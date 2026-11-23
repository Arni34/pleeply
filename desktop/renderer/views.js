// Общие части окна: боковое меню, «This computer», выбор модели, окно согласия, первый запуск.
import { html, S, set, call, tryCall, toast, useState, useEffect, useRef, Icon, Mark, Modal, FitBadge, useDropdown, fmtBytes, fmtNum, ago, cloudLabel, refreshChats, refreshModels, refreshState, go, pushNav, navMove, GoogleG } from "./ui.js";

// ---------------- действия и горячие клавиши ----------------
export const IS_MAC = window.pleeply.platform === "darwin";
/** Подпись сочетания: "mod+shift+k" → «⌘⇧K» на Mac и «Ctrl+Shift+K» на Windows/Linux. */
export function keys(combo) {
  const parts = combo.split("+");
  if (IS_MAC) return parts.map((p) => ({ mod: "⌘", shift: "⇧", alt: "⌥" }[p] || p.toUpperCase())).join("");
  return parts.map((p) => ({ mod: "Ctrl", shift: "Shift", alt: "Alt" }[p] || p.toUpperCase())).join("+");
}

export function focusComposer() {
  setTimeout(() => document.querySelector(".composer textarea")?.focus(), 40);
}

async function toggleUi(key) {
  const v = !S.app.settings.ui[key];
  set({ app: { ...S.app, settings: { ...S.app.settings, ui: { ...S.app.settings.ui, [key]: v } } } });
  await call("settings.update", { ui: { [key]: v } }).catch(() => {});
}

export async function openChat(id) {
  const chat = await tryCall("chats.get", id);
  if (chat) { set({ chat, view: "chat", editing: null, renameTitle: false }); pushNav({ view: "chat", chatId: chat.id }); focusComposer(); }
}

export async function runAction(action) {
  switch (action) {
    case "new-chat": set({ chat: null, view: "chat", editing: null, renameTitle: false }); pushNav({ view: "chat", chatId: null }); focusComposer(); break;
    case "back": await navMove(-1); break;
    case "forward": await navMove(1); break;
    case "search": set({ palette: true }); break;
    case "attach": set({ view: "chat" }); setTimeout(() => window.dispatchEvent(new CustomEvent("pleeply:attach")), 40); break;
    case "export":
      if (S.chat) tryCall("chats.export", S.chat.id).then((ok) => ok && toast("Exported as Markdown."));
      else toast("Open a chat to export it.", "err");
      break;
    case "sidebar": await toggleUi("sidebar"); break;
    case "hw-panel": if (S.view !== "chat") set({ view: "chat" }); await toggleUi("hwPanel"); break;
    case "copy-last": {
      const m = S.chat && [...S.chat.messages].reverse().find((x) => x.role === "assistant" && x.text);
      if (m) { call("shell.copy", m.text); toast("Copied the last answer."); } else toast("No answer to copy yet.", "err");
      break;
    }
    case "shortcuts": set({ shortcuts: true }); break;
    case "stop": if (S.chat) call("chats.stop", S.chat.id).catch(() => {}); break;
    default: if (action.startsWith("go:")) go(action.slice(3));
  }
}

/** Меню в фиксированной позиции: не обрезается прокруткой списка чатов. */
export function FloatMenu({ x, y, items, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const down = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    const key = (e) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    document.addEventListener("mousedown", down);
    window.addEventListener("keydown", key, true);
    return () => { document.removeEventListener("mousedown", down); window.removeEventListener("keydown", key, true); };
  }, []);
  const h = items.length * 36 + 16;
  return html`<div class="menu float" ref=${ref} role="menu" style=${{ left: Math.max(8, Math.min(x - 200, window.innerWidth - 220)) + "px", top: Math.min(y + 4, window.innerHeight - h - 8) + "px" }}>
    ${items.map((it) => it === "-" ? html`<div class="menu-sep"></div>` : html`<button class="menu-i" role="menuitem" onClick=${(e) => { e.stopPropagation(); onClose(); it.run(); }}><${Icon} name=${it.icon} /><div class="t">${it.label}</div></button>`)}
  </div>`;
}

export function chatMenuItems(c) {
  return [
    { label: c.pinned ? "Unpin" : "Pin", icon: "i-pin", run: async () => { await tryCall("chats.pin", { id: c.id, pinned: !c.pinned }); refreshChats(); } },
    { label: "Rename", icon: "i-edit", run: () => set({ renaming: c.id }) },
    { label: "Export as Markdown", icon: "i-download", run: () => tryCall("chats.export", c.id).then((ok) => ok && toast("Exported as Markdown.")) },
    "-",
    { label: "Delete", icon: "i-trash", run: async () => {
      if (!confirm(`Delete “${c.title}”? It is removed from this computer.`)) return;
      await tryCall("chats.delete", c.id);
      if (S.chat?.id === c.id) set({ chat: null });
      refreshChats();
    } },
  ];
}

// ---------------- боковое меню ----------------
export function RenameInput({ c, cls = "rename" }) {
  const [title, setTitle] = useState(c.title);
  const done = useRef(false);
  const finish = async (save) => {
    if (done.current) return;
    done.current = true;
    set({ renaming: null, renameTitle: false });
    const t = title.trim();
    if (save && t && t !== c.title) {
      const chat = await tryCall("chats.rename", { id: c.id, title: t });
      if (chat && S.chat?.id === chat.id) set({ chat: { ...S.chat, title: chat.title } });
      refreshChats();
    }
  };
  return html`<input class=${cls} value=${title} aria-label="Chat name" maxlength="80"
    ref=${(el) => el && !el.dataset.f && (el.dataset.f = "1", el.focus(), el.select())}
    onInput=${(e) => setTitle(e.target.value)} onBlur=${() => finish(true)}
    onKeyDown=${(e) => { e.stopPropagation(); if (e.key === "Enter") finish(true); if (e.key === "Escape") finish(false); }} />`;
}

function ChatItem({ c }) {
  const [menu, setMenu] = useState(null);
  const on = S.chat?.id === c.id && S.view === "chat";
  if (S.renaming === c.id) return html`<div class="chat-item on"><${RenameInput} c=${c} /></div>`;
  return html`<div class=${"chat-item" + (on ? " on" : "") + (menu ? " menu-open" : "")} role="button" tabindex="0" title=${c.title}
    onClick=${() => openChat(c.id)} onDblClick=${() => set({ renaming: c.id })} onKeyDown=${(e) => e.key === "Enter" && openChat(c.id)}>
    <span class="t">${c.title}</span>
    ${c.where === "cloud" ? html`<span class="where-ic" title="The last answer came from a cloud model"><${Icon} name="i-cloud" cls="xs" /></span>` : null}
    <button class="x" aria-label="Chat options" onClick=${(e) => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); setMenu({ x: r.right, y: r.bottom }); }}><${Icon} name="i-more" cls="sm" /></button>
    ${menu ? html`<${FloatMenu} x=${menu.x} y=${menu.y} items=${chatMenuItems(c)} onClose=${() => setMenu(null)} />` : null}
  </div>`;
}

function Group({ id, label, children }) {
  const closed = S.collapsed[id];
  return html`<div class="group">
    <button class="group-h" aria-expanded=${!closed} onClick=${() => set({ collapsed: { ...S.collapsed, [id]: !closed } })}>
      ${label}<${Icon} name="i-down" cls=${"xs chev" + (closed ? " closed" : "")} /></button>
    ${closed ? null : children}
  </div>`;
}

export function Sidebar() {
  const app = S.app;
  const { stack, i } = S.nav;
  const nav = [
    ["models", "Models", "i-models", 2],
    ["agents", "Agents", "i-agents", 3],
    ["memory", "Memory", "i-memory", 4],
    ["control", "Control Center", "i-control", 5],
  ];
  const memCount = S.memory?.suggestions?.length || 0;
  const pinned = S.chats.filter((c) => c.pinned);
  const recents = S.chats.filter((c) => !c.pinned);
  return html`<aside class="side">
    <div class=${"side-top drag" + (IS_MAC ? " mac" : "")}>
      <button class="icon-btn" title=${`Hide sidebar (${keys("mod+b")})`} aria-label="Hide sidebar" onClick=${() => runAction("sidebar")}><${Icon} name="i-sidebar" /></button>
      <button class="icon-btn" title=${`Back (${keys("mod+[")})`} aria-label="Back" disabled=${i <= 0} onClick=${() => runAction("back")}><${Icon} name="i-left" /></button>
      <button class="icon-btn" title=${`Forward (${keys("mod+]")})`} aria-label="Forward" disabled=${i >= stack.length - 1} onClick=${() => runAction("forward")}><${Icon} name="i-right" /></button>
    </div>
    <div class="side-brand drag"><${Mark} />pleeply</div>
    <nav class="nav" aria-label="Sections">
      <button class="nav-item" onClick=${() => runAction("new-chat")}><${Icon} name="i-plus" />New chat<span class="kbd hover">${keys("mod+n")}</span></button>
      <button class="nav-item" onClick=${() => runAction("search")}><${Icon} name="i-search" />Search<span class="kbd hover">${keys("mod+k")}</span></button>
      ${nav.map(([id, label, icon, n]) => html`<button class=${"nav-item" + (S.view === id ? " on" : "")} onClick=${() => go(id)} title=${`${label} (${keys("mod+" + n)})`}>
        <${Icon} name=${icon} />${label}
        ${id === "memory" && memCount ? html`<span class="count" title="New memory suggestions">${memCount}</span>` : null}
        ${id === "agents" && S.pendingApprovals ? html`<span class="count" title="Waiting for your OK">${S.pendingApprovals}</span>` : null}
      </button>`)}
    </nav>
    <div class="chats">
      ${pinned.length ? html`<${Group} id="pinned" label="Pinned">${pinned.map((c) => html`<${ChatItem} c=${c} key=${c.id} />`)}</${Group}>` : null}
      <${Group} id="recents" label="Recents">${recents.length ? recents.map((c) => html`<${ChatItem} c=${c} key=${c.id} />`) : html`<div class="side-empty">No chats yet.</div>`}</${Group}>
    </div>
    <button class="side-foot" onClick=${() => go("control", { ccSection: "privacy" })} title="Change in Control Center">
      <b>CLOUD REQUESTS</b>${cloudLabel(app.settings.cloud.requests)}
    </button>
    <${AccountRow} />
  </aside>`;
}

function AccountRow() {
  const a = S.app.account || {};
  if (!a.signedIn) {
    return html`<button class="acct-row" onClick=${() => (a.signingIn ? go("control", { ccSection: "account" }) : tryCall("account.signIn"))} title="Sign in for higher pleeply Cloud limits">
      <${GoogleG} /><span class="grow">${a.signingIn ? "Finish in your browser…" : "Sign in with Google"}</span></button>`;
  }
  const acc = a.account || {};
  const name = acc.name || acc.email || "Account";
  return html`<button class="acct-row" onClick=${() => go("control", { ccSection: "account" })} title=${acc.email || ""}>
    <span class="avatar">${name.trim()[0]?.toUpperCase() || "P"}</span>
    <span class="grow ellipsis">${name}</span>
    <span class=${"badge" + (acc.plan === "pro" ? " good" : "")}>${acc.plan === "pro" ? "Pro" : "Free"}</span>
  </button>`;
}

/** Кнопки слева в верхней полосе, когда боковое меню скрыто. */
export function TopLead() {
  if (S.app.settings.ui.sidebar) return null;
  return html`<div class="top-lead">
    ${IS_MAC ? html`<span class="tl-space"></span>` : null}
    <button class="icon-btn" title=${`Show sidebar (${keys("mod+b")})`} aria-label="Show sidebar" onClick=${() => runAction("sidebar")}><${Icon} name="i-sidebar" /></button>
    <button class="icon-btn" title=${`New chat (${keys("mod+n")})`} aria-label="New chat" onClick=${() => runAction("new-chat")}><${Icon} name="i-compose" /></button>
  </div>`;
}

// ---------------- поиск ⌘K ----------------
export function Palette() {
  const [q, setQ] = useState("");
  const [res, setRes] = useState([]);
  const [idx, setIdx] = useState(0);
  const listRef = useRef(null);
  const close = () => set({ palette: false });
  useEffect(() => {
    let alive = true;
    const t = setTimeout(async () => {
      const r = await call("chats.search", q).catch(() => []);
      if (alive) { setRes(r || []); setIdx(0); }
    }, 110);
    return () => { alive = false; clearTimeout(t); };
  }, [q]);
  useEffect(() => { listRef.current?.querySelector(".pal-item.on")?.scrollIntoView({ block: "nearest" }); }, [idx]);
  const ql = q.trim().toLowerCase();
  const actions = [
    { label: "New chat", icon: "i-plus", kbd: "mod+n", run: () => runAction("new-chat") },
    { label: "Attach files", icon: "i-clip", kbd: "mod+o", run: () => runAction("attach") },
    { label: "Models", icon: "i-models", kbd: "mod+2", run: () => go("models") },
    { label: "Agents", icon: "i-agents", kbd: "mod+3", run: () => go("agents") },
    { label: "Memory", icon: "i-memory", kbd: "mod+4", run: () => go("memory") },
    { label: "Control Center", icon: "i-control", kbd: "mod+5", run: () => go("control") },
    { label: "Cloud providers", icon: "i-cloud", run: () => go("control", { ccSection: "providers" }) },
    { label: "Privacy and network activity", icon: "i-lock", run: () => go("control", { ccSection: "privacy" }) },
    { label: "Keyboard shortcuts", icon: "i-keyboard", kbd: "mod+/", run: () => runAction("shortcuts") },
  ].filter((a) => !ql || a.label.toLowerCase().includes(ql));
  const items = [...res.map((r) => ({ kind: "chat", ...r })), ...actions.map((a) => ({ kind: "action", ...a }))];
  const choose = (it) => { close(); if (it.kind === "chat") openChat(it.id); else it.run(); };
  const onKey = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setIdx(Math.min(items.length - 1, idx + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setIdx(Math.max(0, idx - 1)); }
    else if (e.key === "Enter" && items[idx]) { e.preventDefault(); choose(items[idx]); }
    else if (e.key === "Escape") { e.preventDefault(); close(); }
  };
  return html`<div class="overlay top" onMouseDown=${(e) => e.target === e.currentTarget && close()}>
    <div class="palette" role="dialog" aria-label="Search chats and actions">
      <div class="pal-in"><${Icon} name="i-search" />
        <input placeholder="Search chats and actions" value=${q} onInput=${(e) => setQ(e.target.value)} onKeyDown=${onKey} ref=${(el) => el && !el.dataset.f && (el.dataset.f = "1", el.focus())} aria-label="Search" />
        <span class="kbd">esc</span></div>
      <div class="pal-list" ref=${listRef}>
        ${res.length ? html`<div class="menu-h">${ql ? "Chats" : "Recent chats"}</div>` : ql ? html`<div class="menu-note">No chats match “${q.trim()}”. Search looks through titles and messages on this computer.</div>` : null}
        ${items.map((it, k) => html`
          ${k === res.length && actions.length ? html`<div class="menu-h">Actions</div>` : null}
          <button class=${"pal-item" + (k === idx ? " on" : "")} onMouseMove=${() => k !== idx && setIdx(k)} onClick=${() => choose(it)}>
            <${Icon} name=${it.kind === "chat" ? "i-chat" : it.icon} />
            <div class="grow"><div class="t ellipsis">${it.kind === "chat" ? it.title : it.label}</div>${it.snippet ? html`<div class="d ellipsis">${it.snippet}</div>` : null}</div>
            ${it.kind === "chat" ? html`<span class="faint" style=${{ fontSize: "12px" }}>${ago(it.updatedAt)}</span>` : it.kbd ? html`<span class="kbd">${keys(it.kbd)}</span>` : null}
          </button>`)}
      </div>
    </div>
  </div>`;
}

export function Shortcuts() {
  const rows = [
    ["New chat", keys("mod+n")], ["Search chats and actions", keys("mod+k")], ["Attach files", keys("mod+o")],
    ["Back · Forward", `${keys("mod+[")}  ${keys("mod+]")}`],
    ["Send message", "Enter"], ["New line", IS_MAC ? "⇧Enter" : "Shift+Enter"], ["Edit your last message", "↑ in an empty message box"],
    ["Stop answering", "Esc"], ["Copy last answer", keys("mod+shift+c")], ["Export chat as Markdown", keys("mod+shift+e")],
    ["Hide or show the sidebar", keys("mod+b")], ["Hide or show This computer", keys("mod+i")],
    ["Chat · Models · Agents · Memory · Control Center", `${keys("mod+1")} … ${keys("mod+5")}`], ["Control Center", keys("mod+,")], ["This list", keys("mod+/")],
  ];
  return html`<${Modal} onClose=${() => set({ shortcuts: false })}>
    <div class="modal-h"><h2>Keyboard shortcuts</h2><p>Start typing anywhere in a chat to jump to the message box.</p></div>
    <div class="modal-b"><div class="list">${rows.map(([t, k]) => html`<div class="li" style=${{ minHeight: "44px", padding: "9px 16px" }}><span class="grow ink">${t}</span><span class="kbd lg">${k}</span></div>`)}</div></div>
    <div class="modal-f"><span class="spacer"></span><button class="btn btn-primary" onClick=${() => set({ shortcuts: false })}>Done</button></div>
  </${Modal}>`;
}

// ---------------- This computer ----------------
export function HwPanel() {
  const app = S.app;
  const hw = app.hardware;
  const eng = S.engine;
  return html`<aside class="hw" aria-label="This computer">
    <div class="hw-h">This computer</div>
    <div class="hw-row"><span>Chip</span><b>${hw.chip}</b></div>
    <div class="hw-row"><span>Memory</span><b>${Math.round(hw.ramBytes / 1073741824)} GB</b></div>
    <div class="hw-row"><span>Graphics</span><b>${app.graphics}</b></div>
    <div class="hw-h">Model fit</div>
    ${app.buckets.map((b) => html`<div class="fit" title=${b.text}><span>${b.label}</span><u><i class=${b.level} style=${{ width: Math.round(b.ratio * 100) + "%" }}></i></u><b>${b.text}</b></div>`)}
    <div class="fit-note">${app.recommendation.text}</div>
    <div class="hw-h">Engine</div>
    <div class="engine">
      ${eng.state === "loading" ? html`<span class="shimmer">Loading ${eng.label}…</span>`
        : eng.loaded ? html`<b>${eng.label}</b> is loaded${eng.contextSize ? html` · ${fmtNum(eng.contextSize)} context` : ""}${eng.gpuLayers != null && hw.gpu.backend !== "cpu" ? html` · ${eng.gpuLayers}${eng.totalLayers ? "/" + eng.totalLayers : ""} layers on GPU` : ""}`
        : html`No model loaded. Local models load on first message and unload when idle.`}
    </div>
    ${app.engineError ? html`<div class="notice err">${app.engineError}</div>` : null}
  </aside>`;
}

// ---------------- выбор модели ----------------
export function defaultCloud() {
  const cloud = S.models?.cloud || [];
  if (!cloud.length) return null;
  const gw = (id) => cloud.find((m) => m.provider === "pleeply" && m.id === id);
  return cloud.find((m) => m.ref === S.app.settings.cloud.defaultModel) || cloud.find((m) => m.id === "claude-opus-5-5") || gw("claude") || gw("gpt") || gw("gemini") || gw("gpt-oss") || cloud[0];
}

function autoDescription() {
  if (S.mode === "local") return "The best model on this computer for each message.";
  if (S.mode === "cloud") return `Uses ${defaultCloud()?.label || "your default cloud model"}. Asks before sending.`;
  return "On this computer when it fits, the cloud when it helps. Cloud still asks first.";
}

export function selectionLabel() {
  const sel = S.selection;
  if (sel.type !== "model") {
    return { title: "Auto", sub: S.mode === "local" ? "this computer" : S.mode === "cloud" ? defaultCloud()?.label || "no cloud model" : "local or cloud" };
  }
  const all = [...(S.models?.local || []), ...(S.models?.cloud || [])];
  const m = all.find((x) => x.ref === sel.ref);
  if (!m) return { title: "Model", sub: "" };
  return { title: m.label, sub: m.where === "cloud" ? (m.provider === "pleeply" ? m.vendor : m.providerName) : m.engine === "pleeply" ? "this computer" : m.engine };
}

function tierText(m) {
  const acc = S.app.account;
  const plans = S.app.cloudPlans;
  const lim = acc?.signedIn && acc.account?.limits ? acc.account.limits : plans?.guest || (S.app.cloudLimits && { free: S.app.cloudLimits.free_per_day, paid: S.app.cloudLimits.premium_per_day });
  if (m.tier === "free") return `Free${lim ? ` · ${lim.free} a day` : ""}`;
  return `Premium${lim ? ` · ${lim.paid} ${lim.paidPeriod === "month" ? "a month" : "a day"}` : ""}`;
}

export function ModelPicker() {
  const dd = useDropdown();
  const [q, setQ] = useState("");
  const models = S.models;
  const mode = S.mode;
  const pick = (selection) => { set({ selection }); dd.setOpen(false); };
  const lab = selectionLabel();
  const local = models?.local || [];
  const cloud = models?.cloud || [];
  const ql = q.trim().toLowerCase();
  const match = (m) => !ql || m.label.toLowerCase().includes(ql) || (m.providerName || "").toLowerCase().includes(ql) || (m.vendor || "").toLowerCase().includes(ql);
  const isOn = (sel) => JSON.stringify(sel) === JSON.stringify(S.selection);
  const gateway = cloud.filter((m) => m.provider === "pleeply" && match(m));
  const byProvider = {};
  for (const m of cloud.filter((x) => x.provider !== "pleeply" && match(x))) (byProvider[m.providerName] ||= []).push(m);
  const downloading = (models?.downloads || []).length;
  const item = (m, icon, desc, badge) => html`<button class=${"menu-i" + (isOn({ type: "model", ref: m.ref }) ? " on" : "")} disabled=${m.fit?.level === "too-large"} onClick=${() => pick({ type: "model", ref: m.ref })}>
    <${Icon} name=${icon} /><div class="grow"><div class="t">${m.label}</div><div class="d">${desc}</div></div>${badge || (isOn({ type: "model", ref: m.ref }) ? html`<${Icon} name="i-check" cls="check" />` : null)}
  </button>`;
  return html`<div class="picker" ref=${dd.ref}>
    <button class="pick" aria-haspopup="listbox" aria-expanded=${dd.open} onClick=${() => { dd.setOpen(!dd.open); if (!dd.open) refreshModels(); }}>
      ${S.selection.type !== "model" ? html`<${Icon} name="i-auto" cls="sm" />` : html`<${Icon} name=${S.selection.ref.startsWith("cloud:") ? "i-cloud" : "i-cpu"} cls="sm" />`}
      <span class="ellipsis">${lab.title}</span>${lab.sub ? html`<span class="sub ellipsis">${lab.sub}</span>` : null}
      <${Icon} name="i-down" />
    </button>
    ${dd.open ? html`<div class="menu" role="listbox">
      ${local.length + cloud.length > 10 ? html`<div class="menu-search"><input class="input" placeholder="Search models" value=${q} onInput=${(e) => setQ(e.target.value)} autofocus /></div>` : null}
      <button class=${"menu-i" + (S.selection.type !== "model" ? " on" : "")} onClick=${() => pick({ type: "auto" })}>
        <${Icon} name="i-auto" /><div class="grow"><div class="t">Auto</div><div class="d">${autoDescription()}</div></div>
        ${S.selection.type !== "model" ? html`<${Icon} name="i-check" cls="check" />` : null}
      </button>
      ${mode !== "cloud" ? html`<div class="menu-sep"></div><div class="menu-h">On this computer · nothing is sent</div>
        ${local.filter(match).map((m) => item(m, "i-cpu", `${m.engine === "pleeply" ? "pleeply" : m.engine}${m.bytes ? " · " + fmtBytes(m.bytes) : ""}${m.stats?.tokPerSec ? ` · ${m.stats.tokPerSec} tok/s` : ""}`, html`<${FitBadge} fit=${m.fit} />`))}
        ${!local.length ? html`<div class="menu-note">${downloading ? "Offline models are downloading. They appear here when ready." : html`No local models yet. <a onClick=${() => { dd.setOpen(false); go("models"); }}>Download one</a> — pleeply checks which fit first.`}</div>` : null}` : null}
      ${mode !== "local" ? html`<div class="menu-sep"></div>
        ${gateway.length ? html`<div class="menu-h">pleeply Cloud · no key needed · asks before sending</div>
          ${gateway.map((m) => item(m, "i-cloud", `${m.vendor || ""}${m.vendor ? " · " : ""}${tierText(m)}`))}` : null}
        ${Object.entries(byProvider).map(([prov, list]) => html`<div class="menu-h">${prov} · your key · asks before sending</div>${list.map((m) => item(m, "i-cloud", prov))}`)}
        ${!gateway.length && !Object.keys(byProvider).length ? html`<div class="menu-note">${S.app.settings.cloud.requests === "off" ? "Cloud is switched off in Control Center." : "Cloud models appear when you're online."} <a onClick=${() => { dd.setOpen(false); go("control", { ccSection: "providers" }); }}>Cloud providers</a></div>` : null}` : null}
      <div class="menu-sep"></div>
      <button class="menu-i" onClick=${() => { dd.setOpen(false); go("models"); }}><${Icon} name="i-models" /><div class="t">Manage models</div></button>
    </div>` : null}
  </div>`;
}

// ---------------- окно согласия ----------------
function SentItem({ item }) {
  const [open, setOpen] = useState(false);
  const long = item.text.length > 420;
  return html`<div class="sent-item">
    <div class="label">${item.label}</div>
    <div class=${"txt" + (long ? " long" : "") + (open ? " open" : "")}>${item.text}</div>
    ${long ? html`<button onClick=${() => setOpen(!open)}>${open ? "Show less" : `Show all ${item.text.length.toLocaleString("en-US")} characters`}</button>` : null}
  </div>`;
}

export function ConsentModal() {
  const c = S.consent;
  const d = c.disclosure;
  const [remember, setRemember] = useState(false);
  const [withHistory, setWithHistory] = useState(true);
  const prior = d.items.filter((i) => i.kind === "message").length - 1;
  const perChat = S.app.settings.cloud.requests === "chat";
  const respond = async (approved, extra = {}) => {
    set({ consent: null });
    await tryCall("consent.respond", { id: c.id, approved, remember, includeHistory: withHistory, ...extra });
  };
  const runLocal = async () => {
    const chat = S.chat;
    const msg = chat && [...chat.messages].reverse().find((m) => m.role === "assistant");
    await respond(false);
    if (chat && msg) {
      setTimeout(() => tryCall("chats.regenerate", { chatId: chat.id, messageId: msg.id, mode: "local", selection: { type: "auto" } }), 300);
      set({ mode: "local", selection: { type: "auto" } });
    }
  };
  const shown = d.items.filter((i) => withHistory || i.kind !== "message" || i === d.items[d.items.length - 1]);
  return html`<${Modal} onClose=${() => respond(false)}>
    <div class="modal-h">
      <h2>${d.scope === "agent" ? `Let this agent use ${d.provider.name}?` : `Send to ${d.provider.name}?`}</h2>
      <p>${d.relay
        ? `${d.model.label} is made by ${d.relay.vendor}. ${d.scope === "agent" ? "Each step of this run goes" : "This request goes"} from this computer to pleeply's server, which passes it${d.relay.via && d.relay.via !== d.relay.vendor ? ` through ${d.relay.via}` : ""} to ${d.relay.vendor}. pleeply doesn't keep the text; ${d.relay.vendor}'s privacy policy applies.`
        : `${d.model.label} runs on ${d.provider.name}'s servers. ${d.scope === "agent" ? "Each step of this run" : "This request"} leaves your computer and is processed under their privacy policy. pleeply can't make that private, but it shows you exactly what goes.`}</p>
    </div>
    <div class="modal-b">
      <div class="provider-line"><${Icon} name="i-cloud" /><div class="grow"><b class="ink">${d.provider.name}</b> · ${d.model.label}</div><a onClick=${() => call("shell.open", d.provider.policyUrl)}>Privacy policy ↗</a></div>
      <div class="label" style=${{ marginBottom: "8px" }}>What will be sent · about ${fmtNum(d.approxTokens)} tokens</div>
      <div class="sent">${shown.map((i) => html`<${SentItem} item=${i} />`)}</div>
      ${d.attachments?.length ? html`<p class="hint" style=${{ marginTop: "10px" }}>Includes text from ${d.attachments.map((a) => a.name).join(", ")}.</p>` : null}
      ${d.memoryIncluded ? html`<p class="hint" style=${{ marginTop: "6px" }}>Includes your Memory, because sharing it with cloud models is on in Control Center.</p>` : null}
      <div class="col" style=${{ marginTop: "14px", gap: "8px" }}>
        ${d.scope !== "agent" && prior > 0 ? html`<label class="check"><input type="checkbox" checked=${withHistory} onChange=${(e) => setWithHistory(e.target.checked)} /><span>Include the ${prior} earlier message${prior > 1 ? "s" : ""} in this chat, so the model has context</span></label>` : null}
        ${perChat ? html`<label class="check"><input type="checkbox" checked=${remember} onChange=${(e) => setRemember(e.target.checked)} /><span>Don't ask again for ${d.provider.name} ${d.scope === "agent" ? "for this agent" : "in this chat"}</span></label>` : null}
      </div>
    </div>
    <div class="modal-f">
      <button class="btn btn-ghost" onClick=${() => respond(false)}>Don't send</button>
      <span class="spacer"></span>
      ${d.scope !== "agent" ? html`<button class="btn btn-line" onClick=${runLocal}><${Icon} name="i-cpu" />Run locally instead</button>` : null}
      <button class="btn btn-primary" onClick=${() => respond(true)} autofocus>${d.scope === "agent" ? "Allow for this run" : `Send to ${d.provider.name}`}</button>
    </div>
  </${Modal}>`;
}

// ---------------- первый запуск ----------------
export function Onboarding() {
  const [step, setStep] = useState(0);
  const app = S.app;
  const hw = app.hardware;
  const models = S.models;
  useEffect(() => {
    refreshModels();
    const t = setInterval(refreshModels, 4000);
    return () => clearInterval(t);
  }, []);
  const finish = async () => {
    await tryCall("settings.update", { onboarded: true });
    await refreshState();
  };
  const downloads = (models?.downloads || []).map((d) => ({ ...d, ...(S.downloads[d.id] || {}) }));
  const installed = (models?.local || []).filter((m) => m.backend === "pleeply");
  const others = (models?.local || []).filter((m) => m.backend !== "pleeply");
  const gateway = (models?.cloud || []).filter((m) => m.provider === "pleeply");
  return html`<div class="onb">
    <div class="drag" style=${{ height: "40px", flex: "none" }}></div>
    <div class="onb-in"><div class="onb-card">
      ${step === 0 ? html`
        <${Mark} cls="mark" />
        <div class="onb-step" style=${{ marginTop: "22px" }}>pleeply Desktop · early access</div>
        <h1>Your AI. Your device.<br />Your privacy.</h1>
        <p class="lead">One AI ecosystem on your computer. Run models locally, and connect to the cloud only when you choose. Local mode works without a cloud account.</p>
        <div class="actions"><button class="btn btn-primary btn-lg" onClick=${() => setStep(1)}>Get started<${Icon} name="i-arrow" /></button></div>
      ` : step === 1 ? html`
        <div class="onb-step">Step 01 · Let pleeply understand your hardware</div>
        <h1>This is what your computer can run.</h1>
        <p class="lead">pleeply read your chip, memory and graphics on this computer. Nothing was sent anywhere.</p>
        <div class="hw-grid">
          <div class="hw-tile"><span>Chip</span><b>${hw.chip}</b></div>
          <div class="hw-tile"><span>Memory</span><b>${Math.round(hw.ramBytes / 1073741824)} GB</b></div>
          <div class="hw-tile"><span>Graphics</span><b>${app.graphics}</b></div>
        </div>
        <div class="fits">
          ${app.buckets.map((b) => html`<div class="fit"><span>${b.label}</span><u><i class=${b.level} style=${{ width: Math.round(b.ratio * 100) + "%" }}></i></u><b>${b.text}</b></div>`)}
          <div class="fit-note">Best fit: ${app.recommendation.label ? `${app.recommendation.label} models in Local mode.` : app.recommendation.text}</div>
        </div>
        <div class="actions"><button class="btn btn-primary btn-lg" onClick=${() => setStep(2)}>Continue<${Icon} name="i-arrow" /></button><button class="btn btn-ghost" onClick=${() => setStep(0)}>Back</button></div>
      ` : html`
        <div class="onb-step">Step 02 · Ready to go</div>
        <h1>Works out of the box.</h1>
        <p class="lead">Two offline models that fit this computer are downloading now, and cloud models are ready right away. You can start chatting immediately.</p>
        <div class="label" style=${{ margin: "24px 0 8px" }}>Offline · runs on this computer</div>
        <div class="list">
          ${downloads.map((d) => {
            const pct = d.total ? Math.round((d.done / d.total) * 100) : 0;
            return html`<div class="li"><${Icon} name="i-cpu" /><div class="grow"><div class="name">${d.label}</div><div class="sub">${fmtBytes(d.done)} of ${fmtBytes(d.total)}</div></div>
              <div class="side-r"><div class="progress"><i style=${{ width: pct + "%" }}></i></div><span class="mono muted" style=${{ fontSize: "11.5px", width: "34px" }}>${pct}%</span></div></div>`;
          })}
          ${installed.map((m) => html`<div class="li"><${Icon} name="i-cpu" /><div class="grow"><div class="name">${m.label}</div><div class="sub">Ready · works without internet</div></div><div class="side-r"><span class="badge local"><${Icon} name="i-check" cls="xs" />Ready</span></div></div>`)}
          ${others.length ? html`<div class="li"><${Icon} name="i-plug" /><div class="grow"><div class="name">${others.length} model${others.length > 1 ? "s" : ""} from ${[...new Set(others.map((m) => m.engine))].join(" and ")}</div><div class="sub">Already on this computer, they work in pleeply too</div></div></div>` : null}
          ${!downloads.length && !installed.length && !others.length ? html`<div class="li"><span class="muted">Checking which models fit…</span></div>` : null}
        </div>
        <div class="label" style=${{ margin: "20px 0 8px" }}>Cloud · pleeply Cloud, no key needed</div>
        <div class="list">
          ${gateway.length ? gateway.map((m) => html`<div class="li"><${Icon} name="i-cloud" /><div class="grow"><div class="name">${m.label}</div><div class="sub">${m.vendor} · ${tierText(m)}</div></div></div>`)
            : html`<div class="li"><span class="muted">Cloud models appear here when you're online.</span></div>`}
        </div>
        <p class="hint" style=${{ marginTop: "10px" }}>Before anything goes to the cloud, pleeply shows what will be sent and waits for your yes. You can switch the cloud off in Control Center.</p>
        <div class="actions"><button class="btn btn-primary btn-lg" onClick=${finish}>Start chatting<${Icon} name="i-arrow" /></button><button class="btn btn-ghost" onClick=${() => setStep(1)}>Back</button><span class="hint">Downloads continue in the background.</span></div>
      `}
    </div></div>
    <div class="onb-dots">${[0, 1, 2].map((k) => html`<i class=${k === step ? "on" : ""}></i>`)}</div>
  </div>`;
}

export function Toasts() {
  return html`<div class="toasts" role="status" aria-live="polite">
    ${S.toasts.map((t) => html`<div class=${"toast" + (t.kind === "err" ? " err" : "")}>
      <${Icon} name=${t.kind === "err" ? "i-info" : "i-check"} />
      <div class="grow">${t.text}</div>
      ${t.action ? html`<button onClick=${t.action.run}>${t.action.label}</button>` : null}
    </div>`)}
  </div>`;
}
