// Ядро pleeply Desktop. Живёт в главном процессе Electron; окно общается с ним через IPC (electron/main.js).
import path from "node:path";
import { readdir, stat, rm, mkdir, statfs } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { createModelDownloader } from "node-llama-cpp";
import { Store } from "./store.js";
import { DEFAULT_SETTINGS, sanitizeSettings, mergeSettings } from "./settings.js";
import { detectHardware, graphicsLabel } from "./hardware.js";
import { fitModel, fitBuckets, recommendation, memoryBudget, starterPicks, FIT_ORDER } from "./fit.js";
import { CATALOG, CATALOG_CHECKED, catalogById, guessParams } from "./catalog.js";
import { PRESETS, PRESET_IDS, resolvePresetLocal } from "./presets.js";
import { decideAuto, classifyTask } from "./router.js";
import { consentState, buildDisclosure } from "./consent.js";
import { extractText, chunkPages, selectSources, formatSources } from "./docs.js";
import { PROVIDERS, providerById, parseCloudRef, KeyStore, PLEEPLY_CLOUD_URL } from "./providers.js";
import { Memory } from "./memory.js";
import { TOOLS, TEMPLATES, runAgent, makeToolbox } from "./agents.js";
import { LocalEngine } from "./engines/local.js";
import { ollamaList, ollamaChat, openaiModels, openaiChat, geminiModels, geminiChat } from "./engines/remote.js";
import { anthropicModels, anthropicChat } from "./engines/anthropic.js";
import { uid, truncate, estimateTokens, UserError, GB } from "./util.js";

const MAX_MESSAGE_CHARS = 200_000;

function prettyOllama(name) {
  const [base, tag = "latest"] = name.split(":");
  const nice = base.replace(/(^|[-_.])([a-z])/g, (_, s, c) => (s === "." ? "." : s ? " " : "") + c.toUpperCase());
  return tag === "latest" ? nice : `${nice} · ${tag.toUpperCase()}`;
}

function prettyFile(file) {
  return file.replace(/\.gguf$/i, "").replace(/-0000\d-of-0000\d$/i, "").replace(/[-_]/g, " ").replace(/\s+/g, " ").trim();
}

/** Чередование user/assistant без пустых и ошибочных ответов (так требуют все движки). */
export function historyFor(messages) {
  const out = [];
  for (const m of messages) {
    if (m.role === "assistant" && (!m.text || ["error", "declined", "consent"].includes(m.status))) continue;
    const content = m.text;
    if (!content) continue;
    const prev = out[out.length - 1];
    if (prev && prev.role === m.role) prev.content += "\n\n" + content;
    else out.push({ role: m.role, content });
  }
  while (out.length && out[0].role !== "user") out.shift();
  return out;
}

export class Core {
  constructor({ dataDir, cipher, emit = () => {}, openMail = async () => {}, version = "0.1.0", autoSetup = true }) {
    this.autoSetup = autoSetup; // false — без автозагрузки моделей и запроса к pleeply Cloud (для тестов)
    this.dataDir = dataDir;
    this.cipher = cipher;
    this.emit = emit;
    this.openMail = openMail;
    this.version = version;
    this.consents = new Map();
    this.approvals = new Map();
    this.generating = new Map();
    this.downloads = new Map();
    this.runs = new Map();
    this.ephemeralChats = new Map();
    this._localCache = null;
  }

  async init() {
    this.store = await new Store(this.dataDir).init();
    this.settings = sanitizeSettings(await this.store.read("settings.json", DEFAULT_SETTINGS));
    this.keys = new KeyStore(this.store, this.cipher);
    this.memory = new Memory(this.store);
    this.local = new LocalEngine({ getSettings: () => this.settings, onStatus: (s) => this.emit({ type: "engine", ...s }) });
    this.cloudModels = await this.store.read("cloud-models.json", {});
    this.stats = await this.store.read("stats.json", {});
    this.registry = await this.store.read("installed.json", {});
    this.hardware = null;
    this.engineError = null;
    this.hardwareReady = this.refreshHardware();
    // Случайный идентификатор установки — только для дневного лимита pleeply Cloud, не связан с личностью.
    const dev = await this.store.read("device.json", null);
    this.deviceId = dev?.id || randomUUID();
    if (!dev?.id) await this.store.write("device.json", { id: this.deviceId });
    if (this.autoSetup) {
      this.hardwareReady.then(() => this.ensureStarterModels()).catch(() => {});
      this.refreshGateway().catch(() => {});
    }
    return this;
  }

  /** Первый запуск: сразу скачать две офлайн-модели, которые помещаются в память этого компьютера. */
  async ensureStarterModels() {
    if (this.settings.setup.starter) return [];
    const picks = starterPicks(CATALOG, this.hardware, this.settings);
    const mine = await this.#pleeplyModels();
    const todo = picks.filter((id) => !mine.some((m) => m.catalogId === id)).slice(0, Math.max(0, 2 - mine.length));
    await this.updateSettings({ setup: { starter: true } });
    if (!todo.length) return [];
    const bytes = todo.reduce((sum, id) => sum + (catalogById(id)?.bytes || 0), 0);
    const free = this.hardware.diskFreeBytes;
    if (free != null && free < bytes + 3 * GB) {
      this.emit({ type: "toast", kind: "err", text: "Not enough free disk space to download offline models automatically. Pick a smaller one in Models." });
      return [];
    }
    for (const id of todo) await this.downloadModel({ catalogId: id }).catch(() => {});
    this.emit({ type: "starter", models: todo });
    return todo;
  }

  /** Какие облачные модели сейчас есть в pleeply Cloud. О пользователе ничего не отправляется. */
  async refreshGateway({ force = false } = {}) {
    if (!this.settings.cloud.pleeplyCloud || this.settings.cloud.requests === "off") return [];
    const cur = this.cloudModels.pleeply;
    if (!force && cur?.fetchedAt && Date.now() - Date.parse(cur.fetchedAt) < 6 * 3600_000) return cur.models;
    const res = await fetch(`${PLEEPLY_CLOUD_URL}/models`, { signal: AbortSignal.timeout(10000), headers: { "user-agent": `pleeply-desktop/${this.version}` } });
    if (!res.ok) throw new UserError(`pleeply Cloud returned ${res.status}.`);
    const j = await res.json();
    const models = (j.data || []).map((m) => ({ id: m.id, label: m.name || m.id, vendor: m.vendor || null, tier: m.tier || "free", via: m.via || null, policy: m.policy || null, ctx: m.context_length || null }));
    this.cloudModels.pleeply = { models, fetchedAt: new Date().toISOString(), limits: j.limits || null };
    await this.store.write("cloud-models.json", this.cloudModels);
    await this.logActivity({ kind: "cloud-list", provider: "pleeply", providerName: "pleeply Cloud", what: "Checked which cloud models are available (nothing about you was sent)" });
    this._localCache = null;
    this.emit({ type: "models" });
    return models;
  }

  /** Кто получит облачный запрос: провайдер по ключу пользователя или производитель модели через pleeply Cloud. */
  cloudParty(model) {
    const p = providerById(model.provider);
    if (p?.builtIn) {
      const vendor = model.vendor || "the provider";
      return { key: `pleeply/${vendor}`, provider: { id: `pleeply/${vendor}`, name: `${vendor} via pleeply Cloud`, policy: model.policy || p.policy }, relay: { via: model.via, vendor } };
    }
    return { key: p.id, provider: p, relay: null };
  }

  get modelsDir() {
    return this.settings.models.dir || path.join(this.store.dir, "models");
  }

  async refreshHardware() {
    let llama = null;
    try {
      llama = await this.local.llama();
      this.engineError = null;
    } catch (e) {
      this.engineError = `The local engine couldn't start: ${e.message}`;
    }
    this.hardware = await detectHardware({ llama, modelsDir: this.modelsDir });
    this._localCache = null;
    this.emit({ type: "hardware", hardware: this.hardware });
    return this.hardware;
  }

  async logActivity(entry) {
    await this.store.append("activity.jsonl", { at: new Date().toISOString(), ...entry });
    this.emit({ type: "activity" });
  }

  // ---------------- состояние и настройки ----------------

  async state() {
    await this.hardwareReady;
    const hw = this.hardware;
    return {
      version: this.version,
      platform: process.platform,
      settings: this.settings,
      hardware: hw,
      graphics: graphicsLabel(hw),
      budget: memoryBudget(hw, this.settings),
      buckets: fitBuckets(CATALOG, hw, this.settings),
      recommendation: recommendation(CATALOG, hw, this.settings),
      presets: PRESET_IDS.map((id) => ({ id, name: PRESETS[id].name, short: PRESETS[id].short, role: PRESETS[id].role, blurb: PRESETS[id].blurb })),
      providers: PROVIDERS.map(({ id, name, product, kind, policy, keyUrl, keyHint }) => ({ id, name, product, kind, policy, keyUrl, keyHint })),
      keys: await this.keys.status(),
      tools: Object.fromEntries(Object.entries(TOOLS).map(([k, v]) => [k, { label: v.label, matters: v.matters, help: v.help }])),
      templates: TEMPLATES,
      engineError: this.engineError,
      cloudLimits: this.cloudModels.pleeply?.limits || null,
      engine: this.local.status(),
      catalogChecked: CATALOG_CHECKED,
      dataDir: this.store.dir,
      modelsDir: this.modelsDir,
    };
  }

  async updateSettings(patch) {
    const prev = this.settings;
    const next = sanitizeSettings(mergeSettings(prev, patch));
    if (next.models.dir && next.models.dir !== prev.models.dir) {
      await mkdir(next.models.dir, { recursive: true });
    }
    this.settings = next;
    await this.store.write("settings.json", next);
    this._localCache = null;
    if (prev.performance.gpu !== next.performance.gpu) {
      await this.local.reset();
      this.hardwareReady = this.refreshHardware();
      await this.hardwareReady;
    } else if (prev.performance.contextSize !== next.performance.contextSize) {
      await this.local.mutex.run(() => this.local.unload());
    }
    if ((next.cloud.pleeplyCloud && !prev.cloud.pleeplyCloud) || (prev.cloud.requests === "off" && next.cloud.requests !== "off")) {
      this.refreshGateway({ force: true }).catch(() => {});
    }
    if (prev.history.keep && !next.history.keep) {
      for (const f of await this.store.list("chats")) {
        const c = await this.store.read(`chats/${f}`, null);
        if (c) this.ephemeralChats.set(c.id, c);
      }
    }
    this.emit({ type: "settings", settings: next });
    return next;
  }

  // ---------------- модели ----------------

  async #pleeplyModels() {
    let files = [];
    try { files = await readdir(this.modelsDir); } catch { return []; }
    const out = [];
    for (const f of files) {
      if (!/\.gguf$/i.test(f) || /mmproj/i.test(f)) continue;
      const split = /-(\d{5})-of-(\d{5})\.gguf$/i.exec(f);
      if (split && split[1] !== "00001") continue;
      const full = path.join(this.modelsDir, f);
      let bytes = 0;
      try {
        if (split) {
          for (const g of files.filter((x) => x.startsWith(f.slice(0, -split[0].length)) && /-\d{5}-of-\d{5}\.gguf$/i.test(x))) bytes += (await stat(path.join(this.modelsDir, g))).size;
        } else bytes = (await stat(full)).size;
      } catch { continue; }
      const reg = this.registry[f] || {};
      // node-llama-cpp сохраняет файлы с Hugging Face как hf_<автор>_<файл>.
      const cat = reg.catalogId ? catalogById(reg.catalogId) : CATALOG.find((c) => f === c.file || f.endsWith(`_${c.file}`));
      out.push({
        ref: `pleeply:${f}`, backend: "pleeply", where: "local", engine: "pleeply", path: full, file: f, bytes,
        label: cat?.label || reg.label || prettyFile(f),
        params: cat?.params ?? guessParams(f), kv: cat?.kv ?? null, ctx: cat?.ctx ?? 32768,
        tools: cat?.tools ?? true, tags: cat?.tags ?? [], catalogId: cat?.id ?? null,
      });
    }
    return out;
  }

  async #ollamaModels() {
    const o = this.settings.models.ollama;
    if (!o.enabled) return { running: false, models: [] };
    const r = await ollamaList(o.url);
    return {
      running: r.running,
      models: r.models.filter((m) => !/embed/i.test(m.name)).map((m) => {
        const p = m.details?.parameter_size ? parseFloat(m.details.parameter_size) : guessParams(m.name);
        return { ref: `ollama:${m.name}`, backend: "ollama", where: "local", engine: "Ollama", name: m.name, label: prettyOllama(m.name), params: Number.isFinite(p) ? p : null, bytes: m.size, kv: null, ctx: 32768, tools: true, tags: [] };
      }),
    };
  }

  async #lmstudioModels() {
    const l = this.settings.models.lmstudio;
    if (!l.enabled) return { running: false, models: [] };
    try {
      const list = await openaiModels({ baseUrl: `${l.url}/v1`, who: "LM Studio", timeoutMs: 1500 });
      return {
        running: true,
        models: list.filter((m) => !/embed/i.test(m.id)).map((m) => {
          const params = guessParams(m.id);
          return { ref: `lmstudio:${m.id}`, backend: "lmstudio", where: "local", engine: "LM Studio", id: m.id, label: m.id, params, bytes: params ? params * 0.6 * GB : null, kv: null, ctx: 32768, tools: true, tags: [] };
        }),
      };
    } catch {
      return { running: false, models: [] };
    }
  }

  #withFit(m) {
    const fit = m.bytes ? fitModel(m, this.hardware, this.settings) : { level: "good", label: "Managed elsewhere", needGB: null, reason: "Size unknown; the app that runs it manages memory.", ratio: 1 };
    return { ...m, fit, stats: this.stats[m.ref] || null };
  }

  async localModels({ fresh = false } = {}) {
    await this.hardwareReady;
    if (!fresh && this._localCache && Date.now() - this._localCache.at < 4000) return this._localCache;
    const [mine, oll, lms] = await Promise.all([this.#pleeplyModels(), this.#ollamaModels(), this.#lmstudioModels()]);
    const list = [...mine, ...oll.models, ...lms.models].map((m) => this.#withFit(m));
    this._localCache = { at: Date.now(), list, ollama: oll.running, lmstudio: lms.running };
    return this._localCache;
  }

  /** Список pleeply Cloud пуст или устарел — тихо обновить в фоне (не чаще раза в минуту). */
  #gatewayInBackground() {
    if (!this.autoSetup || !this.settings.cloud.pleeplyCloud || this.settings.cloud.requests === "off") return;
    const cur = this.cloudModels.pleeply;
    const stale = !cur?.models?.length || Date.now() - Date.parse(cur.fetchedAt) > 6 * 3600_000;
    if (!stale || Date.now() - (this._gwLast || 0) < 60_000) return;
    this._gwLast = Date.now();
    this.refreshGateway({ force: true }).catch(() => {});
  }

  async cloudModelList() {
    this.#gatewayInBackground();
    const status = await this.keys.status();
    const out = [];
    for (const p of PROVIDERS) {
      if (!status[p.id]?.connected) continue;
      if (p.builtIn && !this.settings.cloud.pleeplyCloud) continue;
      const models = this.cloudModels[p.id]?.models?.length ? this.cloudModels[p.id].models : p.suggested || [];
      for (const m of models) out.push({ ref: `cloud:${p.id}:${m.id}`, where: "cloud", backend: p.kind, provider: p.id, providerName: p.name, id: m.id, label: m.label || m.id, ctx: m.ctx ?? null, vendor: m.vendor ?? null, tier: m.tier ?? null, via: m.via ?? null, policy: m.policy ?? null });
    }
    return out;
  }

  defaultCloudModel(cloud) {
    if (!cloud.length) return null;
    const pref = this.settings.cloud.defaultModel && cloud.find((m) => m.ref === this.settings.cloud.defaultModel);
    if (pref) return pref;
    const gw = (id) => cloud.find((m) => m.provider === "pleeply" && m.id === id);
    return cloud.find((m) => m.id === "claude-opus-5-5") || gw("claude") || gw("gpt") || gw("gemini") || gw("gpt-oss") || cloud[0];
  }

  async modelsState() {
    const { list: local, ollama, lmstudio } = await this.localModels({ fresh: true });
    const installedIds = new Set(local.filter((m) => m.backend === "pleeply" && m.catalogId).map((m) => m.catalogId));
    const downloads = [...this.downloads.values()].map(({ id, catalogId, label, total, done, uri }) => ({ id, catalogId, label, total, done, uri }));
    const catalog = CATALOG.map((m) => ({
      ...m,
      fit: fitModel(m, this.hardware, this.settings),
      installed: installedIds.has(m.id),
      downloading: downloads.find((d) => d.catalogId === m.id) || null,
    }));
    const presets = PRESET_IDS.map((id) => {
      const m = resolvePresetLocal(id, local, this.settings);
      return { id, name: PRESETS[id].name, local: m ? { ref: m.ref, label: m.label } : null, override: this.settings.presets.models[id] };
    });
    return {
      local, catalog, downloads, presets, ollama, lmstudio,
      cloud: await this.cloudModelList(),
      cloudFetched: Object.fromEntries(Object.entries(this.cloudModels).map(([k, v]) => [k, v.fetchedAt])),
      engine: this.local.status(),
      modelsDir: this.modelsDir,
      diskFreeBytes: this.hardware.diskFreeBytes,
      buckets: fitBuckets(CATALOG, this.hardware, this.settings),
      recommendation: recommendation(CATALOG, this.hardware, this.settings),
      budget: memoryBudget(this.hardware, this.settings),
    };
  }

  async downloadModel({ catalogId, uri, label }) {
    const entry = catalogId ? catalogById(catalogId) : null;
    const modelUri = entry?.uri || String(uri || "");
    if (!/^hf:[\w.-]+\/[\w.-]+\/[\w./-]+\.gguf$/i.test(modelUri)) throw new UserError("Only GGUF files from Hugging Face can be downloaded.");
    if ([...this.downloads.values()].some((d) => d.uri === modelUri)) throw new UserError("This model is already downloading.");
    await this.hardwareReady;
    await mkdir(this.modelsDir, { recursive: true });
    const id = uid("dl_");
    const name = entry?.label || label || prettyFile(modelUri.split("/").pop());
    const ctrl = new AbortController();
    let lastEmit = 0;
    const downloader = await createModelDownloader({
      modelUri, dirPath: this.modelsDir, showCliProgress: false, deleteTempFileOnCancel: true, skipExisting: true,
      onProgress: ({ totalSize, downloadedSize }) => {
        const d = this.downloads.get(id);
        if (!d) return;
        d.total = totalSize; d.done = downloadedSize;
        if (Date.now() - lastEmit > 250) {
          lastEmit = Date.now();
          this.emit({ type: "download", id, catalogId: entry?.id ?? null, label: name, total: totalSize, done: downloadedSize });
        }
      },
    });
    const total = downloader.totalSize;
    const free = await statfs(this.modelsDir).catch(() => null);
    if (free && total && free.bavail * free.bsize < total * 1.05) throw new UserError(`Not enough disk space: ${name} needs ${(total / GB).toFixed(1)} GB.`);
    this.downloads.set(id, { id, catalogId: entry?.id ?? null, label: name, uri: modelUri, total, done: 0, downloader, ctrl });
    await this.logActivity({ kind: "download", host: "huggingface.co", what: name, bytes: total });
    this.emit({ type: "download", id, catalogId: entry?.id ?? null, label: name, total, done: 0 });
    downloader.download({ signal: ctrl.signal }).then(async (filePath) => {
      this.registry[path.basename(filePath)] = { catalogId: entry?.id ?? null, uri: modelUri, label: name, addedAt: new Date().toISOString() };
      await this.store.write("installed.json", this.registry);
      this.downloads.delete(id);
      this._localCache = null;
      this.emit({ type: "download", id, label: name, finished: true });
      this.emit({ type: "models" });
    }).catch((e) => {
      this.downloads.delete(id);
      this.emit({ type: "download", id, label: name, error: ctrl.signal.aborted ? null : `Download failed: ${e.message}`, cancelled: ctrl.signal.aborted });
      this.emit({ type: "models" });
    });
    return { id };
  }

  async cancelDownload(id) {
    const d = this.downloads.get(id);
    if (!d) return false;
    d.ctrl.abort();
    await d.downloader.cancel({ deleteTempFile: true }).catch(() => {});
    return true;
  }

  async deleteModel(ref) {
    if (!String(ref).startsWith("pleeply:")) throw new UserError("This model is managed by another app (Ollama or LM Studio). Remove it there.");
    const file = String(ref).slice("pleeply:".length);
    if (path.basename(file) !== file || !/\.gguf$/i.test(file)) throw new UserError("Unknown model");
    await this.local.mutex.run(async () => {
      if (this.local.loaded?.ref === ref) await this.local.unload();
    });
    const split = /-(\d{5})-of-(\d{5})\.gguf$/i.exec(file);
    const files = split ? (await readdir(this.modelsDir)).filter((x) => x.startsWith(file.slice(0, -split[0].length))) : [file];
    for (const f of files) await rm(path.join(this.modelsDir, f), { force: true });
    delete this.registry[file];
    await this.store.write("installed.json", this.registry);
    for (const p of PRESET_IDS) if (this.settings.presets.models[p] === ref) await this.updateSettings({ presets: { models: { [p]: null } } });
    this._localCache = null;
    this.emit({ type: "models" });
    return true;
  }

  /** Discover: поиск GGUF-моделей на Hugging Face. Запрос уходит на huggingface.co — это видно в интерфейсе и журнале. */
  async searchHF(query) {
    const q = String(query || "").trim().slice(0, 100);
    if (!q) return [];
    const url = `https://huggingface.co/api/models?search=${encodeURIComponent(q)}&filter=gguf&sort=downloads&direction=-1&limit=24`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { "user-agent": "pleeply-desktop" } });
    if (!res.ok) throw new UserError(`Hugging Face returned ${res.status}.`);
    await this.logActivity({ kind: "search", host: "huggingface.co", what: `Model search: "${q}"` });
    return (await res.json()).map((m) => ({ repo: m.id, downloads: m.downloads ?? 0, likes: m.likes ?? 0, updated: m.lastModified || m.createdAt || null }));
  }

  async hfFiles(repo) {
    if (!/^[\w.-]+\/[\w.-]+$/.test(String(repo))) throw new UserError("Unknown repository");
    await this.hardwareReady;
    const res = await fetch(`https://huggingface.co/api/models/${repo}/tree/main?recursive=true`, { signal: AbortSignal.timeout(15000), headers: { "user-agent": "pleeply-desktop" } });
    if (!res.ok) throw new UserError(`Hugging Face returned ${res.status}.`);
    const files = (await res.json()).filter((f) => f.type === "file" && /\.gguf$/i.test(f.path) && !/mmproj/i.test(f.path));
    const groups = new Map();
    for (const f of files) {
      const key = f.path.replace(/-\d{5}-of-\d{5}\.gguf$/i, ".gguf");
      const g = groups.get(key) || { file: f.path, bytes: 0, parts: 0 };
      g.bytes += f.lfs?.size ?? f.size;
      g.parts++;
      if (/-00001-of-/i.test(f.path)) g.file = f.path;
      groups.set(key, g);
    }
    const params = guessParams(repo);
    return [...groups.values()].map((g) => {
      const quant = (g.file.match(/(IQ\d_[A-Z]+|Q\d(_K)?(_[A-Z]+)?|F16|BF16|F32)/i)?.[0] || "").toUpperCase();
      const m = { bytes: g.bytes, params: params ?? (g.bytes / GB) * 1.7 };
      return { file: g.file, bytes: g.bytes, parts: g.parts, quant, uri: `hf:${repo}/${g.file}`, fit: fitModel(m, this.hardware, this.settings) };
    }).sort((a, b) => a.bytes - b.bytes);
  }

  // ---------------- облачные провайдеры ----------------

  async setProviderKey(providerId, key) {
    const r = await this.keys.set(providerId, key);
    let models = null, warning = null;
    try { models = await this.refreshCloudModels(providerId); } catch (e) { warning = e.message; }
    this.emit({ type: "models" });
    return { ...r, models: models?.length ?? 0, warning };
  }

  async removeProviderKey(providerId) {
    await this.keys.remove(providerId);
    delete this.cloudModels[providerId];
    await this.store.write("cloud-models.json", this.cloudModels);
    if (this.settings.cloud.defaultModel?.startsWith(`cloud:${providerId}:`)) await this.updateSettings({ cloud: { defaultModel: null } });
    this.emit({ type: "models" });
    return true;
  }

  async refreshCloudModels(providerId) {
    const p = providerById(providerId);
    const key = await this.keys.get(providerId);
    if (!p || !key) throw new UserError("Connect this provider first.");
    let models;
    if (p.kind === "anthropic") models = await anthropicModels({ key });
    else if (p.kind === "gemini") models = await geminiModels({ key });
    else models = await openaiModels({ baseUrl: p.baseUrl, key, who: p.name });
    const skip = /embed|tts|whisper|transcribe|audio|realtime|image|dall-e|moderation|guard|search|computer-use|davinci|babbage|vision-preview|veo|imagen|lyria|aqa/i;
    models = models.filter((m) => !skip.test(m.id));
    if (p.id === "openai") models = models.filter((m) => /^(gpt|o\d|chatgpt)/i.test(m.id));
    models.sort((a, b) => String(a.label).localeCompare(String(b.label)));
    this.cloudModels[providerId] = { models, fetchedAt: new Date().toISOString() };
    await this.store.write("cloud-models.json", this.cloudModels);
    await this.logActivity({ kind: "cloud-list", provider: providerId, providerName: p.name, what: "Listed available models (no conversation data sent)" });
    return models;
  }

  // ---------------- генерация ----------------

  async generateWith(model, { system, messages, temperature, maxTokens, contextSize, thinking, jsonSchema, json, effort, signal, onText, onThought }) {
    switch (model.backend) {
      case "pleeply":
        return this.local.generate({ model, system, messages, temperature, maxTokens, contextSize, thinking, jsonSchema, signal, onText, onThought });
      case "ollama":
        return ollamaChat({ url: this.settings.models.ollama.url, model: model.name, system, messages, temperature, contextSize, jsonSchema, signal, onText, onThought });
      case "lmstudio":
        return openaiChat({ baseUrl: `${this.settings.models.lmstudio.url}/v1`, who: "LM Studio", providerId: "lmstudio", model: model.id, system, messages, temperature, maxTokens, signal, onText, onThought });
    }
    if (model.where !== "cloud") throw new UserError("Unknown model.");
    if (this.settings.cloud.requests === "off") throw new UserError("Cloud is switched off in Control Center → Privacy.");
    const p = providerById(model.provider);
    if (p?.kind === "gateway") {
      if (!this.settings.cloud.pleeplyCloud) throw new UserError("pleeply Cloud is turned off in Control Center → Cloud providers.");
      return openaiChat({ baseUrl: p.baseUrl, who: "pleeply Cloud", providerId: "pleeply", extraHeaders: { "x-pleeply-device": this.deviceId }, model: model.id, system, messages, temperature, maxTokens, signal, onText, onThought });
    }
    const key = await this.keys.get(model.provider);
    if (!p || !key) throw new UserError(`Connect ${p?.name || "the provider"} in Control Center first.`);
    if (p.kind === "anthropic") return anthropicChat({ key, model: model.id, system, messages, effort, signal, onText, onThought });
    if (p.kind === "gemini") return geminiChat({ key, model: model.id, system, messages, temperature, json, signal, onText, onThought });
    return openaiChat({ baseUrl: p.baseUrl, key, who: p.name, providerId: p.id, model: model.id, system, messages, temperature, maxTokens, json, signal, onText, onThought });
  }

  askConsent(disclosure, signal) {
    const id = uid("c_");
    return new Promise((resolve) => {
      this.consents.set(id, resolve);
      this.emit({ type: "consent", id, disclosure });
      signal?.addEventListener("abort", () => {
        if (this.consents.delete(id)) {
          this.emit({ type: "consent:cancel", id });
          resolve({ approved: false });
        }
      }, { once: true });
    });
  }

  respondConsent({ id, approved, remember, includeHistory }) {
    const r = this.consents.get(id);
    if (!r) return false;
    this.consents.delete(id);
    r({ approved: approved === true, remember: remember === true, includeHistory: includeHistory !== false });
    return true;
  }

  async #resolveRoute({ chat, text, mode, selection }) {
    const { list: local } = await this.localModels();
    let cloud = await this.cloudModelList();
    // Облачный ответ, а список pleeply Cloud ещё не загружен (например, не было сети при запуске) — догружаем сейчас.
    if (mode !== "local" && !cloud.some((m) => m.provider === "pleeply") && this.settings.cloud.pleeplyCloud && this.settings.cloud.requests !== "off") {
      await this.refreshGateway({ force: true }).catch(() => {});
      cloud = await this.cloudModelList();
    }
    const hist = historyFor(chat.messages);
    const attachments = chat.attachments || [];
    const attachmentChars = attachments.reduce((s, a) => s + (a.chars || 0), 0);
    const pinnedPreset = selection?.type === "preset" && PRESETS[selection.id] ? selection.id : null;
    const pickedModel = selection?.type === "model" ? [...local, ...cloud].find((m) => m.ref === selection.ref) : null;
    if (selection?.type === "model" && !pickedModel) throw new UserError("That model isn't available anymore. Pick another one.");
    const task = pinnedPreset || classifyTask({ text, attachments: attachments.length, historyTurns: hist.length }).preset;
    const noLocal = () => new UserError(this.downloads.size
      ? "Your offline models are still downloading. Switch to Auto or Cloud to use a cloud model meanwhile."
      : "No local model yet. Download one in Models — pleeply checks which ones fit this computer.");

    if (mode === "auto") {
      if (pickedModel) return { preset: task, model: pickedModel, reason: `You picked ${pickedModel.label}.` };
      const d = decideAuto({
        text, attachmentsCount: attachments.length, attachmentChars,
        historyChars: hist.reduce((s, m) => s + m.content.length, 0), historyTurns: hist.length,
        pinnedPreset, localModels: local, cloudModel: this.defaultCloudModel(cloud), settings: this.settings,
      });
      if (d.error) throw this.downloads.size ? noLocal() : new UserError(d.error);
      return { preset: d.preset, model: d.route.model, reason: d.reason };
    }
    if (mode === "cloud") {
      if (this.settings.cloud.requests === "off") throw new UserError("Cloud is switched off in Control Center → Privacy.");
      if (pickedModel && pickedModel.where !== "cloud") throw new UserError(`${pickedModel.label} runs on this computer. Switch to Local, or pick a cloud model.`);
      const m = pickedModel || this.defaultCloudModel(cloud);
      if (!m) throw new UserError("No cloud provider is connected. Add a key in Control Center → Cloud providers.");
      return { preset: task, model: m };
    }
    if (pickedModel && pickedModel.where !== "local") throw new UserError(`${pickedModel.label} is a cloud model. Switch to Cloud or Auto to use it.`);
    const m = pickedModel || resolvePresetLocal(task, local, this.settings);
    if (!m) throw noLocal();
    return { preset: task, model: m };
  }

  async previewRoute({ chatId, text = "", mode, selection }) {
    try {
      const chat = chatId ? await this.getChat(chatId) : { messages: [], attachments: [] };
      const r = await this.#resolveRoute({ chat, text, mode, selection });
      return { where: r.model.where, ref: r.model.ref, label: r.model.label, providerName: r.model.providerName || null, preset: r.preset, presetName: r.preset ? PRESETS[r.preset].short : null, reason: r.reason || null, fit: r.model.fit?.level || null };
    } catch (e) {
      return { error: e.message };
    }
  }

  // ---------------- чаты ----------------

  async #chatList() {
    const out = [];
    const seen = new Set();
    for (const c of this.ephemeralChats.values()) { out.push(c); seen.add(c.id); }
    if (this.settings.history.keep) {
      for (const f of await this.store.list("chats")) {
        const c = await this.store.read(`chats/${f}`, null);
        if (c && !seen.has(c.id)) out.push(c);
      }
    }
    return out;
  }

  async listChats() {
    return (await this.#chatList())
      .map((c) => {
        const last = [...c.messages].reverse().find((m) => m.role === "assistant" && m.meta?.where);
        return { id: c.id, title: c.title, updatedAt: c.updatedAt, pinned: !!c.pinned, where: last?.meta?.where || null, count: c.messages.length };
      })
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async getChat(id) {
    if (!/^ch_[a-z0-9]+$/.test(String(id))) throw new UserError("Unknown chat");
    if (this.ephemeralChats.has(id)) return this.ephemeralChats.get(id);
    const c = await this.store.read(`chats/${id}.json`, null);
    if (!c) throw new UserError("This chat no longer exists.");
    return c;
  }

  newChat() {
    const now = Date.now();
    return { id: uid("ch_"), title: "New chat", createdAt: now, updatedAt: now, approvals: {}, attachments: [], messages: [] };
  }

  async saveChat(chat, { touch = true } = {}) {
    if (touch) chat.updatedAt = Date.now();
    if (this.settings.history.keep) {
      this.ephemeralChats.delete(chat.id);
      await this.store.write(`chats/${chat.id}.json`, chat);
    } else {
      this.ephemeralChats.set(chat.id, chat);
    }
  }

  async createChat() {
    const c = this.newChat();
    await this.saveChat(c);
    return c;
  }

  async renameChat(id, title) {
    const c = await this.getChat(id);
    c.title = truncate(String(title || "").trim() || "Untitled", 80);
    await this.saveChat(c, { touch: false });
    return c;
  }

  async pinChat(id, pinned) {
    const c = await this.getChat(id);
    c.pinned = !!pinned;
    await this.saveChat(c, { touch: false });
    return c;
  }

  /** Поиск по названиям и тексту всех чатов на этом компьютере. */
  async searchChats(query) {
    const q = String(query || "").trim().toLowerCase().slice(0, 200);
    const chats = await this.#chatList();
    if (!q) return chats.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 12).map((c) => ({ id: c.id, title: c.title, updatedAt: c.updatedAt, snippet: null }));
    const out = [];
    for (const c of chats) {
      let score = c.title.toLowerCase().includes(q) ? 2 : 0;
      let snippet = null;
      for (const m of c.messages) {
        const t = m.text || "";
        const i = t.toLowerCase().indexOf(q);
        if (i < 0) continue;
        const from = Math.max(0, i - 40), to = Math.min(t.length, i + q.length + 70);
        snippet = (from ? "…" : "") + t.slice(from, to).replace(/\s+/g, " ") + (to < t.length ? "…" : "");
        score = Math.max(score, 1);
        break;
      }
      if (score) out.push({ id: c.id, title: c.title, updatedAt: c.updatedAt, snippet, score });
    }
    return out.sort((a, b) => b.score - a.score || b.updatedAt - a.updatedAt).slice(0, 30);
  }

  async deleteChat(id) {
    const c = await this.getChat(id);
    this.generating.get(id)?.abort();
    for (const a of c.attachments || []) await this.store.remove(`docs/${a.id}.json`);
    this.ephemeralChats.delete(id);
    await this.store.remove(`chats/${id}.json`);
    return true;
  }

  exportChat(chat) {
    const lines = [`# ${chat.title}`, ""];
    for (const m of chat.messages) {
      if (m.role === "user") lines.push(`**You**`, "", m.text, "");
      else if (m.text) {
        const where = m.meta?.where === "cloud" ? `${m.meta.model} · sent to ${m.meta.providerName}` : `${m.meta?.model || "pleeply"} · this computer`;
        lines.push(`**pleeply** _(${where})_`, "", m.text, "");
      }
    }
    return lines.join("\n");
  }

  async attachFiles(chatId, paths) {
    const chat = chatId ? await this.getChat(chatId) : this.newChat();
    chat.attachments ||= [];
    const errors = [];
    for (const p of paths.slice(0, 20)) {
      try {
        const doc = await extractText(p);
        const id = uid("d_");
        const chunks = chunkPages(doc.pages);
        await this.store.write(`docs/${id}.json`, { id, name: doc.name, path: p, pages: doc.pages.length, chars: doc.chars, chunks });
        chat.attachments.push({ id, name: doc.name, chars: doc.chars, pages: doc.pages.length, addedAt: new Date().toISOString() });
      } catch (e) {
        errors.push(e instanceof UserError ? e.message : `${path.basename(p)}: ${e.message}`);
      }
    }
    await this.saveChat(chat);
    this.emit({ type: "chat", chat });
    return { chat, errors };
  }

  async removeAttachment(chatId, docId) {
    const chat = await this.getChat(chatId);
    chat.attachments = (chat.attachments || []).filter((a) => a.id !== docId);
    await this.store.remove(`docs/${docId}.json`);
    await this.saveChat(chat);
    this.emit({ type: "chat", chat });
    return chat;
  }

  async send({ chatId, text, mode, selection }) {
    const body = String(text || "").trim();
    if (!body) throw new UserError("Type a message first.");
    if (body.length > MAX_MESSAGE_CHARS) throw new UserError("That message is too long. Attach it as a file instead.");
    if (!["local", "cloud", "auto"].includes(mode)) throw new UserError("Unknown mode");
    const chat = chatId ? await this.getChat(chatId) : this.newChat();
    if (this.generating.has(chat.id)) throw new UserError("pleeply is still answering in this chat.");
    const userMsg = { id: uid("msg_"), role: "user", text: body, createdAt: Date.now(), attachments: (chat.attachments || []).map((a) => a.id) };
    const asst = { id: uid("msg_"), role: "assistant", text: "", thought: "", status: "routing", createdAt: Date.now(), meta: { mode } };
    if (chat.title === "New chat") chat.title = truncate(body.replace(/\s+/g, " "), 60);
    chat.messages.push(userMsg, asst);
    return this.#start({ chat, userMsg, asst, mode, selection });
  }

  /** Ответить заново другой моделью или в другом режиме: ответ заменяется, история остаётся. */
  async regenerate({ chatId, messageId, mode, selection }) {
    if (!["local", "cloud", "auto"].includes(mode)) throw new UserError("Unknown mode");
    const chat = await this.getChat(chatId);
    if (this.generating.has(chat.id)) throw new UserError("pleeply is still answering in this chat.");
    const idx = chat.messages.findIndex((m) => m.id === messageId && m.role === "assistant");
    const userMsg = chat.messages[idx - 1];
    if (idx < 1 || userMsg?.role !== "user") throw new UserError("Nothing to answer again.");
    const asst = { id: uid("msg_"), role: "assistant", text: "", thought: "", status: "routing", createdAt: Date.now(), meta: { mode } };
    chat.messages.splice(idx, chat.messages.length - idx, asst);
    return this.#start({ chat, userMsg, asst, mode, selection });
  }

  /** Изменить своё сообщение и отправить заново: всё, что было после него, заменяется новым ответом. */
  async editAndResend({ chatId, messageId, text, mode, selection }) {
    const body = String(text || "").trim();
    if (!body) throw new UserError("The message can't be empty.");
    if (body.length > MAX_MESSAGE_CHARS) throw new UserError("That message is too long. Attach it as a file instead.");
    if (!["local", "cloud", "auto"].includes(mode)) throw new UserError("Unknown mode");
    const chat = await this.getChat(chatId);
    if (this.generating.has(chat.id)) throw new UserError("pleeply is still answering in this chat.");
    const idx = chat.messages.findIndex((m) => m.id === messageId && m.role === "user");
    if (idx < 0) throw new UserError("That message no longer exists.");
    const userMsg = chat.messages[idx];
    userMsg.text = body;
    userMsg.editedAt = Date.now();
    const asst = { id: uid("msg_"), role: "assistant", text: "", thought: "", status: "routing", createdAt: Date.now(), meta: { mode } };
    chat.messages.splice(idx + 1, chat.messages.length - idx - 1, asst);
    return this.#start({ chat, userMsg, asst, mode, selection });
  }

  async #start({ chat, userMsg, asst, mode, selection }) {
    await this.saveChat(chat);
    this.emit({ type: "chat", chat });
    const ctrl = new AbortController();
    this.generating.set(chat.id, ctrl);
    this.#answer({ chat, userMsg, asst, mode, selection, signal: ctrl.signal })
      .catch((e) => {
        asst.status = "error";
        asst.error = e instanceof UserError ? e.message : `Something went wrong: ${e.message}`;
      })
      .finally(async () => {
        this.generating.delete(chat.id);
        if (["streaming", "routing"].includes(asst.status)) asst.status = ctrl.signal.aborted ? "stopped" : "done";
        await this.saveChat(chat);
        this.emit({ type: "chat", chat, done: asst.id });
        if (asst.status === "done" && asst.meta.where === "local") this.#learn(chat, userMsg).catch(() => {});
      });
    return { chatId: chat.id, messageId: asst.id };
  }

  stop(chatId) {
    const c = this.generating.get(chatId);
    if (!c) return false;
    c.abort();
    return true;
  }

  async #answer({ chat, userMsg, asst, mode, selection, signal }) {
    const route = await this.#resolveRoute({ chat, text: userMsg.text, mode, selection });
    const model = route.model;
    const presetId = route.preset || "saturn";
    const preset = PRESETS[presetId];
    const where = model.where;
    const hasDocs = (chat.attachments || []).length > 0;
    const contextSize = Math.min(model.ctx || 32768, presetId === "atlas" && hasDocs ? Math.max(this.settings.performance.contextSize, 16384) : this.settings.performance.contextSize);

    // Инструкции: профиль задачи + дата + Memory (+ источники из файлов)
    const sys = [route.preset ? preset.system : "You are a helpful assistant inside the pleeply desktop app. Answer in the language the user writes in.", `Today is ${new Date().toLocaleDateString("en-CA")}.`];
    const memoryAllowed = this.settings.memory.enabled && (where === "local" || this.settings.cloud.shareMemory);
    const mem = memoryAllowed ? await this.memory.forPrompt() : "";
    if (mem) sys.push(mem);
    let history = historyFor(chat.messages.filter((m) => m.id !== asst.id));
    let citations = null, narrowed = false;
    if (hasDocs) {
      const docs = [];
      for (const a of chat.attachments) {
        const d = await this.store.read(`docs/${a.id}.json`, null);
        if (d) docs.push({ id: d.id, name: d.name, chunks: d.chunks });
      }
      const histChars = history.reduce((s, m) => s + m.content.length, 0);
      const budget = where === "local" ? Math.max(2500, Math.floor(contextSize * 3.6 * 0.55) - histChars) : 400_000;
      const sel = selectSources(docs, userMsg.text, budget);
      const f = formatSources(sel.chunks);
      citations = f.citations;
      narrowed = sel.narrowed;
      sys.push(`Sources from the user's files${narrowed ? " (the most relevant parts)" : ""}. Cite them like [1]:\n\n${f.text}`);
      if (!route.preset) sys.push("When you use a source, cite its number in square brackets, like [1].");
    }
    let system = sys.join("\n\n");

    // Локально: срезаем самые старые реплики, чтобы влезть в контекст.
    if (where === "local") {
      const room = contextSize - preset.maxTokens - estimateTokens(system) - 64;
      if (estimateTokens(userMsg.text) > room) throw new UserError(`This message is too long for ${model.label} with a ${contextSize}-token context. Attach it as a file, or raise the context size in Control Center.`);
      while (history.length > 1 && estimateTokens(history.map((m) => m.content).join("\n")) > room) history = history.slice(2);
    }

    Object.assign(asst.meta, {
      where, backend: model.backend, engine: model.engine || null, provider: model.provider || null,
      providerName: model.where === "cloud" ? this.cloudParty(model).provider.name : null,
      model: model.label, ref: model.ref, preset: route.preset, presetName: null,
      autoReason: route.reason || null, citations, narrowed, memoryUsed: !!mem,
    });

    if (where === "cloud") {
      const party = this.cloudParty(model);
      const p = party.provider;
      const state = consentState(this.settings, chat.approvals, party.key);
      if (state === "blocked") throw new UserError("Cloud is switched off in Control Center → Privacy.");
      if (state === "ask") {
        asst.status = "consent";
        await this.saveChat(chat);
        this.emit({ type: "chat", chat });
        const disclosure = buildDisclosure({ provider: p, relay: party.relay, model: { id: model.id, label: model.label }, system, messages: history, attachments: hasDocs ? chat.attachments : [], memoryIncluded: !!mem });
        const answer = await this.askConsent(disclosure, signal);
        if (!answer.approved) {
          asst.status = "declined";
          asst.meta.declined = true;
          return;
        }
        if (!answer.includeHistory) history = history.slice(-1);
        if (answer.remember && this.settings.cloud.requests === "chat") chat.approvals = { ...(chat.approvals || {}), [party.key]: true };
        asst.meta.approval = "asked";
      } else {
        asst.meta.approval = "chat";
      }
      const sentChars = system.length + history.reduce((s, m) => s + m.content.length, 0);
      asst.meta.sentChars = sentChars;
      await this.logActivity({ kind: "cloud", provider: party.key, providerName: p.name, model: model.label, chars: sentChars, chatId: chat.id, chatTitle: chat.title, approval: asst.meta.approval, memory: !!mem, files: hasDocs ? chat.attachments.length : 0 });
    }

    asst.status = "streaming";
    this.emit({ type: "chat", chat });
    const emitDelta = (field, t) => this.emit({ type: "delta", chatId: chat.id, messageId: asst.id, field, text: t });
    const r = await this.generateWith(model, {
      system, messages: history, temperature: preset.temperature, maxTokens: preset.maxTokens, contextSize,
      thinking: preset.thinking, effort: preset.effort, signal,
      onText: (t) => { asst.text += t; emitDelta("text", t); },
      onThought: (t) => { asst.thought += t; emitDelta("thought", t); },
    });
    if (r.text && r.text !== asst.text) asst.text = r.text;
    Object.assign(asst.meta, { tokens: r.tokens ?? null, tokPerSec: r.tokPerSec ?? null, ms: r.ms ?? null, servedModel: r.servedModel || null, contextSize: where === "local" ? r.contextSize ?? contextSize : null });
    if (r.refusal) asst.meta.notice = "The provider declined this request.";
    if (r.aborted) asst.status = "stopped";
    if (where === "local" && r.tokPerSec) {
      const s = this.stats[model.ref] || { tokPerSec: r.tokPerSec, runs: 0 };
      s.tokPerSec = Math.round(((s.tokPerSec * Math.min(s.runs, 9) + r.tokPerSec) / (Math.min(s.runs, 9) + 1)) * 10) / 10;
      s.runs++;
      this.stats[model.ref] = s;
      await this.store.write("stats.json", this.stats);
    }
  }

  /** Memory учится только локальной моделью, и только той, что уже загружена (без лишних перезагрузок). */
  async #learn(chat, userMsg) {
    if (!this.settings.memory.enabled || this.settings.memory.learn === "off") return;
    const loadedRef = this.local.loaded?.ref;
    if (!loadedRef) return;
    const { list } = await this.localModels();
    const model = list.find((m) => m.ref === loadedRef);
    // Совсем маленькие модели путают факты о пользователе с фактами о мире — им учиться не даём.
    if (!model || (model.params ?? 0) < 1.5) return;
    const fresh = await this.memory.learn({
      generate: (o) => this.generateWith(model, { ...o, contextSize: this.local.loaded?.ctxReq ?? this.settings.performance.contextSize, thinking: false }),
      userText: userMsg.text, chatId: chat.id, mode: this.settings.memory.learn,
    });
    if (fresh.length) this.emit({ type: "memory", learned: fresh, mode: this.settings.memory.learn });
  }

  // ---------------- агенты ----------------

  async listAgents() {
    const agents = await this.store.read("agents.json", []);
    const runs = await this.listRuns();
    return agents.map((a) => ({ ...a, lastRun: runs.find((r) => r.agentId === a.id) || null }));
  }

  async saveAgent(input) {
    const agents = await this.store.read("agents.json", []);
    const name = truncate(String(input.name || "").trim(), 60);
    const goal = String(input.goal || "").trim().slice(0, 4000);
    if (!name || !goal) throw new UserError("An agent needs a name and a goal.");
    let folder = input.folder ? String(input.folder) : null;
    if (folder) {
      const s = await stat(folder).catch(() => null);
      if (!s?.isDirectory()) throw new UserError("The shared folder doesn't exist.");
    }
    const tools = (Array.isArray(input.tools) ? input.tools : []).filter((t) => TOOLS[t] && t !== "finish");
    const mode = ["local", "cloud", "auto"].includes(input.mode) ? input.mode : "local";
    const modelRef = typeof input.modelRef === "string" && /^(pleeply|ollama|lmstudio|cloud):/.test(input.modelRef) ? input.modelRef : null;
    const existing = agents.find((a) => a.id === input.id);
    const agent = { id: existing?.id || uid("ag_"), name, goal, folder, tools, mode, modelRef, approvals: existing?.approvals || {}, createdAt: existing?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
    const next = existing ? agents.map((a) => (a.id === agent.id ? agent : a)) : [agent, ...agents];
    await this.store.write("agents.json", next);
    return agent;
  }

  async deleteAgent(id) {
    const agents = await this.store.read("agents.json", []);
    await this.store.write("agents.json", agents.filter((a) => a.id !== id));
    return true;
  }

  async listRuns(agentId) {
    const out = [];
    for (const f of await this.store.list("runs")) {
      const r = await this.store.read(`runs/${f}`, null);
      if (r && (!agentId || r.agentId === agentId)) out.push(r);
    }
    return out.sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)));
  }

  async getRun(id) {
    if (!/^run_[a-z0-9]+$/.test(String(id))) throw new UserError("Unknown run");
    return this.store.read(`runs/${id}.json`, null);
  }

  async #agentModel(agent) {
    const { list: local } = await this.localModels();
    const cloud = await this.cloudModelList();
    if (agent.modelRef) {
      const m = [...local, ...cloud].find((x) => x.ref === agent.modelRef);
      if (m) return m;
    }
    if (agent.mode === "cloud") {
      const m = this.defaultCloudModel(cloud);
      if (!m) throw new UserError("Connect a cloud provider to run this agent in Cloud mode.");
      return m;
    }
    const localPick = resolvePresetLocal("orbit", local, this.settings);
    if (agent.mode === "auto" && (!localPick || localPick.fit.level === "slower" || (localPick.params ?? 0) < 3) && this.settings.cloud.requests !== "off" && this.defaultCloudModel(cloud)) {
      return this.defaultCloudModel(cloud);
    }
    if (!localPick) throw new UserError("No local model yet. Download one in Models (agents work best with Qwen or Llama 3B and up).");
    return localPick;
  }

  async runAgent(agentId) {
    const agents = await this.store.read("agents.json", []);
    const agent = agents.find((a) => a.id === agentId);
    if (!agent) throw new UserError("Unknown agent");
    const model = await this.#agentModel(agent);
    const run = { id: uid("run_"), agentId, agentName: agent.name, goal: agent.goal, folder: agent.folder, status: "running", steps: [], startedAt: new Date().toISOString(), where: model.where, model: model.label, providerName: model.where === "cloud" ? this.cloudParty(model).provider.name : null };
    const ctrl = new AbortController();
    const state = { stopped: false, ctrl };
    this.runs.set(run.id, state);

    if (model.where === "cloud") {
      const party = this.cloudParty(model);
      const p = party.provider;
      const st = consentState(this.settings, agent.approvals, party.key);
      if (st === "blocked") throw new UserError("Cloud is switched off in Control Center → Privacy.");
      if (st === "ask") {
        const disclosure = buildDisclosure({
          scope: "agent", provider: p, relay: party.relay, model: { id: model.id, label: model.label },
          system: `Agent "${agent.name}" will send its goal and everything it reads to ${p.name} at every step: text of files from ${agent.folder ? `"${path.basename(agent.folder)}"` : "no folder"}${agent.tools.includes("fetch_url") ? " and web pages it opens" : ""}.`,
          messages: [{ role: "user", content: `Goal: ${agent.goal}` }],
        });
        const ans = await this.askConsent(disclosure, ctrl.signal);
        if (!ans.approved) {
          this.runs.delete(run.id);
          return { declined: true };
        }
        if (ans.remember && this.settings.cloud.requests === "chat") {
          agent.approvals = { ...(agent.approvals || {}), [party.key]: true };
          await this.store.write("agents.json", agents);
        }
      }
    }

    const onUpdate = async (r) => {
      await this.store.write(`runs/${r.id}.json`, r);
      this.emit({ type: "run", run: r });
    };
    await onUpdate(run);
    const generate = async (o) => {
      if (model.where === "cloud") {
        const chars = o.system.length + o.messages.reduce((s, m) => s + m.content.length, 0);
        const party = this.cloudParty(model);
        await this.logActivity({ kind: "cloud", provider: party.key, providerName: party.provider.name, model: model.label, chars, agent: agent.name, approval: "agent run" });
      }
      return this.generateWith(model, { ...o, temperature: 0.2, maxTokens: 1500, contextSize: Math.max(8192, this.settings.performance.contextSize), thinking: false, json: model.backend !== "anthropic", effort: "medium", signal: ctrl.signal });
    };
    const requestApproval = (step) => new Promise((resolve) => {
      this.approvals.set(`${run.id}:${step.id}`, resolve);
      this.emit({ type: "approval", runId: run.id, stepId: step.id });
    });
    runAgent({
      agent, run, generate, requestApproval, onUpdate,
      toolbox: makeToolbox({ agent, store: this.store, memory: this.memory, openMail: this.openMail }),
      isStopped: () => state.stopped,
    }).catch(async (e) => {
      run.status = "failed";
      run.error = e instanceof UserError ? e.message : `The agent stopped: ${e.message}`;
      run.endedAt = new Date().toISOString();
      await onUpdate(run);
    }).finally(() => this.runs.delete(run.id));
    return { runId: run.id };
  }

  approveStep({ runId, stepId, approved, args }) {
    const key = `${runId}:${stepId}`;
    const r = this.approvals.get(key);
    if (!r) return false;
    this.approvals.delete(key);
    r({ approved: approved === true, args: args && typeof args === "object" ? args : null });
    return true;
  }

  stopRun(runId) {
    const s = this.runs.get(runId);
    if (!s) return false;
    s.stopped = true;
    s.ctrl.abort();
    for (const [k, resolve] of this.approvals) {
      if (k.startsWith(runId + ":")) { this.approvals.delete(k); resolve({ approved: false }); }
    }
    return true;
  }

  async listNotes() {
    const out = [];
    for (const f of await this.store.list("notes")) {
      const n = await this.store.read(`notes/${f}`, null);
      if (n) out.push(n);
    }
    return out.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }

  async deleteNote(id) {
    if (!/^n_[a-z0-9]+$/.test(String(id))) throw new UserError("Unknown note");
    await this.store.remove(`notes/${id}.json`);
    return true;
  }

  // ---------------- приватность ----------------

  async activity() {
    return (await this.store.readLines("activity.jsonl", 1000)).reverse();
  }

  async clearActivity() {
    await this.store.remove("activity.jsonl");
    this.emit({ type: "activity" });
    return true;
  }

  /** Удаляет данные pleeply на этом компьютере. Модели не трогаем (их удаляют в Models). */
  async deleteData({ chats = true, memory = true, agents = true, activity = true, keys = false } = {}) {
    for (const c of this.generating.values()) c.abort();
    for (const id of [...this.runs.keys()]) this.stopRun(id);
    if (chats) { await this.store.remove("chats"); await this.store.remove("docs"); this.ephemeralChats.clear(); }
    if (memory) await this.memory.clear();
    if (agents) { await this.store.remove("agents.json"); await this.store.remove("runs"); await this.store.remove("notes"); }
    if (activity) await this.store.remove("activity.jsonl");
    if (keys) { for (const p of PROVIDERS) await this.keys.remove(p.id); await this.store.remove("cloud-models.json"); this.cloudModels = {}; }
    await this.store.init();
    this.emit({ type: "data-deleted" });
    return true;
  }

  async storageUsage() {
    const models = (await this.#pleeplyModels()).reduce((s, m) => s + m.bytes, 0);
    const inside = !path.relative(this.store.dir, this.modelsDir).startsWith("..");
    const total = await this.store.size();
    return { dataBytes: Math.max(0, total - (inside ? models : 0)), modelsBytes: models, dataDir: this.store.dir, modelsDir: this.modelsDir };
  }

  async dispose() {
    for (const c of this.generating.values()) c.abort();
    for (const d of this.downloads.values()) d.ctrl.abort();
    await this.local.dispose();
  }
}

export { FIT_ORDER };
