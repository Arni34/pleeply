// Локальный движок pleeply: модели GGUF через llama.cpp (node-llama-cpp) прямо на этом компьютере.
// Metal на Apple Silicon, CUDA/Vulkan на Windows и Linux, иначе процессор.
import { getLlama, LlamaChat, LlamaLogLevel } from "node-llama-cpp";
import { Mutex, UserError } from "../util.js";

export class LocalEngine {
  constructor({ getSettings, onStatus = () => {} }) {
    this.getSettings = getSettings;
    this.onStatus = onStatus;
    this.mutex = new Mutex();
    this.loaded = null;
    this._llama = null;
    this._gpu = null;
    this.idleTimer = null;
  }

  async llama() {
    const gpu = this.getSettings().performance.gpu ? "auto" : false;
    if (this._llama && this._gpu === gpu) return this._llama;
    await this.unload();
    if (this._llama) await this._llama.dispose().catch(() => {});
    // build: "never" — только готовые сборки llama.cpp, никакой компиляции на компьютере пользователя.
    this._llama = await getLlama({ gpu, build: "never", logLevel: LlamaLogLevel.error, progressLogs: false });
    this._gpu = gpu;
    return this._llama;
  }

  /** Перезапуск после смены GPU acceleration. */
  async reset() {
    await this.mutex.run(async () => {
      await this.unload();
      if (this._llama) await this._llama.dispose().catch(() => {});
      this._llama = null;
    });
  }

  status() {
    if (!this.loaded) return { loaded: null };
    return { loaded: this.loaded.ref, label: this.loaded.label, contextSize: this.loaded.ctx, gpuLayers: this.loaded.gpuLayers, totalLayers: this.loaded.totalLayers };
  }

  async ensureLoaded(model, contextSize) {
    if (this.loaded && this.loaded.path === model.path && this.loaded.ctxReq === contextSize) return this.loaded;
    await this.unload();
    const llama = await this.llama();
    this.onStatus({ state: "loading", ref: model.ref, label: model.label });
    let m, context;
    try {
      m = await llama.loadModel({ modelPath: model.path, gpuLayers: "auto" });
      context = await m.createContext({ contextSize: { min: 2048, max: contextSize } });
    } catch (e) {
      await context?.dispose().catch(() => {});
      await m?.dispose().catch(() => {});
      this.onStatus({ state: "idle" });
      const msg = String(e?.message || e);
      if (/memory|VRAM|RAM|allocate|fit/i.test(msg)) {
        throw new UserError(`Not enough memory to load ${model.label}. Try a smaller model, lower the context size or raise Memory for models in Control Center.`);
      }
      throw new UserError(`Couldn't load ${model.label}: ${msg}`);
    }
    const chat = new LlamaChat({ contextSequence: context.getSequence(), autoDisposeSequence: true });
    this.loaded = {
      path: model.path, ref: model.ref, label: model.label, model: m, context, chat,
      ctxReq: contextSize, ctx: context.contextSize, gpuLayers: m.gpuLayers, totalLayers: m.fileInsights?.totalLayers ?? null,
    };
    this.onStatus({ state: "ready", ...this.status() });
    return this.loaded;
  }

  armIdle() {
    clearTimeout(this.idleTimer);
    const min = this.getSettings().performance.keepLoadedMin;
    if (min > 0) this.idleTimer = setTimeout(() => this.mutex.run(() => this.unload()), min * 60_000);
    else this.mutex.run(() => this.unload());
  }

  async unload() {
    clearTimeout(this.idleTimer);
    if (!this.loaded) return;
    const l = this.loaded;
    this.loaded = null;
    await l.chat.dispose?.();
    await l.context.dispose().catch(() => {});
    await l.model.dispose().catch(() => {});
    this.onStatus({ state: "idle" });
  }

  generate(opts) {
    return this.mutex.run(() => this.#generate(opts));
  }

  async #generate({ model, system, messages, temperature, maxTokens, contextSize, thinking, jsonSchema, signal, onText, onThought }) {
    if (signal?.aborted) return { text: "", thought: "", aborted: true };
    const l = await this.ensureLoaded(model, contextSize);
    const history = [];
    if (system) history.push({ type: "system", text: system });
    for (const msg of messages) {
      history.push(msg.role === "user" ? { type: "user", text: msg.content } : { type: "model", response: [msg.content] });
    }
    history.push({ type: "model", response: [] });
    const grammar = jsonSchema ? await (await this.llama()).createGrammarForJsonSchema(jsonSchema) : undefined;
    const t0 = Date.now();
    let firstAt = 0, thought = "";
    let res;
    try {
      res = await l.chat.generateResponse(history, {
        temperature,
        maxTokens,
        grammar,
        signal,
        stopOnAbortSignal: true,
        budgets: thinking === false || grammar ? { thoughtTokens: 0 } : undefined,
        onResponseChunk: (c) => {
          if (!firstAt) firstAt = Date.now();
          if (c.type === "segment") {
            if (c.segmentType === "thought" && c.text) { thought += c.text; onThought?.(c.text); }
          } else if (c.text) onText?.(c.text);
        },
      });
    } catch (e) {
      if (signal?.aborted) return { text: "", thought, aborted: true };
      throw e;
    } finally {
      this.armIdle();
    }
    const text = res.response;
    const tokens = text ? l.model.tokenize(text).length : 0;
    const genSec = Math.max(0.001, (Date.now() - (firstAt || t0)) / 1000);
    return {
      text, thought, tokens,
      ms: Date.now() - t0,
      tokPerSec: tokens > 4 ? Math.round((tokens / genSec) * 10) / 10 : null,
      stopReason: res.metadata?.stopReason,
      aborted: res.metadata?.stopReason === "abort",
      contextSize: l.ctx,
      gpuLayers: l.gpuLayers,
    };
  }

  async dispose() {
    await this.unload();
    await this._llama?.dispose().catch(() => {});
  }
}
