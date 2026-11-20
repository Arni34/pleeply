// Профили задач: общий, быстрый, документы, планирование. В интерфейсе их имена сейчас не показываются —
// Auto сам выбирает профиль под сообщение: какую модель взять под железо, инструкции, температура, контекст.
import { FIT_ORDER } from "./fit.js";

const COMMON = `Be accurate and say plainly when you are not sure. Use Markdown for lists, tables and code. Answer in the language the user writes in.`;

export const PRESETS = {
  saturn: {
    id: "saturn",
    name: "General",
    short: "General",
    role: "General-purpose intelligence",
    blurb: "The all-rounder for conversation, writing and reasoning, sized to what your computer can run.",
    temperature: 0.7,
    contextSize: 8192,
    maxTokens: 4096,
    thinking: true,
    effort: "medium",
    system: `You are pleeply, a general-purpose assistant in the pleeply desktop app. Help with conversation, writing and reasoning. ${COMMON}`,
  },
  nova: {
    id: "nova",
    name: "Quick answers",
    short: "Quick",
    role: "Fast everyday assistance",
    blurb: "Quick answers with a small memory footprint, made for instant replies and modest laptops.",
    temperature: 0.6,
    contextSize: 4096,
    maxTokens: 1024,
    thinking: false,
    effort: "low",
    system: `You are pleeply, a fast everyday assistant in the pleeply desktop app. Keep answers short and direct: a few sentences or a short list, unless the user asks for more. ${COMMON}`,
  },
  atlas: {
    id: "atlas",
    name: "Documents",
    short: "Documents",
    role: "Research and document analysis",
    blurb: "Reads long documents and notes, pulls out what matters and points to where it came from.",
    temperature: 0.3,
    contextSize: 16384,
    maxTokens: 4096,
    thinking: true,
    effort: "high",
    system: `You are pleeply, a research and document-analysis assistant in the pleeply desktop app. When sources are provided, rely on them, quote sparingly and cite every claim that comes from a source with its number in square brackets, like [1] or [2][3]. If the sources do not contain the answer, say so instead of guessing. ${COMMON}`,
  },
  orbit: {
    id: "orbit",
    name: "Planning",
    short: "Planning",
    role: "Agent workflows and automation",
    blurb: "Plans multi-step tasks and works with your tools, checking in before actions that matter.",
    temperature: 0.2,
    contextSize: 8192,
    maxTokens: 2048,
    thinking: false,
    effort: "high",
    system: `You are pleeply, a planning assistant in the pleeply desktop app. Break tasks into clear numbered steps, name what each step needs, and point out any step that changes files, sends something or spends money so the user can approve it first. ${COMMON}`,
  },
};

export const PRESET_IDS = Object.keys(PRESETS);

const usable = (m) => m.fit && ["fast", "good"].includes(m.fit.level);
const byParamsDesc = (a, b) => (b.params ?? 0) - (a.params ?? 0) || FIT_ORDER[a.fit.level] - FIT_ORDER[b.fit.level];
const byParamsAsc = (a, b) => (a.params ?? 99) - (b.params ?? 99);

/**
 * Выбирает локальную модель под настройку из уже установленных.
 * localModels: [{ ref, params, ctx, tools, tags, fit: {level} }]
 * Возвращает модель или null, если подходящей нет.
 */
export function resolvePresetLocal(presetId, localModels, settings) {
  // Модель по умолчанию из Control Center (или старая настройка для конкретного профиля задачи).
  const override = settings?.presets?.models?.[presetId] || settings?.models?.defaultLocal;
  if (override) {
    const m = localModels.find((x) => x.ref === override);
    if (m) return m;
  }
  const ok = localModels.filter(usable);
  const any = localModels.filter((m) => m.fit?.level !== "too-large");
  if (!any.length) return null;
  switch (presetId) {
    case "nova": {
      const small = ok.filter((m) => (m.params ?? 0) >= 1 && (m.params ?? 99) <= 4.5).sort(byParamsAsc);
      return small[0] || ok.sort(byParamsAsc)[0] || any.sort(byParamsAsc)[0];
    }
    case "atlas": {
      const long = ok.filter((m) => (m.ctx ?? 0) >= 32768 || m.tags?.includes("long-context")).sort(byParamsDesc);
      return long[0] || ok.sort(byParamsDesc)[0] || any.sort(byParamsAsc)[0];
    }
    case "orbit": {
      const tools = ok.filter((m) => m.tools).sort(byParamsDesc);
      return tools[0] || ok.sort(byParamsDesc)[0] || any.sort(byParamsAsc)[0];
    }
    default:
      return ok.sort(byParamsDesc)[0] || any.sort(byParamsAsc)[0];
  }
}
