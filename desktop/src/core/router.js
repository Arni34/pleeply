// Режим Auto: pleeply подбирает профиль задачи (общий, быстрый, документы, планирование) и место выполнения
// под задачу и железо. Облако в Auto только предлагается — отправка всё равно ждёт вашего «да».
import { resolvePresetLocal } from "./presets.js";

const DOC_WORDS = /\b(summari[sz]e|summary|document|pdf|report|paper|article|research|cite|citation|sources?|analy[sz]e|compare|extract|key points|notes)\b|резюм|кратко изложи|документ|статья|исследован|источник|проанализируй|сравни|выдели главное|конспект/i;
const AGENT_WORDS = /\b(plan|step[- ]by[- ]step|steps|automate|workflow|schedule|organi[sz]e|checklist|roadmap|todo|to-do)\b|план|по шагам|автоматиз|распиши|чек-лист|организуй/i;
const CODE_HINT = /```|\b(function|class|def|import|const|SELECT|error|exception|stack trace|regex)\b/i;

/** Какая настройка подходит задаче. */
export function classifyTask({ text = "", attachments = 0, historyTurns = 0 }) {
  const t = String(text);
  if (attachments > 0 || t.length > 6000 || DOC_WORDS.test(t)) return { preset: "atlas", why: attachments > 0 ? "You attached files" : "This looks like research or document work" };
  if (AGENT_WORDS.test(t)) return { preset: "orbit", why: "This is a multi-step task" };
  if (t.length < 140 && !CODE_HINT.test(t) && historyTurns < 6) return { preset: "nova", why: "A quick question needs a fast answer" };
  return { preset: "saturn", why: "This is general writing or reasoning" };
}

/**
 * Решение Auto.
 * Возвращает { preset, route: {where:'local'|'cloud', model}, reason } или { error }.
 */
export function decideAuto({ text, attachmentsCount = 0, attachmentChars = 0, historyChars = 0, historyTurns = 0, pinnedPreset = null, localModels, cloudModel, settings }) {
  const task = pinnedPreset ? { preset: pinnedPreset, why: "You picked this setup" } : classifyTask({ text, attachments: attachmentsCount, historyTurns });
  const preset = task.preset;
  const local = resolvePresetLocal(preset, localModels, settings);
  const cloudOk = settings.cloud.requests !== "off" && !!cloudModel;
  const needTokens = Math.ceil((String(text || "").length + historyChars) / 3.6) + 1200;
  const docTokens = Math.ceil(attachmentChars / 3.6);
  const localCtx = Math.min(local?.ctx ?? 8192, Math.max(settings.performance.contextSize, preset === "atlas" ? 16384 : 0));

  if (local && local.fit.level !== "slower" && needTokens + Math.min(docTokens, localCtx * 0.6) <= localCtx) {
    const docsNote = docTokens > localCtx * 0.6 ? " Long files are narrowed to the most relevant parts." : "";
    return { preset, route: { where: "local", model: local }, reason: `${task.why}; ${local.label} runs well on this computer.${docsNote}` };
  }
  if (cloudOk && (!local || local.fit.level === "slower" || docTokens > localCtx * 2)) {
    const why = !local ? "no local model fits this computer yet" : local.fit.level === "slower" ? `${local.label} would be slow here` : "the files are too long for the local context";
    return { preset, route: { where: "cloud", model: cloudModel }, reason: `${task.why}; ${why}. Suggesting ${cloudModel.label}, and it will ask before sending.` };
  }
  if (local) {
    return { preset, route: { where: "local", model: local }, reason: `${task.why}; using ${local.label} on this computer${cloudOk ? "" : " (cloud is off or not connected)"}.` };
  }
  return { error: "No local model yet. Download one in Models, or connect a cloud provider in Control Center." };
}
