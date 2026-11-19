// Общие части окна: боковое меню, «This computer», выбор модели, окно согласия, первый запуск.
import { html, S, set, call, tryCall, toast, useState, useEffect, useRef, Icon, Mark, Modal, FitBadge, useDropdown, fmtBytes, fmtNum, cloudLabel, refreshChats, refreshModels, refreshState, go } from "./ui.js";

// ---------------- боковое меню ----------------
export function Sidebar() {
  const app = S.app;
  const nav = [
    ["chat", "Chat", "i-chat"],
    ["models", "Models", "i-models"],
    ["agents", "Agents", "i-agents"],
    ["memory", "Memory", "i-memory"],
    ["control", "Control Center", "i-control"],
  ];
  const memCount = S.memory?.suggestions?.length || 0;
  const newChat = () => { set({ chat: null, view: "chat" }); setTimeout(() => document.querySelector(".composer textarea")?.focus(), 30); };
  const del = async (e, id) => {
    e.stopPropagation();
    if (!confirm("Delete this chat? It is removed from this computer.")) return;
    await tryCall("chats.delete", id);
    if (S.chat?.id === id) set({ chat: null });
    refreshChats();
  };
  const open = async (id) => {
    const chat = await tryCall("chats.get", id);
    if (chat) set({ chat, view: "chat" });
  };
  return html`<aside class="side">
    <div class=${"side-top drag" + (window.pleeply.platform === "darwin" ? "" : " win")}></div>
    <div class="side-brand drag"><${Mark} />pleeply</div>
    <button class="btn btn-line side-new" onClick=${newChat}><${Icon} name="i-plus" />New chat</button>
    <nav class="nav" aria-label="Sections">
      ${nav.map(([id, label, icon]) => html`<button class=${"nav-item" + (S.view === id ? " on" : "")} onClick=${() => go(id)}>
        <${Icon} name=${icon} />${label}
        ${id === "memory" && memCount ? html`<span class="count" title="New memory suggestions">${memCount}</span>` : null}
        ${id === "agents" && S.pendingApprovals ? html`<span class="count" title="Waiting for your OK">${S.pendingApprovals}</span>` : null}
      </button>`)}
    </nav>
    <div class="label side-sec">Chats</div>
    <div class="chats">
      ${S.chats.length ? S.chats.map((c) => html`<button class=${"chat-item" + (S.chat?.id === c.id && S.view === "chat" ? " on" : "")} onClick=${() => open(c.id)} title=${c.title}>
        <span class=${"dot" + (c.where === "cloud" ? " cloud" : c.where ? "" : " off")} title=${c.where === "cloud" ? "Last answer came from a cloud model" : c.where ? "Last answer ran on this computer" : ""}></span>
        <span class="t">${c.title}</span>
        <span class="x" role="button" aria-label="Delete chat" onClick=${(e) => del(e, c.id)}><${Icon} name="i-x" cls="xs" /></span>
      </button>`) : html`<div class="side-empty">No chats yet.</div>`}
    </div>
    <button class="side-foot" onClick=${() => go("control", { ccSection: "privacy" })} title="Change in Control Center">
      <b>CLOUD REQUESTS</b>${cloudLabel(app.settings.cloud.requests)}
    </button>
  </aside>`;
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
function presetLocalLabel(p) {
  const m = S.models?.presets?.find((x) => x.id === p.id);
  return m?.local ? `Runs ${m.local.label} here` : "Needs a local model";
}

export function selectionLabel() {
  const sel = S.selection;
  if (sel.type === "auto") return { title: "Auto", sub: "pleeply picks" };
  if (sel.type === "preset") {
    const p = S.app.presets.find((x) => x.id === sel.id);
    return { title: p ? p.short : "Saturn 3.0", sub: S.mode === "cloud" ? defaultCloudLabel() : S.mode === "auto" ? "Auto picks the model" : presetLocalLabel(p || { id: "saturn" }).replace("Runs ", "") };
  }
  const all = [...(S.models?.local || []), ...(S.models?.cloud || [])];
  const m = all.find((x) => x.ref === sel.ref);
  return { title: m?.label || "Model", sub: m ? (m.where === "cloud" ? m.providerName : m.engine === "pleeply" ? "This computer" : m.engine) : "" };
}

function defaultCloudLabel() {
  const cloud = S.models?.cloud || [];
  if (!cloud.length) return "No cloud provider";
  const pref = cloud.find((m) => m.ref === S.app.settings.cloud.defaultModel) || cloud.find((m) => m.id === "claude-opus-5-5") || cloud[0];
  return pref.label;
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
  const match = (m) => !ql || m.label.toLowerCase().includes(ql) || (m.providerName || "").toLowerCase().includes(ql);
  const isOn = (sel) => JSON.stringify(sel) === JSON.stringify(S.selection);
  const byProvider = {};
  for (const m of cloud.filter(match)) (byProvider[m.providerName] ||= []).push(m);
  return html`<div class="picker" ref=${dd.ref}>
    <button class="pick" aria-haspopup="listbox" aria-expanded=${dd.open} onClick=${() => { dd.setOpen(!dd.open); if (!dd.open) refreshModels(); }}>
      ${S.selection.type === "auto" ? html`<${Icon} name="i-auto" cls="sm" />` : html`<span class=${"dot" + (mode === "cloud" || selectedWhere() === "cloud" ? " cloud" : "")}></span>`}
      <span class="ellipsis">${lab.title}</span>${lab.sub ? html`<span class="sub ellipsis">${lab.sub}</span>` : null}
      <${Icon} name="i-down" />
    </button>
    ${dd.open ? html`<div class="menu" role="listbox">
      ${local.length + cloud.length > 10 ? html`<div class="menu-search"><input class="input" placeholder="Search models" value=${q} onInput=${(e) => setQ(e.target.value)} autofocus /></div>` : null}
      ${mode === "auto" ? html`<button class=${"menu-i" + (isOn({ type: "auto" }) ? " on" : "")} onClick=${() => pick({ type: "auto" })}>
        <${Icon} name="i-auto" /><div class="grow"><div class="t">Auto</div><div class="d">pleeply picks the setup and model for each message. Cloud still asks first.</div></div>
        ${isOn({ type: "auto" }) ? html`<${Icon} name="i-check" cls="check" />` : null}
      </button>` : null}
      <div class="menu-h">Model setups</div>
      ${S.app.presets.map((p) => html`<button class=${"menu-i" + (isOn({ type: "preset", id: p.id }) ? " on" : "")} onClick=${() => pick({ type: "preset", id: p.id })}>
        <${Mark} cls="ic" />
        <div class="grow"><div class="t">${p.name}</div><div class="d">${p.role} · ${mode === "cloud" ? defaultCloudLabel() : mode === "auto" ? "local or cloud, chosen per message" : presetLocalLabel(p)}</div></div>
        ${isOn({ type: "preset", id: p.id }) ? html`<${Icon} name="i-check" cls="check" />` : null}
      </button>`)}
      ${mode !== "cloud" ? html`<div class="menu-sep"></div><div class="menu-h">On this computer</div>
        ${local.filter(match).length ? local.filter(match).map((m) => html`<button class=${"menu-i" + (isOn({ type: "model", ref: m.ref }) ? " on" : "")} disabled=${m.fit.level === "too-large"} onClick=${() => pick({ type: "model", ref: m.ref })}>
          <${Icon} name="i-cpu" />
          <div class="grow"><div class="t">${m.label}</div><div class="d">${m.engine === "pleeply" ? "pleeply" : m.engine}${m.bytes ? " · " + fmtBytes(m.bytes) : ""}${m.stats?.tokPerSec ? ` · ${m.stats.tokPerSec} tok/s measured` : ""}</div></div>
          <${FitBadge} fit=${m.fit} />
        </button>`) : html`<div class="menu-note">No local models yet. <a onClick=${() => { dd.setOpen(false); go("models"); }}>Download one</a> — pleeply checks which fit first.</div>`}` : null}
      ${mode !== "local" ? html`<div class="menu-sep"></div><div class="menu-h">Cloud · asks before sending</div>
        ${Object.keys(byProvider).length ? Object.entries(byProvider).map(([prov, list]) => list.map((m) => html`<button class=${"menu-i" + (isOn({ type: "model", ref: m.ref }) ? " on" : "")} onClick=${() => pick({ type: "model", ref: m.ref })}>
          <${Icon} name="i-cloud" /><div class="grow"><div class="t">${m.label}</div><div class="d">${prov}</div></div>
          ${isOn({ type: "model", ref: m.ref }) ? html`<${Icon} name="i-check" cls="check" />` : null}
        </button>`)) : html`<div class="menu-note">No cloud provider connected. <a onClick=${() => { dd.setOpen(false); go("control", { ccSection: "providers" }); }}>Connect one</a> with your own API key.</div>`}` : null}
      <div class="menu-sep"></div>
      <button class="menu-i" onClick=${() => { dd.setOpen(false); go("models"); }}><${Icon} name="i-models" /><div class="t">Manage models</div></button>
    </div>` : null}
  </div>`;
}

function selectedWhere() {
  if (S.selection.type !== "model") return null;
  return S.selection.ref.startsWith("cloud:") ? "cloud" : "local";
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
      setTimeout(() => tryCall("chats.regenerate", { chatId: chat.id, messageId: msg.id, mode: "local", selection: S.selection.type === "preset" ? S.selection : { type: "preset", id: S.app.settings.presets.default } }), 300);
      set({ mode: "local" });
    }
  };
  const shown = d.items.filter((i) => withHistory || i.kind !== "message" || i === d.items[d.items.length - 1]);
  return html`<${Modal} onClose=${() => respond(false)}>
    <div class="modal-h">
      <h2>${d.scope === "agent" ? `Let this agent use ${d.provider.name}?` : `Send to ${d.provider.name}?`}</h2>
      <p>${d.model.label} runs on ${d.provider.name}'s servers. ${d.scope === "agent" ? "Each step of this run" : "This request"} leaves your computer and is processed under their privacy policy. pleeply can't make that private, but it shows you exactly what goes.</p>
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
  useEffect(() => { refreshModels(); }, []);
  const finish = async () => {
    await tryCall("settings.update", { onboarded: true });
    await refreshState();
  };
  const recIds = app.recommendation.modelIds.slice(0, 3);
  const recs = (models?.catalog || []).filter((m) => recIds.includes(m.id));
  const small = (models?.catalog || []).find((m) => m.id === "llama3.2-1b");
  const options = recs.length ? [...recs, ...(small && !recIds.includes(small.id) ? [small] : [])] : [];
  const others = (models?.local || []).filter((m) => m.backend !== "pleeply");
  const download = async (m) => {
    const r = await tryCall("models.download", { catalogId: m.id });
    if (r) toast(`Downloading ${m.label} in the background.`);
    refreshModels();
  };
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
        <div class="onb-step">Step 02 · Choose a model and start</div>
        <h1>Pick a model that fits.</h1>
        <p class="lead">Each one runs entirely on this computer. You can add more, connect a cloud model or use Ollama and LM Studio models any time in Models.</p>
        <div class="list" style=${{ marginTop: "22px" }}>
          ${options.map((m) => html`<div class="li">
            <${Icon} name="i-cpu" />
            <div class="grow"><div class="name">${m.label}</div><div class="sub">${fmtBytes(m.bytes)} download · ${m.fit.reason}</div></div>
            <div class="side-r"><${FitBadge} fit=${m.fit} />
              ${m.installed ? html`<span class="badge local">Installed</span>`
                : m.downloading ? html`<div class="progress"><i style=${{ width: Math.round(((S.downloads[m.downloading.id]?.done ?? m.downloading.done) / (m.downloading.total || 1)) * 100) + "%" }}></i></div>`
                : html`<button class="btn btn-line btn-sm" onClick=${() => download(m)}><${Icon} name="i-download" />Download</button>`}
            </div>
          </div>`)}
          ${!options.length ? html`<div class="li"><span class="muted">Checking models…</span></div>` : null}
        </div>
        ${others.length ? html`<p class="hint" style=${{ marginTop: "10px" }}>Also found ${others.length} model${others.length > 1 ? "s" : ""} from ${[...new Set(others.map((m) => m.engine))].join(" and ")} on this computer — they work in pleeply too.</p>` : null}
        <div class="actions"><button class="btn btn-primary btn-lg" onClick=${finish}>Start chatting<${Icon} name="i-arrow" /></button><button class="btn btn-ghost" onClick=${() => setStep(1)}>Back</button><span class="hint">Downloads continue in the background.</span></div>
      `}
    </div></div>
    <div class="onb-dots">${[0, 1, 2].map((i) => html`<i class=${i === step ? "on" : ""}></i>`)}</div>
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
