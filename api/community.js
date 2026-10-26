// Страницы форума pleeply в духе community.n8n.io. Рендер на сервере — темы видят поисковики и ИИ.
// Адреса (см. vercel.json): /community, /community/latest, /community/categories, /community/c/<slug>,
// /community/t/<id>/<slug>, /community/new, /community/login, /community/signup, /community/sitemap.xml
import { sql, esc, getUser, avatar, shortDate, renderPost, plainText, safeNext, SITE } from './_lib/forum.js';

const DESCRIPTION = 'The pleeply forum: questions about running AI at home — local models, voice assistants, private smart homes — and ideas for what pleeply should do first.';
const isAdmin = (u) => u?.role === 'admin';
// «Founding member» — первые 100 участников: id 1 — админ, id 2 — pleeply-bot, дальше люди
const FOUNDING_MAX_ID = 102;
const ld = (obj) => JSON.stringify(obj).replace(/</g, '\\u003c');

const TOPICS = `
  select t.id, t.title, t.slug, t.posts_count, t.likes_count, t.pinned, t.closed, t.created_at, t.last_posted_at,
         c.slug as cslug, c.name as cname, c.color as ccolor,
         array(select u2.username from forum_posts p2 join forum_users u2 on u2.id = p2.user_id
               where p2.topic_id = t.id and not p2.hidden
               group by u2.username order by min(p2.post_number) limit 5) as posters
  from forum_topics t join forum_categories c on c.id = t.category_id`;

const topicUrl = (t) => `/community/t/${t.id}/${t.slug}`;
const color = (hex) => (/^[0-9a-f]{3,6}$/i.test(hex || '') ? `#${hex}` : '#898988');
const pill = (slug, name, hex) => `<a class="pill" href="/community/c/${esc(slug)}"><i style="background:${color(hex)}"></i>${esc(name)}</a>`;

// ---------- каркас страницы ----------
function layout({ title, path, user, body, noindex = false, description = DESCRIPTION, structured = null }) {
  const next = encodeURIComponent(path || '/community');
  const auth = user
    ? `<span class="me">${avatar(user.username, 'sm')}<span class="me-name">${esc(user.username)}</span></span>
       <button class="link-btn keep" type="button" data-logout>Log out</button>
       <a class="btn keep" href="/community/new">+ New topic</a>`
    : `<a class="keep" href="/community/login?next=${next}">Log in</a>
       <a class="btn btn-green keep" href="/community/signup?next=${next}">Sign up</a>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
${noindex ? '<meta name="robots" content="noindex">' : `<link rel="canonical" href="${SITE}${esc(path)}">`}
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${SITE}${esc(path)}">
<meta property="og:image" content="${SITE}/og.png">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<meta name="theme-color" content="#111111">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/info/docs.css">
${structured ? `<script type="application/ld+json">${ld(structured)}</script>` : ''}
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="top">
  <div class="top-in">
    <a class="brand" href="/community" aria-label="pleeply community"><span class="mark">pleeply<i></i></span><span class="docs">community</span></a>
    <nav class="top-links" aria-label="Site">
      <a href="/info/">Docs</a>
      <a href="/">Product</a>
      ${auth}
    </nav>
  </div>
</header>
${body}
<footer class="foot">
  <div class="foot-in"><span class="mark">pleeply<i></i></span><span>© 2026 pleeply. In development.</span><span class="foot-links"><a href="/info/">Docs</a><a href="/#reserve">Join waitlist</a></span></div>
</footer>
<script>${CLIENT}</script>
<script defer src="/_vercel/insights/script.js"></script>
</body>
</html>`;
}

// Формы, лайки, жалобы и модерация — через /api/forum
const CLIENT = `(function () {
  function api(action, data) {
    return fetch('/api/forum?action=' + action, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Pleeply': '1' }, body: JSON.stringify(data || {})
    }).then(function (r) {
      return r.json().catch(function () { return { error: 'Something went wrong.' }; }).then(function (j) {
        if (!r.ok) throw new Error(j.error || 'Something went wrong.');
        return j;
      });
    });
  }
  // Если адрес отличается только якорем (#post-3), браузер не перезагрузит страницу — делаем это сами
  function go(to) {
    var u = new URL(to || location.href, location.href);
    if (u.pathname === location.pathname && u.search === location.search) {
      history.replaceState(null, '', u.hash || location.hash);
      location.reload();
    } else location.href = u.href;
  }
  document.querySelectorAll('form[data-action]').forEach(function (f) {
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = f.querySelector('[type=submit]'), err = f.querySelector('.form-error'), data = {};
      new FormData(f).forEach(function (v, k) { data[k] = v; });
      btn.disabled = true; err.textContent = '';
      api(f.dataset.action, data).then(function (j) { go(j.redirect); })
        .catch(function (x) { err.textContent = x.message; btn.disabled = false; });
    });
  });
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-like],[data-report],[data-mod],[data-logout]');
    if (!t) return;
    if (t.hasAttribute('data-logout')) { api('logout').then(function () { location.href = '/community'; }); return; }
    if (t.dataset.like) {
      if (t.dataset.auth === '0') { location.href = '/community/login?next=' + encodeURIComponent(location.pathname); return; }
      t.disabled = true;
      api('like', { postId: +t.dataset.like }).then(function (j) {
        t.setAttribute('aria-pressed', j.liked ? 'true' : 'false');
        t.querySelector('span').textContent = j.count || '';
      }).catch(function (x) { alert(x.message); }).then(function () { t.disabled = false; });
    }
    if (t.dataset.report) {
      var reason = prompt('What is wrong with this post? (spam, rude, off-topic…)');
      if (reason === null) return;
      api('report', { postId: +t.dataset.report, reason: reason }).then(function () { t.textContent = 'Reported'; t.disabled = true; })
        .catch(function (x) { alert(x.message); });
    }
    if (t.dataset.mod) {
      if (!confirm('Are you sure?')) return;
      api('mod', { op: t.dataset.mod, postId: +t.dataset.post || 0, topicId: +t.dataset.topic || 0 })
        .then(function (j) { go(j.redirect); }).catch(function (x) { alert(x.message); });
    }
  });
})();`;

// ---------- куски ----------
const tabs = (active) => `<nav class="cm-tabs" aria-label="Forum views">
  <a href="/community/latest"${active === 'latest' ? ' aria-current="page"' : ''}>Latest</a>
  <a href="/community/categories"${active === 'categories' ? ' aria-current="page"' : ''}>Categories</a>
  <a href="/community"${active === 'top' ? ' aria-current="page"' : ''}>Top</a>
</nav>`;

function topicTable(topics, user) {
  if (!topics.length) {
    return `<div class="cm-empty"><p><strong>The forum has just opened.</strong> Be one of the first to post: ask a question, share your setup or suggest a feature.</p>
      <a class="btn" href="${user ? '/community/new' : '/community/signup?next=%2Fcommunity%2Fnew'}">Start the first topic</a></div>`;
  }
  return `<div class="table topics"><table>
    <thead><tr><th>Topic</th><th class="hide-sm">Posters</th><th class="num">Replies</th><th class="num">Activity</th></tr></thead>
    <tbody>${topics.map((t) => `<tr>
      <td><a class="t-title" href="${topicUrl(t)}">${t.pinned ? '<span class="flag" title="Pinned">📌</span> ' : ''}${t.closed ? '<span class="flag" title="Closed">🔒</span> ' : ''}${esc(t.title)}</a>
        <div class="t-meta">${pill(t.cslug, t.cname, t.ccolor)}${t.likes_count ? `<span class="t-likes">♥ ${t.likes_count}</span>` : ''}</div></td>
      <td class="hide-sm posters">${(t.posters || []).map((n) => avatar(n, 'sm')).join('')}</td>
      <td class="num">${Math.max(0, t.posts_count - 1)}</td>
      <td class="num" title="${new Date(t.last_posted_at).toISOString()}">${shortDate(t.last_posted_at)}</td>
    </tr>`).join('')}</tbody>
  </table></div>`;
}

const categoryCards = (cats) => `<div class="cm-cats">${cats.map((c) => `<a class="cm-cat" href="/community/c/${esc(c.slug)}" style="--cat:${color(c.color)}">
  <strong>${esc(c.name)}</strong><span>${esc(c.description)}</span><em>${c.topics} ${c.topics === 1 ? 'topic' : 'topics'}</em></a>`).join('')}</div>`;

const categoriesWithCounts = () => sql`
  select c.*, (select count(*) from forum_topics t where t.category_id = c.id and not t.hidden)::int as topics
  from forum_categories c order by c.position`;

const newTopicLink = (user, category) => {
  const target = `/community/new${category ? `?category=${encodeURIComponent(category)}` : ''}`;
  return user ? target : `/community/signup?next=${encodeURIComponent(target)}`;
};

// ---------- страницы ----------
async function viewTop(req, user) {
  const [[stats], pinned, top, cats] = await Promise.all([
    sql`select (select count(*) from forum_users where role <> 'banned')::int as users,
               (select count(*) from forum_topics where not hidden)::int as topics`,
    sql.query(`${TOPICS} where not t.hidden and t.pinned order by t.last_posted_at desc limit 3`),
    sql.query(`${TOPICS} where not t.hidden and t.created_at > now() - interval '1 year'
               order by (t.likes_count * 3 + (t.posts_count - 1) * 2) desc, t.last_posted_at desc limit 30`),
    categoriesWithCounts(),
  ]);
  const statLine = [stats.users >= 25 && `${stats.users.toLocaleString('en-US')} members`,
    stats.topics >= 10 && `${stats.topics.toLocaleString('en-US')} topics`].filter(Boolean);
  const body = `<main id="main" class="cm">
  <p class="crumb">Community</p>
  <h1>pleeply Community</h1>
  <p class="cm-lead">A forum for people running AI at home — local models, voice assistants, private smart homes — and for shaping what pleeply becomes.</p>
  <div class="cm-actions">
    ${user ? '<a class="btn btn-lg" href="/community/new">+ New topic</a>' : '<a class="btn btn-lg btn-green" href="/community/signup">Join the community →</a><a class="btn-ghost" href="/community/login">Log in</a>'}
    <a class="btn-ghost" href="/info/">Read the docs</a>
  </div>
  ${statLine.length ? `<p class="cm-stats">${statLine.join(' · ')}</p>` : ''}
  ${pinned.length ? `<section aria-labelledby="hl"><h2 class="cm-h" id="hl">Community highlights</h2>
    <div class="cm-highlights">${pinned.map((t) => `<a class="cm-card" href="${topicUrl(t)}"><span class="cm-card-cat">${esc(t.cname)}</span><strong>${esc(t.title)}</strong><span class="cm-card-date">${shortDate(t.last_posted_at)}</span></a>`).join('')}</div></section>` : ''}
  ${tabs('top')}
  <section aria-labelledby="top-h"><h2 class="cm-h" id="top-h">Top topics this year</h2>${topicTable(top, user)}</section>
  <section aria-labelledby="cats-h"><h2 class="cm-h" id="cats-h">Categories</h2>${categoryCards(cats)}</section>
</main>`;
  const structured = {
    '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'pleeply Community', url: `${SITE}/community`,
    ...(top.length ? { mainEntity: { '@type': 'ItemList', itemListElement: top.slice(0, 10).map((t, i) => ({ '@type': 'ListItem', position: i + 1, name: t.title, url: SITE + topicUrl(t) })) } } : {}),
  };
  return { body: layout({ title: 'pleeply Community · Top topics', path: '/community', user, body, structured }) };
}

async function viewLatest(req, user) {
  const topics = await sql.query(`${TOPICS} where not t.hidden order by t.pinned desc, t.last_posted_at desc limit 50`);
  const body = `<main id="main" class="cm">
  <p class="crumb"><a href="/community">Community</a></p>
  <h1>Latest topics</h1>
  <div class="cm-actions"><a class="btn" href="${newTopicLink(user)}">+ New topic</a></div>
  ${tabs('latest')}
  <section class="cm-list">${topicTable(topics, user)}</section>
</main>`;
  return { body: layout({ title: 'Latest topics · pleeply Community', path: '/community/latest', user, body }) };
}

async function viewCategories(req, user) {
  const cats = await categoriesWithCounts();
  const body = `<main id="main" class="cm">
  <p class="crumb"><a href="/community">Community</a></p>
  <h1>Categories</h1>
  ${tabs('categories')}
  <section class="cm-list">${categoryCards(cats)}</section>
</main>`;
  return { body: layout({ title: 'Categories · pleeply Community', path: '/community/categories', user, body }) };
}

async function viewCategory(req, user) {
  const slug = String(req.query.slug || '');
  const [cat] = await sql`select * from forum_categories where slug = ${slug}`;
  if (!cat) return notFound(req, user);
  const topics = await sql.query(`${TOPICS} where not t.hidden and c.slug = $1 order by t.pinned desc, t.last_posted_at desc limit 50`, [slug]);
  const canPost = !cat.staff_only || isAdmin(user);
  const body = `<main id="main" class="cm">
  <p class="crumb"><a href="/community">Community</a></p>
  <h1 class="cat-title"><i style="background:${color(cat.color)}"></i>${esc(cat.name)}</h1>
  <p class="cm-lead">${esc(cat.description)}</p>
  ${canPost ? `<div class="cm-actions"><a class="btn" href="${newTopicLink(user, cat.slug)}">+ New topic</a></div>` : ''}
  ${tabs('')}
  <section class="cm-list">${topicTable(topics, user)}</section>
</main>`;
  return {
    body: layout({
      title: `${cat.name} · pleeply Community`, path: `/community/c/${cat.slug}`, user, body,
      description: `${cat.name} on the pleeply Community: ${cat.description}`,
    }),
  };
}

async function viewTopic(req, user) {
  const id = Number(req.query.id);
  if (!Number.isInteger(id) || id < 1) return notFound(req, user);
  const [t] = await sql`select t.*, c.slug as cslug, c.name as cname, c.color as ccolor
                        from forum_topics t join forum_categories c on c.id = t.category_id where t.id = ${id}`;
  if (!t || (t.hidden && !isAdmin(user))) return notFound(req, user);
  const posts = await sql`
    select p.id, p.post_number, p.body, p.created_at, p.likes_count, p.hidden, p.user_id, u.username, u.role,
           exists(select 1 from forum_likes l where l.post_id = p.id and l.user_id = ${user?.id || 0}) as liked
    from forum_posts p join forum_users u on u.id = p.user_id
    where p.topic_id = ${id} order by p.post_number`;
  const admin = isAdmin(user);
  const path = topicUrl(t);
  const first = posts[0];

  const postHtml = (p) => {
    const hiddenForViewer = p.hidden && !admin;
    const tools = [];
    if (user && user.id !== p.user_id && !hiddenForViewer) tools.push(`<button class="tool" type="button" data-report="${p.id}">Report</button>`);
    if (admin) {
      tools.push(`<button class="tool" type="button" data-mod="${p.hidden ? 'unhide' : 'hide'}" data-post="${p.id}">${p.hidden ? 'Unhide' : 'Hide'}</button>`);
      if (p.user_id !== user.id && p.role !== 'admin') tools.push(`<button class="tool danger" type="button" data-mod="ban" data-post="${p.id}">Ban author</button>`);
    }
    return `<article class="post${p.hidden ? ' is-hidden' : ''}" id="post-${p.post_number}">
      <div class="post-side">${avatar(p.username)}</div>
      <div class="post-main">
        <header class="post-head"><strong>${esc(p.username)}</strong>${p.role === 'admin' ? '<span class="badge">Team</span>' : ''}${p.role === 'bot' ? '<span class="badge badge-bot">AI bot</span>' : ''}${p.role === 'member' && p.user_id <= FOUNDING_MAX_ID ? '<span class="badge badge-founding" title="One of the first 100 members">Founding member</span>' : ''}
          <a class="post-date" href="#post-${p.post_number}" title="${new Date(p.created_at).toISOString()}"><time datetime="${new Date(p.created_at).toISOString()}">${shortDate(p.created_at)}</time></a></header>
        <div class="post-body">${hiddenForViewer ? '<p class="muted">This post was hidden by a moderator.</p>' : renderPost(p.body)}${p.hidden && admin ? '<p class="muted">Hidden from members.</p>' : ''}${p.role === 'bot' && !hiddenForViewer ? '<p class="bot-note">Automated answer from pleeply\'s AI helper. It can be wrong, so check the linked sources.</p>' : ''}</div>
        <footer class="post-actions">
          ${hiddenForViewer ? '' : `<button class="like" type="button" data-like="${p.id}" data-auth="${user ? 1 : 0}" aria-pressed="${p.liked}" aria-label="Like this post" ${user && user.id === p.user_id ? 'disabled' : ''}>♥ <span>${p.likes_count || ''}</span></button>`}
          ${tools.join('')}
        </footer>
      </div>
    </article>`;
  };

  let composer;
  if (t.closed && !admin) composer = '<p class="cm-note">This topic is closed for new replies.</p>';
  else if (!user) composer = `<div class="cm-empty"><p>Join the community to reply. It takes a few seconds and needs no email.</p>
    <a class="btn btn-green" href="/community/signup?next=${encodeURIComponent(path)}">Sign up</a> <a class="btn-ghost" href="/community/login?next=${encodeURIComponent(path)}">Log in</a></div>`;
  else if (user.role === 'banned') composer = '<p class="cm-note">Your account is suspended.</p>';
  else composer = `<form class="composer" data-action="reply">
    <input type="hidden" name="topicId" value="${t.id}">
    <label for="reply-body">Your reply</label>
    <textarea id="reply-body" name="body" rows="6" required minlength="2" maxlength="20000"></textarea>
    <p class="form-hint">Markdown works: **bold**, *italic*, \`code\`, links. Mention @pleeply-bot to ask the AI helper. Be kind and stay on topic.</p>
    <p class="form-error" role="alert"></p>
    <button class="btn" type="submit">Reply</button>
  </form>`;

  const modBar = admin ? `<div class="mod-bar">
    <button class="tool" type="button" data-mod="${t.pinned ? 'unpin' : 'pin'}" data-topic="${t.id}">${t.pinned ? 'Unpin' : 'Pin'}</button>
    <button class="tool" type="button" data-mod="${t.closed ? 'open' : 'close'}" data-topic="${t.id}">${t.closed ? 'Reopen' : 'Close'}</button>
    <button class="tool danger" type="button" data-mod="delete" data-topic="${t.id}">Delete topic</button></div>` : '';

  const visible = posts.filter((p) => !p.hidden);
  const replies = Math.max(0, visible.length - 1);
  const body = `<main id="main" class="cm cm-topic">
  <p class="crumb"><a href="/community">Community</a></p>
  <h1>${t.pinned ? '<span class="flag" title="Pinned">📌</span> ' : ''}${esc(t.title)}</h1>
  <div class="topic-meta">${pill(t.cslug, t.cname, t.ccolor)}<span>${replies} ${replies === 1 ? 'reply' : 'replies'}</span>${t.closed ? '<span>🔒 Closed</span>' : ''}${t.hidden ? '<span>Hidden</span>' : ''}</div>
  ${modBar}
  <div class="posts">${posts.map(postHtml).join('')}</div>
  <section class="reply-box" aria-label="Reply">${composer}</section>
</main>`;

  const person = (name) => ({ '@type': 'Person', name, url: `${SITE}/community` });
  const structured = first && !first.hidden ? {
    '@context': 'https://schema.org', '@type': 'DiscussionForumPosting',
    headline: t.title, url: SITE + path, datePublished: new Date(t.created_at).toISOString(),
    dateModified: new Date(t.last_posted_at).toISOString(), author: person(first.username),
    text: plainText(first.body).slice(0, 1000),
    interactionStatistic: [
      { '@type': 'InteractionCounter', interactionType: 'https://schema.org/CommentAction', userInteractionCount: replies },
      { '@type': 'InteractionCounter', interactionType: 'https://schema.org/LikeAction', userInteractionCount: first.likes_count },
    ],
    comment: visible.slice(1, 30).map((p) => ({
      '@type': 'Comment', author: person(p.username), datePublished: new Date(p.created_at).toISOString(),
      text: plainText(p.body).slice(0, 1000), url: `${SITE}${path}#post-${p.post_number}`,
    })),
  } : null;

  return {
    body: layout({
      title: `${t.title} · pleeply Community`, path, user, body, structured, noindex: t.hidden,
      description: first && !first.hidden ? plainText(first.body).slice(0, 155) : DESCRIPTION,
    }),
  };
}

async function viewNew(req, user) {
  if (!user) return { redirect: `/community/signup?next=${encodeURIComponent('/community/new')}` };
  const cats = await sql`select slug, name, staff_only from forum_categories order by position`;
  const chosen = String(req.query.category || '');
  const options = cats.filter((c) => !c.staff_only || isAdmin(user))
    .map((c) => `<option value="${esc(c.slug)}"${c.slug === chosen ? ' selected' : ''}>${esc(c.name)}</option>`).join('');
  const body = `<main id="main" class="cm cm-narrow">
  <p class="crumb"><a href="/community">Community</a></p>
  <h1>New topic</h1>
  ${user.role === 'banned' ? '<p class="cm-note">Your account is suspended.</p>' : `<form class="composer" data-action="topic">
    <label for="f-cat">Category</label>
    <select id="f-cat" name="category" required><option value="">Choose a category</option>${options}</select>
    <label for="f-title">Title</label>
    <input id="f-title" name="title" required minlength="8" maxlength="150" autocomplete="off" placeholder="Ask a question or share an idea in one sentence">
    <label for="f-body">Post</label>
    <textarea id="f-body" name="body" rows="10" required minlength="10" maxlength="20000"></textarea>
    <p class="form-hint">Markdown works: **bold**, *italic*, \`code\`, links. Be kind and stay on topic.</p>
    <p class="form-error" role="alert"></p>
    <button class="btn" type="submit">Create topic</button>
  </form>`}
</main>`;
  return { body: layout({ title: 'New topic · pleeply Community', path: '/community/new', user, body, noindex: true }) };
}

function authView(kind) {
  return async (req, user) => {
    const next = safeNext(req.query.next);
    if (user) return { redirect: next };
    const signup = kind === 'signup';
    const body = `<main id="main" class="cm cm-narrow">
  <p class="crumb"><a href="/community">Community</a></p>
  <h1>${signup ? 'Join the pleeply Community' : 'Log in'}</h1>
  ${signup ? '<p class="cm-lead">Pick a username and a password. No email needed.</p>' : ''}
  <form class="composer" data-action="${kind}">
    <input type="hidden" name="next" value="${esc(next)}">
    <label for="f-user">Username</label>
    <input id="f-user" name="username" required minlength="3" maxlength="20" pattern="[A-Za-z0-9_]+" autocomplete="username" autocapitalize="off" spellcheck="false">
    ${signup ? '<p class="form-hint">3–20 letters, digits or underscores. Shown next to your posts.</p>' : ''}
    <label for="f-pass">Password</label>
    <input id="f-pass" name="password" type="password" required minlength="${signup ? 8 : 1}" autocomplete="${signup ? 'new-password' : 'current-password'}">
    ${signup ? '<p class="form-hint">At least 8 characters. There is no email reset yet, so keep it somewhere safe.</p>' : ''}
    <div class="hp" aria-hidden="true"><label for="f-web">Website</label><input id="f-web" name="website" tabindex="-1" autocomplete="off"></div>
    <p class="form-error" role="alert"></p>
    <button class="btn${signup ? ' btn-green' : ''}" type="submit">${signup ? 'Create account' : 'Log in'}</button>
  </form>
  <p class="cm-switch">${signup ? `Already a member? <a href="/community/login?next=${encodeURIComponent(next)}">Log in</a>` : `New here? <a href="/community/signup?next=${encodeURIComponent(next)}">Create an account</a>`}</p>
  ${signup ? `<div class="cm-rules"><h2>House rules</h2><ul>
    <li>Be kind and stay on topic. No spam or affiliate links.</li>
    <li>If you work on a competing product, say so.</li>
    <li>pleeply is in development: specs and prices on the site are plans, not promises.</li>
    <li>Don't post personal data — yours or anyone else's.</li></ul></div>` : ''}
</main>`;
    return { body: layout({ title: `${signup ? 'Sign up' : 'Log in'} · pleeply Community`, path: `/community/${kind}`, user, body, noindex: true }) };
  };
}

async function viewSitemap() {
  const [cats, topics] = await Promise.all([
    sql`select slug from forum_categories order by position`,
    sql`select id, slug, last_posted_at from forum_topics where not hidden order by last_posted_at desc limit 5000`,
  ]);
  const urls = [
    { loc: '/community' }, { loc: '/community/latest' }, { loc: '/community/categories' },
    ...cats.map((c) => ({ loc: `/community/c/${c.slug}` })),
    ...topics.map((t) => ({ loc: topicUrl(t), lastmod: new Date(t.last_posted_at).toISOString().slice(0, 10) })),
  ];
  return {
    type: 'application/xml; charset=utf-8',
    body: `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${SITE}${esc(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}</url>`).join('\n')}
</urlset>
`,
  };
}

function notFound(req, user) {
  const body = `<main id="main" class="cm cm-narrow"><p class="crumb"><a href="/community">Community</a></p>
    <h1>Not found</h1><p class="cm-lead">This topic doesn't exist or was removed.</p><a class="btn" href="/community">Back to the community</a></main>`;
  return { status: 404, body: layout({ title: 'Not found · pleeply Community', path: '/community', user, body, noindex: true }) };
}

const VIEWS = {
  top: viewTop, latest: viewLatest, categories: viewCategories, category: viewCategory, topic: viewTopic,
  new: viewNew, login: authView('login'), signup: authView('signup'), sitemap: viewSitemap,
};

export default async function handler(req, res) {
  try {
    const user = await getUser(req);
    const view = VIEWS[String(req.query.view || 'top')] || notFound;
    const page = await view(req, user);
    res.setHeader('Cache-Control', 'no-store');
    if (page.redirect) {
      res.statusCode = 302;
      res.setHeader('Location', page.redirect);
      return res.end();
    }
    res.statusCode = page.status || 200;
    res.setHeader('Content-Type', page.type || 'text/html; charset=utf-8');
    return res.end(page.body);
  } catch (err) {
    console.error('community page', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.end(layout({
      title: 'Error · pleeply Community', path: '/community', user: null, noindex: true,
      body: '<main id="main" class="cm cm-narrow"><h1>Something went wrong</h1><p class="cm-lead">Please try again in a minute.</p></main>',
    }));
  }
}
