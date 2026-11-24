// Браузерная версия pleeply (/chat): интерфейс чата. Все ответы считает сервер; здесь только показ и хранение в браузере.
import { marked } from '/assets/vendor/chat/marked.mjs';
import DOMPurify from '/assets/vendor/chat/purify.mjs';
import { ACCEPT, readFile, saveFile, loadFile, deleteFiles, pickExcerpts, excerptsPrompt, citeList } from '/assets/files.js';
import { initProjects } from '/assets/projects.js';

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icon = (id) => `<svg class="ic"><use href="#${id}"/></svg>`;

// ---------- хранение (только в этом браузере) ----------
const mem = {};
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return k in mem ? mem[k] : d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { mem[k] = v; } },
};
const DEVICE = (() => {
  let id = store.get('pleeply.web.device', null);
  if (!/^[a-f0-9-]{16,64}$/i.test(id || '')) { id = crypto.randomUUID(); store.set('pleeply.web.device', id); }
  return id;
})();

const SYSTEM = 'You are pleeply, a friendly and capable AI assistant. Answer in the language the user writes in. Be clear and concise, and use Markdown (lists, tables, code blocks) when it helps.';
const KEEP_CHARS = 24_000; // сервер всё равно укладывает историю в лимит модели

const S = {
  chats: (() => { const v = store.get('pleeply.web.chats', []); return Array.isArray(v) ? v : []; })(),
  current: null,
  models: [{ id: 'auto', name: 'pleeply Free', tier: 'free' }],
  model: store.get('pleeply.web.model', 'auto'),
  account: null,
  limits: null,
  plans: null,
  free: null,
  busy: null,
  pending: [], // прикреплённые, но ещё не отправленные файлы
};
// Ответы, оборванные закрытием вкладки, не должны вечно «печататься»
for (const c of S.chats) for (const m of c.messages || []) { delete m.view; delete m.status; if (m.streaming) { m.streaming = false; if (!m.content) m.error = 'Interrupted.'; } }
// Скриншоты облачного браузера и токены одобрения в историю не сохраняем
const save = () => store.set('pleeply.web.chats', JSON.parse(JSON.stringify(S.chats.slice(0, 200), (k, v) => (k === 'shot' || k === 'approval' ? undefined : v))));
const chat = () => S.chats.find((c) => c.id === S.current) || null;

// ---------- markdown ----------
marked.setOptions({ gfm: true, breaks: true });
DOMPurify.addHook('afterSanitizeAttributes', (n) => { if (n.tagName === 'A') { n.setAttribute('target', '_blank'); n.setAttribute('rel', 'noopener noreferrer'); } });
// Ответ модели — чужой текст: пропускаем только разметку markdown, без стилей, картинок и медиа,
// чтобы подброшенная в ответ ссылка не могла сама загрузиться и унести данные (вдобавок CSP страницы).
const MD_TAGS = ['p', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'em', 'b', 'i', 'del', 's', 'code', 'pre', 'blockquote', 'ul', 'ol', 'li', 'a', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'span'];
// GPT-OSS оформляет цитаты как 【файл, p. 1】 — показываем привычными [файл, p. 1]
const md = (text) => DOMPurify.sanitize(marked.parse(String(text || '').replace(/\s*【([^】]{1,160})】/g, ' [$1]')), { ALLOWED_TAGS: MD_TAGS, ALLOWED_ATTR: ['href', 'title', 'class', 'align', 'start'], ALLOW_DATA_ATTR: false });

// ---------- модели ----------
const modelInfo = (id) => S.models.find((m) => m.id === id) || S.models[0];
function describe(m) {
  if (m.id === 'auto') return 'Smartest free model available right now';
  if (m.id === 'auto-fast') return 'Fastest free model available right now';
  return [m.vendor, m.via && `via ${m.via}`].filter(Boolean).join(' ');
}
function renderPicker() {
  const cur = modelInfo(S.model);
  if (cur.id !== S.model) S.model = cur.id;
  $('#model-name').textContent = cur.name;
  $('#models').innerHTML = S.models.map((m) => `<button type="button" role="option" data-id="${esc(m.id)}" class="${m.id === S.model ? 'on' : ''}" aria-selected="${m.id === S.model}">
    <span class="tag ${m.tier === 'paid' ? 'paid' : ''}">${m.tier === 'paid' ? 'Premium' : 'Free'}</span><b>${esc(m.name)}</b><small>${esc(describe(m))}</small></button>`).join('');
}
async function loadModels() {
  try {
    const j = await fetch('/api/ai/v1/models').then((r) => r.json());
    const order = (m) => (m.id === 'auto' ? 0 : m.id === 'auto-fast' ? 1 : m.tier === 'free' ? 2 : 3);
    const list = (j.data || []).map((m) => ({ id: m.id, name: m.name || m.id, vendor: m.vendor, via: m.via, tier: m.tier })).sort((a, b) => order(a) - order(b));
    if (list.length) S.models = list;
    S.limits = j.limits; S.plans = j.plans; S.free = j.free;
  } catch {}
  renderPicker();
  renderProviders();
  renderAccount();
}
$('#model-btn').onclick = (e) => {
  e.stopPropagation();
  const box = $('#models');
  box.hidden = !box.hidden;
  $('#model-btn').setAttribute('aria-expanded', String(!box.hidden));
};
$('#models').onclick = (e) => {
  const b = e.target.closest('button[data-id]');
  if (!b) return;
  S.model = b.dataset.id;
  store.set('pleeply.web.model', S.model);
  $('#models').hidden = true;
  renderPicker();
  input.focus();
};

// ---------- провайдеры ----------
function renderProviders() {
  const f = S.free;
  $('#prov-list').innerHTML = f?.providers?.length
    ? f.providers.map((p) => `<li><a href="${esc(p.policy)}" target="_blank" rel="noopener">${esc(p.name)}</a></li>`).join('')
    : '<li>No free providers are connected right now.</li>';
  $('#prov-note').textContent = f ? `${f.models} free models are in rotation now. Model list from ${f.source}.` : '';
}
const privacy = $('#privacy');
for (const el of [$('#open-privacy'), $('#fine-privacy')]) el.onclick = (e) => { e.preventDefault(); closeMobile(); privacy.showModal(); };
privacy.addEventListener('click', (e) => { if (e.target === privacy || e.target.closest('[data-close]')) privacy.close(); });
if (location.hash === '#providers') queueMicrotask(() => privacy.showModal());

// ---------- аккаунт ----------
async function loadAccount() {
  try {
    const r = await fetch('/api/account/me', { cache: 'no-store' });
    S.account = r.ok ? await r.json() : null;
  } catch { S.account = null; }
  renderAccount();
}
function renderAccount() {
  const box = $('#account');
  const a = S.account?.account;
  if (!a) {
    const lim = S.plans?.free;
    box.innerHTML = `<a class="btn-google" href="/api/auth/web"><svg width="18" height="18"><use href="#i-g"/></svg>Sign in with Google</a>
      <p class="guest-note">${S.limits ? `Without an account: ${S.limits.free_per_day} messages a day.` : ''}${lim ? ` Signed in: ${lim.free}.` : ''}</p>`;
    return;
  }
  const initial = (a.name || a.email || '?').trim().charAt(0).toUpperCase();
  box.innerHTML = `<button class="acct btn" id="acct-btn" type="button" aria-haspopup="menu"><span class="avatar">${esc(initial)}</span>
    <span class="who"><span class="name">${esc(a.name || a.email)}</span><span class="plan">${a.plan === 'pro' ? 'pleeply Pro' : 'Free plan'}</span></span></button>`;
  $('#acct-btn').onclick = (e) => { e.stopPropagation(); openAccountMenu(e.currentTarget); };
}
function openAccountMenu(anchor) {
  closeMenus();
  const { account: a, usage = {}, upgrade, price } = S.account;
  const lim = a.limits || {};
  const used = Number(usage.free || 0), cap = Number(lim.free || 0);
  const monthly = lim.paidPeriod === 'month';
  const pUsed = Number((monthly ? usage.paid_month : usage.paid) || 0), pCap = Number(lim.paid || 0);
  const m = document.createElement('div');
  m.className = 'menu';
  m.setAttribute('role', 'menu');
  m.innerHTML = `<div class="head"><b>${esc(a.name || a.email)}</b>${esc(a.email)}</div>
    ${cap ? `<div class="usage">Today: ${used} of ${cap} free messages<div class="bar"><i style="width:${Math.min(100, (used / cap) * 100)}%"></i></div></div>` : ''}
    ${pCap && (monthly || pUsed) ? `<div class="usage">Premium ${monthly ? 'this month' : 'today'}: ${pUsed} of ${pCap}<div class="bar"><i style="width:${Math.min(100, (pUsed / pCap) * 100)}%"></i></div></div>` : ''}
    ${a.plan !== 'pro' && upgrade ? `<button type="button" data-act="upgrade">Upgrade to Pro${price ? ` · ${esc(price)}` : ''}</button>` : ''}
    ${a.plan !== 'pro' && !upgrade ? '<button type="button" data-act="pricing">See pleeply Pro</button>' : ''}
    ${a.plan === 'pro' && a.billing ? '<button type="button" data-act="manage">Manage subscription</button>' : ''}
    <button type="button" data-act="signout">Sign out</button>`;
  document.body.append(m);
  const r = anchor.getBoundingClientRect();
  m.style.left = `${Math.max(8, r.left)}px`;
  m.style.bottom = `${window.innerHeight - r.top + 6}px`;
  m.onclick = async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act) return;
    closeMenus();
    if (act === 'pricing') { location.href = '/pro'; return; }
    if (act === 'signout') {
      await fetch('/api/account/signout', { method: 'POST' }).catch(() => {});
      S.account = null; renderAccount(); toast('Signed out.');
      return;
    }
    const r2 = await fetch(act === 'upgrade' ? '/api/account/checkout' : '/api/account/portal', { method: 'POST' }).catch(() => null);
    const j = r2 ? await r2.json().catch(() => ({})) : {};
    if (r2?.ok && j.url) location.href = j.url; else toast(j.error || "Couldn't reach pleeply. Try again.", true);
  };
}
function closeMenus() { document.querySelectorAll('.menu').forEach((m) => m.remove()); $('#models').hidden = true; $('#model-btn').setAttribute('aria-expanded', 'false'); }
document.addEventListener('click', (e) => { if (!e.target.closest('.menu, .picker')) closeMenus(); });

// ---------- список чатов ----------
function renderChats() {
  const ul = $('#chats');
  if (!S.chats.length) { ul.innerHTML = '<li class="side-empty">Your chats will appear here.</li>'; return; }
  ul.innerHTML = S.chats.map((c) => `<li class="${c.id === S.current ? 'on' : ''}"><a href="#" data-id="${esc(c.id)}">${esc(c.title || 'New chat')}</a>
    <button class="ic-btn del" type="button" data-del="${esc(c.id)}" aria-label="Delete chat" title="Delete">${icon('i-x')}</button></li>`).join('');
}
$('#chats').onclick = (e) => {
  const del = e.target.closest('[data-del]');
  if (del) {
    if (S.current === del.dataset.del && S.busy) S.busy.abort();
    deleteFiles((S.chats.find((c) => c.id === del.dataset.del)?.files || []).map((f) => f.id));
    S.chats = S.chats.filter((c) => c.id !== del.dataset.del);
    if (S.current === del.dataset.del) S.current = null;
    save(); renderChats(); renderThread();
    return;
  }
  const a = e.target.closest('a[data-id]');
  if (!a) return;
  e.preventDefault();
  if (S.busy) S.busy.abort();
  projects.close();
  S.current = a.dataset.id;
  closeMobile(); renderChats(); renderThread(); toBottom();
};
$('#new-chat').onclick = () => { if (S.busy) S.busy.abort(); projects.close(); S.current = null; closeMobile(); renderChats(); renderThread(); input.focus(); };

// ---------- сообщения ----------
// Источники ответа с поиском: только http(s), открываются в новой вкладке
function sourcesHtml(list) {
  const items = (Array.isArray(list) ? list : []).map((s) => {
    let u;
    try { u = new URL(s.url); } catch { return ''; }
    if (!/^https?:$/.test(u.protocol)) return '';
    return { href: u.href, host: u.hostname.replace(/^www\./, ''), title: String(s.title || '') };
  }).filter(Boolean).slice(0, 8);
  if (!items.length) return '';
  return `<div class="sources"><b>Sources</b>${items.map((s, i) => `<a href="${esc(s.href)}" target="_blank" rel="noopener noreferrer" title="${esc(s.href)}">${i + 1}. ${esc(s.title && s.title !== s.host ? s.title : s.host)} <small>${esc(s.host)}</small></a>`).join('')}</div>`;
}

// Панель облачного браузера (computer use): скриншот, шаги, запрос одобрения
const SHOT = /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/;
function computerHtml(m) {
  const b = m.browser;
  if (!b) return '';
  let host = '';
  try { host = new URL(b.url).hostname.replace(/^www\./, ''); } catch {}
  const steps = b.steps || [];
  const a = b.approval;
  return `<div class="computer${m.streaming ? ' live' : ''}">
    <div class="cu-head">${icon('i-globe')}<b>Cloud browser</b>${host ? `<span class="cu-url">${esc(host)}</span>` : ''}${m.streaming ? '<span class="cu-live">live</span>' : ''}</div>
    ${b.shot && SHOT.test(b.shot) ? `<img class="cu-shot" src="${b.shot}" alt="What the cloud browser shows now">` : ''}
    ${a ? `<div class="cu-ask"><b>Approve this step?</b><p>${esc(a.description)}</p>${a.why ? `<small>${esc(a.why)}</small>` : ''}<div class="cu-btns"><button type="button" class="up-btn primary" data-cu="approve">Approve</button><button type="button" class="up-btn" data-cu="deny">Deny</button></div></div>` : ''}
    ${steps.length ? `<details class="cu-steps"${m.streaming ? ' open' : ''}><summary>${steps.length} step${steps.length > 1 ? 's' : ''}</summary><ol>${steps.map((st) => `<li>${esc(st.action)}${st.why ? ` <small>${esc(st.why)}</small>` : ''}</li>`).join('')}</ol></details>` : ''}
  </div>`;
}

function msgHtml(m, i, last) {
  if (m.role === 'user') {
    const files = (m.files || []).map((n) => `<span class="fchip">${icon('i-clip')}${esc(n)}</span>`).join('');
    return `<div class="msg user"><div class="ucol">${files ? `<div class="ufiles">${files}</div>` : ''}<div class="bubble">${esc(m.content)}</div></div></div>`;
  }
  const text = m.streaming && typeof m.view === 'string' ? m.view : m.content;
  const thinking = m.streaming && !text;
  const think = m.reasoning ? `<details class="think"${thinking ? ' open' : ''}><summary>${thinking ? 'Thinking…' : 'Thought process'}</summary><div>${esc(m.reasoning)}</div></details>` : '';
  const up = m.upsell === 'signin'
    ? `<a class="up-btn google" href="/api/auth/web"><svg width="16" height="16" aria-hidden="true"><use href="#i-g"/></svg>Sign in with Google</a><a class="up-btn" href="/pro">See pleeply Pro</a>`
    : m.upsell === 'pro' ? '<a class="up-btn primary" href="/pro">Get pleeply Pro</a>' : '';
  const searching = m.streaming && !text && m.status ? `<div class="searching">${esc(m.status)}…</div>` : '';
  const used = !m.streaming && m.tools?.length
    ? `<div class="tools-used">${m.tools.map((t) => `<span class="${t.ok ? '' : 'bad'}">${icon('i-plug')}${esc(t.connector)} · ${esc(t.tool)}${t.ok ? '' : ' · failed'}</span>`).join('')}</div>` : '';
  const body = m.error ? `<div class="err">${esc(m.error)}${up ? `<div class="ups">${up}</div>` : ''}</div>` : searching || `<div class="body${m.streaming ? ' cursor' : ''}">${md(text)}</div>`;
  const fromFiles = !m.streaming && m.fileCites?.length
    ? `<div class="sources"><b>From your files</b>${m.fileCites.map((f) => `<span class="fcite">${icon('i-clip')}${esc(f.name)}${f.page ? ` · p. ${Number(f.page)}` : ''}</span>`).join('')}</div>` : '';
  const meta = m.streaming ? '' : `${sourcesHtml(m.sources)}${fromFiles}${used}<div class="meta">
      ${m.content ? `<button class="ic-btn" type="button" data-copy="${i}" title="Copy" aria-label="Copy">${icon('i-copy')}</button>` : ''}
      ${last ? `<button class="ic-btn" type="button" data-retry title="Try again" aria-label="Try again">${icon('i-retry')}</button>` : ''}
      ${m.route ? `<span class="route">${esc(m.route)}</span>` : ''}</div>`;
  return `<div class="msg ai" data-i="${i}">${think}${computerHtml(m)}${body}${meta}</div>`;
}
function decorateCode(root) {
  root.querySelectorAll('pre').forEach((pre) => {
    if (pre.querySelector('.copy')) return;
    const b = document.createElement('button');
    b.className = 'copy'; b.type = 'button'; b.textContent = 'Copy';
    b.onclick = () => { navigator.clipboard?.writeText(pre.querySelector('code')?.innerText || pre.innerText); b.textContent = 'Copied'; setTimeout(() => (b.textContent = 'Copy'), 1200); };
    pre.append(b);
  });
}
function renderThread() {
  const c = chat();
  const has = Boolean(c?.messages?.length);
  $('#empty').hidden = has;
  $('#scroll').hidden = !has;
  // одно поле ввода: на пустом экране — по центру, в диалоге — внизу
  const wrap = $('#composer-wrap');
  if (has && wrap.parentElement !== $('#main')) $('#main').append(wrap);
  if (!has && wrap.parentElement !== $('#composer-home')) $('#composer-home').append(wrap);
  const t = $('#thread');
  t.innerHTML = has ? c.messages.map((m, i) => msgHtml(m, i, i === c.messages.length - 1 && m.role === 'assistant')).join('') : '';
  decorateCode(t);
  fitTail();
  document.title = c?.title ? `${c.title} — pleeply` : 'pleeply — chat in your browser';
}
function updateLast() {
  const c = chat();
  if (!c) return;
  const i = c.messages.length - 1;
  const el = $(`#thread .msg.ai[data-i="${i}"]`);
  if (!el) return renderThread();
  const open = el.querySelector('details.think')?.open;
  el.outerHTML = msgHtml(c.messages[i], i, true);
  const d = $(`#thread .msg.ai[data-i="${i}"] details.think`);
  if (d && open && !c.messages[i].streaming) d.open = true;
  decorateCode($('#thread'));
  fitTail();
}
$('#thread').onclick = (e) => {
  const cp = e.target.closest('[data-copy]');
  if (cp) { navigator.clipboard?.writeText(chat().messages[Number(cp.dataset.copy)].content); toast('Copied.'); return; }
  if (e.target.closest('[data-retry]')) retry();
  const cu = e.target.closest('[data-cu]');
  if (cu) {
    const m = chat()?.messages.at(-1);
    const a = m?.browser?.approval;
    if (!a) return;
    const approve = cu.dataset.cu === 'approve';
    cu.closest('.cu-btns').querySelectorAll('button').forEach((x) => { x.disabled = true; });
    fetch('/api/ai/v1/browse', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Pleeply-Device': DEVICE }, body: JSON.stringify({ op: 'decide', id: a.id, token: a.token, approve }) })
      .then((r) => { if (!r.ok) toast('That approval has expired.', true); })
      .catch(() => toast("Couldn't reach pleeply.", true));
  }
};

// ---------- прокрутка: новый вопрос встаёт наверх, ответ растёт под ним без автопрокрутки (как в ChatGPT и Claude) ----------
const scrollEl = $('#scroll');
let pinned = null; // id чата, где последний вопрос закреплён наверху
const lastUserEl = () => [...document.querySelectorAll('#thread .msg.user')].pop() || null;
function syncJump() {
  const gap = $('#thread').getBoundingClientRect().bottom - scrollEl.getBoundingClientRect().bottom;
  $('#jump').hidden = scrollEl.hidden || gap < 60;
}
/** Пустое место под ответом, чтобы закреплённый вопрос мог стоять наверху, пока ответ короткий. */
function fitTail() {
  const tail = $('#tail-space');
  const u = pinned && pinned === S.current ? lastUserEl() : null;
  const below = u ? $('#thread').getBoundingClientRect().bottom - u.getBoundingClientRect().top : 0;
  tail.style.height = u ? `${Math.max(0, scrollEl.clientHeight - below - 28)}px` : '0px';
  syncJump();
}
function pinLast() {
  pinned = S.current;
  fitTail();
  const u = lastUserEl();
  if (u) scrollEl.scrollTo({ top: scrollEl.scrollTop + u.getBoundingClientRect().top - scrollEl.getBoundingClientRect().top - 12, behavior: 'smooth' });
}
const toBottom = () => { pinned = null; fitTail(); scrollEl.scrollTop = scrollEl.scrollHeight; };
scrollEl.addEventListener('scroll', syncJump, { passive: true });
window.addEventListener('resize', fitTail);
$('#jump').onclick = () => {
  const gap = $('#thread').getBoundingClientRect().bottom - scrollEl.getBoundingClientRect().bottom;
  scrollEl.scrollBy({ top: gap + 24, behavior: 'smooth' });
};

/**
 * Плавное появление текста: показываем полученный текст по словам в ритме кадров. Чем больше отставание,
 * тем быстрее догоняем, поэтому длинный ответ не тянется, а короткие куски потока идут ровно.
 */
function makeTyper(reply, render) {
  let shown = 0;
  let raf = 0;
  let timer = 0;
  let last = 0;
  let ending = false;
  let resolve;
  const finished = new Promise((r) => { resolve = r; });
  const stop = () => { cancelAnimationFrame(raf); clearTimeout(timer); raf = 0; timer = 0; };
  const complete = () => { stop(); shown = reply.content.length; reply.view = reply.content; render(); resolve(); };
  // Скорость не зависит от частоты кадров: догоняем отставание с постоянной времени ~0,3 с, но не медленнее 90 знаков/с
  const tick = (now = performance.now()) => {
    stop();
    const dt = Math.min(250, last ? now - last : 16);
    last = now;
    const target = reply.content.length;
    if (shown < target) {
      const backlog = target - shown;
      let next = Math.min(target, shown + Math.max(1, Math.ceil(Math.max(dt * 0.09, backlog * (1 - Math.exp(-dt / 280))))));
      const ws = reply.content.slice(next, next + 16).search(/\s/);
      if (ws > 0) next = Math.min(target, next + ws);
      shown = next;
      reply.view = reply.content.slice(0, shown);
      render();
    }
    if (shown < reply.content.length) schedule();
    else { last = 0; if (ending) resolve(); }
  };
  // Кадр анимации, а если вкладка их притормаживает — таймер
  const schedule = () => { if (raf || timer) return; raf = requestAnimationFrame(tick); timer = setTimeout(tick, 100); };
  return {
    kick() { if (document.hidden) { shown = reply.content.length; reply.view = reply.content; return; } schedule(); },
    reset() { shown = 0; last = 0; reply.view = ''; },
    finish(now) {
      ending = true;
      if (now || document.hidden) complete();
      else if (shown >= reply.content.length) resolve();
      else schedule();
      return finished;
    },
  };
}

// ---------- отправка ----------
function buildHistory(messages, extraSystem = '') {
  const out = [];
  let chars = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.error || m.streaming || !m.content) continue;
    chars += m.content.length;
    if (chars > KEEP_CHARS && out.length) break;
    out.unshift({ role: m.role, content: m.content });
  }
  return [{ role: 'system', content: SYSTEM + extraSystem }, ...out];
}

/** Фрагменты файлов этого чата к последнему вопросу (файлы — в IndexedDB браузера). */
async function fileContext(c, prior) {
  if (!c.files?.length) return { prompt: '', cites: [] };
  const recs = (await Promise.all(c.files.map((f) => loadFile(f.id)))).filter(Boolean);
  if (!recs.length) return { prompt: '', cites: [] };
  const question = [...prior].reverse().find((m) => m.role === 'user')?.content || '';
  const ex = pickExcerpts(recs, question);
  return { prompt: excerptsPrompt(ex), cites: citeList(ex) };
}

/** Задача в облачном браузере: поток шагов со скриншотами; итог дописывается в то же сообщение. */
async function runComputer(reply, signal, typer, paint) {
  reply.browser = { task: reply.computer.task, steps: [], url: reply.computer.start_url };
  reply.status = 'Starting a browser';
  paint();
  const r = await fetch('/api/ai/v1/browse', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Pleeply-Device': DEVICE }, body: JSON.stringify({ task: reply.computer.task, start_url: reply.computer.start_url }), signal });
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    if (r.status === 429) reply.upsell = !S.account?.account ? 'signin' : S.account.account.plan === 'pro' ? null : 'pro';
    throw new Error(j.error?.message || `The cloud browser returned ${r.status}.`);
  }
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') continue;
      let j; try { j = JSON.parse(data); } catch { continue; }
      if (j.error) throw new Error(j.error.message || 'The cloud browser stopped with an error.');
      if (typeof j.pleeply_status === 'string') reply.status = j.pleeply_status;
      if (typeof j.pleeply_route === 'string') reply.route = `Done by ${j.pleeply_route}`;
      const st = j.pleeply_browser;
      if (st) {
        reply.browser.steps.push({ action: String(st.action || '').slice(0, 200), why: String(st.why || '').slice(0, 200) });
        reply.browser.url = String(st.url || '');
        if (SHOT.test(st.shot || '')) reply.browser.shot = st.shot;
      }
      const ap = j.pleeply_approval;
      if (ap) {
        reply.browser.approval = { id: String(ap.id), token: String(ap.token), description: String(ap.description || ''), why: String(ap.why || '') };
        if (SHOT.test(ap.shot || '')) reply.browser.shot = ap.shot;
        toast('pleeply needs your approval to continue.');
      }
      if (j.pleeply_approval_done) delete reply.browser.approval;
      const d = j.choices?.[0]?.delta || {};
      if (d.content) { reply.content += d.content; reply.status = ''; typer.kick(); }
      paint();
    }
  }
}

async function ask(c) {
  const conns = activeConnectors();
  const reply = { role: 'assistant', content: '', reasoning: '', streaming: true, view: '' };
  const prior = c.messages.slice();
  c.messages.push(reply);
  renderThread(); pinLast();
  const ctrl = new AbortController();
  S.busy = ctrl; setBusy(true);
  let frame = 0;
  const paint = () => { if (!frame && S.current === c.id) frame = requestAnimationFrame(() => { frame = 0; updateLast(); }); };
  const typer = makeTyper(reply, () => { if (S.current === c.id) updateLast(); });
  try {
    const fc = await fileContext(c, prior);
    if (fc.cites.length) reply.fileCites = fc.cites;
    const r = await fetch('/api/ai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Pleeply-Device': DEVICE },
      body: JSON.stringify({
        model: S.model, stream: true, messages: buildHistory(prior, fc.prompt), web: true,
        ...(conns.length ? { connectors: conns.map((c) => ({ name: c.name, url: c.url, token: c.token || undefined })) } : {}),
      }),
      signal: ctrl.signal,
    });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      // дневной лимит: гостю — войти, бесплатному аккаунту — Pro
      if (r.status === 429) reply.upsell = !S.account?.account ? 'signin' : S.account.account.plan === 'pro' ? null : 'pro';
      throw new Error(j.error?.message || `pleeply Cloud returned ${r.status}.`);
    }
    const route = r.headers.get('x-pleeply-route');
    reply.route = `Answered by ${route ? decodeURIComponent(route) : modelInfo(S.model).name}`;
    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') continue;
        let j; try { j = JSON.parse(data); } catch { continue; }
        if (j.error) throw new Error(j.error.message || 'The model stopped with an error.');
        if (typeof j.pleeply_status === 'string') { reply.status = j.pleeply_status; paint(); }
        if (j.pleeply_reset) { reply.content = ''; typer.reset(); paint(); }
        if (typeof j.pleeply_route === 'string') reply.route = `Answered by ${j.pleeply_route}`;
        if (j.pleeply_computer?.task) reply.computer = { task: String(j.pleeply_computer.task), start_url: String(j.pleeply_computer.start_url || '') };
        if (Array.isArray(j.pleeply_tools)) reply.tools = j.pleeply_tools.slice(0, 20).map((t) => ({ connector: String(t.connector || ''), tool: String(t.tool || ''), ok: t.ok !== false }));
        if (Array.isArray(j.pleeply_sources)) reply.sources = j.pleeply_sources.slice(0, 8).map((s) => ({ url: String(s.url || ''), title: String(s.title || '') }));
        const d = j.choices?.[0]?.delta || {};
        if (d.content) { reply.content += d.content; reply.status = ''; typer.kick(); }
        const th = d.reasoning ?? d.reasoning_content;
        if (typeof th === 'string' && th) { reply.reasoning += th; paint(); }
      }
    }
    if (reply.computer) await runComputer(reply, ctrl.signal, typer, paint);
    if (!reply.content) throw new Error('The model returned an empty answer. Try again.');
  } catch (e) {
    if (ctrl.signal.aborted) { if (!reply.content) reply.error = 'Stopped.'; }
    else if (!reply.content) reply.error = e.message || "Couldn't reach pleeply Cloud. Check your connection.";
    else reply.content += `\n\n_${e.message || 'Connection lost.'}_`;
  } finally {
    await typer.finish(ctrl.signal.aborted || S.current !== c.id || Boolean(reply.error));
    cancelAnimationFrame(frame);
    reply.streaming = false;
    delete reply.view;
    delete reply.status;
    if (reply.browser) delete reply.browser.approval;
    if (!reply.reasoning) delete reply.reasoning;
    c.updated = Date.now();
    S.busy = null; setBusy(false);
    save();
    if (S.current === c.id) updateLast();
    if (S.account) loadAccount();
  }
}

function send(text) {
  text = text.trim();
  const ready = S.pending.filter((p) => p.status === 'ready');
  if (S.busy || S.pending.some((p) => p.status === 'reading')) return;
  if (!text && ready.length) text = ready.length > 1 ? 'Summarize the attached files.' : 'Summarize the attached file.';
  if (!text) return;
  let c = chat();
  if (!c) {
    c = { id: crypto.randomUUID(), title: text.replace(/\s+/g, ' ').slice(0, 60), created: Date.now(), updated: Date.now(), messages: [] };
    S.chats.unshift(c);
    S.current = c.id;
  } else {
    S.chats = [c, ...S.chats.filter((x) => x !== c)];
  }
  if (ready.length) c.files = [...(c.files || []), ...ready.map((p) => ({ id: p.id, name: p.name, pages: p.pages, chars: p.chars }))].slice(-10);
  c.messages.push({ role: 'user', content: text, ...(ready.length ? { files: ready.map((p) => p.name) } : {}) });
  S.pending = [];
  renderAttach();
  save(); renderChats();
  input.value = ''; grow(); syncSend();
  ask(c);
}

// ---------- файлы: скрепка и перетаскивание ----------
function renderAttach() {
  const row = $('#attach-row');
  row.hidden = !S.pending.length;
  row.innerHTML = S.pending.map((p, i) => `<span class="achip ${p.status}">${icon('i-clip')}<span class="aname">${esc(p.name)}</span><small>${p.status === 'reading' ? 'reading…' : p.status === 'error' ? esc(p.error) : p.pages ? `${p.pages} pages` : `${Math.max(1, Math.round(p.chars / 1000))}k chars`}</small><button type="button" data-rm="${i}" aria-label="Remove ${esc(p.name)}">${icon('i-x')}</button></span>`).join('');
  syncSend();
}
async function addFiles(list) {
  for (const file of [...list].slice(0, 10)) {
    const p = { name: file.name, status: 'reading' };
    S.pending.push(p);
    renderAttach();
    try {
      const rec = await readFile(file);
      await saveFile(rec);
      Object.assign(p, { status: 'ready', id: rec.id, pages: rec.pages, chars: rec.chars });
    } catch (e) {
      Object.assign(p, { status: 'error', error: e.message || "Couldn't read this file." });
    }
    renderAttach();
  }
  input.focus();
}
function retry() {
  const c = chat();
  if (!c || S.busy) return;
  if (c.messages.at(-1)?.role === 'assistant') c.messages.pop();
  if (c.messages.at(-1)?.role !== 'user') return;
  ask(c);
}

// ---------- поле ввода ----------
const input = $('#input');
function grow() { input.style.height = 'auto'; input.style.height = `${Math.min(input.scrollHeight, 240)}px`; }
function syncSend() {
  if (S.busy) return;
  const reading = S.pending.some((p) => p.status === 'reading');
  $('#send').disabled = reading || !(input.value.trim() || S.pending.some((p) => p.status === 'ready'));
}
const fileInput = $('#file-input');
fileInput.accept = ACCEPT;
$('#attach-btn').onclick = () => fileInput.click();
fileInput.onchange = () => { addFiles(fileInput.files); fileInput.value = ''; };
$('#attach-row').onclick = (e) => {
  const b = e.target.closest('[data-rm]');
  if (!b) return;
  const [p] = S.pending.splice(Number(b.dataset.rm), 1);
  if (p?.id) deleteFiles([p.id]);
  renderAttach();
};
$('#main').addEventListener('dragover', (e) => { if (e.dataTransfer?.types?.includes('Files')) { e.preventDefault(); $('#main').classList.add('drop'); } });
$('#main').addEventListener('dragleave', (e) => { if (e.target === $('#main')) $('#main').classList.remove('drop'); });
$('#main').addEventListener('drop', (e) => { e.preventDefault(); $('#main').classList.remove('drop'); if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files); });
function setBusy(on) {
  const b = $('#send');
  b.disabled = false;
  b.innerHTML = icon(on ? 'i-stop' : 'i-up');
  b.setAttribute('aria-label', on ? 'Stop' : 'Send');
  if (!on) syncSend();
}
input.addEventListener('input', () => { grow(); syncSend(); });
// Кнопка «Web»: следующие ответы ищут в интернете и показывают источники

// ---------- коннекторы (MCP, только чтение): хранятся в этом браузере ----------
const SUGGESTED = [
  { name: 'Microsoft Learn', url: 'https://learn.microsoft.com/api/mcp', hint: 'Microsoft and Azure docs' },
  { name: 'Hugging Face', url: 'https://huggingface.co/mcp', hint: 'models and datasets' },
  { name: 'Context7', url: 'https://mcp.context7.com/mcp', hint: 'library docs' },
  { name: 'Parallel Search', url: 'https://search.parallel.ai/mcp', hint: 'web search' },
];
S.connectors = (() => { const v = store.get('pleeply.web.connectors', []); return Array.isArray(v) ? v : []; })();
const activeConnectors = () => S.connectors.filter((c) => c.enabled).slice(0, 5);
const saveConnectors = () => store.set('pleeply.web.connectors', S.connectors.slice(0, 20));
function renderConnectors() {
  const host = (u) => { try { return new URL(u).hostname; } catch { return u; } };
  $('#conn-list').innerHTML = S.connectors.length ? S.connectors.map((c, i) => `<li>
      <input type="checkbox" data-on="${i}" ${c.enabled ? 'checked' : ''} aria-label="Use ${esc(c.name)}">
      <span class="cinfo"><b>${esc(c.name)}</b><small>${esc(host(c.url))} · ${Number(c.tools || 0)} read-only tools${c.hidden ? ` · ${Number(c.hidden)} hidden` : ''}${c.token ? ' · token' : ''}</small></span>
      <button class="ic-btn" type="button" data-cdel="${i}" aria-label="Remove ${esc(c.name)}" title="Remove">${icon('i-x')}</button></li>`).join('')
    : '<li class="cinfo"><small>No connectors yet. Add a suggested one or your own MCP server.</small></li>';
  $('#conn-suggest').innerHTML = SUGGESTED.filter((s) => !S.connectors.some((c) => c.url === s.url))
    .map((s, i) => `<button type="button" data-sug="${SUGGESTED.indexOf(s)}">+ ${esc(s.name)}<small>${esc(s.hint)}</small></button>`).join('') || '<small style="color:var(--dim)">All suggested connectors are added.</small>';
}
async function addConnector({ name, url, token }) {
  const note = $('#conn-note');
  note.className = 'conn-note';
  note.textContent = `Checking ${name || url}…`;
  const r = await fetch('/api/ai/v1/connectors', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Pleeply-Device': DEVICE }, body: JSON.stringify({ url, token }) }).catch(() => null);
  const j = r ? await r.json().catch(() => ({})) : {};
  if (!j.ok) { note.className = 'conn-note err'; note.textContent = j.error || "Couldn't reach this connector."; return false; }
  if (!j.tools.length) { note.className = 'conn-note err'; note.textContent = `${j.server} has no read-only tools${j.hidden ? ` (${j.hidden} hidden because they could change data)` : ''}.`; return false; }
  S.connectors.push({ id: crypto.randomUUID(), name: (name || j.server).slice(0, 40), url, token: token || '', enabled: true, tools: j.tools.length, hidden: j.hidden || 0 });
  saveConnectors(); renderConnectors();
  note.textContent = `Added ${name || j.server}: ${j.tools.length} read-only tools.`;
  return true;
}
const connDlg = $('#connectors');
$('#open-connectors').onclick = () => { closeMobile(); renderConnectors(); connDlg.showModal(); };
connDlg.addEventListener('click', async (e) => {
  if (e.target === connDlg || e.target.closest('[data-close]')) return connDlg.close();
  const on = e.target.closest('[data-on]');
  if (on) { S.connectors[Number(on.dataset.on)].enabled = on.checked; saveConnectors(); renderConnectors(); return; }
  const del = e.target.closest('[data-cdel]');
  if (del) { S.connectors.splice(Number(del.dataset.cdel), 1); saveConnectors(); renderConnectors(); return; }
  const sug = e.target.closest('[data-sug]');
  if (sug) { sug.disabled = true; await addConnector(SUGGESTED[Number(sug.dataset.sug)]); renderConnectors(); }
});
$('#conn-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const ok = await addConnector({ name: $('#conn-name').value.trim(), url: $('#conn-url').value.trim(), token: $('#conn-token').value.trim() });
  if (ok) { $('#conn-name').value = ''; $('#conn-url').value = ''; $('#conn-token').value = ''; }
});
renderConnectors();
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(input.value); }
});
$('#composer').addEventListener('submit', (e) => { e.preventDefault(); if (S.busy) S.busy.abort(); else send(input.value); });
$('#chips').onclick = (e) => { const b = e.target.closest('button'); if (b) send(b.textContent); };
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { if (S.busy) S.busy.abort(); closeMenus(); }
  if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'o') { e.preventDefault(); $('#new-chat').click(); }
});

// ---------- боковая панель ----------
const app = $('#app');
const mobile = () => matchMedia('(max-width: 800px)').matches;
function closeMobile() { app.classList.remove('mobile-open'); }
$('#collapse').onclick = () => { app.classList.add('collapsed'); store.set('pleeply.web.collapsed', true); };
$('#open-side').onclick = () => {
  if (mobile()) app.classList.add('mobile-open');
  else { app.classList.remove('collapsed'); store.set('pleeply.web.collapsed', false); }
};
$('#scrim').onclick = closeMobile;
if (store.get('pleeply.web.collapsed', false)) app.classList.add('collapsed');

// ---------- уведомления ----------
let toastTimer;
function toast(text, err = false) {
  document.querySelector('.toast')?.remove();
  const t = document.createElement('div');
  t.className = `toast${err ? ' err' : ''}`;
  t.setAttribute('role', 'status');
  t.textContent = text;
  document.body.append(t);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), 3200);
}
const signin = new URLSearchParams(location.search).get('signin');
if (signin) {
  toast(signin === 'cancelled' ? 'Sign-in cancelled.' : "Google sign-in didn't finish. Try again.", signin !== 'cancelled');
  window.history.replaceState(null, '', '/chat');
}

// ---------- проекты и Co-founder (assets/projects.js) ----------
const projects = initProjects({
  $, esc, md, icon, store, DEVICE, toast, closeMobile, sourcesHtml,
  onOpen: () => { if (S.busy) S.busy.abort(); S.current = null; $('#main').classList.add('project-mode'); renderChats(); },
  onClose: () => { $('#main').classList.remove('project-mode'); renderThread(); },
});

// ---------- старт ----------
renderChats();
renderThread();
renderPicker();
loadModels();
loadAccount();
input.focus();

// Вопрос, набранный в строке на главной странице. Сам отправляется только то, что передала наша главная через
// sessionStorage этой вкладки. Текст из ссылки (#q=…) лишь вписывается в поле: чужая ссылка не может отправить
// сообщение от имени человека и потратить его лимит.
(() => {
  let text = null;
  try {
    const p = JSON.parse(sessionStorage.getItem('pleeply.web.pending') || 'null');
    sessionStorage.removeItem('pleeply.web.pending');
    if (p && typeof p.text === 'string' && Date.now() - Number(p.at) < 120_000) text = p.text;
  } catch {}
  const h = /^#q=(.+)$/.exec(location.hash);
  if (h) {
    window.history.replaceState(null, '', '/chat');
    if (!text) {
      try { input.value = decodeURIComponent(h[1]).slice(0, 20_000); } catch {}
      grow(); syncSend(); input.focus();
    }
  }
  if (text) send(text.slice(0, 20_000));
})();
