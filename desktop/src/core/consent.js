// Согласие перед облаком: pleeply показывает, какому провайдеру и что именно уйдёт, и ждёт «да».
import { estimateTokens } from "./util.js";

/**
 * blocked — облако выключено в Control Center;
 * approved — в режиме «once per chat» этот провайдер уже одобрен в этом чате (или в этом запуске агента);
 * ask — нужно спросить.
 */
export function consentState(settings, approvals, providerId) {
  if (settings.cloud.requests === "off") return "blocked";
  if (settings.cloud.requests === "chat" && approvals?.[providerId]) return "approved";
  return "ask";
}

/** Что ровно уйдёт провайдеру — показывается в окне согласия до отправки. */
export function buildDisclosure({ provider, model, system, messages, attachments = [], memoryIncluded = false, scope = "message" }) {
  const items = [];
  if (system) items.push({ kind: "system", label: memoryIncluded ? "Instructions, including your Memory" : "Instructions", text: system });
  for (const m of messages) items.push({ kind: "message", label: m.role === "user" ? "You" : "Earlier answer", text: m.content });
  const chars = items.reduce((s, i) => s + i.text.length, 0);
  return {
    scope,
    provider: { id: provider.id, name: provider.name, policyUrl: provider.policy },
    model: { id: model.id, label: model.label },
    items,
    attachments: attachments.map((a) => ({ name: a.name, chars: a.chars })),
    memoryIncluded,
    chars,
    approxTokens: estimateTokens(items.map((i) => i.text).join("\n")),
  };
}
