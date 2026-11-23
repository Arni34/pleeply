// pleeply Free — маршрутизатор бесплатных моделей по образцу FreeLLMAPI (github.com/tashfeenahmed/freellmapi, MIT).
// Каталог моделей (рейтинг, лимиты, контекст) взят из его репозитория: free-catalog.json, лицензия — free-catalog.LICENSE.
// Запрос «auto» идёт к лучшей доступной модели; при 429, ошибке или таймауте до первого байта — к следующей по цепочке.
// Провайдер участвует, только если в Vercel задан его ключ (или он работает без ключа). Тексты запросов не сохраняются:
// в базе только паузы после ошибок и счётчики запросов к каждой модели за день.
import { readFileSync } from 'node:fs';
import { sql, json } from './forum.js';

const CATALOG = JSON.parse(readFileSync(new URL('./free-catalog.json', import.meta.url), 'utf8'));

/** Провайдеры с API в формате OpenAI. key — переменная Vercel; keyless — работает и без неё. */
export const FREE_PROVIDERS = {
  groq: { name: 'Groq', base: 'https://api.groq.com/openai/v1', key: 'GROQ_API_KEY', policy: 'https://groq.com/privacy-policy/' },
  cerebras: { name: 'Cerebras', base: 'https://api.cerebras.ai/v1', key: 'CEREBRAS_API_KEY', policy: 'https://www.cerebras.ai/privacy-policy' },
  google: { name: 'Google AI Studio', base: 'https://generativelanguage.googleapis.com/v1beta/openai', key: 'GEMINI_API_KEY', policy: 'https://ai.google.dev/gemini-api/terms' },
  mistral: { name: 'Mistral', base: 'https://api.mistral.ai/v1', key: 'MISTRAL_API_KEY', policy: 'https://legal.mistral.ai/terms/privacy-policy' },
  openrouter: { name: 'OpenRouter', base: 'https://openrouter.ai/api/v1', key: 'OPENROUTER_API_KEY', policy: 'https://openrouter.ai/privacy', headers: { 'HTTP-Referer': 'https://pleeply.vercel.app', 'X-Title': 'pleeply' } },
  nvidia: { name: 'NVIDIA NIM', base: 'https://integrate.api.nvidia.com/v1', key: 'NVIDIA_API_KEY', policy: 'https://www.nvidia.com/en-us/about-nvidia/privacy-policy/', timeout: 45_000 },
  cohere: { name: 'Cohere', base: 'https://api.cohere.ai/compatibility/v1', key: 'COHERE_API_KEY', policy: 'https://cohere.com/privacy' },
  cloudflare: { name: 'Cloudflare Workers AI', key: 'CLOUDFLARE_AI_KEY', policy: 'https://www.cloudflare.com/privacypolicy/' }, // ключ «account_id:token»
  zhipu: { name: 'Zhipu', base: process.env.ZHIPU_API_BASE || 'https://open.bigmodel.cn/api/paas/v4', key: 'ZHIPU_API_KEY', policy: 'https://open.bigmodel.cn/' },
  ollama: { name: 'Ollama Cloud', base: 'https://ollama.com/v1', key: 'OLLAMA_API_KEY', policy: 'https://ollama.com/privacy', timeout: 45_000 },
  kilo: { name: 'Kilo Gateway', base: 'https://api.kilo.ai/api/gateway/v1', key: 'KILO_API_KEY', keyless: true, policy: 'https://kilo.ai/privacy' },
  pollinations: { name: 'Pollinations', base: 'https://gen.pollinations.ai/v1', key: 'POLLINATIONS_API_KEY', policy: 'https://pollinations.ai/privacy' },
  llm7: { name: 'LLM7', base: 'https://api.llm7.io/v1', key: 'LLM7_API_KEY', keyless: true, policy: 'https://llm7.io/' },
  huggingface: { name: 'Hugging Face', base: 'https://router.huggingface.co/v1', key: 'HF_TOKEN', policy: 'https://huggingface.co/privacy' },
  opencode: { name: 'OpenCode Zen', base: 'https://opencode.ai/zen/v1', key: 'OPENCODE_API_KEY', policy: 'https://opencode.ai/legal/privacy-policy' },
};

const MAX_ATTEMPTS = 6;
const HEADER_TIMEOUT = 25_000;

function endpoint(pid) {
  const p = FREE_PROVIDERS[pid];
  const raw = process.env[p.key] || '';
  if (pid === 'cloudflare') {
    const i = raw.indexOf(':');
    if (i < 1) return null;
    return { url: `https://api.cloudflare.com/client/v4/accounts/${raw.slice(0, i)}/ai/v1/chat/completions`, token: raw.slice(i + 1) };
  }
  if (!raw && !p.keyless) return null;
  return { url: `${p.base}/chat/completions`, token: raw }; // без ключа — без заголовка Authorization
}

/** Провайдеры, которые сейчас можно звать. */
export const availableProviders = () => Object.keys(FREE_PROVIDERS).filter((pid) => endpoint(pid));

const isCoder = (id) => /coder|codestral|code-|devstral/i.test(id);

/**
 * Цепочка моделей для стратегии: smart — по рейтингу «ума», fast — по скорости.
 * Модели для кода уходят в конец: в общем чате они отвечают хуже своего рейтинга.
 */
export function chain(strategy = 'smart', providers = availableProviders()) {
  const ok = new Set(providers);
  const list = CATALOG.models
    .map(([provider, id, name, rank, speed, rpm, rpd, context]) => ({ provider, id, name, rank, speed, rpm, rpd, context, target: `${provider}/${id}` }))
    .filter((m) => ok.has(m.provider));
  const key = strategy === 'fast' ? (m) => [isCoder(m.id), m.speed, m.rank] : (m) => [isCoder(m.id), m.rank, m.speed];
  return list.sort((a, b) => {
    const x = key(a), y = key(b);
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
    return 0;
  });
}

// ---------- сверка с живыми списками моделей ----------
// Каталог из репозитория стареет: провайдеры снимают бесплатные модели. Раз в час на каждой копии функции спрашиваем
// у провайдера /models и оставляем только то, что у него реально есть. Не ответил или формат чужой — каталог как есть.

const MODELS_URL = { kilo: 'https://api.kilo.ai/api/gateway/models' };
const live = new Map(); // provider → { at, ids: Set | null }

async function liveIds(pid) {
  const hit = live.get(pid);
  if (hit && Date.now() - hit.at < 3600_000) return hit.ids;
  let ids = null;
  const ep = endpoint(pid);
  const p = FREE_PROVIDERS[pid];
  if (ep && p.base) {
    try {
      const r = await fetch(MODELS_URL[pid] || `${p.base}/models`, {
        headers: ep.token ? { Authorization: `Bearer ${ep.token}` } : {},
        signal: AbortSignal.timeout(4000),
      });
      const j = r.ok ? await r.json() : null;
      const list = Array.isArray(j) ? j : Array.isArray(j?.data) ? j.data : Array.isArray(j?.models) ? j.models : null;
      if (list?.length) ids = new Set(list.map((m) => String(m.id ?? m.name ?? m).replace(/^models\//, '')));
    } catch {}
  }
  live.set(pid, { at: Date.now(), ids });
  return ids;
}

/** Цепочка без моделей, которых у провайдера уже нет. */
export async function liveChain(strategy) {
  const list = chain(strategy);
  const pids = [...new Set(list.map((m) => m.provider))];
  const sets = new Map(await Promise.all(pids.map(async (pid) => [pid, await liveIds(pid)])));
  return list.filter((m) => {
    const ids = sets.get(m.provider);
    return !ids || ids.has(m.id);
  });
}

// ---------- паузы и дневные счётчики (общие для всех копий функции) ----------

let stateReady;
const ensureState = () => (stateReady ??= sql.query(`create table if not exists ai_free_state (
  target text primary key, cooldown_until timestamptz, day date, used integer not null default 0, last_error text)`));

async function loadState() {
  await ensureState();
  const rows = await sql`select target, cooldown_until, day = current_date as today, used from ai_free_state`;
  return new Map(rows.map((r) => [r.target, r]));
}

async function cool(target, seconds, reason) {
  await sql`insert into ai_free_state (target, cooldown_until, last_error) values (${target}, now() + make_interval(secs => ${seconds}), ${reason})
    on conflict (target) do update set cooldown_until = excluded.cooldown_until, last_error = excluded.last_error`.catch(() => {});
}

async function count(target) {
  await sql`insert into ai_free_state (target, day, used) values (${target}, current_date, 1)
    on conflict (target) do update set used = case when ai_free_state.day = current_date then ai_free_state.used + 1 else 1 end, day = current_date`.catch(() => {});
}

/**
 * Сколько ждать после ошибки провайдера, в секундах. Пауза общая для всех пользователей, поэтому ставим её только
 * за проблемы на стороне провайдера. 400/403/413/422 может вызвать сам запрос (длина, содержание, модерация) —
 * иначе пара испорченных запросов выключила бы модели для всех; такие ошибки дают 0, без паузы.
 */
export function cooldownFor(status, retryAfter) {
  const ra = Number(retryAfter);
  if (status === 429) return Math.min(Math.max(Number.isFinite(ra) && ra > 0 ? ra : 60, 20), 3600);
  if (status === 401) return 3600; // ключ не принят — не дёргаем час
  if (status === 404) return 6 * 3600; // модель убрали
  if (status >= 400 && status < 500) return 0;
  return 45; // 5xx, таймаут, обрыв сети
}

// Грубая оценка токенов: около 3,5 символа на токен
const tokensOf = (messages) => Math.ceil(messages.reduce((n, m) => n + m.content.length, 0) / 3.5) + 16 * messages.length;

/** Модели, подходящие для этого запроса прямо сейчас: без паузы, в пределах дневного лимита и контекста. */
export function candidates(list, state, request) {
  const need = tokensOf(request.messages);
  const now = Date.now();
  return list.filter((m) => {
    const s = state.get(m.target);
    if (s?.cooldown_until && new Date(s.cooldown_until).getTime() > now) return false;
    if (m.rpd && s?.today && s.used >= m.rpd * 0.95) return false;
    if (m.context && m.context < need + 512) return false;
    return true;
  });
}

const routeLabel = (m) => `${FREE_PROVIDERS[m.provider].name} · ${m.name}`;

/**
 * Ответ целиком (без потока и инструментов) от первой доступной бесплатной модели, кроме провайдеров exclude.
 * Нужен агенту, когда весь Groq упёрся в лимиты: найденное в сети дописывает другая модель. null — никто не ответил.
 */
export async function freeComplete(request, signal, exclude = []) {
  const [list, state] = await Promise.all([liveChain('smart'), loadState().catch(() => new Map())]);
  const tries = candidates(list.filter((m) => !exclude.includes(m.provider)), state, request).slice(0, 4);
  for (const m of tries) {
    if (signal.aborted) return null;
    const ep = endpoint(m.provider);
    const p = FREE_PROVIDERS[m.provider];
    try {
      const r = await fetch(ep.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(ep.token ? { Authorization: `Bearer ${ep.token}` } : {}), ...(p.headers || {}) },
        body: JSON.stringify({ model: m.id, messages: request.messages, max_tokens: Math.min(request.max_tokens || 2048, 4096) }),
        signal: AbortSignal.any([signal, AbortSignal.timeout(p.timeout || HEADER_TIMEOUT * 2)]),
      });
      if (!r.ok) { await r.body?.cancel().catch(() => {}); const secs = cooldownFor(r.status, r.headers.get('retry-after')); if (secs) await cool(m.target, secs, `http ${r.status}`); continue; }
      const text = String((await r.json().catch(() => null))?.choices?.[0]?.message?.content || '').trim();
      if (!text) continue;
      count(m.target);
      return { text, label: routeLabel(m) };
    } catch {
      if (signal.aborted) return null;
    }
  }
  return null;
}

/** Ответ от первой модели цепочки, которая согласилась; поток SSE передаётся как есть. */
export async function relayFree(entry, request, res, signal) {
  if (!request.messages.some((m) => m.role === 'user' && m.content.trim())) {
    return json(res, 400, { error: { message: 'Write a message first.' } });
  }
  const [list, state] = await Promise.all([liveChain(entry.strategy), loadState().catch(() => new Map())]);
  if (!list.length) return json(res, 503, { error: { message: 'pleeply Free has no free models available right now.' } });
  let tries = candidates(list, state, request);
  if (!tries.length) tries = list.slice(0, 2); // всё на паузе — пробуем лучшие, вдруг уже отпустило
  const need = tokensOf(request.messages);
  let lastStatus = 0;
  let refused = 0; // отказы, которые мог вызвать сам запрос
  const REFUSED = { error: { message: "The free models couldn't process this message. Try rephrasing or shortening it." } };
  for (const m of tries.slice(0, MAX_ATTEMPTS)) {
    if (signal.aborted) return;
    const ep = endpoint(m.provider);
    const p = FREE_PROVIDERS[m.provider];
    const maxTokens = m.context ? Math.max(256, Math.min(request.max_tokens, m.context - need - 256)) : request.max_tokens;
    const headers = { 'Content-Type': 'application/json', ...(ep.token ? { Authorization: `Bearer ${ep.token}` } : {}), ...(p.headers || {}) };
    const ctrl = new AbortController();
    const onAbort = () => ctrl.abort();
    signal.addEventListener('abort', onAbort, { once: true });
    const timer = setTimeout(() => ctrl.abort(), p.timeout || HEADER_TIMEOUT);
    let up;
    try {
      up = await fetch(ep.url, { method: 'POST', headers, body: JSON.stringify({ model: m.id, messages: request.messages, stream: true, max_tokens: maxTokens }), signal: ctrl.signal });
    } catch {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      if (signal.aborted) return;
      // долгий ответ на огромный запрос — не вина провайдера, общую паузу не ставим
      if (need < 8000) await cool(m.target, cooldownFor(0), 'network');
      continue;
    }
    clearTimeout(timer);
    if (!up.ok || !/event-stream/i.test(up.headers.get('content-type') || '')) {
      lastStatus = up.status;
      await up.body?.cancel().catch(() => {});
      signal.removeEventListener('abort', onAbort);
      const secs = cooldownFor(up.ok ? 502 : up.status, up.headers.get('retry-after'));
      if (secs) await cool(m.target, secs, `http ${up.status}`);
      else if (++refused >= 2) return json(res, 400, REFUSED); // две модели подряд отказали — дело в запросе
      continue;
    }
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no',
      'X-Pleeply-Route': encodeURIComponent(routeLabel(m)),
    });
    count(m.target);
    try {
      for await (const chunk of up.body) res.write(chunk);
    } finally {
      signal.removeEventListener('abort', onAbort);
      res.end();
    }
    return;
  }
  return json(res, lastStatus === 429 ? 429 : 503, { error: { message: 'All free models are busy right now. Try again in a minute.' } });
}

/** Сводка для страницы /chat и списка моделей: какие провайдеры подключены и сколько у них моделей. */
export async function freeSummary() {
  const list = await liveChain('smart');
  const providers = [...new Set(list.map((m) => m.provider))];
  return { providers: providers.map((id) => ({ id, name: FREE_PROVIDERS[id].name, policy: FREE_PROVIDERS[id].policy })), models: list.length, source: CATALOG.source };
}
