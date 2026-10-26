// JSON API форума: POST /api/forum?action=signup|login|logout|topic|reply|like|report|mod
// Защита от CSRF: кука SameSite=Lax + обязательный заголовок X-Pleeply, который чужой сайт без CORS не пошлёт.
import {
  sql, json, getUser, startSession, endSession, hashPassword, verifyPassword, DUMMY_HASH,
  clientKey, allow, slugify, safeNext, RESERVED,
} from './_lib/forum.js';
import { waitUntil } from '@vercel/functions';
import { answerTopic, ANSWER_CATEGORIES, mentionsBot } from './_lib/bot.js';

const USERNAME = /^[A-Za-z0-9_]{3,20}$/;
const isAdmin = (u) => u?.role === 'admin';
const isNew = (u) => Date.now() - new Date(u.created_at).getTime() < 86400e3;
const linkCount = (s) => (s.match(/https?:\/\//gi) || []).length;
const fail = (res, status, error) => json(res, status, { error });
const text = (v, max) => String(v ?? '').slice(0, max);

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return fail(res, 405, 'Method not allowed.');
    if (req.headers['x-pleeply'] !== '1' || !String(req.headers['content-type'] || '').startsWith('application/json')) {
      return fail(res, 403, 'Forbidden.');
    }
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const action = String(req.query.action || '');
    const net = clientKey(req);
    const user = await getUser(req);

    if (action === 'signup') {
      if (body.website) return json(res, 200, { redirect: '/community' }); // поле-ловушка: человек его не видит
      const username = text(body.username, 40).trim();
      const password = text(body.password, 300);
      if (!USERNAME.test(username)) return fail(res, 400, 'Username: 3–20 letters, digits or underscores.');
      if (RESERVED.has(username.toLowerCase()) || /^pleeply/i.test(username)) return fail(res, 400, 'This username is reserved.');
      if (password.length < 8) return fail(res, 400, 'Password: at least 8 characters.');
      if (!(await allow(`signup:${net}`, 5, 3600))) return fail(res, 429, 'Too many sign-ups from this network. Try again in an hour.');
      const rows = await sql`insert into forum_users (username, password_hash) values (${username}, ${hashPassword(password)})
                             on conflict do nothing returning id`;
      if (!rows.length) return fail(res, 409, 'This username is taken.');
      await startSession(res, rows[0].id);
      return json(res, 200, { redirect: safeNext(body.next) });
    }

    if (action === 'login') {
      if (!(await allow(`login:${net}`, 20, 900))) return fail(res, 429, 'Too many attempts. Wait 15 minutes.');
      const username = text(body.username, 40).trim();
      const password = text(body.password, 300);
      const [u] = await sql`select id, password_hash, role from forum_users where lower(username) = lower(${username})`;
      const ok = verifyPassword(password, u ? u.password_hash : DUMMY_HASH);
      if (!u || !ok) return fail(res, 401, 'Wrong username or password.');
      if (u.role === 'banned') return fail(res, 403, 'This account is suspended.');
      await startSession(res, u.id);
      return json(res, 200, { redirect: safeNext(body.next) });
    }

    if (action === 'logout') {
      await endSession(req, res);
      return json(res, 200, { redirect: '/community' });
    }

    // Дальше — только для вошедших
    if (!user) return fail(res, 401, 'Log in first.');
    if (user.role === 'banned') return fail(res, 403, 'Your account is suspended.');

    if (action === 'topic') {
      const title = text(body.title, 400).replace(/\s+/g, ' ').trim();
      const post = text(body.body, 30000).trim();
      if (title.length < 8 || title.length > 150) return fail(res, 400, 'Title: 8–150 characters.');
      if (post.length < 10 || post.length > 20000) return fail(res, 400, 'Post: 10–20,000 characters.');
      const [cat] = await sql`select id, slug, staff_only from forum_categories where slug = ${text(body.category, 80)}`;
      if (!cat) return fail(res, 400, 'Choose a category.');
      if (cat.staff_only && !isAdmin(user)) return fail(res, 403, 'Only the pleeply team posts in this category.');
      if (!isAdmin(user)) {
        if (isNew(user) && linkCount(post) > 2) return fail(res, 400, 'New members can add up to 2 links per post.');
        if (!(await allow(`topic:${user.id}`, 5, 86400))) return fail(res, 429, 'You can start up to 5 topics a day.');
      }
      const slug = slugify(title);
      const [row] = await sql`
        with t as (
          insert into forum_topics (category_id, user_id, title, slug, last_poster_id)
          values (${cat.id}, ${user.id}, ${title}, ${slug}, ${user.id}) returning id
        )
        insert into forum_posts (topic_id, user_id, post_number, body)
        select id, ${user.id}, 1, ${post} from t returning topic_id`;
      // ИИ-помощник отвечает в фоне: человек не ждёт ответа модели
      if (ANSWER_CATEGORIES.has(cat.slug) || mentionsBot(post)) waitUntil(answerTopic(row.topic_id));
      return json(res, 200, { redirect: `/community/t/${row.topic_id}/${slug}` });
    }

    if (action === 'reply') {
      const topicId = Number(body.topicId);
      const post = text(body.body, 30000).trim();
      if (!Number.isInteger(topicId) || topicId < 1) return fail(res, 400, 'Unknown topic.');
      if (post.length < 2 || post.length > 20000) return fail(res, 400, 'Reply: 2–20,000 characters.');
      const [t] = await sql`select id, slug, closed, hidden from forum_topics where id = ${topicId}`;
      if (!t || (t.hidden && !isAdmin(user))) return fail(res, 404, 'Unknown topic.');
      if (t.closed && !isAdmin(user)) return fail(res, 403, 'This topic is closed.');
      if (!isAdmin(user)) {
        if (isNew(user) && linkCount(post) > 2) return fail(res, 400, 'New members can add up to 2 links per post.');
        if (!(await allow(`post:${user.id}`, 30, 3600))) return fail(res, 429, 'Too many replies. Take a short break.');
      }
      const [row] = await sql`
        with p as (
          insert into forum_posts (topic_id, user_id, post_number, body)
          select ${topicId}, ${user.id}, coalesce(max(post_number), 0) + 1, ${post} from forum_posts where topic_id = ${topicId}
          returning post_number
        ), t as (
          update forum_topics set posts_count = posts_count + 1, last_posted_at = now(), last_poster_id = ${user.id}
          where id = ${topicId}
        )
        select post_number from p`;
      if (mentionsBot(post)) waitUntil(answerTopic(topicId));
      return json(res, 200, { redirect: `/community/t/${topicId}/${t.slug}#post-${row.post_number}` });
    }

    if (action === 'like') {
      const postId = Number(body.postId);
      const [p] = await sql`select id, user_id, topic_id from forum_posts where id = ${Number.isInteger(postId) ? postId : 0} and not hidden`;
      if (!p) return fail(res, 404, 'Unknown post.');
      if (p.user_id === user.id) return fail(res, 400, "You can't like your own post.");
      if (!(await allow(`like:${user.id}`, 120, 3600))) return fail(res, 429, 'Too many likes. Take a short break.');
      const removed = await sql`delete from forum_likes where post_id = ${p.id} and user_id = ${user.id} returning post_id`;
      const delta = removed.length ? -1 : (await sql`insert into forum_likes (post_id, user_id) values (${p.id}, ${user.id})
                                                       on conflict do nothing returning post_id`).length;
      if (delta) {
        await sql`update forum_posts set likes_count = greatest(likes_count + ${delta}, 0) where id = ${p.id}`;
        await sql`update forum_topics set likes_count = greatest(likes_count + ${delta}, 0) where id = ${p.topic_id}`;
      }
      const [{ likes_count: count }] = await sql`select likes_count from forum_posts where id = ${p.id}`;
      return json(res, 200, { liked: !removed.length, count });
    }

    if (action === 'report') {
      const postId = Number(body.postId);
      if (!(await allow(`report:${user.id}`, 20, 3600))) return fail(res, 429, 'Too many reports.');
      const [p] = await sql`select id from forum_posts where id = ${Number.isInteger(postId) ? postId : 0}`;
      if (!p) return fail(res, 404, 'Unknown post.');
      await sql`insert into forum_reports (post_id, user_id, reason) values (${p.id}, ${user.id}, ${text(body.reason, 500)})
                on conflict do nothing`;
      return json(res, 200, { ok: true });
    }

    if (action === 'mod') {
      if (!isAdmin(user)) return fail(res, 403, 'Moderators only.');
      const op = String(body.op || '');
      const postId = Number(body.postId) || 0;
      const topicId = Number(body.topicId) || 0;
      switch (op) {
        case 'hide':
        case 'unhide': {
          const hidden = op === 'hide';
          const [p] = await sql`update forum_posts set hidden = ${hidden} where id = ${postId} returning topic_id, post_number`;
          if (!p) return fail(res, 404, 'Unknown post.');
          if (p.post_number === 1) await sql`update forum_topics set hidden = ${hidden} where id = ${p.topic_id}`;
          await sql`update forum_reports set resolved = true where post_id = ${postId}`;
          return json(res, 200, { ok: true });
        }
        case 'pin': case 'unpin':
          await sql`update forum_topics set pinned = ${op === 'pin'} where id = ${topicId}`;
          return json(res, 200, { ok: true });
        case 'close': case 'open':
          await sql`update forum_topics set closed = ${op === 'close'} where id = ${topicId}`;
          return json(res, 200, { ok: true });
        case 'delete':
          await sql`delete from forum_topics where id = ${topicId}`;
          return json(res, 200, { redirect: '/community' });
        case 'ban': {
          const [p] = await sql`select user_id from forum_posts where id = ${postId}`;
          if (!p || p.user_id === user.id) return fail(res, 400, 'Cannot ban this user.');
          await sql`update forum_users set role = 'banned' where id = ${p.user_id} and role <> 'admin'`;
          await sql`delete from forum_sessions where user_id = ${p.user_id}`;
          return json(res, 200, { ok: true });
        }
        default:
          return fail(res, 400, 'Unknown moderation action.');
      }
    }

    return fail(res, 404, 'Unknown action.');
  } catch (err) {
    console.error('forum api', err);
    return fail(res, 500, 'Something went wrong. Please try again.');
  }
}
