// pleeply Cloud: шлюз облачных моделей для pleeply Desktop, чтобы GPT, Claude, Gemini и DeepSeek работали без ключей у пользователя.
// Приложение шлёт запросы в формате OpenAI на /api/ai/v1/*, шлюз передаёт их провайдеру по ключам из переменных Vercel:
//   GROQ_API_KEY       — бесплатные открытые модели (GPT-OSS от OpenAI и DeepSeek, если Groq их держит);
//   OPENROUTER_API_KEY — один ключ на GPT, Claude, Gemini и DeepSeek (платно, баланс в OpenRouter);
//   ANTHROPIC_API_KEY  — Claude напрямую через SDK Anthropic (если задан, имеет приоритет над OpenRouter);
//   GEMINI_API_KEY     — Gemini напрямую (бесплатный уровень Google AI Studio);
//   DEEPSEEK_API_KEY   — DeepSeek напрямую.
// Текст запросов не сохраняется и не пишется в логи: в базе только счётчики запросов за день.
import crypto from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';
import { sql, clientKey, json } from './forum.js';
import { PLANS, effectivePlan } from './account.js';
import { relayFree, availableProviders } from './free.js';

const OPENROUTER = 'https://openrouter.ai/api/v1';
const GROQ = 'https://api.groq.com/openai/v1';
const GEMINI = 'https://generativelanguage.googleapis.com/v1beta/openai';
const DEEPSEEK = 'https://api.deepseek.com/v1';

// Лимиты на устройство в сутки; на одну сеть (IP) — в IP_FACTOR раз больше; общий потолок платных запросов в сутки.
export const LIMITS = {
  ipFactor: 4,
  proGlobal: Number(process.env.AI_PRO_GLOBAL_PER_DAY || 5000),
  paidGlobal: Number(process.env.AI_PAID_GLOBAL_PER_DAY || 300),
  maxTokens: 8192,
  maxChars: 300_000,
};

const VENDOR_POLICY = {
  OpenAI: 'https://openai.com/policies/privacy-policy/',
  Anthropic: 'https://www.anthropic.com/legal/privacy',
  Google: 'https://policies.google.com/privacy',
  DeepSeek: 'https://cdn.deepseek.com/policies/en-US/deepseek-privacy-policy.html',
  'Free AI providers': 'https://pleeply.vercel.app/chat#providers',
};

const UPSTREAM_NAME = { groq: 'Groq', openrouter: 'OpenRouter', anthropic: 'Anthropic', gemini: 'Google', deepseek: 'DeepSeek', free: 'pleeply Free router' };

// ---------- какие модели доступны ----------

async function getJson(url, headers = {}) {
  const r = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`${url} ${r.status}`);
  return r.json();
}

const clean = (id) => !/[:]|vision|image|audio|search|exp|preview|safeguard|codex|realtime|tts|embed|distill|-\d{4}$/i.test(id);
const newest = (list) => list.sort((a, b) => (b.created || 0) - (a.created || 0))[0] || null;
const nameOf = (m) => String(m.name || m.id).replace(/^[^:]+:\s*/, '');

/** Свежая модель каждого производителя в каталоге OpenRouter. AI_MODEL_* в Vercel фиксирует конкретную. */
export function pickOpenRouter(models) {
  const by = (re, extra = () => true) => newest(models.filter((m) => re.test(m.id) && clean(m.id) && extra(m)));
  const fixed = (env) => process.env[env] && models.find((m) => m.id === process.env[env]);
  return {
    claude: fixed('AI_MODEL_CLAUDE') || models.find((m) => m.id === 'anthropic/claude-opus-5.5') || by(/^anthropic\/claude-opus-[\d.]+$/),
    gpt: fixed('AI_MODEL_GPT') || by(/^openai\/gpt-\d[\d.]*(-[a-z]+)?$/, (m) => !/pro|mini|nano|chat|oss/.test(m.id)),
    gemini: fixed('AI_MODEL_GEMINI') || by(/^google\/gemini-\d[\d.]*-[a-z]+$/, (m) => !/lite|flash-8b/.test(m.id)),
    deepseek: fixed('AI_MODEL_DEEPSEEK') || by(/^deepseek\/deepseek-v\d[\d.]*(-[a-z]+)?$/),
  };
}

let cache = null;
/** Список моделей шлюза: только те, для которых есть ключ. Кэш на 10 минут. */
export async function catalog() {
  if (cache && Date.now() - cache.at < 600_000) return cache.list;
  const list = [];
  const env = process.env;
  if (env.ANTHROPIC_API_KEY) {
    list.push({ id: 'claude', name: 'Claude Opus 5.5', vendor: 'Anthropic', tier: 'paid', via: 'anthropic', upstream: 'claude-opus-5-5', context: 1_000_000 });
  }
  if (env.OPENROUTER_API_KEY) {
    try {
      const { data } = await getJson(`${OPENROUTER}/models`);
      const p = pickOpenRouter(data || []);
      for (const [id, vendor] of [['claude', 'Anthropic'], ['gpt', 'OpenAI'], ['gemini', 'Google'], ['deepseek', 'DeepSeek']]) {
        const m = p[id];
        if (!m || list.some((x) => x.id === id)) continue;
        list.push({ id, name: nameOf(m), vendor, tier: 'paid', via: 'openrouter', upstream: m.id, context: m.context_length || null });
      }
    } catch {}
  }
  if (env.GEMINI_API_KEY && !list.some((x) => x.id === 'gemini')) {
    list.push({ id: 'gemini', name: 'Gemini Flash', vendor: 'Google', tier: 'free', via: 'gemini', upstream: env.GEMINI_MODEL || 'gemini-flash-latest', context: 1_000_000 });
  }
  if (env.DEEPSEEK_API_KEY && !list.some((x) => x.id === 'deepseek')) {
    list.push({ id: 'deepseek', name: 'DeepSeek Chat', vendor: 'DeepSeek', tier: 'paid', via: 'deepseek', upstream: 'deepseek-chat', context: 128_000 });
  }
  if (env.GROQ_API_KEY) {
    try {
      const { data } = await getJson(`${GROQ}/models`, { Authorization: `Bearer ${env.GROQ_API_KEY}` });
      const ids = (data || []).filter((m) => m.active !== false).map((m) => m.id);
      if (ids.includes('openai/gpt-oss-120b')) list.push({ id: 'gpt-oss', name: 'GPT-OSS 120B', vendor: 'OpenAI', tier: 'free', via: 'groq', upstream: 'openai/gpt-oss-120b', context: 131_072 });
      const ds = ids.find((id) => /deepseek/i.test(id) && clean(id));
      if (ds && !list.some((x) => x.vendor === 'DeepSeek')) list.push({ id: 'deepseek-free', name: ds.replace(/^.*\//, '').replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()), vendor: 'DeepSeek', tier: 'free', via: 'groq', upstream: ds, context: null });
    } catch {}
  }
  // pleeply Free: цепочка бесплатных моделей разных провайдеров с переключением при лимитах (см. free.js)
  if (availableProviders().length) {
    list.push({ id: 'auto', name: 'pleeply Free', vendor: 'Free AI providers', tier: 'free', via: 'free', strategy: 'smart', context: 128_000 });
    list.push({ id: 'auto-fast', name: 'pleeply Free · Fast', vendor: 'Free AI providers', tier: 'free', via: 'free', strategy: 'fast', context: 128_000 });
  }
  for (const m of list) { m.upstreamName = UPSTREAM_NAME[m.via]; m.policy = VENDOR_POLICY[m.vendor]; }
  cache = { at: Date.now(), list };
  return list;
}

// ---------- лимиты ----------

let usageReady;
const ensureUsage = () => (usageReady ??= sql.query(`create table if not exists ai_usage (
  key text not null, day date not null default current_date, tier text not null, n integer not null default 0,
  primary key (key, day, tier))`));

async function bump(key, tier) {
  const [row] = await sql`insert into ai_usage (key, day, tier, n) values (${key}, current_date, ${tier}, 1)
    on conflict (key, day, tier) do update set n = ai_usage.n + 1 returning n`;
  return row.n;
}

/**
 * Считает запрос и решает, можно ли. Возвращает null или текст отказа.
 * Без входа лимит на установку (и на сеть), с аккаунтом — на аккаунт по тарифу: free или Pro.
 */
export async function checkLimits(req, deviceId, tier, account = null) {
  await ensureUsage();
  const plan = account ? effectivePlan(account) : 'guest';
  const perDay = PLANS[plan][tier];
  const kind = tier === 'paid' ? 'premium ' : '';
  if (account) {
    const n = await bump('a:' + account.id, tier);
    if (n > perDay) {
      return plan === 'pro'
        ? `You've used today's ${perDay} ${kind}requests on pleeply Pro. They reset at midnight UTC.`
        : `You've used today's ${perDay} ${kind}requests. pleeply Pro gives ${PLANS.pro[tier]} a day — upgrade in Control Center → Account.`;
    }
  } else {
    const dev = 'd:' + crypto.createHash('sha256').update(`pleeply-ai:${deviceId}`).digest('hex').slice(0, 24);
    const [d, i] = await Promise.all([bump(dev, tier), bump('i:' + clientKey(req), tier)]);
    if (d > perDay) return `You've used today's ${perDay} ${kind}requests without an account. Sign in with Google for ${PLANS.free[tier]} a day, or use a local model.`;
    if (i > perDay * LIMITS.ipFactor) return 'Too many pleeply Cloud requests from this network today. Sign in with Google or use a local model.';
  }
  if (tier === 'paid') {
    const pro = plan === 'pro';
    if ((await bump(pro ? 'g:pro' : 'g:all', tier)) > (pro ? LIMITS.proGlobal : LIMITS.paidGlobal)) return 'pleeply Cloud has reached its daily limit for premium models. Try a free model or a local one.';
  }
  return null;
}

// ---------- запрос к провайдеру ----------

export function validate(body, maxTokens) {
  const b = body && typeof body === 'object' ? body : {};
  if (typeof b.model !== 'string') return { error: 'Missing model.' };
  if (!Array.isArray(b.messages) || !b.messages.length || b.messages.length > 200) return { error: 'Bad messages.' };
  let chars = 0;
  const messages = [];
  for (const m of b.messages) {
    if (!m || !['system', 'user', 'assistant'].includes(m.role) || typeof m.content !== 'string') return { error: 'Bad message.' };
    chars += m.content.length;
    messages.push({ role: m.role, content: m.content });
  }
  if (chars > LIMITS.maxChars) return { error: 'This request is too long for pleeply Cloud.' };
  const out = { model: b.model, messages, max_tokens: Math.min(Math.max(Number(b.max_tokens) || maxTokens, 16), maxTokens) };
  const t = Number(b.temperature);
  if (Number.isFinite(t)) out.temperature = Math.min(Math.max(t, 0), 2);
  return { value: out };
}

const KEYS = { groq: 'GROQ_API_KEY', openrouter: 'OPENROUTER_API_KEY', gemini: 'GEMINI_API_KEY', deepseek: 'DEEPSEEK_API_KEY' };
const BASE = { groq: GROQ, openrouter: OPENROUTER, gemini: GEMINI, deepseek: DEEPSEEK };

/** Провайдеры с API в формате OpenAI: поток SSE передаётся в приложение как есть. */
async function streamOpenAI(entry, req, res, signal) {
  const body = { model: entry.upstream, messages: req.messages, stream: true, max_tokens: req.max_tokens };
  // Рассуждающие модели OpenAI не принимают температуру.
  if (req.temperature != null && entry.vendor !== 'OpenAI') body.temperature = req.temperature;
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env[KEYS[entry.via]]}` };
  if (entry.via === 'openrouter') Object.assign(headers, { 'HTTP-Referer': 'https://pleeply.vercel.app', 'X-Title': 'pleeply Desktop' });
  const up = await fetch(`${BASE[entry.via]}/chat/completions`, { method: 'POST', headers, body: JSON.stringify(body), signal });
  if (!up.ok) {
    const detail = (await up.text().catch(() => '')).slice(0, 300);
    return json(res, up.status === 429 ? 429 : 502, { error: { message: up.status === 429 ? `${entry.upstreamName} is busy right now. Try again in a minute.` : `${entry.upstreamName} returned ${up.status}.`, detail } });
  }
  res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' });
  for await (const chunk of up.body) res.write(chunk);
  res.end();
}

/** Claude напрямую через SDK Anthropic: события SDK пересказываются в поток формата OpenAI. */
async function streamAnthropic(entry, req, res, signal) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 1 });
  const system = req.messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
  const messages = req.messages.filter((m) => m.role !== 'system');
  const stream = client.beta.messages.stream({
    model: entry.upstream,
    max_tokens: req.max_tokens,
    ...(system ? { system } : {}),
    messages,
    thinking: { type: 'adaptive', display: 'summarized' },
    output_config: { effort: 'medium' },
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
  }, { signal });
  res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' });
  const send = (delta) => res.write(`data: ${JSON.stringify({ model: entry.upstream, choices: [{ index: 0, delta }] })}\n\n`);
  try {
    for await (const ev of stream) {
      if (ev.type !== 'content_block_delta') continue;
      if (ev.delta.type === 'text_delta') send({ content: ev.delta.text });
      else if (ev.delta.type === 'thinking_delta') send({ reasoning: ev.delta.thinking });
    }
    const final = await stream.finalMessage();
    if (final.stop_reason === 'refusal') send({ content: '\n\n_Claude declined this request._' });
    res.write(`data: ${JSON.stringify({ model: final.model, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: final.usage?.input_tokens, completion_tokens: final.usage?.output_tokens } })}\n\n`);
  } catch (e) {
    if (!signal.aborted) send({ content: `\n\n_${e instanceof Anthropic.APIError ? `Anthropic error ${e.status ?? ''}` : 'Connection to Anthropic failed'}._` });
  }
  res.end('data: [DONE]\n\n');
}

export async function relay(entry, request, res) {
  const ctrl = new AbortController();
  res.on('close', () => { if (!res.writableEnded) ctrl.abort(); });
  try {
    if (entry.via === 'anthropic') return await streamAnthropic(entry, request, res, ctrl.signal);
    if (entry.via === 'free') return await relayFree(entry, request, res, ctrl.signal);
    return await streamOpenAI(entry, request, res, ctrl.signal);
  } catch (e) {
    if (ctrl.signal.aborted) return;
    if (!res.headersSent) return json(res, 502, { error: { message: `Couldn't reach ${entry.upstreamName}.` } });
    res.end();
  }
}
