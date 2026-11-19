// Claude через официальный SDK Anthropic. Вызывается только после согласия пользователя.
import Anthropic from "@anthropic-ai/sdk";
import { UserError } from "../util.js";

// Модели с адаптивным мышлением и параметром effort.
const ADAPTIVE = /^claude-(fable|mythos|opus-5|sonnet-5|haiku-5|opus-4-[6-9]|sonnet-4-6)/;
// Модели, для которых включаем серверный запасной вариант при отказе (fallbacks: "default").
const FALLBACK = /^claude-(fable-5-[12]|opus-5-5|opus-5|sonnet-5-5)$/;

function mapError(e) {
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) return new UserError("Anthropic rejected the API key. Check it in Control Center → Cloud providers.");
  if (e instanceof Anthropic.NotFoundError) return new UserError("Anthropic doesn't offer this model to your key.");
  if (e instanceof Anthropic.RateLimitError) return new UserError("Anthropic is rate-limiting requests right now. Try again in a minute.");
  if (e instanceof Anthropic.BadRequestError) return new UserError(`Anthropic couldn't accept the request: ${e.message}`);
  if (e instanceof Anthropic.APIConnectionError) return new UserError("Couldn't reach Anthropic. Check your connection.");
  if (e instanceof Anthropic.APIError) return new UserError(`Anthropic error: ${e.message}`);
  return e;
}

export async function anthropicModels({ key }) {
  const client = new Anthropic({ apiKey: key, maxRetries: 1, timeout: 15_000 });
  const out = [];
  try {
    for await (const m of client.models.list({ limit: 100 })) out.push({ id: m.id, label: m.display_name, ctx: m.max_input_tokens ?? null });
  } catch (e) {
    throw mapError(e);
  }
  return out;
}

export async function anthropicChat({ key, model, system, messages, effort, signal, onText, onThought }) {
  const client = new Anthropic({ apiKey: key, maxRetries: 2 });
  const params = {
    model,
    max_tokens: 64000,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    ...(system ? { system } : {}),
  };
  if (ADAPTIVE.test(model)) {
    params.thinking = { type: "adaptive", display: "summarized" };
    if (effort) params.output_config = { effort };
  }
  const stream = FALLBACK.test(model)
    ? client.beta.messages.stream({ ...params, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" }, { signal })
    : client.messages.stream(params, { signal });
  let text = "", thought = "";
  const t0 = Date.now();
  try {
    for await (const ev of stream) {
      if (ev.type !== "content_block_delta") continue;
      if (ev.delta.type === "text_delta") { text += ev.delta.text; onText?.(ev.delta.text); }
      else if (ev.delta.type === "thinking_delta") { thought += ev.delta.thinking; onThought?.(ev.delta.thinking); }
    }
  } catch (e) {
    if (signal?.aborted) return { text, thought, aborted: true, ms: Date.now() - t0 };
    throw mapError(e);
  }
  let final;
  try {
    final = await stream.finalMessage();
  } catch (e) {
    if (signal?.aborted) return { text, thought, aborted: true, ms: Date.now() - t0 };
    throw mapError(e);
  }
  return {
    text,
    thought,
    servedModel: final.model,
    refusal: final.stop_reason === "refusal",
    stopReason: final.stop_reason,
    usage: { input: final.usage?.input_tokens, output: final.usage?.output_tokens },
    tokens: final.usage?.output_tokens ?? null,
    ms: Date.now() - t0,
  };
}
