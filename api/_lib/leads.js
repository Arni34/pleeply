// Таблица заявок waitlist_leads: два списка в одной таблице.
//   list = 'device'  — лист ожидания устройства (Pocket / One / Pro), все старые строки;
//   list = 'desktop' — ранний доступ к приложению pleeply Desktop.
// Одна почта может стоять в обоих списках: уникальность по (list, lower(email)).
// Таблица и новые колонки создаются при первом запросе после холодного старта — отдельной миграции не нужно.
import { sql } from './forum.js';

let ready;
export const ensureLeadsTable = () => (ready ??= (async () => {
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
  // Ноябрь 2026: второй список (Desktop) и поля его анкеты.
  await sql.query(`alter table waitlist_leads add column if not exists list text not null default 'device'
    check (list in ('device', 'desktop'))`);
  await sql.query('alter table waitlist_leads add column if not exists name text');
  await sql.query('alter table waitlist_leads add column if not exists os text');
  await sql.query('alter table waitlist_leads add column if not exists ram text');
  await sql.query('alter table waitlist_leads add column if not exists gpu text');
  await sql.query("alter table waitlist_leads add column if not exists use_cases text[] not null default '{}'");
  await sql.query('create unique index if not exists waitlist_leads_list_email_key on waitlist_leads (list, lower(email))');
  await sql.query('drop index if exists waitlist_leads_email_key');
  await sql.query('create index if not exists waitlist_leads_created_idx on waitlist_leads (created_at desc)');
})().catch((err) => { ready = undefined; throw err; }));
