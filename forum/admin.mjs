// Управление форумом из терминала. Запуск из папки pleeply:
//   node --env-file=.env.local forum/admin.mjs users            — список участников
//   node --env-file=.env.local forum/admin.mjs promote <имя>     — сделать админом
//   node --env-file=.env.local forum/admin.mjs demote <имя>      — снять админа
//   node --env-file=.env.local forum/admin.mjs ban <имя> | unban <имя>
//   node --env-file=.env.local forum/admin.mjs reports           — жалобы без решения
//   node --env-file=.env.local forum/admin.mjs cleanup-test      — удалить тестовых test_* со всеми их темами
import { neon } from '@neondatabase/serverless';

if (!process.env.DATABASE_URL) throw new Error('нет DATABASE_URL — запускай с --env-file=.env.local');
const sql = neon(process.env.DATABASE_URL);
const [cmd, name] = process.argv.slice(2);

const setRole = async (role) => {
  if (!name) throw new Error('укажи имя участника');
  const rows = await sql`update forum_users set role = ${role} where lower(username) = lower(${name}) returning username, role`;
  if (!rows.length) throw new Error(`нет участника ${name}`);
  if (role === 'banned') await sql`delete from forum_sessions where user_id = (select id from forum_users where lower(username) = lower(${name}))`;
  console.log(rows[0]);
};

switch (cmd) {
  case 'users':
    console.table(await sql`select id, username, role, created_at::date as joined,
      (select count(*) from forum_posts p where p.user_id = u.id)::int as posts
      from forum_users u order by id`);
    break;
  case 'promote': await setRole('admin'); break;
  case 'demote': case 'unban': await setRole('member'); break;
  case 'ban': await setRole('banned'); break;
  case 'reports':
    console.table(await sql`select r.id, r.created_at::date as date, u.username as reporter, r.reason,
      t.id as topic, p.post_number as post, left(p.body, 80) as excerpt
      from forum_reports r join forum_posts p on p.id = r.post_id join forum_topics t on t.id = p.topic_id
      join forum_users u on u.id = r.user_id where not r.resolved order by r.id`);
    break;
  case 'cleanup-test': {
    const rows = await sql`delete from forum_users where username like 'test\\_%' returning username`;
    console.log('удалены:', rows.map((r) => r.username).join(', ') || 'никого');
    break;
  }
  default:
    console.log('команды: users | promote <имя> | demote <имя> | ban <имя> | unban <имя> | reports | cleanup-test');
}
