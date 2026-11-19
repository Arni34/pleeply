// pleeply Models: найти, скачать и управлять локальными и облачными моделями. Каждая проверяется по железу до скачивания.
import { html, S, set, call, tryCall, toast, useState, useEffect, Icon, FitBadge, fmtBytes, fmtNum, ago, refreshModels, go } from "./ui.js";

function DownloadCell({ m }) {
  const d = m.downloading;
  if (m.installed) return html`<span class="badge local"><${Icon} name="i-check" cls="xs" />Installed</span>`;
  if (d) {
    const live = S.downloads[d.id] || d;
    const pct = live.total ? Math.round((live.done / live.total) * 100) : 0;
    return html`<div class="row" style=${{ gap: "8px" }}>
      <div class="progress" title=${`${fmtBytes(live.done)} of ${fmtBytes(live.total)}`}><i style=${{ width: pct + "%" }}></i></div>
      <span class="mono muted" style=${{ fontSize: "11.5px", width: "34px" }}>${pct}%</span>
      <button class="icon-btn" title="Cancel download" onClick=${() => tryCall("models.cancel", d.id)}><${Icon} name="i-x" cls="sm" /></button>
    </div>`;
  }
  const tooBig = m.fit.level === "too-large";
  return html`<button class="btn btn-line btn-sm" disabled=${tooBig} title=${tooBig ? m.fit.reason : `Download ${fmtBytes(m.bytes)} from Hugging Face`}
    onClick=${async () => { const r = await tryCall("models.download", { catalogId: m.id }); if (r) { toast(`Downloading ${m.label}.`); refreshModels(); } }}>
    <${Icon} name="i-download" />Download</button>`;
}

function Catalog() {
  const models = S.models;
  const [showAll, setShowAll] = useState(false);
  const rec = new Set(models.recommendation.modelIds);
  const list = models.catalog.filter((m) => showAll || m.fit.level !== "too-large" || m.installed);
  const hidden = models.catalog.length - list.length;
  return html`
    <div class="banner"><${Icon} name="i-cpu" /><div class="grow">${models.recommendation.text} <span class="muted">Sizes and fit are checked against this computer before you download. Memory for models: ${models.budget.limitGB} GB${models.budget.custom ? " (your limit)" : " (auto)"}.</span></div></div>
    <div class="list" style=${{ marginTop: "14px" }}>
      ${list.map((m) => html`<div class=${"li" + (m.fit.level === "too-large" ? " dim" : "")}>
        <div class="grow">
          <div class="row" style=${{ gap: "8px" }}><span class="name">${m.label}</span>${rec.has(m.id) ? html`<span class="badge local">Recommended</span>` : null}${m.tags.filter((t) => !["tiny", "fast"].includes(t)).slice(0, 2).map((t) => html`<span class="badge">${t.replace("-", " ")}</span>`)}</div>
          <div class="sub">${fmtBytes(m.bytes)} · ${m.quant} · ${fmtNum(m.ctx)} context · ${m.fit.reason}</div>
        </div>
        <div class="side-r"><${FitBadge} fit=${m.fit} /><${DownloadCell} m=${m} /></div>
      </div>`)}
    </div>
    ${hidden ? html`<button class="btn btn-ghost btn-sm" style=${{ marginTop: "10px" }} onClick=${() => setShowAll(true)}>Show ${hidden} model${hidden > 1 ? "s" : ""} too large for this computer</button>` : null}
    <p class="hint" style=${{ marginTop: "12px" }}>Open models in GGUF format from Hugging Face (Q4_K_M), checked ${S.app.catalogChecked}. Each license is set by the model's author.</p>`;
}

function Installed() {
  const models = S.models;
  const presetsFor = (ref) => models.presets.filter((p) => p.local?.ref === ref).map((p) => p.name.replace("pleeply ", ""));
  const del = async (m) => {
    if (!confirm(`Delete ${m.label}? This frees ${fmtBytes(m.bytes)}. You can download it again later.`)) return;
    if (await tryCall("models.delete", m.ref)) { toast(`${m.label} deleted.`); refreshModels(); }
  };
  const use = (m) => { set({ mode: "local", selection: { type: "model", ref: m.ref }, view: "chat" }); call("settings.update", { mode: "local" }); };
  return html`
    ${models.local.length ? html`<div class="list">
      ${models.local.map((m) => html`<div class="li">
        <${Icon} name="i-cpu" />
        <div class="grow">
          <div class="row" style=${{ gap: "8px" }}><span class="name">${m.label}</span><span class="badge solid">${m.engine}</span>${presetsFor(m.ref).map((p) => html`<span class="badge local">${p}</span>`)}</div>
          <div class="sub">${m.bytes ? fmtBytes(m.bytes) : "Size managed by " + m.engine}${m.stats?.tokPerSec ? ` · ${m.stats.tokPerSec} tokens/s measured on this computer` : ""}${S.engine.loaded === m.ref ? " · loaded now" : ""}</div>
        </div>
        <div class="side-r">
          <${FitBadge} fit=${m.fit} />
          <button class="btn btn-line btn-sm" onClick=${() => use(m)}>Use in chat</button>
          ${m.backend === "pleeply" ? html`<button class="icon-btn" title="Delete model" onClick=${() => del(m)}><${Icon} name="i-trash" cls="sm" /></button>` : null}
        </div>
      </div>`)}
    </div>` : html`<div class="card empty"><h3>No local models yet</h3><p>Download one from “For this computer”. pleeply checks which ones fit before you download.</p></div>`}
    <div class="sec">
      <div class="sec-head"><h2>Other apps on this computer</h2><p>Models you already have in Ollama or LM Studio work here too, and still run locally.</p></div>
      <div class="list">
        <div class="li"><span class=${"dot" + (models.ollama ? "" : " off")}></span><div class="grow"><div class="name">Ollama</div><div class="sub">${!S.app.settings.models.ollama.enabled ? "Turned off in Control Center" : models.ollama ? `Running at ${S.app.settings.models.ollama.url} · ${models.local.filter((m) => m.backend === "ollama").length} models` : "Not running. Open Ollama to use its models here."}</div></div></div>
        <div class="li"><span class=${"dot" + (models.lmstudio ? "" : " off")}></span><div class="grow"><div class="name">LM Studio</div><div class="sub">${!S.app.settings.models.lmstudio.enabled ? "Turned off in Control Center" : models.lmstudio ? `Server running at ${S.app.settings.models.lmstudio.url} · ${models.local.filter((m) => m.backend === "lmstudio").length} models` : "Server not running. Start the local server in LM Studio to use its models."}</div></div></div>
      </div>
    </div>
    <div class="sec">
      <div class="sec-head"><h2>Storage</h2></div>
      <div class="card row">
        <${Icon} name="i-folder" />
        <div class="grow"><div class="ink sel mono" style=${{ fontSize: "12px" }}>${models.modelsDir}</div><div class="hint">${models.diskFreeBytes != null ? `${fmtBytes(models.diskFreeBytes)} free on this disk` : ""}</div></div>
        <button class="btn btn-line btn-sm" onClick=${() => call("models.openFolder")}>Open folder</button>
        <button class="btn btn-ghost btn-sm" onClick=${async () => { const d = await tryCall("models.chooseFolder"); if (d) { toast("Models folder changed."); refreshModels(); } }}>Change…</button>
      </div>
    </div>`;
}

function Discover() {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState(null);
  const [repo, setRepo] = useState(null);
  const [files, setFiles] = useState(null);
  const search = async (e) => {
    e?.preventDefault();
    if (!q.trim()) return;
    setBusy(true); setRepo(null); setFiles(null);
    setResults(await tryCall("models.search", q));
    setBusy(false);
  };
  const open = async (r) => {
    setRepo(r.repo); setFiles(null);
    setFiles(await tryCall("models.files", r.repo));
  };
  const download = async (f) => {
    const res = await tryCall("models.download", { uri: f.uri, label: `${repo.split("/")[1].replace(/-GGUF$/i, "")} · ${f.quant || "GGUF"}` });
    if (res) { toast("Download started. It will appear in Installed."); refreshModels(); }
  };
  return html`
    <form class="row" onSubmit=${search}>
      <input class="input grow" placeholder="Search GGUF models on Hugging Face, e.g. qwen, llama, mistral" value=${q} onInput=${(e) => setQ(e.target.value)} />
      <button class="btn btn-primary" disabled=${busy || !q.trim()}><${Icon} name="i-search" />Search</button>
    </form>
    <p class="hint" style=${{ marginTop: "8px" }}>Search runs on huggingface.co and only sends what you type here. Your chats are never sent. It is logged in Control Center → Privacy.</p>
    ${repo ? html`<div class="sec">
      <div class="row" style=${{ marginBottom: "10px" }}><button class="btn btn-ghost btn-sm" onClick=${() => setRepo(null)}>← Results</button><h3 class="ellipsis">${repo}</h3><span class="spacer"></span><a onClick=${() => call("shell.open", `https://huggingface.co/${repo}`)}>Model card ↗</a></div>
      ${!files ? html`<p class="muted">Reading files…</p>` : !files.length ? html`<p class="muted">No GGUF files in this repository.</p>` : html`<div class="list">
        ${files.map((f) => html`<div class=${"li" + (f.fit.level === "too-large" ? " dim" : "")}>
          <div class="grow"><div class="name mono" style=${{ fontSize: "12.5px" }}>${f.file.split("/").pop()}</div><div class="sub">${fmtBytes(f.bytes)}${f.parts > 1 ? ` · ${f.parts} parts` : ""} · ${f.fit.reason}</div></div>
          <div class="side-r"><span class="badge">${f.quant || "GGUF"}</span><${FitBadge} fit=${f.fit} />
            <button class="btn btn-line btn-sm" disabled=${f.fit.level === "too-large"} onClick=${() => download(f)}><${Icon} name="i-download" />Download</button></div>
        </div>`)}
      </div>`}
      <p class="hint" style=${{ marginTop: "10px" }}>Models from Discover aren't reviewed by pleeply. Check the license and the model card before using one.</p>
    </div>` : results ? html`<div class="list" style=${{ marginTop: "14px" }}>
      ${results.length ? results.map((r) => html`<button class="li" style=${{ textAlign: "left", width: "100%" }} onClick=${() => open(r)}>
        <div class="grow"><div class="name">${r.repo}</div><div class="sub">${fmtNum(r.downloads)} downloads · ${fmtNum(r.likes)} likes${r.updated ? " · updated " + ago(r.updated) : ""}</div></div>
        <${Icon} name="i-right" />
      </button>`) : html`<div class="li muted">Nothing found.</div>`}
    </div>` : null}`;
}

function Cloud() {
  const models = S.models;
  const keys = S.app.keys;
  const connected = S.app.providers.filter((p) => keys[p.id]?.connected);
  const setDefault = async (ref) => { await tryCall("settings.update", { cloud: { defaultModel: ref } }); toast("Default cloud model updated."); };
  return html`
    <div class="banner grey"><${Icon} name="i-cloud" /><div class="grow">Cloud models are an add-on, never a requirement. They run on the provider's servers under their privacy policy, and pleeply asks before every request${S.app.settings.cloud.requests === "chat" ? " (once per chat)" : ""}.</div>
      <button class="btn btn-line btn-sm" onClick=${() => go("control", { ccSection: "providers" })}>Manage providers</button></div>
    ${connected.length ? connected.map((p) => {
      const list = models.cloud.filter((m) => m.provider === p.id);
      return html`<div class="sec">
        <div class="sec-head"><h2>${p.name}</h2><p>${list.length} models${models.cloudFetched[p.id] ? ` · listed ${ago(models.cloudFetched[p.id])}` : ""}</p><span class="spacer"></span>
          <button class="btn btn-ghost btn-sm" onClick=${async () => { const r = await tryCall("providers.refresh", p.id); if (r) { toast(`Found ${r.length} models.`); refreshModels(); } }}><${Icon} name="i-refresh" />Refresh list</button></div>
        <div class="list">${list.slice(0, 60).map((m) => html`<div class="li">
          <${Icon} name="i-cloud" /><div class="grow"><div class="name">${m.label}</div><div class="sub mono">${m.id}${m.ctx ? ` · ${fmtNum(m.ctx)} context` : ""}</div></div>
          <div class="side-r">${S.app.settings.cloud.defaultModel === m.ref ? html`<span class="badge local">Default</span>` : html`<button class="btn btn-ghost btn-sm" onClick=${() => setDefault(m.ref)}>Make default</button>`}</div>
        </div>`)}${list.length > 60 ? html`<div class="li muted">…and ${list.length - 60} more. Use search in the chat model menu.</div>` : null}</div>
      </div>`;
    }) : html`<div class="card empty" style=${{ marginTop: "14px" }}><h3>No cloud provider connected</h3><p>Local mode works without one. Add your own API key for Anthropic, OpenAI, Google, Groq, OpenRouter or Mistral when you need more power.</p>
      <button class="btn btn-primary" style=${{ marginTop: "14px" }} onClick=${() => go("control", { ccSection: "providers" })}>Connect a provider</button></div>`}`;
}

export function ModelsView() {
  const [tab, setTab] = useState("catalog");
  useEffect(() => { refreshModels(); }, []);
  const models = S.models;
  const tabs = [["catalog", "For this computer"], ["installed", `Installed${models ? ` (${models.local.length})` : ""}`], ["discover", "Discover"], ["cloud", `Cloud${models ? ` (${models.cloud.length})` : ""}`]];
  return html`<div class="page">
    <header class="topbar drag"><span class="title">Models</span></header>
    <div class="scroll"><div class="page-body">
      <div class="page-head"><div class="grow"><h1>pleeply Models</h1><p>Discover, download and manage local and cloud models. Each one is checked against your hardware before you download it.</p></div>
        <button class="btn btn-ghost btn-sm" onClick=${() => refreshModels()}><${Icon} name="i-refresh" />Refresh</button></div>
      <div class="tabs" role="tablist">${tabs.map(([id, label]) => html`<button role="tab" aria-selected=${tab === id} class=${tab === id ? "on" : ""} onClick=${() => setTab(id)}>${label}</button>`)}</div>
      ${!models ? html`<p class="muted">Checking this computer…</p>` : tab === "catalog" ? html`<${Catalog} />` : tab === "installed" ? html`<${Installed} />` : tab === "discover" ? html`<${Discover} />` : html`<${Cloud} />`}
    </div></div>
  </div>`;
}
