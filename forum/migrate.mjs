// Создаёт таблицы форума и категории (как у community.n8n.io).
// Запуск из папки pleeply: node --env-file=.env.local forum/migrate.mjs
import fs from 'node:fs';
import { neon } from '@neondatabase/serverless';

if (!process.env.DATABASE_URL) throw new Error('нет DATABASE_URL — запускай с --env-file=.env.local');
const sql = neon(process.env.DATABASE_URL);

const ddl = fs.readFileSync(new URL('./schema.sql', import.meta.url), 'utf8')
  .replace(/^--.*$/gm, '');
for (const statement of ddl.split(/;\s*\n/).map((s) => s.trim()).filter(Boolean)) {
  await sql.query(statement);
}

const categories = [
  { slug: 'announcements', name: 'Announcements', color: 'd9534f', staff: true,
    description: 'News from the pleeply team: progress, test builds, reservations.' },
  { slug: 'questions', name: 'Questions', color: '3a7bd5', staff: false,
    description: 'Running AI at home: models, hardware, voice, Home Assistant.' },
  { slug: 'ideas', name: 'Ideas', color: 'e8a317', staff: false,
    description: 'What should pleeply do? One idea per topic. Like ❤️ to vote.' },
  { slug: 'show-and-tell', name: 'Show & tell', color: '75a24c', staff: false,
    description: 'Your local-AI setups: hardware, models, speeds, photos.' },
  { slug: 'models-and-benchmarks', name: 'Models & benchmarks', color: '9b59d0', staff: false,
    description: 'Which model runs how fast on what. Post tokens per second with the model, quantization and runtime.' },
  { slug: 'smart-home-and-voice', name: 'Smart home & voice', color: '1fa39b', staff: false,
    description: 'Wake words, speech-to-text, text-to-speech, Home Assistant, privacy.' },
  { slug: 'general', name: 'General', color: '8c8c85', staff: false,
    description: 'Introductions and everything else.' },
];

// Роль 'bot' для ИИ-помощника (для баз, созданных до её появления)
await sql.query(`alter table forum_users drop constraint if exists forum_users_role_check`);
await sql.query(`alter table forum_users add constraint forum_users_role_check check (role in ('member', 'admin', 'banned', 'bot'))`);

// ИИ-помощник: войти под ним нельзя — у пароля нет формата scrypt, проверка всегда ложна
await sql`insert into forum_users (username, password_hash, role) values ('pleeply-bot', '!no-login', 'bot')
          on conflict do nothing`;

for (const [i, c] of categories.entries()) {
  await sql`
    insert into forum_categories (slug, name, description, color, position, staff_only)
    values (${c.slug}, ${c.name}, ${c.description}, ${c.color}, ${i}, ${c.staff})
    on conflict (slug) do update set name = excluded.name, description = excluded.description,
      color = excluded.color, position = excluded.position, staff_only = excluded.staff_only`;
}

const [counts] = await sql`
  select (select count(*) from forum_categories)::int as categories,
         (select count(*) from forum_users)::int as users,
         (select count(*) from forum_topics)::int as topics`;
console.log('форум готов:', counts);
