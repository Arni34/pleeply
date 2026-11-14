// Разовая настройка для аналитики (задача Веги ta32f7bd5, одобрено владельцем 2026-11-14):
//  1) таблица lead_interviews (п. 3.3 vega-output/lead_criteria.md);
//  2) роль pleeply_reader только на чтение (SELECT по схеме public, включая будущие таблицы).
// Из папки pleeply:  node --env-file=.env.local forum/interviews-setup.mjs
// Повторный запуск безопасен; пароль роли меняется, новая строка подключения
// печатается как DATABASE_URL_READONLY=... — её надо сохранить в .env.local.
import { neon } from '@neondatabase/serverless';
import { randomBytes } from 'node:crypto';

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) throw new Error('нет DATABASE_URL — запускай с --env-file=.env.local');
const sql = neon(url);

await sql.query(`create table if not exists lead_interviews (
  email         text primary key,
  held_at       timestamptz not null,
  hw_spend_12m  int,
  current_cost  text,
  wtp_verdict   text check (wtp_verdict in ('strong', 'weak', 'none')),
  commitment    text,
  notes         text
)`);
await sql.query(`comment on table lead_interviews is 'Результаты интервью с листом ожидания; правила — vega-output/lead_criteria.md'`);

const [{ db, owner }] = await sql`select current_database() as db, current_user as owner`;
const pass = randomBytes(24).toString('base64url');
const [{ exists }] = await sql`select exists(select 1 from pg_roles where rolname = 'pleeply_reader') as exists`;
await sql.query(`${exists ? 'alter' : 'create'} role pleeply_reader with login password '${pass}'`);
for (const q of [
  `grant connect on database "${db}" to pleeply_reader`,
  `grant usage on schema public to pleeply_reader`,
  `grant select on all tables in schema public to pleeply_reader`,
  `alter default privileges for role "${owner}" in schema public grant select on tables to pleeply_reader`,
  `alter role pleeply_reader set default_transaction_read_only = on`,
]) await sql.query(q);

const ro = new URL(process.env.DATABASE_URL);
ro.username = 'pleeply_reader';
ro.password = pass;
console.log(`DATABASE_URL_READONLY=${ro.toString()}`);
