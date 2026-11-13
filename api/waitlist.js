// Анкета листа ожидания: POST /api/waitlist → таблица waitlist_leads в Neon (та же база, что у форума).
// Повторная заявка с той же почтой обновляет ответы (submissions + 1), а не плодит дубли.
// Схема таблицы — в ensureTable ниже. Защита: заголовок X-Pleeply (как у форума), лимит 10 заявок в час с одной сети.
import { sql, json, clientKey, allow } from './_lib/forum.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const TIER = new Set(['pocket', 'one', 'pro']);
const LOCAL_AI = new Set(['ollama', 'lmstudio', 'own_hw', 'cloud', 'none']);
const BUDGET = new Set(['lt300', '300_499', '500_699', '700p', 'unsure']);
const DEPOSIT = new Set(['yes', 'maybe', 'no']);
const LANG = new Set(['en', 'ru']);

const pick = (v, set) => (set.has(String(v)) ? String(v) : null);
const text = (v, max) => String(v ?? '').trim().slice(0, max);

// Таблица создаётся при первом запросе после холодного старта — отдельной миграции не нужно.
let ready;
const ensureTable = () => (ready ??= (async () => {
  await sql.query(`create table if not exists waitlist_leads (
    id            bigserial primary key,
    email         text not null,
    tier          text check (tier in ('pocket', 'one', 'pro')),
    local_ai      text[] not null default '{}',
    budget        text check (budget in ('lt300', '300_499', '500_699', '700p', 'unsure')),
    deposit       text check (deposit in ('yes', 'maybe', 'no')),
    call_ok       boolean,
    lang          text,
    variant       text,
    utm_source    text,
    utm_medium    text,
    utm_campaign  text,
    referrer      text,
    ref           text,
    my_ref        text,
    session       text,
    net_key       text,
    submissions   integer not null default 1,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now()
  )`);
  await sql.query('create unique index if not exists waitlist_leads_email_key on waitlist_leads (lower(email))');
  await sql.query('create index if not exists waitlist_leads_created_idx on waitlist_leads (created_at desc)');
})().catch((err) => { ready = undefined; throw err; }));

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed.' });
    if (req.headers['x-pleeply'] !== '1' || !String(req.headers['content-type'] || '').startsWith('application/json')) {
      return json(res, 403, { error: 'Forbidden.' });
    }
    const b = req.body && typeof req.body === 'object' ? req.body : {};
    const email = text(b.email, 254).toLowerCase();
    if (!EMAIL.test(email)) return json(res, 400, { error: 'Check your email address.' });

    const net = clientKey(req);
    await ensureTable();
    if (!(await allow(`waitlist:${net}`, 10, 3600))) return json(res, 429, { error: 'Too many sign-ups. Try again later.' });

    const localAi = [...new Set((Array.isArray(b.local_ai) ? b.local_ai : []).map(String))].filter((v) => LOCAL_AI.has(v));
    const call = b.call === 'yes' ? true : b.call === 'no' ? false : null;
    const row = {
      tier: pick(b.tier, TIER),
      budget: pick(b.budget, BUDGET),
      deposit: pick(b.deposit, DEPOSIT),
      lang: pick(b.lang, LANG),
      variant: text(b.variant, 20) || null,
      utm_source: text(b.utm_source, 80) || null,
      utm_medium: text(b.utm_medium, 80) || null,
      utm_campaign: text(b.utm_campaign, 80) || null,
      referrer: text(b.referrer, 120) || null,
      ref: text(b.ref, 20) || null,
      my_ref: text(b.my_ref, 20) || null,
      session: text(b.session, 40) || null,
    };

    // При повторной заявке пустой ответ не затирает уже данный; источник (utm/referrer) остаётся первым.
    await sql`
      insert into waitlist_leads (email, tier, local_ai, budget, deposit, call_ok, lang, variant,
        utm_source, utm_medium, utm_campaign, referrer, ref, my_ref, session, net_key)
      values (${email}, ${row.tier}, ${localAi}, ${row.budget}, ${row.deposit}, ${call}, ${row.lang}, ${row.variant},
        ${row.utm_source}, ${row.utm_medium}, ${row.utm_campaign}, ${row.referrer}, ${row.ref}, ${row.my_ref},
        ${row.session}, ${net})
      on conflict (lower(email)) do update set
        tier        = coalesce(excluded.tier, waitlist_leads.tier),
        local_ai    = case when cardinality(excluded.local_ai) > 0 then excluded.local_ai else waitlist_leads.local_ai end,
        budget      = coalesce(excluded.budget, waitlist_leads.budget),
        deposit     = coalesce(excluded.deposit, waitlist_leads.deposit),
        call_ok     = coalesce(excluded.call_ok, waitlist_leads.call_ok),
        submissions = waitlist_leads.submissions + 1,
        updated_at  = now()`;

    return json(res, 200, { ok: true });
  } catch (err) {
    console.error('waitlist api', err);
    return json(res, 500, { error: 'Something went wrong.' });
  }
}
