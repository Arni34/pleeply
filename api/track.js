// Своя аналитика без cookie: POST /api/track → таблица site_events в Neon (та же база, что у форума и waitlist_leads).
// Пишет client assets/track.js: pageview, guide_view, model_view, model_open, pricing_view, tier_click, form_open, signup.
// Почту, IP и user-agent не храним: визит = случайный id из sessionStorage, страна — из заголовка Vercel.
// Защита: заголовок X-Pleeply (как у форума), лимит 300 событий в час с одной сети, боты по user-agent не пишутся.
import { sql, json, clientKey, allow } from './_lib/forum.js';
import { attribute } from './_lib/source.js';

const EVENTS = new Set([
  'pageview', 'guide_view', 'model_view', 'model_open', 'pricing_view', 'tier_click', 'form_open', 'signup', 'lead_save_failed',
]);
const BOT = /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|facebookexternalhit|embedly|curl|wget|python|node-fetch|axios/i;
const text = (v, max) => String(v ?? '').trim().slice(0, max);

// Таблица создаётся при первом запросе после холодного старта — как waitlist_leads в api/waitlist.js.
let ready;
const ensureTable = () => (ready ??= (async () => {
  await sql.query(`create table if not exists site_events (
    id        bigserial primary key,
    ts        timestamptz not null default now(),
    session   text not null,
    event     text not null,
    detail    text,
    path      text,
    source    text not null default 'direct',
    medium    text,
    campaign  text,
    referrer  text,
    ref       text,
    variant   text,
    lang      text,
    country   text,
    is_test   boolean not null default false
  )`);
  await sql.query('create index if not exists site_events_ts_idx on site_events (ts desc)');
  await sql.query('create index if not exists site_events_session_idx on site_events (session)');
})().catch((err) => { ready = undefined; throw err; }));

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed.' });
    if (req.headers['x-pleeply'] !== '1' || !String(req.headers['content-type'] || '').startsWith('application/json')) {
      return json(res, 403, { error: 'Forbidden.' });
    }
    if (BOT.test(String(req.headers['user-agent'] || ''))) return json(res, 202, { ok: true, skipped: 'bot' });

    const b = req.body && typeof req.body === 'object' ? req.body : {};
    const event = text(b.event, 40);
    const session = text(b.session, 40);
    if (!EVENTS.has(event) || !/^[a-z0-9]{4,40}$/i.test(session)) return json(res, 400, { error: 'Bad event.' });

    await ensureTable();
    if (!(await allow(`track:${clientKey(req)}`, 300, 3600))) return json(res, 429, { error: 'Too many events.' });

    const src = attribute(b);
    const isTest = b.test === true || src.source === 'test';
    const country = text(req.headers['x-vercel-ip-country'], 2).toUpperCase() || null;

    await sql`
      insert into site_events (session, event, detail, path, source, medium, campaign, referrer, ref, variant, lang, country, is_test)
      values (${session}, ${event}, ${text(b.detail, 120) || null}, ${text(b.path, 200) || null},
        ${src.source}, ${src.medium}, ${src.campaign}, ${src.referrer}, ${text(b.ref, 20) || null},
        ${text(b.variant, 20) || null}, ${text(b.lang, 5) || null}, ${country}, ${isTest})`;

    return json(res, 200, { ok: true });
  } catch (err) {
    console.error('track api', err);
    return json(res, 500, { error: 'Something went wrong.' });
  }
}
