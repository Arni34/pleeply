// HTTP-движки: Ollama и LM Studio (локально, только loopback), OpenAI-совместимые облака и Google Gemini.
import { UserError } from "../util.js";

async function* lines(res, sep) {
  const dec = new TextDecoder();
  let buf = "";
  for await (const chunk of res.body) {
    buf += dec.decode(chunk, { stream: true }).replace(/\r\n/g, "\n");
    let idx;
    while ((idx = buf.indexOf(sep)) >= 0) {
      const part = buf.slice(0, idx);
      buf = buf.slice(idx + sep.length);
      yield part;
    }
  }
  if (buf.trim()) yield buf;
}

/** Server-Sent Events: отдаёт содержимое полей data:. */
export async function* sseData(res) {
  for await (const block of lines(res, "\n\n")) {
    const data = block.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).replace(/^ /, "")).join("\n");
    if (data) yield data;
  }
}

async function httpError(res, who) {
  let detail = "";
  try {
    const t = await res.text();
    try {
      const j = JSON.parse(t);
      detail = j.error?.message || j.message || j.error || t;
    } catch { detail = t; }
  } catch {}
  detail = String(detail).slice(0, 300);
  // Шлюз pleeply Cloud сам пишет понятную причину (дневной лимит, модель недоступна).
  if (who === "pleeply Cloud" && detail) return new UserError(detail);
  if (res.status === 401 || res.status === 403) return new UserError(`${who} rejected the API key. Check it in Control Center → Cloud providers.`);
  if (res.status === 404) return new UserError(`${who} doesn't have this model (404). ${detail}`);
  if (res.status === 429) return new UserError(`${who} is rate-limiting requests right now. Try again in a minute. ${detail}`);
  if (res.status >= 500) return new UserError(`${who} had a server error (${res.status}). Try again later.`);
  return new UserError(`${who} returned ${res.status}: ${detail}`);
}

async function request(url, init, who) {
  try {
    return await fetch(url, init);
  } catch (e) {
    if (init?.signal?.aborted) throw e;
    throw new UserError(`Couldn't reach ${who}. ${e.cause?.code === "ECONNREFUSED" ? "It isn't running." : "Check your connection."}`);
  }
}

function timeoutSignal(ms) {
  return AbortSignal.timeout(ms);
}

// ---------- Ollama ----------

export async function ollamaList(url) {
  try {
    const res = await fetch(`${url}/api/tags`, { signal: timeoutSignal(1500) });
    if (!res.ok) return { running: true, models: [] };
    const j = await res.json();
    return { running: true, models: j.models || [] };
  } catch {
    return { running: false, models: [] };
  }
}

export async function ollamaChat({ url, model, system, messages, temperature, contextSize, jsonSchema, signal, onText, onThought }) {
  const body = {
    model,
    stream: true,
    messages: [...(system ? [{ role: "system", content: system }] : []), ...messages],
    options: { ...(temperature != null ? { temperature } : {}), ...(contextSize ? { num_ctx: contextSize } : {}) },
    ...(jsonSchema ? { format: jsonSchema } : {}),
  };
  const res = await request(`${url}/api/chat`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal }, "Ollama");
  if (!res.ok) throw await httpError(res, "Ollama");
  let text = "", thought = "", tokens = null, evalMs = null;
  const t0 = Date.now();
  try {
    for await (const line of lines(res, "\n")) {
      if (!line.trim()) continue;
      const j = JSON.parse(line);
      if (j.error) throw new UserError(`Ollama: ${j.error}`);
      if (j.message?.thinking) { thought += j.message.thinking; onThought?.(j.message.thinking); }
      if (j.message?.content) { text += j.message.content; onText?.(j.message.content); }
      if (j.done) { tokens = j.eval_count ?? null; evalMs = j.eval_duration ? j.eval_duration / 1e6 : null; }
    }
  } catch (e) {
    if (signal?.aborted) return { text, thought, aborted: true, ms: Date.now() - t0 };
    throw e;
  }
  return { text, thought, tokens, ms: Date.now() - t0, tokPerSec: tokens && evalMs ? Math.round((tokens / (evalMs / 1000)) * 10) / 10 : null };
}

// ---------- OpenAI-совместимые (OpenAI, Groq, OpenRouter, Mistral, LM Studio) ----------

export async function openaiModels({ baseUrl, key, who, timeoutMs = 10000 }) {
  const res = await request(`${baseUrl}/models`, { headers: key ? { authorization: `Bearer ${key}` } : {}, signal: timeoutSignal(timeoutMs) }, who);
  if (!res.ok) throw await httpError(res, who);
  const j = await res.json();
  return (j.data || []).map((m) => ({ id: m.id, label: m.name || m.id, ctx: m.context_length || m.context_window || null }));
}

export async function openaiChat({ baseUrl, key, who, providerId, extraHeaders = {}, model, system, messages, temperature, maxTokens, json, signal, onText, onThought }) {
  const body = {
    model,
    stream: true,
    messages: [...(system ? [{ role: "system", content: system }] : []), ...messages],
  };
  // У OpenAI рассуждающие модели не принимают temperature/max_tokens — там оставляем значения по умолчанию.
  if (providerId !== "openai") {
    if (temperature != null) body.temperature = temperature;
    if (maxTokens) body.max_tokens = maxTokens;
  } else {
    body.stream_options = { include_usage: true };
  }
  if (json) body.response_format = { type: "json_object" };
  const headers = { "content-type": "application/json", ...(key ? { authorization: `Bearer ${key}` } : {}), ...extraHeaders };
  if (providerId === "openrouter") headers["X-Title"] = "pleeply";
  const res = await request(`${baseUrl}/chat/completions`, { method: "POST", headers, body: JSON.stringify(body), signal }, who);
  if (!res.ok) throw await httpError(res, who);
  let text = "", thought = "", usage = null, servedModel = null;
  const t0 = Date.now();
  try {
    for await (const data of sseData(res)) {
      if (data === "[DONE]") break;
      let j;
      try { j = JSON.parse(data); } catch { continue; }
      if (j.error) throw new UserError(`${who}: ${j.error.message || "error"}`);
      if (j.model) servedModel = j.model;
      if (j.usage) usage = { input: j.usage.prompt_tokens, output: j.usage.completion_tokens };
      const d = j.choices?.[0]?.delta || {};
      const r = d.reasoning_content ?? d.reasoning;
      if (r) { thought += r; onThought?.(r); }
      if (d.content) { text += d.content; onText?.(d.content); }
    }
  } catch (e) {
    if (signal?.aborted) return { text, thought, aborted: true, ms: Date.now() - t0 };
    throw e;
  }
  return { text, thought, usage, servedModel, ms: Date.now() - t0, tokens: usage?.output ?? null };
}

// ---------- Google Gemini ----------

const GEMINI = "https://generativelanguage.googleapis.com/v1beta";

export async function geminiModels({ key }) {
  const res = await request(`${GEMINI}/models?pageSize=1000`, { headers: { "x-goog-api-key": key }, signal: timeoutSignal(10000) }, "Google");
  if (!res.ok) throw await httpError(res, "Google");
  const j = await res.json();
  return (j.models || [])
    .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
    .map((m) => ({ id: m.name.replace(/^models\//, ""), label: m.displayName || m.name, ctx: m.inputTokenLimit || null }));
}

export async function geminiChat({ key, model, system, messages, temperature, json, signal, onText, onThought }) {
  const body = {
    contents: messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
    ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
    generationConfig: { ...(temperature != null ? { temperature } : {}), ...(json ? { responseMimeType: "application/json" } : {}) },
  };
  const url = `${GEMINI}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`;
  const res = await request(url, { method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": key }, body: JSON.stringify(body), signal }, "Google");
  if (!res.ok) throw await httpError(res, "Google");
  let text = "", thought = "", usage = null;
  const t0 = Date.now();
  try {
    for await (const data of sseData(res)) {
      let j;
      try { j = JSON.parse(data); } catch { continue; }
      if (j.error) throw new UserError(`Google: ${j.error.message}`);
      for (const p of j.candidates?.[0]?.content?.parts || []) {
        if (!p.text) continue;
        if (p.thought) { thought += p.text; onThought?.(p.text); }
        else { text += p.text; onText?.(p.text); }
      }
      if (j.usageMetadata) usage = { input: j.usageMetadata.promptTokenCount, output: j.usageMetadata.candidatesTokenCount };
    }
  } catch (e) {
    if (signal?.aborted) return { text, thought, aborted: true, ms: Date.now() - t0 };
    throw e;
  }
  return { text, thought, usage, ms: Date.now() - t0, tokens: usage?.output ?? null };
}
