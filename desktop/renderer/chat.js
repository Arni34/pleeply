// pleeply Chat: один интерфейс для разных моделей, у каждого ответа видно, где он посчитан.
import { html, S, set, call, tryCall, toast, useState, useEffect, useRef, Icon, Mark, Markdown, Seg, useDropdown, fmtNum, refreshChats, refreshModels, go } from "./ui.js";
import { HwPanel, ModelPicker, TopLead, RenameInput, FloatMenu, chatMenuItems, focusComposer } from "./views.js";

const STARTERS = [
  { t: "Rewrite something", d: "Make this calmer and shorter: …", text: "Rewrite this so it sounds calmer and shorter:\n\n" },
  { t: "Plan a trip", d: "Three days in Almaty for two", text: "Plan three days in Almaty for two." },
  { t: "Summarize a document", d: "Attach a PDF or notes", attach: true },
  { t: "Think it through", d: "Pros and cons, step by step", text: "Help me think through this decision step by step: " },
];

function MetaLine({ m }) {
  const meta = m.meta || {};
  if (!meta.where || ["consent", "declined", "routing", "streaming"].includes(m.status)) return null;
  const parts = [];
  // «Ответила другая модель» — только при запасном варианте Claude по собственному ключу Anthropic.
  parts.push(meta.backend === "anthropic" && meta.servedModel && !String(meta.ref).endsWith(meta.servedModel) ? `${meta.model} → answered by ${meta.servedModel}` : meta.model);
  if (meta.where === "local" && meta.engine && meta.engine !== "pleeply") parts.push(`via ${meta.engine}`);
  if (meta.tokPerSec) parts.push(`${meta.tokPerSec} tok/s`);
  if (meta.memoryUsed) parts.push("used Memory");
  return html`<div class="msg-meta">
    ${meta.where === "local"
      ? html`<span class="where local"><${Icon} name="i-cpu" />Ran on this computer · nothing sent</span>`
      : html`<span class="where cloud"><${Icon} name="i-cloud" />Sent to ${meta.providerName} · ${meta.approval === "chat" ? "approved for this chat" : "you approved"}${meta.sentChars ? ` · ${fmtNum(meta.sentChars)} characters` : ""}</span>`}
    ${parts.map((p) => html`<span class="sep">·</span><span>${p}</span>`)}
  </div>`;
}

function Thought({ m, streaming }) {
  if (!m.thought) return null;
  return html`<details class="thought" open=${streaming && !m.text}>
    <summary><${Icon} name="i-brain" cls="sm" />${streaming && !m.text ? html`<span class="shimmer">Thinking…</span>` : "Thought process"}<${Icon} name="i-down" cls="xs" /></summary>
    <div class="body">${m.thought}</div>
  </details>`;
}

function Citations({ citations, open, setOpen }) {
  if (!citations || !Object.keys(citations).length) return null;
  const cur = open && citations[open];
  return html`<div>
    <div class="cites">${Object.entries(citations).slice(0, 12).map(([n, c]) => html`<button class="cite-chip" onClick=${() => setOpen(open === n ? null : n)} title=${c.name}>
      <b>${n}</b><span class="ellipsis">${c.name}${c.page ? ` · p. ${c.page}` : ""}</span></button>`)}</div>
    ${cur ? html`<div class="cite-pop"><b class="ink">[${open}] ${cur.name}${cur.page ? `, page ${cur.page}` : ""}</b><div class="q">${cur.excerpt}</div></div>` : null}
  </div>`;
}

function RetryMenu({ m }) {
  const dd = useDropdown();
  const chat = S.chat;
  const local = (S.models?.local || []).filter((x) => x.fit.level !== "too-large");
  const cloud = S.models?.cloud || [];
  const redo = (mode, selection) => {
    dd.setOpen(false);
    tryCall("chats.regenerate", { chatId: chat.id, messageId: m.id, mode, selection });
  };
  return html`<div class="picker" ref=${dd.ref}>
    <button class="icon-btn" title="Answer again with another model" onClick=${() => { dd.setOpen(!dd.open); refreshModels(); }}><${Icon} name="i-refresh" cls="sm" /></button>
    ${dd.open ? html`<div class="menu" style=${{ top: "auto", bottom: "calc(100% + 6px)" }}>
      <div class="menu-h">Answer again with</div>
      <button class="menu-i" onClick=${() => redo(S.mode, S.selection)}><${Icon} name="i-refresh" /><div class="t">Same choice</div></button>
      ${local.map((x) => html`<button class="menu-i" onClick=${() => redo("local", { type: "model", ref: x.ref })}><${Icon} name="i-cpu" /><div class="grow"><div class="t">${x.label}</div><div class="d">This computer${x.engine !== "pleeply" ? " · " + x.engine : ""}</div></div></button>`)}
      ${cloud.slice(0, 12).map((x) => html`<button class="menu-i" onClick=${() => redo("cloud", { type: "model", ref: x.ref })}><${Icon} name="i-cloud" /><div class="grow"><div class="t">${x.label}</div><div class="d">${x.providerName} · asks before sending</div></div></button>`)}
    </div>` : null}
  </div>`;
}

function AssistantMessage({ m, last }) {
  const [cite, setCite] = useState(null);
  const streaming = m.status === "streaming";
  const meta = m.meta || {};
  let body;
  if (m.status === "routing") body = html`<div class="state"><span class="shimmer">${meta.mode === "auto" ? "Choosing the right setup and model…" : "Getting ready…"}</span></div>`;
  else if (m.status === "consent") body = html`<div class="state"><${Icon} name="i-cloud" cls="sm" />Waiting for your OK to send this to ${meta.providerName}…</div>`;
  else if (m.status === "declined") body = html`<div class="notice">Not sent. Nothing left your computer.
    <div class="row"><button class="btn btn-line btn-sm" onClick=${() => tryCall("chats.regenerate", { chatId: S.chat.id, messageId: m.id, mode: "local", selection: { type: "auto" } })}><${Icon} name="i-cpu" />Run locally instead</button></div></div>`;
  else if (m.status === "error") body = html`<div class="notice err">${m.error}
    <div class="row">
      ${/local model|Download one/i.test(m.error || "") ? html`<button class="btn btn-line btn-sm" onClick=${() => go("models")}><${Icon} name="i-models" />Open Models</button>` : null}
      ${/cloud provider|Connect/i.test(m.error || "") ? html`<button class="btn btn-line btn-sm" onClick=${() => go("control", { ccSection: "providers" })}><${Icon} name="i-control" />Control Center</button>` : null}
      ${last ? html`<button class="btn btn-ghost btn-sm" onClick=${() => tryCall("chats.regenerate", { chatId: S.chat.id, messageId: m.id, mode: S.mode, selection: S.selection })}><${Icon} name="i-refresh" />Try again</button>` : null}
    </div></div>`;
  else body = html`
    <${Thought} m=${m} streaming=${streaming} />
    ${m.text ? html`<${Markdown} text=${m.text} citations=${meta.citations} onCite=${setCite} streaming=${streaming} />` : streaming && !m.thought ? html`<div class="state"><span class="shimmer">${meta.where === "local" ? `Running ${meta.model} on this computer…` : `Waiting for ${meta.providerName}…`}</span></div>` : null}
    ${m.status === "stopped" ? html`<div class="msg-auto">Stopped.</div>` : null}
    ${meta.notice ? html`<div class="notice">${meta.notice}</div>` : null}
    <${Citations} citations=${meta.citations} open=${cite} setOpen=${setCite} />
    <${MetaLine} m=${m} />
    ${meta.autoReason && meta.mode === "auto" ? html`<div class="msg-auto">Auto: ${meta.autoReason}</div>` : null}
    ${!streaming && m.text ? html`<div class="msg-tools">
      <button class="icon-btn" title="Copy" onClick=${() => { call("shell.copy", m.text); toast("Copied."); }}><${Icon} name="i-copy" cls="sm" /></button>
      <${RetryMenu} m=${m} />
      <button class="icon-btn" title="Remember something from this" onClick=${() => go("memory")}><${Icon} name="i-memory" cls="sm" /></button>
    </div>` : null}`;
  return html`<div class="msg-ai">${body}</div>`;
}

function UserMessage({ m, canEdit }) {
  const editing = S.editing === m.id;
  const [text, setText] = useState(m.text);
  const ta = useRef(null);
  useEffect(() => {
    if (!editing) return;
    setText(m.text);
    setTimeout(() => { const el = ta.current; if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }, 20);
  }, [editing]);
  useEffect(() => {
    const el = ta.current;
    if (el) { el.style.height = "auto"; el.style.height = Math.min(320, el.scrollHeight) + "px"; }
  }, [text, editing]);
  const cancel = () => { set({ editing: null }); focusComposer(); };
  const save = async () => {
    const body = text.trim();
    if (!body) return;
    set({ editing: null });
    await tryCall("chats.edit", { chatId: S.chat.id, messageId: m.id, text: body, mode: S.mode, selection: S.selection });
  };
  const files = m.attachments?.length ? html`<div class="files">${m.attachments.length} file${m.attachments.length > 1 ? "s" : ""} attached</div>` : null;
  if (editing) return html`<div class="msg-edit">
    <textarea ref=${ta} value=${text} aria-label="Edit message" onInput=${(e) => setText(e.target.value)}
      onKeyDown=${(e) => {
        if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); save(); }
        if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); cancel(); }
      }}></textarea>
    <div class="row"><span class="hint grow">Sending replaces the answers after this message.</span>
      <button class="btn btn-ghost btn-sm" onClick=${cancel}>Cancel</button>
      <button class="btn btn-primary btn-sm" disabled=${!text.trim()} onClick=${save}>Send</button></div>
  </div>`;
  return html`<div class="msg-user">
    <div class="msg-me">${m.text}${files}</div>
    <div class="msg-tools">
      ${m.editedAt ? html`<span class="faint edited">edited</span>` : null}
      <button class="icon-btn" title="Copy" onClick=${() => { call("shell.copy", m.text); toast("Copied."); }}><${Icon} name="i-copy" cls="sm" /></button>
      ${canEdit ? html`<button class="icon-btn" title="Edit and send again (↑ in an empty message box)" onClick=${() => set({ editing: m.id })}><${Icon} name="i-edit" cls="sm" /></button>` : null}
    </div>
  </div>`;
}

function Hello({ onStarter }) {
  const local = S.mode === "local";
  return html`<div class="hello">
    <${Mark} cls="mark" />
    <h1>What can I help with?</h1>
    <p>${local ? "Local mode: everything runs on this computer and nothing is sent." : S.mode === "cloud" ? "Cloud mode: GPT, Claude, Gemini and DeepSeek. pleeply shows what will be sent and asks first." : "Auto: pleeply picks a model for each message, on this computer when it fits. Cloud still asks first."}</p>
    <div class="starters">${STARTERS.map((s) => html`<button class="starter" onClick=${() => onStarter(s)}><b>${s.t}</b>${s.d}</button>`)}</div>
  </div>`;
}

function useRoutePreview(text) {
  const [r, setR] = useState(null);
  useEffect(() => {
    let alive = true;
    const t = setTimeout(async () => {
      const res = await call("route.preview", { chatId: S.chat?.id || null, text, mode: S.mode, selection: S.selection }).catch(() => null);
      if (alive) setR(res);
    }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [text, S.mode, JSON.stringify(S.selection), S.chat?.id, S.models?.local?.length, S.models?.cloud?.length, S.chat?.attachments?.length, S.app.settings.cloud.requests]);
  return r;
}

function RouteHint({ r }) {
  const req = S.app.settings.cloud.requests;
  if (!r) return html`<div class="route"></div>`;
  if (r.error) return html`<div class="route"><${Icon} name="i-info" /><span class="ellipsis">${r.error}</span></div>`;
  const auto = S.selection.type !== "model" ? "Auto → " : "";
  if (r.where === "local") return html`<div class="route local" title=${r.reason || ""}><${Icon} name="i-cpu" /><span class="ellipsis">${auto}${r.label} · runs on this computer, nothing is sent</span></div>`;
  return html`<div class="route" title=${r.reason || ""}><${Icon} name="i-cloud" /><span class="ellipsis">${auto}${r.label} · ${r.providerName} · ${req === "ask" ? "asks before sending" : "asks once per chat"}</span></div>`;
}

function Composer() {
  const [text, setText] = useState("");
  const [drop, setDrop] = useState(false);
  const ta = useRef(null);
  const chat = S.chat;
  const busy = chat?.messages?.some((m) => ["routing", "consent", "streaming"].includes(m.status));
  const preview = useRoutePreview(text);
  useEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(240, el.scrollHeight) + "px";
  }, [text]);
  useEffect(() => {
    const f = (e) => { if (e.detail) { setText(e.detail); ta.current?.focus(); } };
    const a = () => attach();
    window.addEventListener("pleeply:compose", f);
    window.addEventListener("pleeply:attach", a);
    return () => { window.removeEventListener("pleeply:compose", f); window.removeEventListener("pleeply:attach", a); };
  }, [chat?.id]);
  useEffect(() => { if (!S.editing) ta.current?.focus(); }, [chat?.id]);
  const editLast = (e) => {
    if (e.key !== "ArrowUp" || text || busy || e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) return false;
    const last = [...(chat?.messages || [])].reverse().find((m) => m.role === "user");
    if (!last) return false;
    e.preventDefault();
    set({ editing: last.id });
    return true;
  };
  const send = async () => {
    const body = text.trim();
    if (!body || busy) return;
    setText("");
    const r = await tryCall("chats.send", { chatId: chat?.id || null, text: body, mode: S.mode, selection: S.selection });
    if (!r) { setText(body); return; }
    if (!chat || chat.id !== r.chatId) {
      const c = await tryCall("chats.get", r.chatId);
      if (c) set({ chat: c });
    }
    refreshChats();
  };
  const attach = async () => {
    const r = await tryCall("chats.attach", chat?.id || null);
    if (!r) return;
    for (const e of r.errors) toast(e, "err");
    set({ chat: r.chat });
    refreshChats();
  };
  const onDrop = async (e) => {
    e.preventDefault();
    setDrop(false);
    const paths = [...e.dataTransfer.files].map((f) => window.pleeply.pathForFile(f)).filter(Boolean);
    if (!paths.length) return;
    const r = await tryCall("chats.attachPaths", { chatId: chat?.id || null, paths });
    if (!r) return;
    for (const er of r.errors) toast(er, "err");
    set({ chat: r.chat });
    refreshChats();
  };
  const remove = async (docId) => {
    const c = await tryCall("chats.removeAttachment", { chatId: chat.id, docId });
    if (c) set({ chat: c });
  };
  const placeholder = preview?.label ? `Message ${preview.label}…` : "Message pleeply…";
  return html`<div class="composer-wrap">
    <div class=${"composer" + (drop ? " drop" : "")} onDragOver=${(e) => { e.preventDefault(); setDrop(true); }} onDragLeave=${() => setDrop(false)} onDrop=${onDrop}>
      ${chat?.attachments?.length ? html`<div class="chips">${chat.attachments.map((a) => html`<span class="chip" title=${`${a.name} · ${fmtNum(a.chars)} characters${a.pages > 1 ? ` · ${a.pages} pages` : ""}`}><${Icon} name="i-file" /><span class="ellipsis">${a.name}</span><button aria-label="Remove file" onClick=${() => remove(a.id)}><${Icon} name="i-x" cls="xs" /></button></span>`)}</div>` : null}
      <textarea ref=${ta} rows="1" value=${text} placeholder=${placeholder} aria-label="Message"
        onInput=${(e) => setText(e.target.value)}
        onKeyDown=${(e) => { if (editLast(e)) return; if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); } }}></textarea>
      <div class="bar">
        <button class="icon-btn" title=${`Attach files: PDF, text, Markdown, code. Read on this computer (${window.pleeply.platform === "darwin" ? "⌘O" : "Ctrl+O"})`} onClick=${attach}><${Icon} name="i-clip" /></button>
        <${RouteHint} r=${preview} />
        ${busy ? html`<button class="send" title="Stop" onClick=${() => call("chats.stop", chat.id)}><${Icon} name="i-stop" /></button>`
          : html`<button class="send" title="Send (Enter)" disabled=${!text.trim()} onClick=${send}><${Icon} name="i-send" /></button>`}
      </div>
    </div>
    <div class="foot-note">${S.mode === "local" ? "Local mode · prompts and files stay on this computer." : "Cloud requests always show the provider and what will be sent, and wait for your yes."}</div>
  </div>`;
}

function ChatMenu() {
  const [menu, setMenu] = useState(null);
  const chat = S.chat;
  if (!chat) return null;
  const listed = S.chats.find((c) => c.id === chat.id) || chat;
  const items = chatMenuItems({ ...listed, title: chat.title }).map((it) => (it !== "-" && it.label === "Rename" ? { ...it, run: () => set({ renameTitle: true }) } : it));
  return html`<button class="icon-btn" title="Chat options" aria-label="Chat options" onClick=${(e) => { const r = e.currentTarget.getBoundingClientRect(); setMenu({ x: r.right, y: r.bottom }); }}><${Icon} name="i-more" /></button>
    ${menu ? html`<${FloatMenu} x=${menu.x} y=${menu.y} items=${items} onClose=${() => setMenu(null)} />` : null}`;
}

export function ChatView() {
  const chat = S.chat;
  const scroller = useRef(null);
  const stick = useRef(true);
  const msgs = chat?.messages || [];
  const lastLen = msgs.length ? (msgs[msgs.length - 1].text || "").length + (msgs[msgs.length - 1].thought || "").length : 0;
  useEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [msgs.length, lastLen, chat?.id]);
  const [atBottom, setAtBottom] = useState(true);
  useEffect(() => { stick.current = true; setAtBottom(true); }, [chat?.id]);
  const onScroll = (e) => {
    const el = e.currentTarget;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    stick.current = near;
    if (near !== atBottom) setAtBottom(near);
  };
  const toBottom = () => {
    const el = scroller.current;
    if (el) { stick.current = true; el.scrollTo({ top: el.scrollHeight, behavior: "smooth" }); }
  };
  const busy = msgs.some((m) => ["routing", "consent", "streaming"].includes(m.status));
  const setMode = (mode) => {
    let selection = S.selection;
    if (selection.type === "model" && ((mode === "local" && selection.ref.startsWith("cloud:")) || (mode === "cloud" && !selection.ref.startsWith("cloud:")))) selection = { type: "auto" };
    if (mode === "cloud" && S.app.settings.cloud.requests === "off") toast("Cloud is switched off in Control Center → Privacy.", "err", { label: "Open", run: () => go("control", { ccSection: "privacy" }) });
    set({ mode, selection });
    call("settings.update", { mode }).catch(() => {});
  };
  const onStarter = async (s) => {
    if (s.attach) {
      const r = await tryCall("chats.attach", chat?.id || null);
      if (r) { for (const e of r.errors) toast(e, "err"); set({ chat: r.chat }); refreshChats(); window.dispatchEvent(new CustomEvent("pleeply:compose", { detail: "Summarize the key points and tell me where each one comes from." })); }
      return;
    }
    window.dispatchEvent(new CustomEvent("pleeply:compose", { detail: s.text }));
  };
  const lastAi = [...msgs].reverse().find((m) => m.role === "assistant");
  return html`<div class="chat-wrap">
    <div class="page">
      <header class="topbar drag">
        <${TopLead} />
        <${ModelPicker} />
        <${Seg} label="Where requests run" value=${S.mode} onChange=${setMode} options=${[
          { value: "local", label: "Local", icon: "i-cpu", title: "Run on this computer. Nothing is sent." },
          { value: "cloud", label: "Cloud", icon: "i-cloud", title: "Use a connected cloud provider. Asks before sending." },
          { value: "auto", label: "Auto", icon: "i-auto", title: "pleeply recommends the model and mode. Cloud still needs your yes." },
        ]} />
        <span class="spacer"></span>
        ${chat ? (S.renameTitle
          ? html`<${RenameInput} c=${chat} cls="rename title-input" />`
          : html`<button class="title ellipsis title-btn" title="Click to rename" onClick=${() => set({ renameTitle: true })}>${chat.title}</button>`) : null}
        <${ChatMenu} />
        <button class=${"icon-btn" + (S.app.settings.ui.hwPanel ? " on" : "")} title="This computer" onClick=${() => call("settings.update", { ui: { hwPanel: !S.app.settings.ui.hwPanel } })}><${Icon} name="i-panel" /></button>
      </header>
      <div class="scroll-wrap">
        <div class="scroll" ref=${scroller} onScroll=${onScroll}>
          ${msgs.length ? html`<div class="msgs">
            ${msgs.map((m) => m.role === "user"
              ? html`<${UserMessage} key=${m.id} m=${m} canEdit=${!busy} />`
              : html`<${AssistantMessage} key=${m.id} m=${m} last=${m === lastAi} />`)}
          </div>` : html`<${Hello} onStarter=${onStarter} />`}
        </div>
        ${!atBottom && msgs.length ? html`<button class="to-bottom" title="Scroll to the latest message" aria-label="Scroll to the latest message" onClick=${toBottom}><${Icon} name="i-down" /></button>` : null}
      </div>
      <${Composer} />
    </div>
    ${S.app.settings.ui.hwPanel ? html`<${HwPanel} />` : null}
  </div>`;
}
