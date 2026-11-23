// pleeply Control Center: железо, производительность, приватность и настройки моделей в одном месте.
import { html, S, set, call, tryCall, toast, useState, useEffect, useRef, Icon, Toggle, FitBadge, GoogleG, fmtBytes, fmtNum, when, refreshState, refreshModels, refreshChats } from "./ui.js";
import { TopLead } from "./views.js";

const SECTIONS = [
  ["account", "Account"],
  ["computer", "This computer"],
  ["performance", "Performance"],
  ["privacy", "Privacy"],
  ["modelsettings", "Model settings"],
  ["providers", "Cloud providers"],
  ["integrations", "Ollama & LM Studio"],
  ["storage", "Storage & data"],
];

const update = async (patch) => {
  const s = await tryCall("settings.update", patch);
  if (s) { set({ app: { ...S.app, settings: s } }); await refreshState(); }
  return s;
};

function Setting({ t, d, children }) {
  return html`<div class="setting"><div class="grow"><div class="t">${t}</div>${d ? html`<div class="d">${d}</div>` : null}</div><div class="ctl">${children}</div></div>`;
}

function Usage({ label, used, limit }) {
  const pct = limit ? Math.min(100, Math.round(((used || 0) / limit) * 100)) : 0;
  return html`<div class="usage"><div class="row"><span class="grow">${label}</span><span class="mono muted">${used || 0} / ${limit}</span></div><div class="progress wide"><i style=${{ width: pct + "%" }}></i></div></div>`;
}

// Премиум у Pro считается в месяц, у остальных тарифов — в день
const per = (p) => (p?.paidPeriod === "month" ? "a month" : "a day");

function AccountSection() {
  const a = S.app.account || {};
  const plans = a.plans || S.app.cloudPlans;
  useEffect(() => { if (a.signedIn) tryCall("account.refresh"); }, []);
  if (!a.signedIn) {
    return html`<div class="card col" style=${{ gap: "12px" }}>
      <h3>Sign in to pleeply</h3>
      <p class="muted">Signing in raises your daily pleeply Cloud limits${plans ? ` to ${plans.free.free} free and ${plans.free.paid} premium requests` : ""} and lets you upgrade to pleeply Pro${plans ? ` (${plans.pro.free} free requests a day and ${plans.pro.paid} premium ${per(plans.pro)})` : ""}. Local models never need an account.</p>
      <div class="row">
        <button class="btn btn-google" disabled=${a.signingIn} onClick=${() => tryCall("account.signIn")}><${GoogleG} />${a.signingIn ? "Waiting for your browser…" : "Continue with Google"}</button>
        ${a.signingIn ? html`<button class="btn btn-ghost btn-sm" onClick=${() => tryCall("account.cancel")}>Cancel</button>` : null}
      </div>
      <p class="hint">pleeply opens Google in your browser. You sign in there, so pleeply never sees your Google password.</p>
    </div>`;
  }
  const acc = a.account || {};
  const pro = acc.plan === "pro";
  const lim = acc.limits || plans?.[pro ? "pro" : "free"] || { free: 0, paid: 0 };
  return html`<div class="card col" style=${{ gap: "14px" }}>
      <div class="row">
        <span class="avatar lg">${(acc.name || acc.email || "P").trim()[0].toUpperCase()}</span>
        <div class="grow"><div class="ink" style=${{ fontWeight: 500 }}>${acc.name || acc.email}</div><div class="muted" style=${{ fontSize: "13px" }}>${acc.email}</div></div>
        <span class=${"badge" + (pro ? " good" : "")}>${pro ? "Pro" : "Free"}</span>
      </div>
      <div class="label">pleeply Cloud usage</div>
      <${Usage} label="Free cloud models · today" used=${a.usage?.free} limit=${lim.free} />
      <${Usage} label=${`Premium models (Claude, GPT, Gemini, DeepSeek) · ${lim.paidPeriod === "month" ? "this month" : "today"}`} used=${lim.paidPeriod === "month" ? a.usage?.paid_month : a.usage?.paid} limit=${lim.paid} />
      ${pro && acc.planUntil ? html`<p class="hint">Pro renews or ends around ${new Date(acc.planUntil).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}.</p>` : null}
      <div class="row wrap">
        ${pro || acc.billing ? html`<button class="btn btn-line" onClick=${() => tryCall("account.manage")}>Manage subscription</button>` : null}
        ${!pro ? html`<button class="btn btn-primary" disabled=${a.upgrade === false} onClick=${() => tryCall("account.upgrade")}>Upgrade to Pro${a.price ? ` · ${a.price}` : ""}</button>` : null}
        ${!pro && a.upgrade === false ? html`<span class="hint">Payments are being set up.</span>` : null}
        <span class="spacer"></span>
        <button class="btn btn-ghost btn-sm" onClick=${async () => { if (confirm("Sign out of pleeply on this computer?")) await tryCall("account.signOut"); }}>Sign out</button>
      </div>
    </div>
    ${!pro && plans ? html`<div class="card"><b class="ink">pleeply Pro</b><p class="muted" style=${{ marginTop: "6px" }}>${plans.pro.free} requests a day to free cloud models and ${plans.pro.paid} premium requests ${per(plans.pro)} (Claude, GPT, Gemini). Local models stay free and unlimited. Cancel any time; payment is handled by Paddle.</p></div>` : null}
    <p class="hint" style=${{ marginTop: "10px" }}>While you're signed in, pleeply Cloud counts your requests against your account. The text of requests is never stored.</p>`;
}

function Computer() {
  const app = S.app;
  const hw = app.hardware;
  const [busy, setBusy] = useState(false);
  return html`<div class="card">
    <div class="kv">
      <span>Chip</span><b>${hw.chip}</b>
      <span>Processor cores</span><b>${hw.cpuCores}</b>
      <span>Memory</span><b>${Math.round(hw.ramBytes / 1073741824)} GB${hw.gpu.unified ? " unified" : ""}</b>
      <span>Graphics</span><b>${app.graphics}${hw.gpu.name && hw.gpu.unified ? ` · ${hw.gpu.name}` : ""}</b>
      <span>Acceleration</span><b>${hw.gpu.backend === "cpu" ? "Processor only" : hw.gpu.backend === "metal" ? "Metal" : hw.gpu.backend.toUpperCase()}</b>
      <span>Graphics memory for models</span><b>${hw.gpu.vramBytes ? fmtBytes(hw.gpu.vramBytes) : "—"}</b>
      <span>System</span><b>${hw.os} ${hw.osVersion || ""} · ${hw.arch}</b>
      <span>Free disk space</span><b>${fmtBytes(hw.diskFreeBytes)}</b>
    </div>
    <div class="row" style=${{ marginTop: "16px" }}>
      <span class="hint grow">Read on this computer ${when(hw.detectedAt)}. Nothing about your hardware is sent anywhere.</span>
      <button class="btn btn-line btn-sm" disabled=${busy} onClick=${async () => { setBusy(true); const a = await tryCall("hardware.refresh"); if (a) set({ app: a }); setBusy(false); }}><${Icon} name="i-refresh" />Check again</button>
    </div>
  </div>
  <div class="card"><div class="label" style=${{ marginBottom: "10px" }}>Model fit</div>
    <div class="col">${app.buckets.map((b) => html`<div class="fit"><span>${b.label}</span><u><i class=${b.level} style=${{ width: Math.round(b.ratio * 100) + "%" }}></i></u><b>${b.text}</b></div>`)}
    <div class="fit-note">${app.recommendation.text}</div></div>
  </div>`;
}

function Performance() {
  const s = S.app.settings;
  const b = S.app.budget;
  const eng = S.engine;
  const [mem, setMem] = useState(s.performance.memoryGB ?? b.autoGB);
  useEffect(() => setMem(s.performance.memoryGB ?? b.autoGB), [s.performance.memoryGB, b.autoGB]);
  return html`<div class="list">
    <${Setting} t="GPU acceleration" d=${S.app.hardware.gpu.backend === "cpu" && !s.performance.gpu ? "Off: models run on the processor only." : "Runs models on the graphics chip when it can. Turn off only if you see crashes."}>
      <${Toggle} label="GPU acceleration" on=${s.performance.gpu} onChange=${(v) => update({ performance: { gpu: v } })} />
    </${Setting}>
    <${Setting} t="Memory for models" d=${`How much memory pleeply may use for a model. Auto is ${b.autoGB} GB on this computer; models over the limit show as Too large.`}>
      <input class="range" type="range" min="1" max=${b.maxGB} step="0.5" value=${mem} onInput=${(e) => setMem(Number(e.target.value))} onChange=${(e) => update({ performance: { memoryGB: Number(e.target.value) } })} />
      <span class="mono ink" style=${{ width: "52px", textAlign: "right" }}>${mem} GB</span>
      ${s.performance.memoryGB != null ? html`<button class="btn btn-ghost btn-sm" onClick=${() => update({ performance: { memoryGB: null } })}>Auto</button>` : html`<span class="badge">Auto</span>`}
    </${Setting}>
    <${Setting} t="Context size" d="How much of the conversation and files a local model can see at once. Larger uses more memory.">
      <select class="select" style=${{ width: "140px" }} value=${s.performance.contextSize} onChange=${(e) => update({ performance: { contextSize: Number(e.target.value) } })}>
        ${[2048, 4096, 8192, 16384, 32768, 65536].map((n) => html`<option value=${n}>${fmtNum(n)} tokens</option>`)}
      </select>
    </${Setting}>
    <${Setting} t="Keep the model loaded" d="Loaded models answer instantly but hold memory. pleeply unloads them after this much idle time.">
      <select class="select" style=${{ width: "140px" }} value=${s.performance.keepLoadedMin} onChange=${(e) => update({ performance: { keepLoadedMin: Number(e.target.value) } })}>
        ${[[0, "Unload right away"], [2, "2 minutes"], [5, "5 minutes"], [10, "10 minutes"], [30, "30 minutes"], [60, "1 hour"]].map(([v, l]) => html`<option value=${v}>${l}</option>`)}
      </select>
    </${Setting}>
    <${Setting} t="Loaded now" d=${eng.loaded ? `${eng.label} · ${fmtNum(eng.contextSize)} context${eng.gpuLayers != null ? ` · ${eng.gpuLayers}${eng.totalLayers ? "/" + eng.totalLayers : ""} layers on GPU` : ""}` : "No model is loaded."}>
      <button class="btn btn-line btn-sm" disabled=${!eng.loaded} onClick=${() => tryCall("engine.unload")}>Unload</button>
    </${Setting}>
  </div>`;
}

const ACT_ICON = { cloud: "i-cloud", download: "i-download", search: "i-search", "cloud-list": "i-plug" };
function actText(a) {
  if (a.kind === "cloud") return html`<span><b class="ink">${a.providerName}</b> · ${a.model} · ${fmtNum(a.chars)} characters ${a.agent ? html`from agent “${a.agent}”` : html`from “${a.chatTitle || "chat"}”`}${a.files ? ` · ${a.files} file${a.files > 1 ? "s" : ""}` : ""}${a.memory ? " · included Memory" : ""} <span class="faint">(${a.approval === "chat" ? "approved for this chat" : a.approval === "agent run" ? "approved for the run" : "you approved"})</span></span>`;
  if (a.kind === "download") return html`<span>Downloaded <b class="ink">${a.what}</b> from ${a.host}${a.bytes ? ` · ${fmtBytes(a.bytes)}` : ""}</span>`;
  if (a.kind === "search") return html`<span>${a.what} on ${a.host}</span>`;
  if (a.kind === "cloud-list") return html`<span><b class="ink">${a.providerName}</b> · ${a.what}</span>`;
  return html`<span>${a.what || a.kind}</span>`;
}

function Privacy() {
  const s = S.app.settings;
  const [act, setAct] = useState(null);
  const load = async () => setAct(await tryCall("activity.list"));
  useEffect(() => { load(); }, [S.activityTick]);
  const opt = (v, t, d) => html`<label class=${"radio" + (s.cloud.requests === v ? " on" : "")}><input type="radio" name="cloudreq" checked=${s.cloud.requests === v} onChange=${() => update({ cloud: { requests: v } })} /><div><b>${t}</b><span>${d}</span></div></label>`;
  const cloudCount = (act || []).filter((a) => a.kind === "cloud").length;
  return html`
    <div class="card">
      <div class="label" style=${{ marginBottom: "10px" }}>Cloud requests</div>
      <div class="radio-row">
        ${opt("ask", "Ask me every time", "Before each request, pleeply shows the provider and exactly what will be sent, and waits for your yes.")}
        ${opt("chat", "Ask once per chat", "Ask the first time a chat uses a provider, then remember your answer for that chat only.")}
        ${opt("off", "Off — switch cloud off completely", "Cloud models can't be used at all. Local models keep working.")}
      </div>
    </div>
    <div class="list" style=${{ marginTop: "12px" }}>
      <${Setting} t="Share Memory with cloud models" d="Off by default: what pleeply remembers about you stays on this computer even when you use a cloud model.">
        <${Toggle} label="Share Memory with cloud models" on=${s.cloud.shareMemory} onChange=${(v) => update({ cloud: { shareMemory: v } })} />
      </${Setting}>
      <${Setting} t="Keep chat history" d="When off, chats live only until you quit pleeply and are never written to disk.">
        <${Toggle} label="Keep chat history" on=${s.history.keep} onChange=${async (v) => { await update({ history: { keep: v } }); refreshChats(); }} />
      </${Setting}>
    </div>
    <div class="sec">
      <div class="sec-head"><h2>Network activity</h2><p>Everything pleeply sent from this computer: cloud requests, model downloads and searches. ${act ? `${cloudCount} cloud request${cloudCount === 1 ? "" : "s"} logged.` : ""}</p><span class="spacer"></span>
        <button class="btn btn-ghost btn-sm" disabled=${!act?.length} onClick=${async () => { if (confirm("Clear the activity log?")) { await tryCall("activity.clear"); load(); } }}>Clear log</button></div>
      <div class="list act-list">
        ${!act ? html`<div class="act muted">Loading…</div>` : act.length ? act.slice(0, 200).map((a) => html`<div class="act"><span class="when">${when(a.at)}</span><${Icon} name=${ACT_ICON[a.kind] || "i-info"} cls="sm" />${actText(a)}</div>`)
          : html`<div class="act"><span></span><${Icon} name="i-lock" cls="sm" /><span>Nothing has left this computer yet.</span></div>`}
      </div>
    </div>
    <div class="card" style=${{ marginTop: "14px" }}>
      <b class="ink">The honest part</b>
      <p class="muted" style=${{ marginTop: "6px" }}>When you choose a cloud model, your request is processed on that provider's servers under their privacy policy. pleeply can't make cloud processing private. It can make sure you always know when it happens.</p>
    </div>`;
}

function ModelSettings() {
  const s = S.app.settings;
  const models = S.models;
  useEffect(() => { if (!models) refreshModels(); }, []);
  if (!models) return html`<p class="muted">Loading…</p>`;
  const usable = models.local.filter((m) => m.fit.level !== "too-large");
  return html`<div class="list">
    <${Setting} t="Model on this computer" d="Used in Local mode and by Auto. Best fit picks a model for each message: a small one for quick questions, a larger one for writing and documents.">
      <select class="select" style=${{ width: "260px" }} value=${s.models.defaultLocal || ""} onChange=${(e) => update({ models: { defaultLocal: e.target.value || null } })}>
        <option value="">Best fit for each message</option>
        ${usable.map((m) => html`<option value=${m.ref}>${m.label}${m.engine !== "pleeply" ? ` · ${m.engine}` : ""}</option>`)}
      </select>
    </${Setting}>
    <${Setting} t="Default cloud model" d="Used in Cloud mode and suggested by Auto. It still asks before sending.">
      <select class="select" style=${{ width: "260px" }} value=${s.cloud.defaultModel || ""} disabled=${!models.cloud.length} onChange=${(e) => update({ cloud: { defaultModel: e.target.value || null } })}>
        <option value="">${models.cloud.length ? "Automatic" : "No cloud models"}</option>
        ${models.cloud.map((m) => html`<option value=${m.ref}>${m.label} · ${m.provider === "pleeply" ? `${m.vendor} via pleeply Cloud` : m.providerName}</option>`)}
      </select>
    </${Setting}>
  </div>`;
}

function ProviderRow({ p }) {
  const st = S.app.keys[p.id] || {};
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    const r = await tryCall("providers.setKey", { id: p.id, key });
    setBusy(false);
    if (!r) return;
    setKey("");
    toast(r.warning ? `Saved, but listing models failed: ${r.warning}` : `${p.name} connected · ${r.models} models.${r.persisted ? "" : " The key is kept only until you quit (system encryption isn't available)."}`, r.warning ? "err" : "info");
    await refreshState(); refreshModels();
  };
  const remove = async () => {
    if (!confirm(`Disconnect ${p.name}? The key is deleted from this computer.`)) return;
    await tryCall("providers.removeKey", p.id);
    await refreshState(); refreshModels();
  };
  return html`<div class="li" style=${{ flexWrap: "wrap" }}>
    <span class=${"dot" + (st.connected ? "" : " off")}></span>
    <div class="grow"><div class="name">${p.name} <span class="muted" style=${{ fontWeight: 400 }}>· ${p.product}</span></div>
      <div class="sub">${st.connected ? `Connected · key ending ${st.last4}${st.sessionOnly ? " · this session only" : ""}` : "Not connected"} · <a onClick=${() => call("shell.open", p.policy)}>Privacy policy ↗</a></div></div>
    ${st.connected ? html`<button class="btn btn-ghost btn-sm" onClick=${remove}>Disconnect</button>`
      : html`<div class="key-row" style=${{ margin: 0 }}>
        <input class="input" type="password" autocomplete="off" spellcheck="false" style=${{ width: "220px" }} placeholder=${p.keyHint} value=${key} onInput=${(e) => setKey(e.target.value)} aria-label=${`${p.name} API key`} />
        <button class="btn btn-line btn-sm" disabled=${busy || key.trim().length < 8} onClick=${save}>${busy ? "Checking…" : "Save"}</button>
        <a class="hint" onClick=${() => call("shell.open", p.keyUrl)}>Get a key ↗</a>
      </div>`}
  </div>`;
}

function Providers() {
  const s = S.app.settings;
  const n = (S.models?.cloud || []).filter((m) => m.provider === "pleeply").length;
  const lim = S.app.cloudLimits;
  useEffect(() => { if (!S.models) refreshModels(); }, []);
  return html`<div class="list">
      <${Setting} t="pleeply Cloud" d=${`GPT, Claude, Gemini and DeepSeek without your own key${n ? ` · ${n} models now` : ""}${lim ? ` · ${lim.free_per_day} free and ${lim.premium_per_day} premium requests a day` : ""}. Requests go through pleeply's server to the model's maker; pleeply doesn't keep the text.`}>
        <${Toggle} label="pleeply Cloud" on=${s.cloud.pleeplyCloud} onChange=${async (v) => { await update({ cloud: { pleeplyCloud: v } }); setTimeout(refreshModels, 1500); }} />
      </${Setting}>
    </div>
    <p class="muted" style=${{ margin: "16px 0 12px" }}>Or connect your own key to use a provider directly. Keys are encrypted with your system's keychain and never shown again. Requests go straight from this computer to the provider.</p>
    <div class="list">${S.app.providers.filter((p) => !p.builtIn && (p.id !== "testcloud" || S.app.keys.testcloud)).map((p) => html`<${ProviderRow} p=${p} key=${p.id} />`)}</div>`;
}

function IntegrationRow({ id, name, d }) {
  const s = S.app.settings;
  const [url, setUrl] = useState(s.models[id].url);
  return html`<div class="setting"><div class="grow"><div class="t">${name}</div><div class="d">${d}</div>
    <div class="row" style=${{ marginTop: "8px" }}><input class="input" style=${{ width: "260px" }} value=${url} onInput=${(e) => setUrl(e.target.value)} onBlur=${async () => { if (url !== s.models[id].url) { const r = await update({ models: { [id]: { url } } }); if (r && r.models[id].url !== url.trim().replace(/\/+$/, "")) { setUrl(r.models[id].url); toast("Only addresses on this computer are allowed.", "err"); } } }} aria-label=${`${name} address`} /><span class="hint">Only addresses on this computer are allowed.</span></div></div>
    <div class="ctl"><${Toggle} label=${name} on=${s.models[id].enabled} onChange=${(v) => update({ models: { [id]: { enabled: v } } })} /></div></div>`;
}

function Integrations() {
  const Row = IntegrationRow;
  return html`<div class="list">
    <${Row} id="ollama" name="Ollama" d="Use models you've pulled with Ollama. They run locally through Ollama." />
    <${Row} id="lmstudio" name="LM Studio" d="Use models served by LM Studio's local server." />
  </div>`;
}

function Storage() {
  const [u, setU] = useState(null);
  useEffect(() => { tryCall("data.usage").then(setU); }, []);
  const wipe = async (opts, what) => {
    if (!confirm(`Delete ${what}? This can't be undone.`)) return;
    await tryCall("data.delete", opts);
    toast(`Deleted ${what}.`);
    set({ chat: null });
    refreshChats();
    setU(await tryCall("data.usage"));
  };
  return html`<div class="card">
    <div class="kv">
      <span>Your data</span><b>${u ? fmtBytes(u.dataBytes) : "…"} <span class="muted" style=${{ fontWeight: 400 }}>chats, files, memory, agents</span></b>
      <span>Models</span><b>${u ? fmtBytes(u.modelsBytes) : "…"}</b>
      <span>Data folder</span><b class="sel mono" style=${{ fontSize: "12px" }}>${S.app.dataDir}</b>
    </div>
    <div class="row" style=${{ marginTop: "14px" }}><button class="btn btn-line btn-sm" onClick=${() => call("data.openFolder")}><${Icon} name="i-folder" />Open data folder</button></div>
  </div>
  <div class="list" style=${{ marginTop: "12px" }}>
    <${Setting} t="Delete all chats" d="Conversations and the files you attached to them."><button class="btn btn-danger btn-sm" onClick=${() => wipe({ chats: true, memory: false, agents: false, activity: false }, "all chats")}>Delete</button></${Setting}>
    <${Setting} t="Delete everything" d="Chats, Memory, agents, notes, the activity log and cloud keys. Downloaded models stay; remove them in Models."><button class="btn btn-danger btn-sm" onClick=${() => wipe({ chats: true, memory: true, agents: true, activity: true, keys: true }, "all pleeply data")}>Delete everything</button></${Setting}>
  </div>
  <p class="hint" style=${{ marginTop: "12px" }}>pleeply Desktop ${S.app.version} · in development. Plans, features and prices can change.</p>`;
}

export function ControlView() {
  const sec = S.ccSection || "computer";
  const body = { account: AccountSection, computer: Computer, performance: Performance, privacy: Privacy, modelsettings: ModelSettings, providers: Providers, integrations: Integrations, storage: Storage }[sec];
  const title = SECTIONS.find(([id]) => id === sec)?.[1];
  return html`<div class="page">
    <header class="topbar drag"><${TopLead} /><span class="title">Control Center</span></header>
    <div class="scroll"><div class="page-body">
      <div class="page-head"><div><h1>pleeply Control Center</h1><p>Manage hardware, performance, privacy and model settings in one place.</p></div></div>
      <div class="cc-grid">
        <nav class="cc-nav" aria-label="Control Center sections">${SECTIONS.map(([id, label]) => html`<button class=${sec === id ? "on" : ""} onClick=${() => set({ ccSection: id })}>${label}</button>`)}</nav>
        <div><div class="sec-head"><h2>${title}</h2></div><${body} /></div>
      </div>
    </div></div>
  </div>`;
}
