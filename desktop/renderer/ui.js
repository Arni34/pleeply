// Общий слой интерфейса: состояние, вызовы в главный процесс, мелкие компоненты.
import { h } from "./vendor/preact.mjs";
import { useState, useEffect, useRef, useMemo, useReducer } from "./vendor/hooks.mjs";
import htm from "./vendor/htm.mjs";
import { marked } from "./vendor/marked.mjs";
import DOMPurify from "./vendor/purify.mjs";

export const html = htm.bind(h);
export { useState, useEffect, useRef, useMemo };

// ---------- состояние ----------
export const S = {
  ready: false,
  app: null, // app.state
  view: "chat",
  ccSection: "computer",
  chats: [],
  chat: null,
  mode: "auto",
  selection: { type: "auto" },
  nav: { stack: [{ view: "chat", chatId: null }], i: 0 },
  collapsed: {},
  models: null,
  downloads: {},
  consent: null,
  toasts: [],
  engine: { state: "idle" },
  memory: null,
  agents: null,
  runs: {},
  pendingApprovals: 0,
  activity: null,
};
const listeners = new Set();
let scheduled = false;
export function set(patch) {
  if (patch) Object.assign(S, typeof patch === "function" ? patch(S) : patch);
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    for (const f of listeners) f();
  });
}
export function useStore() {
  const [, force] = useReducer((x) => x + 1, 0);
  useEffect(() => {
    listeners.add(force);
    return () => listeners.delete(force);
  }, []);
  return S;
}

// ---------- IPC ----------
export async function call(method, arg) {
  const r = await window.pleeply.invoke(method, arg);
  if (r && r.error) throw new Error(r.error);
  return r ? r.ok : null;
}
/** То же, но ошибка показывается тостом и возвращается null. */
export async function tryCall(method, arg) {
  try {
    return await call(method, arg);
  } catch (e) {
    toast(e.message, "err");
    return null;
  }
}

// ---------- тосты ----------
let toastId = 0;
export function toast(text, kind = "info", action = null, ms = 4500) {
  const id = ++toastId;
  set({ toasts: [...S.toasts, { id, text, kind, action }] });
  setTimeout(() => set({ toasts: S.toasts.filter((t) => t.id !== id) }), ms);
}

// ---------- форматирование ----------
export const GB = 1e9;
export function fmtBytes(b) {
  if (b == null) return "—";
  if (b >= GB) return `${(b / GB).toFixed(b >= 10 * GB ? 0 : 1)} GB`;
  if (b >= 1e6) return `${Math.round(b / 1e6)} MB`;
  if (b >= 1e3) return `${Math.round(b / 1e3)} KB`;
  return `${b} B`;
}
export function fmtNum(n) {
  return n == null ? "—" : Number(n).toLocaleString("en-US");
}
export function ago(ts) {
  const t = typeof ts === "number" ? ts : Date.parse(ts);
  const s = Math.max(1, Math.round((Date.now() - t) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
export function when(ts) {
  return new Date(ts).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
export function cloudLabel(requests) {
  return requests === "off" ? "Off — cloud is switched off" : requests === "chat" ? "Ask once per chat" : "Ask me every time";
}

// ---------- компоненты ----------
export function Icon({ name, cls = "" }) {
  return html`<svg class=${"ic " + cls} aria-hidden="true"><use href=${"#" + name} /></svg>`;
}
export function Mark({ cls = "" }) {
  return html`<svg class=${cls} aria-hidden="true"><use href="#mark" width="100%" height="100%" /></svg>`;
}
/** Знак Google для кнопки входа (по правилам оформления кнопок «Sign in with Google»). */
export function GoogleG() {
  return html`<svg class="ic g-logo" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.6 13.3l7.9 6.1C12.4 13.7 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17.1z"/><path fill="#FBBC05" d="M10.5 28.6c-.5-1.4-.8-2.9-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C.9 16.6 0 20.2 0 24s.9 7.4 2.6 10.7l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.5 2.3-6.3 0-11.6-4.2-13.5-9.9l-7.9 6.1C6.6 42.6 14.6 48 24 48z"/></svg>`;
}

export function Toggle({ on, onChange, label, disabled }) {
  return html`<button class=${"toggle" + (on ? " on" : "")} role="switch" aria-checked=${on} aria-label=${label} disabled=${disabled} onClick=${() => onChange(!on)}></button>`;
}
export function Seg({ value, options, onChange, label }) {
  return html`<div class="seg" role="radiogroup" aria-label=${label}>
    ${options.map((o) => html`<button role="radio" aria-checked=${value === o.value} class=${value === o.value ? "on" : ""} title=${o.title || ""} onClick=${() => onChange(o.value)}>${o.icon ? html`<${Icon} name=${o.icon} />` : null}${o.label}</button>`)}
  </div>`;
}
export function FitBadge({ fit }) {
  if (!fit) return null;
  return html`<span class=${"badge " + fit.level} title=${fit.reason || ""}>${fit.label}</span>`;
}
export function Modal({ children, onClose, wide }) {
  useEffect(() => {
    const k = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return html`<div class="overlay" onMouseDown=${(e) => e.target === e.currentTarget && onClose?.()}>
    <div class="modal" role="dialog" aria-modal="true">${children}</div>
  </div>`;
}

/** Выпадающее меню, закрывается по клику вне и Esc. */
export function useDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const down = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const key = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", down);
    window.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", down); window.removeEventListener("keydown", key); };
  }, [open]);
  return { open, setOpen, ref };
}

// ---------- Markdown ----------
marked.setOptions({ gfm: true, breaks: true });
DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName === "A") { node.setAttribute("rel", "noreferrer"); node.removeAttribute("target"); }
  if (node.tagName === "IMG") node.remove(); // картинки из ответа модели не грузим: окно не ходит в сеть
});

function decorate(el, citations) {
  for (const pre of el.querySelectorAll("pre")) {
    if (pre.querySelector(".copy")) continue;
    const b = document.createElement("button");
    b.className = "copy";
    b.textContent = "Copy";
    b.dataset.copy = "1";
    pre.appendChild(b);
  }
  if (!citations) return;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) {
    const n = walker.currentNode;
    if (/\[\d+\]/.test(n.nodeValue) && !n.parentElement.closest("pre, code")) nodes.push(n);
  }
  for (const n of nodes) {
    const frag = document.createDocumentFragment();
    let last = 0;
    n.nodeValue.replace(/\[(\d+)\]/g, (m, num, idx) => {
      if (!citations[num]) return m;
      frag.appendChild(document.createTextNode(n.nodeValue.slice(last, idx)));
      const s = document.createElement("button");
      s.className = "cite";
      s.dataset.cite = num;
      s.title = citations[num].name + (citations[num].page ? `, page ${citations[num].page}` : "");
      s.textContent = num;
      frag.appendChild(s);
      last = idx + m.length;
      return m;
    });
    if (last === 0) continue;
    frag.appendChild(document.createTextNode(n.nodeValue.slice(last)));
    n.parentNode.replaceChild(frag, n);
  }
}

export function Markdown({ text, citations, onCite, streaming }) {
  const ref = useRef(null);
  const out = useMemo(() => DOMPurify.sanitize(marked.parse(text || "")), [text]);
  useEffect(() => { if (ref.current) decorate(ref.current, citations); }, [out, citations]);
  const onClick = (e) => {
    const a = e.target.closest("a");
    if (a) { e.preventDefault(); const href = a.getAttribute("href"); if (href) call("shell.open", href); return; }
    const c = e.target.closest("[data-cite]");
    if (c) { onCite?.(c.dataset.cite); return; }
    const cp = e.target.closest("[data-copy]");
    if (cp) {
      const code = cp.parentElement.querySelector("code")?.innerText ?? cp.parentElement.innerText.replace(/Copy$/, "");
      call("shell.copy", code);
      cp.textContent = "Copied";
      setTimeout(() => (cp.textContent = "Copy"), 1200);
    }
  };
  return html`<div class=${"md" + (streaming ? " caret" : "")} ref=${ref} onClick=${onClick} dangerouslySetInnerHTML=${{ __html: out }}></div>`;
}

// ---------- общие действия ----------
export async function refreshState() {
  const app = await call("app.state");
  set({ app, engine: app.engine?.loaded ? { state: "ready", ...app.engine } : S.engine });
  return app;
}
export async function refreshModels() {
  const models = await tryCall("models.state");
  if (models) set({ models });
  return models;
}
export async function refreshChats() {
  const chats = await tryCall("chats.list");
  if (chats) set({ chats });
}
// ---------- история переходов (кнопки ‹ › и ⌘[ ⌘]) ----------
let restoring = false;
export function pushNav(entry) {
  if (restoring) return;
  const { stack, i } = S.nav;
  const cur = stack[i];
  if (cur && cur.view === entry.view && cur.chatId === entry.chatId && cur.ccSection === entry.ccSection) return;
  const next = [...stack.slice(0, i + 1), entry].slice(-50);
  S.nav = { stack: next, i: next.length - 1 };
}
export async function navMove(delta) {
  const { stack, i } = S.nav;
  const j = i + delta;
  if (j < 0 || j >= stack.length) return;
  const e = stack[j];
  restoring = true;
  try {
    let chat = null;
    if (e.view === "chat" && e.chatId) chat = await call("chats.get", e.chatId).catch(() => null);
    S.nav = { stack, i: j };
    set({ view: e.view, ccSection: e.ccSection || S.ccSection, ...(e.view === "chat" ? { chat, editing: null, renameTitle: false } : {}) });
  } finally {
    restoring = false;
  }
}
export function go(view, extra = {}) {
  set({ view, ...extra });
  pushNav({ view, chatId: view === "chat" ? S.chat?.id ?? null : null, ccSection: view === "control" ? extra.ccSection || S.ccSection : undefined });
}
