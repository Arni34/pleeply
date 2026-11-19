// Проверка «влезет ли модель в этот компьютер» до скачивания.
// Fast / Good / Slower / Too large — те же уровни, что на сайте.
import { GB } from "./util.js";

export const FIT_LABEL = { fast: "Fast", good: "Good", slower: "Slower", "too-large": "Too large" };

/** Сколько памяти займёт модель: веса + KV-кэш на контекст + буферы рантайма. */
export function estimateNeedGB(model, contextTokens) {
  const weights = model.bytes / GB;
  const kvMBper1k = model.kv ?? Math.max(16, weights * 16);
  const kv = (kvMBper1k * contextTokens) / 1000 / 1000;
  return weights + kv + 0.3 + weights * 0.03;
}

/**
 * Бюджет памяти под модели.
 * gpuGB — сколько может взять GPU (на Apple Silicon это рекомендованная Metal-память из общей).
 * limitGB — потолок «Memory for models» из Control Center (по умолчанию — авто).
 */
export function memoryBudget(hw, settings) {
  const ramGB = hw.ramBytes / GB;
  const gpuOn = settings.performance.gpu && hw.gpu.backend !== "cpu";
  const vramGB = hw.gpu.vramBytes / GB;
  const gpuGB = gpuOn ? (hw.gpu.unified ? vramGB || ramGB * 0.66 : vramGB) : 0;
  // Авто: на общей памяти оставляем четверть системе и приложениям; на дискретной — VRAM плюс половина RAM.
  const autoGB = hw.gpu.unified ? Math.max(vramGB, ramGB * 0.75) : Math.max(vramGB, 0) + ramGB * 0.5;
  const maxGB = hw.gpu.unified ? Math.floor(ramGB * 0.85) : Math.floor(vramGB + ramGB * 0.85);
  const custom = settings.performance.memoryGB != null;
  const limitGB = custom ? Math.min(settings.performance.memoryGB, Math.max(1, maxGB)) : Math.round(autoGB * 10) / 10;
  return { ramGB, gpuGB, autoGB: Math.round(autoGB * 10) / 10, maxGB: Math.max(1, maxGB), limitGB, custom, gpuOn };
}

export function fitModel(model, hw, settings, contextTokens = settings.performance.contextSize) {
  const b = memoryBudget(hw, settings);
  const needGB = estimateNeedGB(model, contextTokens);
  const params = model.params ?? (model.bytes / GB) * 1.6;
  let level, reason;
  if (needGB > b.ramGB * 0.9) {
    level = "too-large";
    reason = `Needs about ${needGB.toFixed(1)} GB; this computer has ${b.ramGB.toFixed(0)} GB.`;
  } else if (needGB > b.limitGB) {
    level = "too-large";
    reason = b.custom
      ? `Needs about ${needGB.toFixed(1)} GB, over the ${b.limitGB} GB limit set in Control Center.`
      : `Needs about ${needGB.toFixed(1)} GB, which would leave too little memory for your system and apps.`;
  } else if (b.gpuOn && needGB <= b.gpuGB * 0.95) {
    level = params <= 4.5 ? "fast" : "good";
    reason = `Fits in graphics memory (${needGB.toFixed(1)} of ${b.gpuGB.toFixed(1)} GB).`;
  } else if (!b.gpuOn && params <= 2) {
    level = "good";
    reason = "Small enough to run on the processor.";
  } else {
    level = "slower";
    reason = b.gpuOn ? "Part of the model runs on the processor, so answers come slower." : "Runs on the processor only, so answers come slower.";
  }
  return { level, label: FIT_LABEL[level], needGB: Math.round(needGB * 10) / 10, reason, ratio: Math.max(0.04, Math.min(1, b.limitGB / needGB)) };
}

export const FIT_ORDER = { fast: 0, good: 1, slower: 2, "too-large": 3 };

/** Полоски «Model fit» как на сайте: 3B / 7–8B / 14B / 70B. Класс оценивается по лучшей модели в нём. */
export function fitBuckets(catalog, hw, settings) {
  const rows = [
    ["3B", ["llama3.2-3b", "qwen2.5-3b"]],
    ["7–8B", ["qwen2.5-7b", "mistral-7b", "llama3.1-8b", "qwen3-8b"]],
    ["14B", ["qwen2.5-14b", "qwen3-14b"]],
    ["70B", ["llama3.1-70b"]],
  ];
  return rows.map(([label, ids]) => {
    const fits = ids.map((id) => catalog.find((m) => m.id === id)).filter(Boolean).map((m) => fitModel(m, hw, settings));
    if (!fits.length) return null;
    const f = fits.sort((a, b) => FIT_ORDER[a.level] - FIT_ORDER[b.level] || b.ratio - a.ratio)[0];
    return { label, level: f.level, text: f.label, ratio: f.level === "too-large" ? Math.min(f.ratio, 0.12) : f.level === "slower" ? Math.min(f.ratio, 0.55) : f.ratio };
  }).filter(Boolean);
}

/** «Recommended for you: 7–8B models in Local mode.» */
export function recommendation(catalog, hw, settings) {
  const classes = [
    { label: "14B", ids: ["qwen2.5-14b", "qwen3-14b"] },
    { label: "7–8B", ids: ["llama3.1-8b", "qwen2.5-7b", "qwen3-8b", "mistral-7b"] },
    { label: "3–4B", ids: ["llama3.2-3b", "qwen2.5-3b", "qwen3-4b", "gemma3-4b", "phi4-mini"] },
    { label: "1–2B", ids: ["llama3.2-1b", "gemma3-1b", "qwen3-1.7b"] },
  ];
  for (const c of classes) {
    const ok = c.ids.map((id) => catalog.find((m) => m.id === id)).filter(Boolean)
      .filter((m) => ["fast", "good"].includes(fitModel(m, hw, settings).level));
    if (ok.length) return { label: c.label, text: `Recommended for you: ${c.label} models in Local mode.`, modelIds: ok.map((m) => m.id) };
  }
  return { label: null, text: "Local models will be slow here. Connect a cloud model in Control Center for heavier work.", modelIds: ["qwen2.5-0.5b"] };
}
