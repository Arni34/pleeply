// Заявки с главной: POST /api/waitlist → таблица waitlist_leads в Neon (та же база, что у форума).
// Два списка: list='desktop' (ранний доступ к pleeply Desktop) и list='device' (устройство Pocket / One / Pro).
// Повторная заявка с той же почтой в тот же список обновляет ответы (submissions + 1), а не плодит дубли.
// Защита: заголовок X-Pleeply (как у форума), лимит 10 заявок в час с одной сети.
import { sql, json, clientKey, allow } from './_lib/forum.js';
import { ensureLeadsTable } from './_lib/leads.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const LIST = new Set(['desktop', 'device']);
const TIER = new Set(['pocket', 'one', 'pro']);
const LOCAL_AI = new Set(['ollama', 'lmstudio', 'own_hw', 'cloud', 'none']);
const BUDGET = new Set(['lt300', '300_499', '500_699', '700p', 'unsure']);
const DEPOSIT = new Set(['yes', 'maybe', 'no']);
const OS = new Set(['macos', 'windows', 'linux']);
const RAM = new Set(['le8', '16', '32', '64p', 'unsure']);
const GPU = new Set(['apple', 'nvidia', 'amd', 'integrated', 'unsure']);
const USE = new Set(['chat', 'code', 'docs', 'agents', 'offline']);
const LANG = new Set(['en', 'ru']);

const pick = (v, set) => (set.has(String(v)) ? String(v) : null);
const many = (v, set) => [...new Set((Array.isArray(v) ? v : []).map(String))].filter((x) => set.has(x));
const text = (v, max) => String(v ?? '').trim().slice(0, max);

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed.' });
    if (req.headers['x-pleeply'] !== '1' || !String(req.headers['content-type'] || '').startsWith('application/json')) {
      return json(res, 403, { error: 'Forbidden.' });
    }
    const b = req.body && typeof req.body === 'object' ? req.body : {};
    const email = text(b.email, 254).toLowerCase();
    if (!EMAIL.test(email)) return json(res, 400, { error: 'Check your email address.' });
    // Старые клиенты не присылают list — их заявки относятся к устройству.
    const list = pick(b.list, LIST) || 'device';
    const name = text(b.name, 80).replace(/[\u0000-\u001f]/g, '') || null;
    if (list === 'desktop' && !name) return json(res, 400, { error: 'Add your name.' });

    const net = clientKey(req);
    await ensureLeadsTable();
    if (!(await allow(`waitlist:${net}`, 10, 3600))) return json(res, 429, { error: 'Too many sign-ups. Try again later.' });

    const localAi = many(b.local_ai, LOCAL_AI);
    const useCases = many(b.use_cases, USE);
    const call = b.call === 'yes' ? true : b.call === 'no' ? false : null;
    const row = {
      tier: list === 'device' ? pick(b.tier, TIER) : null,
      budget: list === 'device' ? pick(b.budget, BUDGET) : null,
      deposit: list === 'device' ? pick(b.deposit, DEPOSIT) : null,
      os: list === 'desktop' ? pick(b.os, OS) : null,
      ram: list === 'desktop' ? pick(b.ram, RAM) : null,
      gpu: list === 'desktop' ? pick(b.gpu, GPU) : null,
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
      insert into waitlist_leads (list, email, name, tier, local_ai, budget, deposit, os, ram, gpu, use_cases, call_ok,
        lang, variant, utm_source, utm_medium, utm_campaign, referrer, ref, my_ref, session, net_key)
      values (${list}, ${email}, ${name}, ${row.tier}, ${localAi}, ${row.budget}, ${row.deposit}, ${row.os}, ${row.ram},
        ${row.gpu}, ${useCases}, ${call}, ${row.lang}, ${row.variant}, ${row.utm_source}, ${row.utm_medium},
        ${row.utm_campaign}, ${row.referrer}, ${row.ref}, ${row.my_ref}, ${row.session}, ${net})
      on conflict (list, lower(email)) do update set
        name        = coalesce(excluded.name, waitlist_leads.name),
        tier        = coalesce(excluded.tier, waitlist_leads.tier),
        local_ai    = case when cardinality(excluded.local_ai) > 0 then excluded.local_ai else waitlist_leads.local_ai end,
        budget      = coalesce(excluded.budget, waitlist_leads.budget),
        deposit     = coalesce(excluded.deposit, waitlist_leads.deposit),
        os          = coalesce(excluded.os, waitlist_leads.os),
        ram         = coalesce(excluded.ram, waitlist_leads.ram),
        gpu         = coalesce(excluded.gpu, waitlist_leads.gpu),
        use_cases   = case when cardinality(excluded.use_cases) > 0 then excluded.use_cases else waitlist_leads.use_cases end,
        call_ok     = coalesce(excluded.call_ok, waitlist_leads.call_ok),
        submissions = waitlist_leads.submissions + 1,
        updated_at  = now()`;

    return json(res, 200, { ok: true });
  } catch (err) {
    console.error('waitlist api', err);
    return json(res, 500, { error: 'Something went wrong.' });
  }
}
