// pleeply Studio (/studio): ИИ пишет сценарий сайта на сервере, здесь — превью в песочнице, инспектор, версии,
// скачивание HTML и публикация по ссылке. Сайты и версии хранятся только в этом браузере.
import { normalize, SCENES, SECTION_TYPES } from '/assets/studio/spec.js';
import { DEMOS } from '/assets/studio/demos.js';

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icon = (id) => `<svg class="ic"><use href="#${id}"/></svg>`;
const clone = (v) => JSON.parse(JSON.stringify(v));

// ---------- хранение ----------
const mem = {};
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return k in mem ? mem[k] : d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { mem[k] = v; return false; } },
};
const DEVICE = (() => {
  let id = store.get('pleeply.web.device', null);
  if (!/^[a-f0-9-]{16,64}$/i.test(id || '')) { id = crypto.randomUUID(); store.set('pleeply.web.device', id); }
  return id;
})();
const MAX_SITES = 12;
const MAX_VERSIONS = 20;

const validSite = (s) => s && typeof s.id === 'string' && Array.isArray(s.versions) && s.versions.length && s.versions.every((v) => v && typeof v.spec === 'object');
const S = {
  sites: (() => { const v = store.get('pleeply.studio.sites', []); return Array.isArray(v) ? v.filter(validSite) : []; })(),
  id: store.get('pleeply.studio.current', null),
  tab: 'create',
  device: 'desktop',
  style: '',
  busy: null,
  frameReady: false,
  shown: null,
};
for (const s of S.sites) { s.cur = Math.min(Math.max(0, Number(s.cur) || 0), s.versions.length - 1); s.log = Array.isArray(s.log) ? s.log : []; }
if (!S.sites.some((s) => s.id === S.id)) S.id = null;

const site = () => S.sites.find((s) => s.id === S.id) || null;
const spec = () => { const s = site(); return s ? s.versions[s.cur].spec : null; };

let saveT = 0;
function save(now = false) {
  clearTimeout(saveT);
  const run = () => {
    store.set('pleeply.studio.current', S.id);
    for (let i = 0; i < 40; i++) {
      if (store.set('pleeply.studio.sites', S.sites)) return;
      // место кончилось: убираем самые старые версии у сайта, где их больше всего
      const big = [...S.sites].sort((a, b) => b.versions.length - a.versions.length)[0];
      if (!big || big.versions.length <= 2) return;
      big.versions.shift();
      big.cur = Math.max(0, big.cur - 1);
    }
  };
  if (now) run(); else saveT = setTimeout(run, 400);
}

function hash(v) {
  const s = JSON.stringify(v);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

function ago(t) {
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  if (m < 60 * 24) return `${Math.round(m / 60)} h ago`;
  return new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

let toastT = 0;
function toast(text) {
  const t = $('#toast');
  t.textContent = text;
  t.classList.add('on');
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('on'), 2600);
}

// ---------- версии ----------
function pushVersion(s, sp, note, by, model = '') {
  s.versions = s.versions.slice(0, s.cur + 1);
  s.versions.push({ spec: sp, note, by, model, at: Date.now() });
  if (s.versions.length > MAX_VERSIONS) s.versions.shift();
  s.cur = s.versions.length - 1;
  s.title = sp.title;
  s.updated = Date.now();
}

function newSite(sp, extra = {}) {
  const s = { id: crypto.randomUUID(), title: sp.title, created: Date.now(), updated: Date.now(), versions: [], cur: -1, log: [], pub: null, ...extra };
  pushVersion(s, sp, extra.note || '', extra.by || 'ai', extra.model || '');
  S.sites.unshift(s);
  // старые неопубликованные сайты уходят первыми
  while (S.sites.length > MAX_SITES) {
    const i = S.sites.findLastIndex((x, k) => k > 0 && !x.pub);
    S.sites.splice(i > 0 ? i : S.sites.length - 1, 1);
  }
  S.id = s.id;
  return s;
}

function go(delta) {
  const s = site();
  if (!s) return;
  const n = s.cur + delta;
  if (n < 0 || n >= s.versions.length) return;
  s.cur = n;
  s.title = s.versions[n].spec.title;
  save();
  refresh({ keepScroll: true });
}

// ---------- превью ----------
const frame = $('#frame');
let previewT = 0;
function preview(keepScroll = false) {
  const sp = spec();
  $('#device').classList.toggle('hidden-frame', !sp);
  $('#intro').hidden = Boolean(sp);
  if (!sp) return;
  S.shown = { type: 'pp-render', spec: sp, keepScroll };
  clearTimeout(previewT);
  previewT = setTimeout(flush, keepScroll ? 120 : 0);
}
function flush() {
  if (S.frameReady && S.shown) frame.contentWindow.postMessage(S.shown, '*');
}
addEventListener('message', (e) => {
  if (e.source !== frame.contentWindow) return;
  const t = e.data?.type;
  if (t === 'pp-frame-ready') { S.frameReady = true; if (S.shown) S.shown = { ...S.shown, keepScroll: false }; flush(); }
  else if (t === 'pp-error') toast("The preview couldn't draw this version.");
});

function setDevice(d) {
  S.device = d;
  $('#device').dataset.device = d;
  for (const b of document.querySelectorAll('.devices button')) b.setAttribute('aria-pressed', String(b.dataset.device === d));
}

// ---------- вкладки ----------
function setTab(t) {
  S.tab = t;
  for (const b of document.querySelectorAll('.tabs button')) b.setAttribute('aria-selected', String(b.dataset.tab === t));
  const has = Boolean(site());
  $('#tab-create').hidden = !(t === 'create' && !has);
  $('#tab-edit').hidden = !(t === 'create' && has);
  $('#tab-inspect').hidden = t !== 'inspect';
  $('#tab-sites').hidden = t !== 'sites';
  if (t === 'inspect') renderInspector();
  if (t === 'sites') renderSites();
  if (t === 'create' && has) { renderLog(); }
}

// ---------- верхняя панель ----------
function renderBar() {
  const s = site();
  $('#site-title').textContent = s ? s.title : 'New site';
  $('#ver').textContent = s ? `v${s.cur + 1}/${s.versions.length}` : '';
  $('#undo').disabled = !s || s.cur <= 0 || Boolean(S.busy);
  $('#redo').disabled = !s || s.cur >= s.versions.length - 1 || Boolean(S.busy);
  $('#download').disabled = !s || Boolean(S.busy);
  const pub = $('#publish');
  pub.disabled = !s || Boolean(S.busy);
  const live = s?.pub;
  pub.lastChild.textContent = !live ? 'Publish' : live.hash === hash(spec()) ? 'Published' : 'Update link';
  document.title = s ? `${s.title} · pleeply Studio` : 'pleeply Studio — describe a site, get it in 3D';
}

function refresh({ keepScroll = false } = {}) {
  renderBar();
  preview(keepScroll);
  if (S.tab === 'inspect') renderInspector();
  if (S.tab === 'sites') renderSites();
  if (S.tab === 'create') setTab('create');
}

// ---------- создание ----------
const STYLES = [
  { id: 'prism', name: 'Prism studio', note: 'Dark, glass prism, huge grotesk', dot: 'conic-gradient(from 200deg, #d9e2ff, #6c7bff, #111 70%)',
    hint: 'near-black background, a glass prism refracting light, an enormous grotesk wordmark, tiny mono labels, thin grid lines, minimal and premium' },
  { id: 'swiss', name: 'Swiss organic', note: 'Light, bold type, living form', dot: 'radial-gradient(circle at 35% 35%, #7aa2ff, #1f4dff 60%)',
    hint: 'light off-white background, bold Swiss grotesk typography, one electric blue accent, an organic morphing 3D form, numbered annotations' },
  { id: 'editorial', name: 'Editorial', note: 'Serif, fashion, flowing colour', dot: 'radial-gradient(circle at 40% 40%, #f4d7c4, #b0614b 70%)',
    hint: 'editorial fashion magazine mood, elegant serif headlines, a soft flowing colour field, calm luxury tone' },
  { id: 'bureau', name: 'Mono bureau', note: 'Dark, data grid, particles', dot: 'radial-gradient(circle at 50% 50%, #c8ff5a, #1a1a1a 65%)',
    hint: 'dark design bureau, monospace metadata everywhere, precise and witty copy, a particle sphere, one sharp acid accent' },
];
$('#styles').innerHTML = STYLES.map((s) => `<button type="button" class="style" data-style="${s.id}" aria-pressed="false"><i style="background:${s.dot}"></i><b>${esc(s.name)}</b><small>${esc(s.note)}</small></button>`).join('');
$('#styles').addEventListener('click', (e) => {
  const b = e.target.closest('.style');
  if (!b) return;
  S.style = S.style === b.dataset.style ? '' : b.dataset.style;
  for (const x of document.querySelectorAll('.style')) x.setAttribute('aria-pressed', String(x.dataset.style === S.style));
});

$('#demos').innerHTML = DEMOS.map((d) => `<button type="button" class="demo" data-demo="${d.key}"><i style="background:${d.bg}"></i><b>${esc(d.name)}</b><small>${esc(d.tag)}</small></button>`).join('');
$('#demos').addEventListener('click', (e) => {
  const b = e.target.closest('.demo');
  const d = b && DEMOS.find((x) => x.key === b.dataset.demo);
  if (!d) return;
  const had = S.sites.find((s) => s.demo === d.key);
  if (had) S.id = had.id;
  else {
    const s = newSite(normalize(d.spec), { by: 'demo', demo: d.key, note: 'Demo site' });
    s.log.push({ role: 'sys', text: `Demo: ${d.name}` }, { role: 'ai', text: 'This is a demo. Ask for any change below, or tune the scene and colours in the Inspector.', v: 1 });
  }
  save();
  setTab('create');
  refresh();
});

const PHASES = {
  new: ['Reading the brief', 'Choosing the 3D scene', 'Writing the copy', 'Setting the type', 'Tuning the colours', 'Almost there'],
  edit: ['Reading your change', 'Rewriting the site', 'Rebuilding the scene', 'Almost there'],
};
let phaseT = 0;
function busy(kind) {
  const on = Boolean(kind);
  $('#busy').hidden = !on;
  clearInterval(phaseT);
  $('#generate').disabled = on;
  $('#send').disabled = on || !$('#edit').value.trim();
  if (on) {
    let i = 0;
    $('#busy-text').textContent = PHASES[kind][0];
    phaseT = setInterval(() => { i = Math.min(i + 1, PHASES[kind].length - 1); $('#busy-text').textContent = PHASES[kind][i]; }, 4500);
  } else S.busy = null;
  renderBar();
}
$('#stop').addEventListener('click', () => S.busy?.abort());

async function callStudio(body) {
  const ctrl = new AbortController();
  S.busy = ctrl;
  const r = await fetch('/api/ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Pleeply-Device': DEVICE },
    body: JSON.stringify({ task: 'site', model: 'auto', messages: [{ role: 'user', content: body.brief || body.edit }], ...body }),
    signal: ctrl.signal,
  });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(j?.error?.message || `pleeply Cloud returned ${r.status}. Try again.`);
  if (!j?.spec) throw new Error("Studio couldn't design the site this time. Try again.");
  return j;
}

const brief = $('#brief');
$('#brief-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = brief.value.trim();
  if (!text || S.busy) return;
  const style = STYLES.find((s) => s.id === S.style);
  busy('new');
  try {
    const j = await callStudio({ brief: text, style: style?.hint || '', scene: $('#scene').value, mode: $('#mode').value });
    const s = newSite(normalize(j.spec), { by: 'ai', note: j.note, model: j.model, brief: text });
    s.log.push({ role: 'you', text }, { role: 'ai', text: j.note || 'Here is your site. Ask for changes below.', v: 1 });
    brief.value = '';
    save();
    busy(null);
    setTab('create');
    refresh();
  } catch (err) {
    busy(null);
    if (err.name !== 'AbortError') toast(err.message);
  }
});
brief.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) $('#brief-form').requestSubmit(); });

// ---------- правки чатом ----------
const QUICK = ['Bolder, shorter copy', 'Add a stats section', 'Make it feel more luxurious', 'Try a different 3D scene', 'Translate to Russian'];
$('#quick').innerHTML = QUICK.map((q) => `<button type="button">${esc(q)}</button>`).join('');
$('#quick').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b || S.busy) return;
  $('#edit').value = b.textContent;
  $('#edit-form').requestSubmit();
});

function renderLog() {
  const s = site();
  const log = $('#log');
  if (!s) { log.textContent = ''; return; }
  log.innerHTML = s.log.map((m) => {
    if (m.role === 'ai') return `<div class="msg ai">${esc(m.text)}${m.v ? `<span class="v">Version ${m.v}</span>` : ''}</div>`;
    return `<div class="msg ${m.role === 'you' ? 'you' : m.role === 'err' ? 'err' : 'sys'}">${esc(m.text)}</div>`;
  }).join('');
  log.scrollTop = log.scrollHeight;
}

const edit = $('#edit');
const grow = () => { edit.style.height = 'auto'; edit.style.height = `${Math.min(edit.scrollHeight, 180)}px`; $('#send').disabled = Boolean(S.busy) || !edit.value.trim(); };
edit.addEventListener('input', grow);
edit.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); $('#edit-form').requestSubmit(); } });
$('#edit-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const s = site();
  const text = edit.value.trim();
  if (!s || !text || S.busy) return;
  s.log.push({ role: 'you', text });
  if (s.log.length > 60) s.log.splice(0, s.log.length - 60);
  edit.value = '';
  grow();
  renderLog();
  busy('edit');
  try {
    const j = await callStudio({ edit: text, current: spec() });
    pushVersion(s, normalize(j.spec), j.note, 'ai', j.model);
    s.log.push({ role: 'ai', text: j.note || 'Done.', v: s.cur + 1 });
  } catch (err) {
    s.log.push({ role: 'err', text: err.name === 'AbortError' ? 'Stopped.' : err.message });
  }
  save();
  busy(null);
  refresh({ keepScroll: true });
});

// ---------- инспектор ----------
const SCENE_NAMES = { prism: 'Prism', blob: 'Organic', particles: 'Particles', waves: 'Waves', rings: 'Rings', terrain: 'Terrain' };
const FONT_NAMES = { grotesk: ['Aa', 'Grotesk', "800 20px 'Arial Black', Arial, sans-serif"], sans: ['Aa', 'Sans', "600 20px system-ui, sans-serif"], serif: ['Aa', 'Serif', "400 22px 'Instrument Serif', Georgia, serif"], display: ['AA', 'Display', "700 18px Impact, 'Arial Narrow', sans-serif"] };
const TYPE_NAMES = { hero: 'Hero', statement: 'Manifesto', marquee: 'Ticker', index: 'Index', features: 'Cards', stats: 'Numbers', quote: 'Quote', gallery: 'Gallery', cta: 'Call to action', footer: 'Footer' };
const TEMPLATES = {
  statement: { type: 'statement', label: 'Manifesto', text: 'Write one bold sentence here. Each word lights up as visitors scroll past it.' },
  marquee: { type: 'marquee', items: [{ title: 'One' }, { title: 'Two' }, { title: 'Three' }, { title: 'Four' }] },
  index: { type: 'index', label: 'Index', title: 'Selected work', items: [{ title: 'First item', meta: '2026' }, { title: 'Second item', meta: '2025' }, { title: 'Third item', meta: '2024' }] },
  features: { type: 'features', label: 'Services', title: 'What we do', items: [{ title: 'First', text: 'Describe it in a sentence.' }, { title: 'Second', text: 'Describe it in a sentence.' }, { title: 'Third', text: 'Describe it in a sentence.' }] },
  stats: { type: 'stats', label: 'Numbers', items: [{ value: '120+', title: 'Clients' }, { value: '14', title: 'Years' }, { value: '3', title: 'Cities' }] },
  quote: { type: 'quote', label: 'Voices', text: 'A short, memorable sentence from a client.', author: 'Name, role' },
  gallery: { type: 'gallery', label: 'Gallery', title: 'Selected', items: [{ title: 'One', meta: '2026' }, { title: 'Two', meta: '2025' }, { title: 'Three', meta: '2024' }] },
  cta: { type: 'cta', label: 'Contact', title: 'Let’s talk', text: 'Tell visitors what to do next.', cta: { label: 'Get in touch', href: 'mailto:hello@example.com' } },
  hero: { type: 'hero', label: 'Intro', title: 'A new beginning', text: 'One or two sentences about it.' },
  footer: { type: 'footer', text: '© 2026' },
};
let openSec = -1;

/** Изменение из инспектора: новая версия (быстрые правки подряд склеиваются в одну). */
function mutate(fn, { rebuild = false } = {}) {
  const s = site();
  if (!s) return;
  const next = clone(spec());
  fn(next);
  const sp = normalize(next);
  const last = s.versions[s.cur];
  if (last.by === 'you' && s.cur === s.versions.length - 1 && Date.now() - last.at < 5000) {
    last.spec = sp; last.at = Date.now(); s.title = sp.title; s.updated = Date.now();
  } else pushVersion(s, sp, 'Edited in the Inspector', 'you');
  save();
  renderBar();
  preview(true);
  if (rebuild) renderInspector();
}

const lum = (hex) => { const n = parseInt(hex.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };
const itemsText = (sec) => sec.items.map((i) => (sec.type === 'stats' ? [i.value, i.title] : sec.type === 'marquee' ? [i.title] : [i.title, i.text, i.meta]).filter((x, k) => x || k === 0).join(' | ')).join('\n');
const parseItems = (type, text) => text.split('\n').map((l) => l.split('|').map((x) => x.trim())).filter((p) => p[0]).slice(0, 12).map((p) => (
  type === 'stats' ? { value: p[0], title: p[1] || '' } : type === 'marquee' ? { title: p[0] } : { title: p[0], text: p[1] || '', meta: p[2] || '' }));

function renderInspector() {
  const box = $('#tab-inspect');
  const sp = spec();
  if (!sp) { box.innerHTML = '<p class="empty-note">Generate a site or open a demo first. Then tune its 3D scene, colours, type and sections here — changes show instantly and cost nothing.</p>'; return; }
  const sw = (key, label, val) => `<label class="ctl">${label}<span class="swatch"><input type="color" data-color="${key}" value="${esc(val)}"><code>${esc(val)}</code></span></label>`;
  const heroes = sp.sections.filter((x) => x.type === 'hero').length;
  box.innerHTML = `
    <div class="group"><h3>3D scene</h3>
      <div class="scenes">${SCENES.map((t) => `<button type="button" class="scene-btn" data-scene="${t}" aria-pressed="${sp.scene.type === t}"><svg><use href="#s-${t}"/></svg>${SCENE_NAMES[t]}</button>`).join('')}</div>
      <label class="ctl">Intensity<input type="range" min="0" max="1" step="0.05" data-range="intensity" value="${sp.scene.intensity}"></label>
      ${sw('scene', 'Scene colour', sp.scene.color)}
    </div>
    <div class="group"><h3>Theme</h3>
      <div class="ctl">Mode<div class="seg" data-seg="mode"><button type="button" data-v="dark" aria-pressed="${sp.theme.mode === 'dark'}">Dark</button><button type="button" data-v="light" aria-pressed="${sp.theme.mode === 'light'}">Light</button></div></div>
      ${sw('bg', 'Background', sp.theme.bg)}${sw('fg', 'Text', sp.theme.fg)}${sw('accent', 'Accent', sp.theme.accent)}
      <div class="ctl">Grid lines<div class="seg" data-seg="grid"><button type="button" data-v="on" aria-pressed="${sp.theme.grid}">On</button><button type="button" data-v="off" aria-pressed="${!sp.theme.grid}">Off</button></div></div>
      <span class="lbl">Typeface</span>
      <div class="fonts">${Object.entries(FONT_NAMES).map(([k, [a, n, f]]) => `<button type="button" data-font="${k}" aria-pressed="${sp.theme.font === k}"><b style="font:${f}">${a}</b>${n}</button>`).join('')}</div>
    </div>
    <div class="group"><h3>Text</h3>
      <label class="lbl" for="in-title">Site name</label><input class="inp" id="in-title" data-text="title" maxlength="80">
      <label class="lbl" for="in-brand">Wordmark</label><input class="inp" id="in-brand" data-text="brand" maxlength="40">
      <label class="lbl" for="in-desc">Description</label><textarea id="in-desc" rows="2" data-text="description" maxlength="200"></textarea>
    </div>
    <div class="group"><h3>Sections</h3>
      <ul class="secs">${sp.sections.map((x, i) => `<li data-i="${i}">
        <span class="badge">${TYPE_NAMES[x.type]}</span>
        <button type="button" class="t" data-open="${i}" style="all:unset;cursor:pointer;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-size:13px;color:var(--text)">${esc(x.title || x.label || x.text || x.items?.[0]?.title || TYPE_NAMES[x.type])}</button>
        <span class="acts">
          <button type="button" class="ic-btn" data-move="-1" aria-label="Move up" ${i === 0 ? 'disabled' : ''}>${icon('i-up')}</button>
          <button type="button" class="ic-btn" data-move="1" aria-label="Move down" ${i === sp.sections.length - 1 ? 'disabled' : ''}>${icon('i-down')}</button>
          <button type="button" class="ic-btn" data-drop aria-label="Remove section" ${x.type === 'hero' && heroes < 2 ? 'disabled' : ''}>${icon('i-x')}</button>
        </span></li>${openSec === i ? secEditor(x, i) : ''}`).join('')}</ul>
      <div class="add-sec"><select id="add-type" aria-label="Section type">${SECTION_TYPES.filter((t) => t !== 'footer' || !sp.sections.some((x) => x.type === 'footer')).map((t) => `<option value="${t}">${TYPE_NAMES[t]}</option>`).join('')}</select><button class="btn" id="add-sec" type="button">${icon('i-plus')}Add</button></div>
    </div>`;
  $('#in-title').value = sp.title;
  $('#in-brand').value = sp.nav.brand;
  $('#in-desc').value = sp.description;
  const ed = box.querySelector('.sec-ed');
  if (ed) {
    const x = sp.sections[openSec];
    for (const f of ['label', 'title', 'text', 'author']) { const inp = ed.querySelector(`[data-sec="${f}"]`); if (inp) inp.value = x[f] || ''; }
    const it = ed.querySelector('[data-sec="items"]');
    if (it) it.value = itemsText(x);
  }
}

function secEditor(x, i) {
  const has = { label: x.type !== 'marquee', title: !['statement', 'marquee', 'quote', 'footer', 'stats'].includes(x.type), text: !['marquee', 'index', 'features', 'stats', 'gallery'].includes(x.type), author: x.type === 'quote', items: ['marquee', 'index', 'features', 'stats', 'gallery'].includes(x.type) };
  const hint = x.type === 'stats' ? 'One per line: value | what it counts' : x.type === 'marquee' ? 'One phrase per line' : 'One per line: title | text | meta';
  return `<li class="sec-ed" data-i="${i}" style="display:block;padding:10px">
    ${has.label ? '<label class="lbl" style="margin-top:2px">Label</label><input class="inp" data-sec="label" maxlength="40">' : ''}
    ${has.title ? '<label class="lbl">Title</label><input class="inp" data-sec="title" maxlength="140">' : ''}
    ${has.text ? '<label class="lbl">Text</label><textarea rows="3" data-sec="text" maxlength="700"></textarea>' : ''}
    ${has.author ? '<label class="lbl">Author</label><input class="inp" data-sec="author" maxlength="80">' : ''}
    ${has.items ? `<label class="lbl">Items</label><textarea rows="5" data-sec="items" placeholder="${esc(hint)}"></textarea><p class="fine" style="margin-top:6px">${esc(hint)}</p>` : ''}
  </li>`;
}

const insp = $('#tab-inspect');
insp.addEventListener('click', (e) => {
  const sp = spec();
  if (!sp) return;
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.scene) return mutate((n) => { n.scene.type = b.dataset.scene; }, { rebuild: true });
  if (b.dataset.font) return mutate((n) => { n.theme.font = b.dataset.font; }, { rebuild: true });
  const seg = b.closest('[data-seg]')?.dataset.seg;
  if (seg === 'mode') return mutate((n) => {
    const v = b.dataset.v;
    if (v === n.theme.mode) return;
    n.theme.mode = v;
    if (v === 'light' && lum(n.theme.bg) < 0.5) { n.theme.bg = '#f3f1ec'; n.theme.fg = '#0d0d0d'; }
    if (v === 'dark' && lum(n.theme.bg) >= 0.5) { n.theme.bg = '#07080a'; n.theme.fg = '#f2f2ee'; }
  }, { rebuild: true });
  if (seg === 'grid') return mutate((n) => { n.theme.grid = b.dataset.v === 'on'; }, { rebuild: true });
  const li = b.closest('li[data-i]');
  const i = li ? Number(li.dataset.i) : -1;
  if (b.dataset.open != null) { openSec = openSec === Number(b.dataset.open) ? -1 : Number(b.dataset.open); return renderInspector(); }
  if (b.dataset.move) {
    const j = i + Number(b.dataset.move);
    if (openSec === i) openSec = j; else if (openSec === j) openSec = i;
    return mutate((n) => { [n.sections[i], n.sections[j]] = [n.sections[j], n.sections[i]]; }, { rebuild: true });
  }
  if (b.hasAttribute('data-drop')) { if (openSec === i) openSec = -1; else if (openSec > i) openSec--; return mutate((n) => { n.sections.splice(i, 1); }, { rebuild: true }); }
  if (b.id === 'add-sec') {
    const t = $('#add-type').value;
    return mutate((n) => {
      const at = n.sections.findIndex((x) => x.type === 'footer');
      const pos = t === 'footer' || at < 0 ? n.sections.length : at;
      n.sections.splice(pos, 0, clone(TEMPLATES[t]));
      openSec = pos;
    }, { rebuild: true });
  }
});
insp.addEventListener('input', (e) => {
  const el = e.target;
  if (el.dataset.range === 'intensity') return mutate((n) => { n.scene.intensity = Number(el.value); });
  if (el.dataset.color) {
    el.nextElementSibling.textContent = el.value;
    return mutate((n) => { if (el.dataset.color === 'scene') n.scene.color = el.value; else n.theme[el.dataset.color] = el.value; });
  }
  if (el.dataset.text) return mutate((n) => { if (el.dataset.text === 'brand') n.nav.brand = el.value; else n[el.dataset.text] = el.value; });
  if (el.dataset.sec) {
    const i = Number(el.closest('li').dataset.i);
    return mutate((n) => {
      const x = n.sections[i];
      if (el.dataset.sec === 'items') x.items = parseItems(x.type, el.value);
      else x[el.dataset.sec] = el.value;
    });
  }
});
insp.addEventListener('change', (e) => { if (e.target.dataset.text || e.target.dataset.sec) renderInspectorTitles(); });
function renderInspectorTitles() {
  const sp = spec();
  for (const b of insp.querySelectorAll('[data-open]')) { const x = sp.sections[Number(b.dataset.open)]; if (x) b.textContent = x.title || x.label || x.text || x.items?.[0]?.title || TYPE_NAMES[x.type]; }
}

// ---------- сайты и версии ----------
function renderSites() {
  const ul = $('#sites');
  ul.innerHTML = S.sites.length ? S.sites.map((s) => {
    const sp = s.versions[s.cur].spec;
    return `<li data-id="${esc(s.id)}" class="${s.id === S.id ? 'on' : ''}"><span class="dot" style="background:radial-gradient(circle at 35% 35%, ${sp.scene.color}, ${sp.theme.bg} 75%)"></span>
      <span class="meta"><b>${esc(s.title)}</b><small>${ago(s.updated)} · ${s.versions.length} version${s.versions.length === 1 ? '' : 's'}</small></span>
      ${s.pub ? '<span class="live">Live</span>' : ''}<button type="button" class="ic-btn" data-remove aria-label="Remove ${esc(s.title)}">${icon('i-x')}</button></li>`;
  }).join('') : '<li class="empty-note" style="cursor:default">No sites yet.</li>';
  const s = site();
  $('#versions').innerHTML = s ? s.versions.map((v, i) => ({ v, i })).reverse().map(({ v, i }) => `<li data-v="${i}" class="${i === s.cur ? 'on' : ''}">
    <span class="meta"><b>v${i + 1} · ${v.by === 'ai' ? 'AI' : v.by === 'demo' ? 'Demo' : 'You'}</b><small>${esc(v.note || '')}${v.note ? ' · ' : ''}${ago(v.at)}</small></span></li>`).join('') : '<li class="empty-note" style="cursor:default">Open a site to see its versions.</li>';
}
$('#sites').addEventListener('click', (e) => {
  const li = e.target.closest('li[data-id]');
  if (!li) return;
  const s = S.sites.find((x) => x.id === li.dataset.id);
  if (!s) return;
  if (e.target.closest('[data-remove]')) {
    const note = s.pub ? '\n\nIt stays online at its link. Unpublish it first if you want it gone.' : '';
    if (!confirm(`Remove “${s.title}” and its versions from this browser?${note}`)) return;
    S.sites = S.sites.filter((x) => x !== s);
    if (S.id === s.id) S.id = null;
  } else {
    S.id = s.id;
    openSec = -1;
  }
  save();
  refresh();
});
$('#versions').addEventListener('click', (e) => {
  const li = e.target.closest('li[data-v]');
  const s = site();
  if (!li || !s) return;
  s.cur = Number(li.dataset.v);
  s.title = s.versions[s.cur].spec.title;
  save();
  refresh({ keepScroll: true });
});
$('#new-site').addEventListener('click', () => { S.id = null; save(); setTab('create'); refresh(); brief.focus(); });

// ---------- скачивание ----------
async function download() {
  const sp = spec();
  if (!sp) return;
  try {
    const [lib, engine] = await Promise.all(['/assets/studio/spec.js', '/assets/studio/engine.js'].map(async (u) => { const r = await fetch(u); if (!r.ok) throw new Error(); return r.text(); }));
    const code = `${lib}\n${engine.replace(/^import \{[^}]*\} from '\.\/spec\.js';\s*$/m, '')}\nrender(JSON.parse(document.getElementById('pp-spec').textContent));`.replace(/<\/script/gi, '<\\/script');
    const data = JSON.stringify(sp).replace(/</g, '\\u003c');
    const html = `<!doctype html>
<html lang="${esc(sp.lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(sp.title)}</title>
<meta name="description" content="${esc(sp.description)}">
<meta name="generator" content="pleeply Studio">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<style>html,body{margin:0;background:${sp.theme.bg};color:${sp.theme.fg}}</style>
<script type="application/json" id="pp-spec">${data}</script>
<script type="module">
${code}
</script>
</head>
<body></body>
</html>
`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    a.download = `${sp.title.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'site'}.html`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast('Saved a standalone HTML file');
  } catch {
    toast("Couldn't build the file. Check your connection and try again.");
  }
}
$('#download').addEventListener('click', download);

// ---------- публикация ----------
const dlg = $('#pub-dlg');
async function post(url, body) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { ok: r.ok, status: r.status, j: await r.json().catch(() => ({})) };
}
function showPub() {
  const s = site();
  if (!s?.pub) return;
  const url = `${location.origin}/s/${s.pub.slug}`;
  $('#pub-url').value = url;
  $('#pub-open').href = url;
  dlg.showModal();
  $('#pub-url').select();
}
$('#publish').addEventListener('click', async () => {
  const s = site();
  const sp = spec();
  if (!s || !sp) return;
  if (s.pub && s.pub.hash === hash(sp)) return showPub();
  const btn = $('#publish');
  btn.disabled = true;
  try {
    let r = await post('/api/studio/publish', s.pub ? { spec: sp, slug: s.pub.slug, owner: s.pub.owner } : { spec: sp });
    if (r.status === 403 && s.pub) { s.pub = null; r = await post('/api/studio/publish', { spec: sp }); }
    if (!r.ok) throw new Error(r.j.error || "Couldn't publish. Try again.");
    if (r.j.owner) s.pub = { slug: r.j.slug, owner: r.j.owner };
    s.pub.hash = hash(sp);
    s.pub.at = Date.now();
    save(true);
    renderBar();
    showPub();
  } catch (err) {
    toast(err.message);
  } finally {
    renderBar();
  }
});
$('#pub-copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('#pub-url').value); toast('Link copied'); } catch { $('#pub-url').select(); }
});
$('#pub-close').addEventListener('click', () => dlg.close());
$('#pub-off').addEventListener('click', async () => {
  const s = site();
  if (!s?.pub || !confirm('Take this site offline? The link will stop working.')) return;
  const r = await post('/api/studio/unpublish', { slug: s.pub.slug, owner: s.pub.owner }).catch(() => null);
  if (!r?.ok && r?.status !== 403) return toast(r?.j?.error || "Couldn't unpublish. Try again.");
  s.pub = null;
  save(true);
  dlg.close();
  renderBar();
  renderSites();
  toast('The site is offline');
});

// ---------- общие события ----------
for (const b of document.querySelectorAll('.tabs button')) b.addEventListener('click', () => setTab(b.dataset.tab));
for (const b of document.querySelectorAll('.devices button')) b.addEventListener('click', () => setDevice(b.dataset.device));
$('#undo').addEventListener('click', () => go(-1));
$('#redo').addEventListener('click', () => go(1));
addEventListener('keydown', (e) => {
  if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z' || S.busy) return;
  if (e.target.closest?.('input, textarea, select')) return;
  e.preventDefault();
  go(e.shiftKey ? 1 : -1);
});

setTab('create');
refresh();
