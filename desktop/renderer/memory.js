// pleeply Memory: личный контекст на этом компьютере. Видно, можно изменить или удалить всё, что запомнено.
import { html, S, set, tryCall, toast, useState, useEffect, Icon, Toggle, ago } from "./ui.js";

export async function refreshMemory() {
  const memory = await tryCall("memory.get");
  if (memory) set({ memory });
}

const ORIGIN = { you: "You added", learned: "Learned from a chat", agent: "Added by an agent" };

function Item({ it }) {
  const [edit, setEdit] = useState(false);
  const [text, setText] = useState(it.text);
  const save = async () => { const m = await tryCall("memory.update", { id: it.id, text }); if (m) { set({ memory: m }); setEdit(false); } };
  return html`<div class="mem-item">
    <${Icon} name="i-memory" cls="sm" />
    <div class="grow">
      ${edit ? html`<div class="row"><input class="input grow" value=${text} onInput=${(e) => setText(e.target.value)} onKeyDown=${(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEdit(false); }} autofocus /><button class="btn btn-primary btn-sm" onClick=${save}>Save</button></div>`
        : html`<div class="txt">${it.text}</div>`}
      <div class="when">${ORIGIN[it.origin] || "Saved"} · ${ago(it.updatedAt || it.createdAt)}</div>
    </div>
    ${!edit ? html`<div class="acts">
      <button class="icon-btn" title="Edit" onClick=${() => setEdit(true)}><${Icon} name="i-edit" cls="sm" /></button>
      <button class="icon-btn" title="Forget" onClick=${async () => { const m = await tryCall("memory.remove", it.id); if (m) set({ memory: m }); }}><${Icon} name="i-trash" cls="sm" /></button>
    </div>` : null}
  </div>`;
}

export function MemoryView() {
  const [text, setText] = useState("");
  useEffect(() => { refreshMemory(); }, []);
  const s = S.app.settings;
  const mem = S.memory;
  const update = async (patch) => { const r = await tryCall("settings.update", patch); if (r) set({ app: { ...S.app, settings: r } }); };
  const add = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    const m = await tryCall("memory.add", text);
    if (m) { set({ memory: m }); setText(""); }
  };
  return html`<div class="page">
    <header class="topbar drag"><span class="title">Memory</span></header>
    <div class="scroll"><div class="page-body" style=${{ maxWidth: "820px" }}>
      <div class="page-head"><div><h1>pleeply Memory</h1><p>A personal context system that helps AI understand how you work, stored on this computer. See, edit or delete anything it remembers.</p></div></div>
      <div class="list">
        <div class="setting"><div class="grow"><div class="t">Use Memory in chats</div><div class="d">Adds what's below to the instructions of local models.${s.cloud.shareMemory ? " Cloud models get it too (you turned that on in Control Center)." : " Cloud models don't get it unless you allow that in Control Center → Privacy."}</div></div>
          <div class="ctl"><${Toggle} label="Use Memory" on=${s.memory.enabled} onChange=${(v) => update({ memory: { enabled: v } })} /></div></div>
        <div class="setting"><div class="grow"><div class="t">Learn from chats</div><div class="d">After you chat with a local model, it can note lasting preferences. Learning never uses the cloud.</div></div>
          <div class="ctl"><select class="select" style=${{ width: "190px" }} value=${s.memory.learn} onChange=${(e) => update({ memory: { learn: e.target.value } })}>
            <option value="suggest">Suggest, I approve</option><option value="auto">Remember automatically</option><option value="off">Off</option></select></div></div>
      </div>
      ${mem?.suggestions?.length ? html`<div class="sec"><div class="sec-head"><h2>Suggestions</h2><p>Things pleeply noticed. Keep only what's right.</p></div>
        <div class="list">${mem.suggestions.map((sg) => html`<div class="mem-item"><${Icon} name="i-auto" cls="sm" /><div class="grow"><div class="txt">${sg.text}</div><div class="when">${ago(sg.createdAt)}</div></div>
          <button class="btn btn-line btn-sm" onClick=${async () => { const m = await tryCall("memory.accept", sg.id); if (m) set({ memory: m }); }}>Keep</button>
          <button class="btn btn-ghost btn-sm" onClick=${async () => { const m = await tryCall("memory.dismiss", sg.id); if (m) set({ memory: m }); }}>Dismiss</button></div>`)}</div></div>` : null}
      <div class="sec">
        <div class="sec-head"><h2>What pleeply remembers</h2><p>${mem ? `${mem.items.length} item${mem.items.length === 1 ? "" : "s"}` : ""}</p><span class="spacer"></span>
          ${mem?.items?.length ? html`<button class="btn btn-ghost btn-sm" onClick=${async () => { if (confirm("Forget everything in Memory?")) { const m = await tryCall("memory.clear"); if (m) { set({ memory: m }); toast("Memory cleared."); } } }}>Forget everything</button>` : null}</div>
        <form class="row" onSubmit=${add} style=${{ marginBottom: "12px" }}>
          <input class="input grow" placeholder="Add something, e.g. “Prefers short answers” or “Writes in RU and EN”" value=${text} onInput=${(e) => setText(e.target.value)} maxlength="400" />
          <button class="btn btn-primary" disabled=${!text.trim()}><${Icon} name="i-plus" />Add</button>
        </form>
        ${mem?.items?.length ? html`<div class="list">${mem.items.map((it) => html`<${Item} it=${it} key=${it.id} />`)}</div>`
          : html`<div class="card empty"><h3>Nothing yet</h3><p>Add a few things about how you work, or let local chats suggest them.</p></div>`}
      </div>
    </div></div>
  </div>`;
}
