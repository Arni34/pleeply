// Дашборд «визиты → заявки по источникам»: GET /stats (rewrite на /api/stats). Только для админа форума.
// Параметры: ?days=7 (1–90), ?test=1 — показать и тестовые строки (проверка тестовой заявкой).
// Для скриптов: GET /api/stats?format=json с заголовком Authorization: Bearer $STATS_TOKEN
//   → заявки по дням и источникам + визиты по дням (без почт). Без токена — только админ форума.
// Визит = session из site_events; источник визита — с его первого события.
// Источник заявки = источник её визита (waitlist_leads.session), иначе её собственные utm/referrer.
import crypto from 'node:crypto';
import { sql, getUser, esc } from './_lib/forum.js';
import { ensureLeadsTable } from './_lib/leads.js';

function tokenOk(req) {
  const want = process.env.STATS_TOKEN || '';
  const got = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (want.length < 16 || got.length !== want.length) return false;
  return crypto.timingSafeEqual(Buffer.from(got), Buffer.from(want));
}

// Заявки по дням (UTC) и источникам. Источник = utm_source → внешний referrer → direct.
const leadsByDay = (days, withTest) => sql`
  select to_char(date_trunc('day', created_at), 'YYYY-MM-DD') as day,
         coalesce(nullif(lower(utm_source), ''),
           case when coalesce(referrer, '') = '' or referrer like '%pleeply%' then 'direct' else referrer end) as source,
         coalesce(nullif(lower(utm_campaign), ''), '') as campaign,
         count(*)::int as leads,
         count(*) filter (where list = 'desktop')::int as desktop
  from waitlist_leads
  where created_at >= now() - make_interval(days => ${days})
    and (${withTest} or (coalesce(lower(utm_source), '') <> 'test' and email not like '%@example.com'))
  group by 1, 2, 3 order by 1 desc, 4 desc`;

const visitsByDay = (days, withTest) => sql`
  select to_char(date_trunc('day', ts), 'YYYY-MM-DD') as day, source, count(distinct session)::int as visits
  from site_events
  where event = 'pageview' and ts >= now() - make_interval(days => ${days}) and (${withTest} or not is_test)
  group by 1, 2 order by 1 desc, 3 desc`;

const num = (v) => Number(v || 0).toLocaleString('en-US');
const pct = (a, b) => (Number(b) ? `${((100 * Number(a)) / Number(b)).toFixed(1)}%` : '—');

function page(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
  res.end(`<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>pleeply · воронка</title><meta name="robots" content="noindex">
<style>
body{font:15px/1.45 -apple-system,Inter,system-ui,sans-serif;color:#111;background:#fff;margin:0;padding:32px 20px}
main{max-width:1100px;margin:0 auto}h1{font-size:26px;margin:0 0 4px}h2{font-size:17px;margin:32px 0 10px}
.muted{color:#6b6b66}.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:20px 0}
.tile{background:#f4f3f0;border-radius:12px;padding:14px 16px}.tile b{display:block;font-size:26px;font-variant-numeric:tabular-nums}
table{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums}th,td{padding:8px 10px;border-bottom:1px solid #e6e5e1;text-align:right}
th:first-child,td:first-child{text-align:left}th{font-weight:500;color:#6b6b66;font-size:13px}tr.total td{font-weight:600}
nav a{color:#111;margin-right:12px}nav a[aria-current]{font-weight:700;text-decoration:none}
</style></head><body><main>${body}</main></body></html>`);
}

export default async function handler(req, res) {
  try {
    const days0 = Math.min(90, Math.max(1, parseInt(req.query.days, 10) || 7));
    if (req.query.format === 'json') {
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      const user = tokenOk(req) ? { role: 'admin' } : await getUser(req);
      if (user?.role !== 'admin') { res.statusCode = 401; return res.end('{"error":"Unauthorized."}'); }
      const withTest = req.query.test === '1';
      const [t] = await sql`select to_regclass('site_events') is not null as ev, to_regclass('waitlist_leads') is not null as wl`;
      if (t.wl) await ensureLeadsTable();
      const leads = t.wl ? await leadsByDay(days0, withTest) : [];
      const visits = t.ev ? await visitsByDay(days0, withTest) : [];
      const total = leads.reduce((a, r) => a + r.leads, 0);
      res.statusCode = 200;
      return res.end(JSON.stringify({ days: days0, test_included: withTest, total_leads: total, leads_by_day: leads, visits_by_day: visits }));
    }

    const user = await getUser(req);
    if (user?.role !== 'admin') {
      return page(res, 403, `<h1>Только для админа</h1><p class="muted">Войдите на форум под админ-аккаунтом и откройте /stats снова.</p>
        <p><a href="/community/login">Войти</a></p>`);
    }

    const days = Math.min(90, Math.max(1, parseInt(req.query.days, 10) || 7));
    const withTest = req.query.test === '1';

    const [t] = await sql`select to_regclass('site_events') is not null as ev, to_regclass('waitlist_leads') is not null as wl`;
    if (!t.ev || !t.wl) {
      return page(res, 200, `<h1>Данных пока нет</h1><p class="muted">Таблицы создаются при первом событии и первой заявке:
        site_events — ${t.ev ? 'есть' : 'нет'}, waitlist_leads — ${t.wl ? 'есть' : 'нет'}.</p>`);
    }
    await ensureLeadsTable(); // колонки list/name/os… появляются здесь, даже если новых заявок ещё не было

    const rows = await sql`
      with s as (
        select session,
               (array_agg(source order by ts))[1] as source,
               bool_or(is_test) as is_test,
               bool_or(event = 'guide_view') as guide,
               bool_or(event = 'model_open') as model,
               bool_or(event = 'form_open') as form
        from site_events
        where ts >= now() - make_interval(days => ${days})
        group by session
      ),
      v as (
        select source, count(*) as visits, count(*) filter (where guide) as guide,
               count(*) filter (where model) as model, count(*) filter (where form) as form
        from s where ${withTest} or not is_test group by source
      ),
      l as (
        select w.tier, w.list,
               coalesce(s.source, nullif(lower(w.utm_source), ''),
                 case when coalesce(w.referrer, '') = '' or w.referrer like '%pleeply%' then 'direct' else w.referrer end) as source
        from waitlist_leads w left join s on s.session = w.session
        where w.created_at >= now() - make_interval(days => ${days})
          and (${withTest} or (coalesce(lower(w.utm_source), '') <> 'test'
                               and w.email not like '%@example.com'
                               and not coalesce(s.is_test, false)))
      ),
      lg as (
        select source, count(*) as leads,
               count(*) filter (where list = 'desktop') as desktop,
               count(*) filter (where tier = 'pocket') as pocket,
               count(*) filter (where tier = 'one') as one,
               count(*) filter (where tier = 'pro') as pro
        from l group by source
      )
      select coalesce(v.source, lg.source) as source,
             coalesce(v.visits, 0) as visits, coalesce(v.guide, 0) as guide, coalesce(v.model, 0) as model,
             coalesce(v.form, 0) as form, coalesce(lg.leads, 0) as leads, coalesce(lg.desktop, 0) as desktop,
             coalesce(lg.pocket, 0) as pocket, coalesce(lg.one, 0) as one, coalesce(lg.pro, 0) as pro
      from v full join lg on lg.source = v.source
      order by visits desc, leads desc`;

    const guides = await sql`
      select detail as guide, count(*) as views, count(distinct session) as visits
      from site_events
      where event = 'guide_view' and ts >= now() - make_interval(days => ${days}) and (${withTest} or not is_test)
      group by detail order by views desc`;

    const models = await sql`
      select split_part(detail, ':', 1) as model,
             count(distinct session) filter (where event = 'model_view') as seen,
             count(distinct session) filter (where event = 'model_open') as opened,
             count(distinct session) filter (where event = 'tier_click') as reserve_click,
             count(distinct session) filter (where event = 'signup') as signups
      from site_events
      where event in ('model_view', 'model_open', 'tier_click', 'signup')
        and ts >= now() - make_interval(days => ${days}) and (${withTest} or not is_test)
      group by 1 order by 1`;

    const daily = await leadsByDay(days, withTest);

    const tot = rows.reduce((a, r) => {
      for (const k of ['visits', 'guide', 'model', 'form', 'leads', 'desktop', 'pocket', 'one', 'pro']) a[k] = (a[k] || 0) + Number(r[k]);
      return a;
    }, {});

    const link = (d, label) => `<a href="/stats?days=${d}${withTest ? '&test=1' : ''}"${d === days ? ' aria-current="page"' : ''}>${label}</a>`;
    const tr = (r, cls = '') => `<tr class="${cls}"><td>${esc(r.source)}</td><td>${num(r.visits)}</td><td>${num(r.guide)}</td>
      <td>${num(r.model)}</td><td>${num(r.form)}</td><td>${num(r.leads)}</td><td>${pct(r.leads, r.visits)}</td>
      <td>${num(r.desktop)}</td><td>${num(r.pocket)}</td><td>${num(r.one)}</td><td>${num(r.pro)}</td></tr>`;

    page(res, 200, `
      <h1>Визиты → заявки</h1>
      <p class="muted">За ${days} дн. ${withTest ? '<b>Тестовые строки включены.</b>' : 'Без тестовых строк (utm_source=test, @example.com).'} Визит = вкладка (sessionStorage), без cookie.</p>
      <nav>${link(1, 'Сутки')}${link(7, '7 дней')}${link(30, '30 дней')}
        <a href="/stats?days=${days}${withTest ? '' : '&test=1'}">${withTest ? 'Скрыть тесты' : 'Показать тесты'}</a></nav>
      <div class="tiles">
        <div class="tile"><span class="muted">Визиты</span><b>${num(tot.visits)}</b></div>
        <div class="tile"><span class="muted">Открыли форму</span><b>${num(tot.form)}</b></div>
        <div class="tile"><span class="muted">Заявки</span><b>${num(tot.leads)}</b></div>
        <div class="tile"><span class="muted">Конверсия</span><b>${pct(tot.leads, tot.visits)}</b></div>
      </div>
      <h2>По источникам</h2>
      <table><thead><tr><th>Источник</th><th>Визиты</th><th>С гайдом</th><th>Открыли модель</th><th>Открыли форму</th>
        <th>Заявки</th><th>Конв.</th><th>Desktop</th><th>Pocket</th><th>One</th><th>Pro</th></tr></thead>
      <tbody>${rows.map((r) => tr(r)).join('') || '<tr><td colspan="11" class="muted">Пока пусто</td></tr>'}
      ${rows.length ? tr({ source: 'Всего', ...tot }, 'total') : ''}</tbody></table>
      <h2>Заявки по дням</h2>
      <table><thead><tr><th>День (UTC)</th><th>Источник</th><th>Кампания</th><th>Заявки</th><th>Из них Desktop</th></tr></thead>
      <tbody>${daily.map((d) => `<tr><td>${esc(d.day)}</td><td style="text-align:left">${esc(d.source)}</td><td style="text-align:left">${esc(d.campaign) || '—'}</td><td>${num(d.leads)}</td><td>${num(d.desktop)}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">Пока пусто</td></tr>'}</tbody></table>
      <p class="muted">JSON для скриптов: <code>/api/stats?format=json&amp;days=${days}</code> с заголовком <code>Authorization: Bearer STATS_TOKEN</code>.</p>
      <h2>Модели (визиты)</h2>
      <table><thead><tr><th>Модель</th><th>Увидели карточку</th><th>Открыли подробнее</th><th>Нажали «Reserve»</th><th>Заявки</th></tr></thead>
      <tbody>${models.map((m) => `<tr><td>${esc(m.model)}</td><td>${num(m.seen)}</td><td>${num(m.opened)}</td><td>${num(m.reserve_click)}</td><td>${num(m.signups)}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">Пока пусто</td></tr>'}</tbody></table>
      <h2>Гайды</h2>
      <table><thead><tr><th>Гайд</th><th>Просмотры</th><th>Визиты</th></tr></thead>
      <tbody>${guides.map((g) => `<tr><td>/info/${esc(g.guide)}/</td><td>${num(g.views)}</td><td>${num(g.visits)}</td></tr>`).join('') || '<tr><td colspan="3" class="muted">Пока пусто</td></tr>'}</tbody></table>`);
  } catch (err) {
    console.error('stats', err);
    page(res, 500, '<h1>Ошибка</h1><p class="muted">Смотрите логи функции /api/stats.</p>');
  }
}
