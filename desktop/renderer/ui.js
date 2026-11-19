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
  mode: "local",
  selection: { type: "preset", id: "saturn" },
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
export function go(view, extra = {}) {
  set({ view, ...extra });
}
