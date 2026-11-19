import { randomBytes } from "node:crypto";

export const GB = 1e9;

export function uid(prefix = "") {
  return prefix + Date.now().toString(36) + randomBytes(5).toString("hex");
}

export function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

/** Грубая оценка токенов: ~3.6 символа на токен для смешанного EN/RU текста. */
export function estimateTokens(text) {
  return Math.ceil(String(text || "").length / 3.6);
}

export function fmtGB(bytes, digits = 1) {
  const gb = bytes / GB;
  return `${gb >= 10 ? Math.round(gb) : gb.toFixed(digits)} GB`;
}

export function truncate(text, max) {
  const s = String(text || "");
  return s.length <= max ? s : s.slice(0, max - 1) + "…";
}

/** Достаёт первый JSON-объект из текста модели (ответ может быть обёрнут в ```json или пояснения). */
export function parseJsonLoose(text) {
  const s = String(text || "").trim();
  try { return JSON.parse(s); } catch {}
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) { try { return JSON.parse(fence[1]); } catch {} }
  const start = s.indexOf("{");
  if (start < 0) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) {
      try { return JSON.parse(s.slice(start, i + 1)); } catch { return null; }
    }
  }
  return null;
}

/** Простой мьютекс: одна генерация на загруженную модель за раз. */
export class Mutex {
  #tail = Promise.resolve();
  run(fn) {
    const next = this.#tail.then(fn, fn);
    this.#tail = next.catch(() => {});
    return next;
  }
}

export class UserError extends Error {
  constructor(message, code = "user") {
    super(message);
    this.code = code;
  }
}
