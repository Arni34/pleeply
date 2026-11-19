// pleeply Agents: агенты для исследований, продуктивности и автоматизации, с проверкой перед каждым важным шагом.
import { html, S, set, call, tryCall, toast, useState, useEffect, Icon, Markdown, Seg, fmtNum, ago, when, refreshModels, go } from "./ui.js";

const TOOL_ICON = { list_files: "i-folder", read_file: "i-file", search_files: "i-search", fetch_url: "i-globe", write_note: "i-note", write_file: "i-edit", draft_email: "i-mail", remember: "i-memory", finish: "i-flag" };
const STATUS = { running: "Running", waiting: "Waiting for you", done: "Done", failed: "Failed", stopped: "Stopped" };

export async function refreshAgents() {
  const agents = await tryCall("agents.list");
  if (agents) set({ agents });
}

function Approval({ run, step }) {
  const [args, setArgs] = useState(step.args);
  const field = (k, label, multi) => html`<div class="field"><span class="label">${label}</span>
    ${multi ? html`<textarea class="textarea" rows="6" value=${args[k]} onInput=${(e) => setArgs({ ...args, [k]: e.target.value })}></textarea>`
      : html`<input class="input" value=${args[k]} onInput=${(e) => setArgs({ ...args, [k]: e.target.value })} />`}</div>`;
  const decide = async (approved) => {
    await tryCall("agents.approve", { runId: run.id, stepId: step.id, approved, args });
  };
  const titles = {
    fetch_url: "Open this web page? pleeply downloads its text for the agent.",
    write_file: `Write this file in “${(run.folder || "").split(/[\\/]/).pop()}”? You can edit it first.`,
    draft_email: "Open this draft in your mail app? It is never sent automatically.",
    remember: "Add this to pleeply Memory?",
  };
  return html`<div class="approve">
    <div class="ttl">${titles[step.tool] || "Approve this step?"}</div>
    ${step.tool === "fetch_url" ? field("url", "Address") : null}
    ${step.tool === "write_file" ? html`${field("path", "File")}${field("content", "Content", true)}` : null}
    ${step.tool === "draft_email" ? html`${field("to", "To")}${field("subject", "Subject")}${field("body", "Body", true)}` : null}
    ${step.tool === "remember" ? field("fact", "Memory") : null}
    <div class="row"><button class="btn btn-green btn-sm" onClick=${() => decide(true)}><${Icon} name="i-check" />Approve</button><button class="btn btn-ghost btn-sm" onClick=${() => decide(false)}>Skip this step</button></div>
  </div>`;
}

function argSummary(step) {
  const a = step.args || {};
  return a.path || a.query || a.url || a.title || a.subject || a.fact || "";
}

function RunView({ run }) {
  const live = S.runs[run.id] || run;
  const running = ["running"].includes(live.status);
  return html`<div class="card">
    <div class="row">
      <span class=${"badge" + (live.status === "done" ? " good" : live.status === "running" ? " fast" : "")}>${live.steps.some((s) => s.status === "waiting") ? STATUS.waiting : STATUS[live.status] || live.status}</span>
      <span class="muted" style=${{ fontSize: "12.5px" }}>${live.where === "cloud" ? html`<${Icon} name="i-cloud" cls="xs" /> ${live.model} · ${live.providerName}` : html`<${Icon} name="i-cpu" cls="xs" /> ${live.model} · this computer`} · started ${when(live.startedAt)}</span>
      <span class="spacer"></span>
      ${running ? html`<button class="btn btn-line btn-sm" onClick=${() => tryCall("agents.stop", live.id)}><${Icon} name="i-stop" />Stop</button>` : null}
    </div>
    <div class="steps" style=${{ marginTop: "14px" }}>
      ${live.steps.map((st) => html`<div class=${"step " + st.status}>
        <div class="step-ic"><${Icon} name=${TOOL_ICON[st.tool] || "i-auto"} cls="sm" /></div>
        <div class="step-b">
          <div class="step-t">${st.status === "thinking" ? html`<span class="shimmer">Deciding the next step…</span>` : html`${st.label || st.tool}${argSummary(st) ? html`<span class="muted mono ellipsis" style=${{ fontWeight: 400, fontSize: "12px" }}>${argSummary(st)}</span>` : null}`}
            ${st.status === "declined" ? html`<span class="badge">Skipped</span>` : st.status === "error" ? html`<span class="badge">Error</span>` : st.status === "running" ? html`<span class="badge fast">Running</span>` : null}</div>
          ${st.thought ? html`<div class="step-d">${st.thought}</div>` : null}
          ${st.status === "waiting" ? html`<${Approval} run=${live} step=${st} />` : null}
          ${st.result && st.tool !== "finish" ? html`<details class="step-r"><summary>Result</summary><pre>${st.result}</pre></details>` : null}
        </div>
      </div>`)}
    </div>
    ${live.error ? html`<div class="notice err">${live.error}</div>` : null}
    ${live.output ? html`<div class="output"><div class="label" style=${{ marginBottom: "8px" }}>Result</div><${Markdown} text=${live.output} />
      <div class="row" style=${{ marginTop: "10px" }}><button class="btn btn-line btn-sm" onClick=${() => { call("shell.copy", live.output); toast("Copied."); }}><${Icon} name="i-copy" />Copy</button></div></div>` : null}
  </div>`;
}

function Editor({ agent, onSaved, onDeleted }) {
  const tools = S.app.tools;
  const [a, setA] = useState(agent);
  useEffect(() => setA(agent), [agent.id]);
  const models = S.models;
  const local = (models?.local || []).filter((m) => m.fit.level !== "too-large");
  const cloud = models?.cloud || [];
  const toggleTool = (t) => setA({ ...a, tools: a.tools.includes(t) ? a.tools.filter((x) => x !== t) : [...a.tools, t] });
  const save = async () => {
    const saved = await tryCall("agents.save", a);
    if (saved) { onSaved(saved); toast("Agent saved."); }
    return saved;
  };
  const run = async () => {
    const saved = await save();
    if (!saved) return;
    const r = await tryCall("agents.run", saved.id);
    if (r?.declined) toast("Not started: you declined sending to the cloud.");
    else if (r?.runId) onSaved(saved, r.runId);
  };
  const pickFolder = async () => { const f = await tryCall("agents.pickFolder"); if (f) setA({ ...a, folder: f }); };
  const del = async () => { if (confirm(`Delete the agent “${a.name}”?`)) { await tryCall("agents.delete", a.id); onDeleted(); } };
  return html`<div class="card col" style=${{ gap: "14px" }}>
    <div class="field"><span class="label">Name</span><input class="input" value=${a.name} onInput=${(e) => setA({ ...a, name: e.target.value })} placeholder="Research digest" /></div>
    <div class="field"><span class="label">Goal</span><textarea class="textarea" rows="4" value=${a.goal} onInput=${(e) => setA({ ...a, goal: e.target.value })} placeholder="What should this agent do?"></textarea></div>
    <div class="field"><span class="label">Shared folder</span>
      <div class="row"><${Icon} name="i-folder" /><span class=${"grow ellipsis mono " + (a.folder ? "ink" : "muted")} style=${{ fontSize: "12px" }}>${a.folder || "No folder: the agent can't see any of your files"}</span>
        <button class="btn btn-line btn-sm" onClick=${pickFolder}>Choose…</button>${a.folder ? html`<button class="btn btn-ghost btn-sm" onClick=${() => setA({ ...a, folder: null })}>Remove</button>` : null}</div>
      <span class="hint">The agent can only read and write inside this folder.</span></div>
    <div class="field"><span class="label">Tools</span>
      <div class="tools-grid">${Object.entries(tools).filter(([k]) => k !== "finish").map(([k, t]) => html`<label class="tool-opt" title=${t.help}>
        <input type="checkbox" checked=${a.tools.includes(k)} onChange=${() => toggleTool(k)} /><${Icon} name=${TOOL_ICON[k]} cls="sm" />${t.label}${t.matters ? html`<span class="badge asks">asks first</span>` : null}</label>`)}</div></div>
    <div class="row wrap" style=${{ gap: "14px" }}>
      <div class="field"><span class="label">Runs</span>
        <${Seg} label="Where the agent runs" value=${a.mode} onChange=${(mode) => setA({ ...a, mode, modelRef: null })} options=${[{ value: "local", label: "Local", icon: "i-cpu" }, { value: "cloud", label: "Cloud", icon: "i-cloud" }, { value: "auto", label: "Auto", icon: "i-auto" }]} /></div>
      <div class="field grow"><span class="label">Model</span>
        <select class="select" value=${a.modelRef || ""} onChange=${(e) => setA({ ...a, modelRef: e.target.value || null })}>
          <option value="">pleeply Orbit · best fit</option>
          ${a.mode !== "cloud" ? local.map((m) => html`<option value=${m.ref}>${m.label} · this computer</option>`) : null}
          ${a.mode !== "local" ? cloud.map((m) => html`<option value=${m.ref}>${m.label} · ${m.providerName}</option>`) : null}
        </select></div>
    </div>
    ${a.mode !== "local" ? html`<p class="hint">In Cloud mode the goal and everything the agent reads go to the provider at every step. pleeply asks before the run starts.</p>` : null}
    <div class="row"><button class="btn btn-primary" onClick=${run}><${Icon} name="i-play" />Run</button><button class="btn btn-line" onClick=${save}>Save</button><span class="spacer"></span>${a.id ? html`<button class="btn btn-ghost btn-sm" onClick=${del}><${Icon} name="i-trash" />Delete</button>` : null}</div>
  </div>`;
}

function Notes() {
  const [notes, setNotes] = useState(null);
  const [open, setOpen] = useState(null);
  const load = async () => setNotes(await tryCall("notes.list"));
  useEffect(() => { load(); }, [S.notesTick]);
  if (!notes?.length) return null;
  return html`<div class="sec"><div class="sec-head"><h2>Notes from agents</h2><p>Saved inside pleeply on this computer.</p></div>
    <div class="list">${notes.map((n) => html`<div>
      <div class="li"><${Icon} name="i-note" /><button class="grow" style=${{ textAlign: "left" }} onClick=${() => setOpen(open === n.id ? null : n.id)}><div class="name">${n.title}</div><div class="sub">${n.agentName} · ${ago(n.createdAt)}</div></button>
        <button class="icon-btn" title="Copy" onClick=${() => { call("shell.copy", n.content); toast("Copied."); }}><${Icon} name="i-copy" cls="sm" /></button>
        <button class="icon-btn" title="Delete note" onClick=${async () => { await tryCall("notes.delete", n.id); load(); }}><${Icon} name="i-trash" cls="sm" /></button></div>
      ${open === n.id ? html`<div style=${{ padding: "0 16px 16px 48px" }}><${Markdown} text=${n.content} /></div>` : null}
    </div>`)}</div></div>`;
}

export function AgentsView() {
  const [selId, setSelId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [runs, setRuns] = useState([]);
  const [runId, setRunId] = useState(null);
  useEffect(() => { refreshAgents(); refreshModels(); }, []);
  const agents = S.agents || [];
  const sel = draft || agents.find((x) => x.id === selId) || null;
  const loadRuns = async (agentId, preferRun) => {
    const r = (await tryCall("agents.runs", agentId)) || [];
    setRuns(r);
    setRunId(preferRun || r[0]?.id || null);
  };
  useEffect(() => { if (sel?.id) loadRuns(sel.id); else { setRuns([]); setRunId(null); } }, [sel?.id]);
  useEffect(() => {
    // новые события по запускам этого агента
    const mine = Object.values(S.runs).filter((r) => r.agentId === sel?.id);
    if (mine.some((r) => !runs.find((x) => x.id === r.id))) loadRuns(sel.id, runId);
  }, [Object.keys(S.runs).length]);
  const fromTemplate = (t) => { setSelId(null); setDraft({ id: null, name: t.name, goal: t.goal, folder: null, tools: t.tools.filter((x) => x !== "finish"), mode: "local", modelRef: null }); };
  const blank = () => fromTemplate({ name: "New agent", goal: "", tools: ["list_files", "read_file", "write_note"] });
  const run = runs.find((r) => r.id === runId);
  return html`<div class="page">
    <header class="topbar drag"><span class="title">Agents</span></header>
    <div class="scroll"><div class="page-body">
      <div class="page-head"><div class="grow"><h1>pleeply Agents</h1><p>Personal AI agents for research, productivity and automation, with a check-in before any step that matters. They work only in the folder you share.</p></div>
        <button class="btn btn-primary" onClick=${blank}><${Icon} name="i-plus" />New agent</button></div>
      <div class="agents-grid">
        <div class="agent-list">
          ${agents.map((x) => html`<button class=${"agent-item" + (sel?.id === x.id ? " on" : "")} onClick=${() => { setDraft(null); setSelId(x.id); }}>
            <div class="n">${x.name}</div><div class="s">${x.lastRun ? `${STATUS[x.lastRun.status] || x.lastRun.status} · ${ago(x.lastRun.startedAt)}` : "Not run yet"} · ${x.mode === "local" ? "Local" : x.mode === "cloud" ? "Cloud" : "Auto"}</div></button>`)}
          <div class="label" style=${{ margin: "14px 4px 4px" }}>Start from a template</div>
          ${S.app.templates.map((t) => html`<button class="agent-item" onClick=${() => fromTemplate(t)}><div class="n">${t.name}</div><div class="s">${t.goal.split("\n")[0].slice(0, 90)}…</div></button>`)}
        </div>
        <div>
          ${sel ? html`
            <${Editor} agent=${sel} onSaved=${async (saved, newRun) => { setDraft(null); setSelId(saved.id); await refreshAgents(); loadRuns(saved.id, newRun); }} onDeleted=${() => { setSelId(null); setDraft(null); refreshAgents(); }} />
            ${runs.length ? html`<div class="sec">
              <div class="sec-head"><h2>Runs</h2><span class="spacer"></span>
                ${runs.length > 1 ? html`<select class="select" style=${{ width: "220px" }} value=${runId} onChange=${(e) => setRunId(e.target.value)}>${runs.map((r) => html`<option value=${r.id}>${when(r.startedAt)} · ${STATUS[(S.runs[r.id] || r).status]}</option>`)}</select>` : null}</div>
              ${run ? html`<${RunView} run=${run} />` : null}
            </div>` : null}
          ` : html`<div class="card"><h3>What agents can do</h3>
            <p class="muted" style=${{ marginTop: "6px" }}>Pick a template on the left or create your own. An agent plans its steps with pleeply Orbit, reads only the folder you share, and stops to ask before it writes a file, opens a web page, drafts an email or saves to Memory.</p>
            <div class="templates" style=${{ marginTop: "14px" }}>${S.app.templates.map((t) => html`<button class="tpl" onClick=${() => fromTemplate(t)}><b>${t.name}</b><span>${t.goal.split("\n")[0]}</span></button>`)}</div>
          </div>`}
          <${Notes} />
        </div>
      </div>
    </div></div>
  </div>`;
}
