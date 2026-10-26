#!/usr/bin/env node
// Сборка раздела /info и страницы /community (без зависимостей): node info-src/build.mjs
// Вход: info-src/pages/*.md и info-src/site.json (адрес форума Discourse).
// Выход: info/**, community/index.html, llms.txt, llms-full.txt, sitemap.xml.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const OUT = path.join(ROOT, 'info');
const SITE = 'https://pleeply.vercel.app';
const SECTIONS = [
  { id: 'start', title: 'Start here' },
  { id: 'learn', title: 'Learn' },
  { id: 'build', title: 'Run it yourself' },
  { id: 'compare', title: 'Compare' },
  { id: 'pleeply', title: 'pleeply' },
];
const site = JSON.parse(fs.readFileSync(path.join(HERE, 'site.json'), 'utf8'));
// COMMUNITY_URL в окружении — проверить вёрстку на чужом форуме, не трогая site.json
// Адрес вида "/community" — свой форум на сайте (api/community.js), иначе — внешний Discourse
const FORUM = (process.env.COMMUNITY_URL ?? site.communityUrl ?? '').replace(/\/+$/, '');
const INTERNAL = FORUM.startsWith('/');
const TODAY = new Date().toISOString().slice(0, 10);
let community = null; // данные форума: блок «Join» и /community

// ---------- Markdown ----------
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const slugify = (s) => s.toLowerCase().replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const plain = (s) => s.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/[*`>#|]/g, '').replace(/\s+/g, ' ').trim();

function inline(s) {
  const codes = [];
  s = s.replace(/`([^`]+)`/g, (_, c) => `\u0000${codes.push(c) - 1}\u0000`);
  s = esc(s);
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, u) =>
    /^https?:/.test(u) ? `<a href="${u}" rel="noopener" target="_blank">${t}</a>` : `<a href="${u}">${t}</a>`);
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?![*\w])/g, '$1<em>$2</em>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${esc(codes[i])}</code>`);
}

const BLOCK = /^(#{2,4}\s|```|>|\||- |\* |\d+\.\s|:::)/;

function md(src, toc = null) {
  const lines = src.replace(/\r/g, '').split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    const fence = line.match(/^```(\w*)/);
    if (fence) {
      const buf = [];
      for (i++; i < lines.length && !lines[i].startsWith('```'); i++) buf.push(lines[i]);
      i++;
      out.push(`<pre><code${fence[1] ? ` class="lang-${fence[1]}"` : ''}>${esc(buf.join('\n'))}</code></pre>`);
      continue;
    }

    if (line.trim() === ':::cards') {
      const buf = [];
      for (i++; i < lines.length && lines[i].trim() !== ':::'; i++) buf.push(lines[i]);
      i++;
      out.push(cards(buf));
      continue;
    }

    const h = line.match(/^(#{2,4})\s+(.*)$/);
    if (h) {
      const lvl = h[1].length, text = h[2].trim(), id = slugify(text);
      if (toc && lvl === 2) toc.push({ id, text: plain(text) });
      out.push(`<h${lvl} id="${id}">${inline(text)}<a class="anchor" href="#${id}" aria-label="Link to this section">#</a></h${lvl}>`);
      i++;
      continue;
    }

    if (line.startsWith('>')) {
      const buf = [];
      for (; i < lines.length && lines[i].startsWith('>'); i++) buf.push(lines[i].replace(/^>\s?/, ''));
      out.push(callout(buf));
      continue;
    }

    if (line.trim().startsWith('|') && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1] || '')) {
      const rows = [];
      for (; i < lines.length && lines[i].trim().startsWith('|'); i++) rows.push(lines[i]);
      const cells = (r) => r.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const head = cells(rows[0]);
      const body = rows.slice(2).map(cells);
      out.push(`<div class="table"><table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${
        body.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
      continue;
    }

    const li = line.match(/^([-*]|\d+\.)\s+/);
    if (li) {
      const ordered = /\d/.test(li[1]);
      const items = [];
      while (i < lines.length) {
        const m = lines[i].match(/^([-*]|\d+\.)\s+(.*)$/);
        if (m && /\d/.test(m[1]) === ordered) { items.push(m[2]); i++; }
        else if (items.length && /^\s{2,}\S/.test(lines[i])) { items[items.length - 1] += ' ' + lines[i].trim(); i++; }
        else break;
      }
      const tag = ordered ? 'ol' : 'ul';
      out.push(`<${tag}>${items.map((t) => `<li>${inline(t)}</li>`).join('')}</${tag}>`);
      continue;
    }

    const buf = [];
    for (; i < lines.length && lines[i].trim() && !BLOCK.test(lines[i]); i++) buf.push(lines[i].trim());
    out.push(`<p>${inline(buf.join(' '))}</p>`);
  }
  return out.join('\n');
}

function callout(buf) {
  const m = buf[0].match(/^\[!(\w+)\]\s*(.*)$/);
  if (!m) return `<blockquote>${md(buf.join('\n'))}</blockquote>`;
  const title = m[2] ? `<p class="callout-title">${inline(m[2])}</p>` : '';
  return `<aside class="callout ${m[1].toLowerCase()}">${title}${md(buf.slice(1).join('\n'))}</aside>`;
}

function cards(buf) {
  const items = [];
  for (const l of buf) {
    const m = l.match(/^###\s+\[([^\]]+)\]\(([^)]+)\)\s*$/) || l.match(/^###\s+(.*)$/);
    if (m) items.push({ title: m[1], href: m[2] || null, lines: [] });
    else if (items.length) items[items.length - 1].lines.push(l);
  }
  return `<div class="cards">${items.map((c) => {
    const title = c.href ? `<a class="card-link" href="${c.href}">${inline(c.title)}</a>` : inline(c.title);
    return `<div class="card${c.href ? ' has-link' : ''}"><h3>${title}</h3>${md(c.lines.join('\n'))}</div>`;
  }).join('')}</div>`;
}

// ---------- страницы ----------
function parsePage(file) {
  const src = fs.readFileSync(file, 'utf8');
  const m = src.match(/^---\n([\s\S]*?)\n---\n?/);
  const meta = {};
  if (m) for (const line of m[1].split('\n')) {
    const k = line.indexOf(':');
    if (k > 0) meta[line.slice(0, k).trim()] = line.slice(k + 1).trim().replace(/^"(.*)"$/, '$1');
  }
  for (const key of ['title', 'description', 'section', 'updated']) {
    if (!meta[key]) throw new Error(`${path.basename(file)}: нет поля ${key} во frontmatter`);
  }
  if (!SECTIONS.some((s) => s.id === meta.section)) throw new Error(`${path.basename(file)}: неизвестный раздел ${meta.section}`);
  const slug = path.basename(file, '.md') === 'index' ? '' : path.basename(file, '.md');
  const body = m ? src.slice(m[0].length) : src;
  return {
    ...meta, slug, body,
    order: Number(meta.order || 99),
    nav: meta.nav || meta.title,
    url: slug ? `/info/${slug}/` : '/info/',
    mdUrl: slug ? `/info/${slug}.md` : '/info/index.md',
  };
}

function faqOf(body) {
  const part = ('\n' + body).split(/\n(?=## )/).find((s) => /^## (FAQ|Frequently asked questions)\s*$/im.test(s.split('\n')[0]));
  if (!part) return [];
  return part.split(/\n(?=### )/).slice(1).map((q) => {
    const [first, ...rest] = q.split('\n');
    return { q: plain(first.replace(/^###\s+/, '')), a: plain(rest.join(' ')) };
  });
}

function toMarkdown(p) {
  const b = p.body
    .replace(/^:::cards\s*$/gm, '').replace(/^:::\s*$/gm, '')
    .replace(/^>\s*\[!(\w+)\]\s*(.*)$/gm, (_, k, t) => `> **${t || k}**`)
    .replace(/\]\((\/[^)]*)\)/g, (_, u) => `](${SITE}${u})`);
  return `# ${p.title}\n\n> ${p.description}\n\nSource: ${SITE}${p.url} · Updated ${p.updated}\n\n${b.trim()}\n`;
}

const fmtDate = (d) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
const words = (s) => plain(s).split(' ').length;
const ldJson = (graph) => JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(/</g, '\\u003c');
const ORG = { '@type': 'Organization', '@id': `${SITE}/#org`, name: 'pleeply', url: `${SITE}/`, logo: `${SITE}/icon-512.png` };

function jsonLd(p, faq) {
  const url = SITE + p.url;
  const graph = [
    ORG,
    {
      '@type': 'TechArticle', '@id': `${url}#article`, headline: p.title, description: p.description,
      datePublished: p.published || p.updated, dateModified: p.updated, inLanguage: 'en', mainEntityOfPage: url,
      author: { '@id': `${SITE}/#org` }, publisher: { '@id': `${SITE}/#org` },
    },
    {
      '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'pleeply', item: `${SITE}/` },
        { '@type': 'ListItem', position: 2, name: 'Docs', item: `${SITE}/info/` },
        ...(p.slug ? [{ '@type': 'ListItem', position: 3, name: p.nav, item: url }] : []),
      ],
    },
  ];
  if (faq.length) graph.push({
    '@type': 'FAQPage', '@id': `${url}#faq`,
    mainEntity: faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
  });
  return ldJson(graph);
}

// ---------- общие куски страницы ----------
function head({ title, description, canonical, type, extra = '', ld }) {
  return `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${canonical}">
${extra}<meta property="og:type" content="${type}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${canonical}">
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
<script type="application/ld+json">${ld}</script>`;
}

function topbar(current) {
  const link = (href, label, key) => `<a href="${href}"${current === key ? ' aria-current="page"' : ''}>${label}</a>`;
  return `<a class="skip" href="#main">Skip to content</a>
<header class="top">
  <div class="top-in">
    <a class="brand" href="/info/" aria-label="pleeply docs"><span class="mark">pleeply<i></i></span><span class="docs">docs</span></a>
    <nav class="top-links" aria-label="Site">
      ${link('/info/', 'Docs', 'docs')}
      ${FORUM ? link('/community', 'Community', 'community') : ''}
      <a href="/">Product</a>
      <a class="btn" href="/#reserve"><span class="dot"></span>Join waitlist</a>
    </nav>
  </div>
</header>`;
}

const footer = () => `<footer class="foot">
  <div class="foot-in"><span class="mark">pleeply<i></i></span><span>© 2026 pleeply. In development.</span><span class="foot-links">${FORUM ? '<a href="/community">Community</a>' : ''}<a href="/llms.txt">llms.txt</a></span></div>
</footer>
<script defer src="/_vercel/insights/script.js"></script>`;

// Блок «Вступить в сообщество» в конце каждой статьи — как «Дальше — вместе с сообществом» у edgelab
function joinBlock() {
  if (!FORUM) return '';
  const members = Number(community?.stats?.users_count || 0);
  const proof = members >= 25 ? ` · ${members.toLocaleString('en-US')} members` : '';
  return `<section class="join" aria-labelledby="join-title">
        <p class="join-kicker">pleeply Community</p>
        <h2 id="join-title">Keep going with the community</h2>
        <p>Running AI at home is easier with people who've already done it. On the pleeply forum you can:</p>
        <ul>
          <li>ask about local models, hardware and Home Assistant, and get answers from people running them;</li>
          <li>vote on what pleeply should do first;</li>
          <li>show your own local-AI setup and get feedback;</li>
          <li>hear first about test builds and reservations.</li>
        </ul>
        <div class="join-actions"><a class="btn btn-lg" href="${INTERNAL ? '/community/signup?next=%2Fcommunity' : FORUM}">Join the community →</a><a class="join-more" href="/community">See top topics</a></div>
        <p class="join-micro">${INTERNAL ? 'Free · no email needed' : 'Free · built on Discourse'}${proof}</p>
      </section>`;
}

function sidebar(pages, current) {
  return SECTIONS.map((s) => {
    const list = pages.filter((p) => p.section === s.id);
    if (!list.length) return '';
    return `<div class="nav-group"><p class="nav-title">${esc(s.title)}</p><ul>${list.map((p) =>
      `<li><a href="${p.url}"${p === current ? ' aria-current="page"' : ''}>${esc(p.nav)}</a></li>`).join('')}</ul></div>`;
  }).join('');
}

function render(p, pages) {
  const toc = [];
  const content = md(p.body, toc);
  const faq = faqOf(p.body);
  const idx = pages.indexOf(p);
  const prev = pages[idx - 1], next = pages[idx + 1];
  const section = SECTIONS.find((s) => s.id === p.section).title;
  const minutes = Math.max(1, Math.round(words(p.body) / 220));
  return `<!doctype html>
<html lang="en">
<head>
${head({
    title: `${p.title} · pleeply docs`, description: p.description, canonical: SITE + p.url, type: 'article', ld: jsonLd(p, faq),
    extra: `<link rel="alternate" type="text/markdown" href="${p.mdUrl}" title="${esc(p.title)} (Markdown)">\n<meta property="article:modified_time" content="${p.updated}">\n`,
  })}
</head>
<body>
${topbar('docs')}
<div class="shell">
  <aside class="side">
    <details class="navbox" open>
      <summary>Menu</summary>
      <input class="filter" type="search" placeholder="Filter pages" aria-label="Filter pages">
      <nav aria-label="Docs">${sidebar(pages, p)}</nav>
    </details>
  </aside>
  <main id="main" class="doc">
    <article>
      <p class="crumb">${esc(section)}</p>
      <h1>${esc(p.title)}</h1>
      <div class="meta">
        <span>Updated <time datetime="${p.updated}">${fmtDate(p.updated)}</time></span><span>${minutes} min read</span>
        <span class="meta-actions"><button class="copy-md" type="button" data-md="${p.mdUrl}">Copy as Markdown</button><a href="${p.mdUrl}">View .md</a></span>
      </div>
      <div class="prose">
${content}
      </div>
      ${joinBlock()}
      <p class="ai-note">This page is also available as <a href="${p.mdUrl}">Markdown</a>. For the full docs index, see <a href="/llms.txt">llms.txt</a>.</p>
      <nav class="pager" aria-label="Previous and next">
        ${prev ? `<a class="prev" href="${prev.url}"><span>Previous</span>${esc(prev.nav)}</a>` : '<span></span>'}
        ${next ? `<a class="next" href="${next.url}"><span>Next</span>${esc(next.nav)}</a>` : '<span></span>'}
      </nav>
    </article>
  </main>
  ${toc.length > 1 ? `<aside class="toc" aria-label="On this page"><p>On this page</p><ul>${toc.map((t) => `<li><a href="#${t.id}">${esc(t.text)}</a></li>`).join('')}</ul></aside>` : ''}
</div>
${footer()}
<script>
(function () {
  var box = document.querySelector('.navbox');
  if (box && window.matchMedia('(max-width: 899px)').matches) box.removeAttribute('open');
  var f = document.querySelector('.filter');
  if (f) f.addEventListener('input', function () {
    var q = f.value.trim().toLowerCase();
    document.querySelectorAll('.nav-group').forEach(function (g) {
      var any = false;
      g.querySelectorAll('li').forEach(function (li) {
        var hit = !q || li.textContent.toLowerCase().indexOf(q) !== -1;
        li.hidden = !hit; if (hit) any = true;
      });
      g.hidden = !any;
    });
  });
  var b = document.querySelector('.copy-md');
  if (b) b.addEventListener('click', function () {
    fetch(b.dataset.md).then(function (r) { return r.text(); })
      .then(function (t) { return navigator.clipboard.writeText(t); })
      .then(function () { b.textContent = 'Copied'; }, function () { location.href = b.dataset.md; })
      .then(function () { setTimeout(function () { b.textContent = 'Copy as Markdown'; }, 1600); });
  });
})();
</script>
</body>
</html>
`;
}

// ---------- сообщество (Discourse) ----------
const isAboutTopic = (t) => /^About the .+ category$/i.test(t.title);

async function getCommunity() {
  if (!FORUM) return null;
  if (INTERNAL) return { internal: true, url: FORUM, fetchedAt: TODAY, stats: {}, categories: [], top: [], latest: [], users: [] };
  const cacheFile = path.join(HERE, 'community-cache.json');
  const get = (u) => fetch(FORUM + u, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15000) })
    .then((r) => { if (!r.ok) throw new Error(`${u}: HTTP ${r.status}`); return r.json(); });
  const topic = (t) => ({
    id: t.id, title: t.title, slug: t.slug, posts: t.posts_count, category: t.category_id,
    last: t.last_posted_at || t.bumped_at, pinned: Boolean(t.pinned || t.pinned_globally),
    posters: (t.posters || []).map((p) => p.user_id).slice(0, 5),
  });
  try {
    const [cats, top, latest, about] = await Promise.all([
      get('/categories.json'), get('/top.json?period=yearly'), get('/latest.json'), get('/about.json'),
    ]);
    const users = new Map();
    for (const u of [...(top.users || []), ...(latest.users || [])]) users.set(u.id, { id: u.id, username: u.username, avatar: u.avatar_template });
    const data = {
      url: FORUM, fetchedAt: TODAY,
      stats: about.about?.stats || {},
      categories: cats.category_list.categories.filter((c) => !c.read_restricted).map((c) => ({
        id: c.id, name: c.name, slug: c.slug, color: c.color, topics: c.topic_count, description: c.description_text || '',
      })),
      top: top.topic_list.topics.filter((t) => !isAboutTopic(t)).map(topic),
      latest: latest.topic_list.topics.filter((t) => !isAboutTopic(t)).map(topic),
      users: [...users.values()],
    };
    fs.writeFileSync(cacheFile, JSON.stringify(data, null, 2));
    return data;
  } catch (e) {
    const cache = fs.existsSync(cacheFile) ? JSON.parse(fs.readFileSync(cacheFile, 'utf8')) : null;
    if (cache && cache.url === FORUM) { console.warn(`форум недоступен (${e.message}) — беру кэш от ${cache.fetchedAt}`); return cache; }
    console.warn(`форум недоступен (${e.message}) — /community без тем`);
    return { url: FORUM, fetchedAt: null, stats: {}, categories: [], top: [], latest: [], users: [] };
  }
}

function renderCommunity(data) {
  const canonical = `${SITE}/community/`;
  const cats = new Map(data.categories.map((c) => [c.id, c]));
  const users = new Map(data.users.map((u) => [u.id, u]));
  const color = (c) => (/^[0-9a-f]{3,6}$/i.test(c?.color || '') ? `#${c.color}` : 'var(--soft)');
  const topicUrl = (t) => `${FORUM}/t/${encodeURIComponent(t.slug)}/${t.id}`;
  const catUrl = (c) => `${FORUM}/c/${encodeURIComponent(c.slug)}/${c.id}`;
  const pill = (id) => {
    const c = cats.get(id);
    return c ? `<a class="pill" href="${catUrl(c)}"><i style="background:${color(c)}"></i>${esc(c.name)}</a>` : '';
  };
  const avatar = (id) => {
    const u = users.get(id);
    if (!u?.avatar) return '';
    let src = u.avatar.replace('{size}', '48');
    if (src.startsWith('/')) src = FORUM + src;
    return `<img src="${esc(src)}" alt="${esc(u.username)}" title="${esc(u.username)}" width="24" height="24" loading="lazy">`;
  };
  const year = new Date().getUTCFullYear();
  const when = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', d.getUTCFullYear() === year
      ? { month: 'short', day: 'numeric', timeZone: 'UTC' } : { month: 'short', year: 'numeric', timeZone: 'UTC' });
  };

  const isNews = (t) => /announce|news/i.test(cats.get(t.category)?.name || '');
  const seen = new Set();
  const highlights = [...data.latest.filter((t) => t.pinned), ...data.latest.filter(isNews)]
    .filter((t) => !seen.has(t.id) && seen.add(t.id)).slice(0, 3);
  const list = (data.top.length ? data.top : data.latest).slice(0, 30);
  const listTitle = data.top.length ? 'Top topics this year' : 'Latest topics';
  const s = data.stats || {};
  const stats = [
    s.users_count >= 25 && `${Number(s.users_count).toLocaleString('en-US')} members`,
    s.topics_count >= 10 && `${Number(s.topics_count).toLocaleString('en-US')} topics`,
    s.active_users_30_days >= 10 && `${Number(s.active_users_30_days).toLocaleString('en-US')} active this month`,
  ].filter(Boolean);
  const host = FORUM.replace(/^https?:\/\//, '');

  const ld = ldJson([
    ORG,
    { '@type': 'CollectionPage', '@id': `${canonical}#page`, name: 'pleeply Community', url: canonical, isPartOf: { '@id': `${SITE}/#org` }, inLanguage: 'en' },
    {
      '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'pleeply', item: `${SITE}/` },
        { '@type': 'ListItem', position: 2, name: 'Community', item: canonical },
      ],
    },
    ...(list.length ? [{
      '@type': 'ItemList', name: listTitle,
      itemListElement: list.slice(0, 10).map((t, i) => ({ '@type': 'ListItem', position: i + 1, name: t.title, url: topicUrl(t) })),
    }] : []),
  ]);

  return `<!doctype html>
<html lang="en">
<head>
${head({
    title: 'pleeply Community · Top topics', canonical, type: 'website', ld,
    description: 'The pleeply forum: questions about running AI at home — local models, voice assistants, private smart homes — and ideas for what pleeply should do first.',
  })}
</head>
<body>
${topbar('community')}
<main id="main" class="cm">
  <p class="crumb">Community</p>
  <h1>pleeply Community</h1>
  <p class="cm-lead">A forum for people running AI at home — local models, voice assistants, private smart homes — and for shaping what pleeply becomes.</p>
  <div class="cm-actions">
    <a class="btn btn-lg" href="${FORUM}">Join the community →</a>
    <a class="btn-ghost" href="${FORUM}/new-topic">Start a topic</a>
    <a class="btn-ghost" href="/info/">Read the docs</a>
  </div>
  ${stats.length ? `<p class="cm-stats">${stats.map(esc).join(' · ')}</p>` : ''}

  ${highlights.length ? `<section aria-labelledby="hl"><h2 class="cm-h" id="hl">Community highlights</h2>
  <div class="cm-highlights">${highlights.map((t) => `<a class="cm-card" href="${topicUrl(t)}"><span class="cm-card-cat">${esc(cats.get(t.category)?.name || 'Topic')}</span><strong>${esc(t.title)}</strong><span class="cm-card-date">${when(t.last)}</span></a>`).join('')}</div></section>` : ''}

  <nav class="cm-tabs" aria-label="Forum views"><a href="${FORUM}/latest">Latest</a><a href="${FORUM}/categories">Categories</a><a href="${FORUM}/top" aria-current="page">Top</a></nav>

  <section aria-labelledby="top"><h2 class="cm-h" id="top">${listTitle}</h2>
  ${list.length ? `<div class="table topics"><table>
    <thead><tr><th>Topic</th><th class="hide-sm">Posters</th><th class="num">Replies</th><th class="num">Activity</th></tr></thead>
    <tbody>${list.map((t) => `<tr><td><a class="t-title" href="${topicUrl(t)}">${esc(t.title)}</a><div class="t-meta">${pill(t.category)}</div></td><td class="hide-sm posters">${t.posters.map(avatar).join('')}</td><td class="num">${Math.max(0, t.posts - 1)}</td><td class="num">${when(t.last)}</td></tr>`).join('')}</tbody>
  </table></div>` : `<div class="cm-empty"><p><strong>The forum has just opened.</strong> Be one of the first to post — ask a question, share your setup or suggest a feature.</p><a class="btn" href="${FORUM}/new-topic">Start the first topic</a></div>`}
  </section>

  ${data.categories.length ? `<section aria-labelledby="cats"><h2 class="cm-h" id="cats">Categories</h2>
  <div class="cm-cats">${data.categories.map((c) => `<a class="cm-cat" href="${catUrl(c)}" style="--cat:${color(c)}"><strong>${esc(c.name)}</strong>${c.description ? `<span>${esc(c.description)}</span>` : ''}<em>${c.topics} ${c.topics === 1 ? 'topic' : 'topics'}</em></a>`).join('')}</div></section>` : ''}

  <p class="ai-note">Topics are copied from <a href="${FORUM}">${esc(host)}</a> when the site is rebuilt${data.fetchedAt ? ` (last update ${fmtDate(data.fetchedAt)})` : ''}. Full discussions live on the forum.</p>
</main>
${footer()}
</body>
</html>
`;
}

// ---------- сборка ----------
const files = fs.readdirSync(path.join(HERE, 'pages')).filter((f) => f.endsWith('.md'));
const order = (p) => SECTIONS.findIndex((s) => s.id === p.section) * 1000 + p.order;
const pages = files.map((f) => parsePage(path.join(HERE, 'pages', f))).sort((a, b) => order(a) - order(b));

community = await getCommunity();

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
fs.copyFileSync(path.join(HERE, 'docs.css'), path.join(OUT, 'docs.css'));

for (const p of pages) {
  const dir = p.slug ? path.join(OUT, p.slug) : OUT;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), render(p, pages));
  fs.writeFileSync(path.join(OUT, `${p.slug || 'index'}.md`), toMarkdown(p));
}

// Статическая /community только для внешнего Discourse: свой форум рендерит api/community.js,
// и файл community/index.html перекрыл бы его (на Vercel файлы важнее rewrites)
const communityDir = path.join(ROOT, 'community');
fs.rmSync(communityDir, { recursive: true, force: true });
if (community && !community.internal) {
  fs.mkdirSync(communityDir, { recursive: true });
  fs.writeFileSync(path.join(communityDir, 'index.html'), renderCommunity(community));
}

// llms.txt — короткий указатель, llms-full.txt — все страницы одним файлом
const intro = `# pleeply

> pleeply is a home speaker with a computer inside. It runs open-weight AI models on the device, keeps a private memory of you at home, and works without the cloud.

Status: in development, not for sale yet. Prices on the site are expected prices for planned products; specs may change. Waitlist: ${SITE}/
`;
const index = SECTIONS.map((s) => {
  const list = pages.filter((p) => p.section === s.id);
  return list.length ? `## ${s.title}\n\n${list.map((p) => `- [${p.title}](${SITE}${p.mdUrl}): ${p.description}`).join('\n')}\n` : '';
}).filter(Boolean).join('\n');
const communityIndex = !community ? '' : INTERNAL
  ? `\n## Community\n\n- [pleeply Community](${SITE}/community): forum about running AI at home and ideas for pleeply; top topics, categories and discussions\n- [Latest topics](${SITE}/community/latest)\n`
  : `\n## Community\n\n- [pleeply Community forum](${FORUM}): questions about running AI at home and ideas for pleeply\n- [Top topics](${SITE}/community/): the most active forum discussions\n`;
fs.writeFileSync(path.join(ROOT, 'llms.txt'), `${intro}\n${index}${communityIndex}\n## Product\n\n- [pleeply home page](${SITE}/): what pleeply is, planned lineup and the waitlist\n- [Full docs in one file](${SITE}/llms-full.txt)\n`);
fs.writeFileSync(path.join(ROOT, 'llms-full.txt'), `${intro}\n${pages.map(toMarkdown).join('\n---\n\n')}`);

// sitemap.xml: главная + /info + /community
const sitemapPath = path.join(ROOT, 'sitemap.xml');
const oldRoot = (fs.existsSync(sitemapPath) && fs.readFileSync(sitemapPath, 'utf8').match(/<loc>https:\/\/pleeply\.vercel\.app\/<\/loc>\s*<lastmod>([^<]+)/)) || [];
const urls = [
  { loc: `${SITE}/`, lastmod: oldRoot[1] || pages[0].updated },
  ...pages.map((p) => ({ loc: SITE + p.url, lastmod: p.updated })),
  ...(community ? [{ loc: `${SITE}${INTERNAL ? '/community' : '/community/'}`, lastmod: community.fetchedAt || TODAY }] : []),
];
fs.writeFileSync(sitemapPath, `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url>\n    <loc>${u.loc}</loc>\n    <lastmod>${u.lastmod}</lastmod>\n  </url>`).join('\n')}
</urlset>
`);

console.log(`info: ${pages.length} страниц${community ? `, /community (${community.top.length} тем в топе, форум ${FORUM})` : ', форум не задан — /community не собирается'} → llms.txt, sitemap.xml`);
