// Браузерная версия pleeply (/chat): интерфейс чата. Все ответы считает сервер; здесь только показ и хранение в браузере.
import { marked } from '/assets/vendor/chat/marked.mjs';
import DOMPurify from '/assets/vendor/chat/purify.mjs';

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
const KEEP_CHARS = 48_000;

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
};
// Ответы, оборванные закрытием вкладки, не должны вечно «печататься»
for (const c of S.chats) for (const m of c.messages || []) if (m.streaming) { m.streaming = false; if (!m.content) m.error = 'Interrupted.'; }
const save = () => store.set('pleeply.web.chats', S.chats.slice(0, 200));
const chat = () => S.chats.find((c) => c.id === S.current) || null;

// ---------- markdown ----------
marked.setOptions({ gfm: true, breaks: true });
DOMPurify.addHook('afterSanitizeAttributes', (n) => { if (n.tagName === 'A') { n.setAttribute('target', '_blank'); n.setAttribute('rel', 'noopener noreferrer'); } });
// Ответ модели — чужой текст: пропускаем только разметку markdown, без стилей, картинок и медиа,
// чтобы подброшенная в ответ ссылка не могла сама загрузиться и унести данные (вдобавок CSP страницы).
const MD_TAGS = ['p', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'em', 'b', 'i', 'del', 's', 'code', 'pre', 'blockquote', 'ul', 'ol', 'li', 'a', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'span'];
const md = (text) => DOMPurify.sanitize(marked.parse(text || ''), { ALLOWED_TAGS: MD_TAGS, ALLOWED_ATTR: ['href', 'title', 'class', 'align', 'start'], ALLOW_DATA_ATTR: false });

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
  const m = document.createElement('div');
  m.className = 'menu';
  m.setAttribute('role', 'menu');
  m.innerHTML = `<div class="head"><b>${esc(a.name || a.email)}</b>${esc(a.email)}</div>
    ${cap ? `<div class="usage">Today: ${used} of ${cap} free messages<div class="bar"><i style="width:${Math.min(100, (used / cap) * 100)}%"></i></div></div>` : ''}
    ${a.plan !== 'pro' && upgrade ? `<button type="button" data-act="upgrade">Upgrade to Pro${price ? ` · ${esc(price)}` : ''}</button>` : ''}
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
    S.chats = S.chats.filter((c) => c.id !== del.dataset.del);
    if (S.current === del.dataset.del) S.current = null;
    save(); renderChats(); renderThread();
    return;
  }
  const a = e.target.closest('a[data-id]');
  if (!a) return;
  e.preventDefault();
  if (S.busy) S.busy.abort();
  S.current = a.dataset.id;
  closeMobile(); renderChats(); renderThread(); toBottom(true);
};
$('#new-chat').onclick = () => { if (S.busy) S.busy.abort(); S.current = null; closeMobile(); renderChats(); renderThread(); input.focus(); };

// ---------- сообщения ----------
function msgHtml(m, i, last) {
  if (m.role === 'user') return `<div class="msg user"><div class="bubble">${esc(m.content)}</div></div>`;
  const thinking = m.streaming && !m.content;
  const think = m.reasoning ? `<details class="think"${thinking ? ' open' : ''}><summary>${thinking ? 'Thinking…' : 'Thought process'}</summary><div>${esc(m.reasoning)}</div></details>` : '';
  const body = m.error ? `<div class="err">${esc(m.error)}</div>` : `<div class="body${m.streaming ? ' cursor' : ''}">${md(m.content)}</div>`;
  const meta = m.streaming ? '' : `<div class="meta">
      ${m.content ? `<button class="ic-btn" type="button" data-copy="${i}" title="Copy" aria-label="Copy">${icon('i-copy')}</button>` : ''}
      ${last ? `<button class="ic-btn" type="button" data-retry title="Try again" aria-label="Try again">${icon('i-retry')}</button>` : ''}
      ${m.route ? `<span class="route">${esc(m.route)}</span>` : ''}</div>`;
  return `<div class="msg ai" data-i="${i}">${think}${body}${meta}</div>`;
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
}
$('#thread').onclick = (e) => {
  const cp = e.target.closest('[data-copy]');
  if (cp) { navigator.clipboard?.writeText(chat().messages[Number(cp.dataset.copy)].content); toast('Copied.'); return; }
  if (e.target.closest('[data-retry]')) retry();
};

let stick = true;
$('#scroll').addEventListener('scroll', (e) => { const s = e.target; stick = s.scrollHeight - s.scrollTop - s.clientHeight < 80; });
const toBottom = (force) => { const s = $('#scroll'); if (force || stick) s.scrollTop = s.scrollHeight; };

// ---------- отправка ----------
function buildHistory(messages) {
  const out = [];
  let chars = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.error || m.streaming || !m.content) continue;
    chars += m.content.length;
    if (chars > KEEP_CHARS && out.length) break;
    out.unshift({ role: m.role, content: m.content });
  }
  return [{ role: 'system', content: SYSTEM }, ...out];
}

async function ask(c) {
  const reply = { role: 'assistant', content: '', reasoning: '', streaming: true };
  const prior = c.messages.slice();
  c.messages.push(reply);
  renderThread(); toBottom(true);
  const ctrl = new AbortController();
  S.busy = ctrl; setBusy(true);
  let frame = 0;
  const paint = () => { if (!frame && S.current === c.id) frame = requestAnimationFrame(() => { frame = 0; updateLast(); toBottom(); }); };
  try {
    const r = await fetch('/api/ai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Pleeply-Device': DEVICE },
      body: JSON.stringify({ model: S.model, stream: true, messages: buildHistory(prior) }),
      signal: ctrl.signal,
    });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
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
        const d = j.choices?.[0]?.delta || {};
        if (d.content) reply.content += d.content;
        const th = d.reasoning ?? d.reasoning_content;
        if (typeof th === 'string') reply.reasoning += th;
        paint();
      }
    }
    if (!reply.content) throw new Error('The model returned an empty answer. Try again.');
  } catch (e) {
    if (ctrl.signal.aborted) { if (!reply.content) reply.error = 'Stopped.'; }
    else if (!reply.content) reply.error = e.message || "Couldn't reach pleeply Cloud. Check your connection.";
    else reply.content += `\n\n_${e.message || 'Connection lost.'}_`;
  } finally {
    cancelAnimationFrame(frame);
    reply.streaming = false;
    if (!reply.reasoning) delete reply.reasoning;
    c.updated = Date.now();
    S.busy = null; setBusy(false);
    save();
    if (S.current === c.id) { updateLast(); toBottom(); }
    if (S.account) loadAccount();
  }
}

function send(text) {
  text = text.trim();
  if (!text || S.busy) return;
  let c = chat();
  if (!c) {
    c = { id: crypto.randomUUID(), title: text.replace(/\s+/g, ' ').slice(0, 60), created: Date.now(), updated: Date.now(), messages: [] };
    S.chats.unshift(c);
    S.current = c.id;
  } else {
    S.chats = [c, ...S.chats.filter((x) => x !== c)];
  }
  c.messages.push({ role: 'user', content: text });
  save(); renderChats();
  input.value = ''; grow(); syncSend();
  ask(c);
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
function syncSend() { if (!S.busy) $('#send').disabled = !input.value.trim(); }
function setBusy(on) {
  const b = $('#send');
  b.disabled = false;
  b.innerHTML = icon(on ? 'i-stop' : 'i-up');
  b.setAttribute('aria-label', on ? 'Stop' : 'Send');
  if (!on) syncSend();
}
input.addEventListener('input', () => { grow(); syncSend(); });
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
