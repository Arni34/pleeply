// pleeply Agents: личные агенты для исследований, продуктивности и автоматизации.
// Агент работает только в папке, которую вы ему дали, и останавливается перед каждым шагом, который важен:
// запись файла, черновик письма, загрузка веб-страницы, запись в Memory.
import { readdir, stat, realpath, mkdir, lstat, open } from "node:fs/promises";
import { constants as FS } from "node:fs";
import dns from "node:dns";
import net from "node:net";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import { extractText, htmlToText, chunkPages, bm25Rank, SUPPORTED_EXT } from "./docs.js";
import { PRESETS } from "./presets.js";
import { uid, truncate, parseJsonLoose, UserError } from "./util.js";

export const TOOLS = {
  list_files: { label: "List files", matters: false, args: ["path"], help: 'List files in the shared folder. args.path: a subfolder, or "" for the top.' },
  read_file: { label: "Read file", matters: false, args: ["path"], help: "Read a text, Markdown, HTML or PDF file from the shared folder. args.path: file path relative to the folder." },
  search_files: { label: "Search files", matters: false, args: ["query"], help: "Search inside all readable files in the shared folder. args.query: words to look for." },
  fetch_url: { label: "Open web page", matters: true, args: ["url"], help: "Download the text of a public web page. args.url: full https:// address. The user approves every page." },
  write_note: { label: "Save note", matters: false, args: ["title", "content"], help: "Save a Markdown note inside pleeply (not in the user's folder). args.title, args.content." },
  write_file: { label: "Write file", matters: true, args: ["path", "content"], help: "Create or replace a text file in the shared folder. args.path, args.content. The user approves first." },
  draft_email: { label: "Draft email", matters: true, args: ["to", "subject", "body"], help: "Prepare an email draft. It is never sent: the user reviews it and opens it in their mail app. args.to (may be empty), args.subject, args.body." },
  remember: { label: "Remember", matters: true, args: ["fact"], help: "Add a short fact about the user to pleeply Memory. args.fact. The user approves first." },
  finish: { label: "Finish", matters: false, args: ["answer"], help: "End the task. args.answer: the final result for the user in Markdown." },
};

export const TEMPLATES = [
  {
    id: "digest", name: "Research digest", needsFolder: true,
    goal: "Read the saved articles in my folder, summarize the key points of each one, and draft an email to me with the digest.",
    tools: ["list_files", "read_file", "search_files", "write_note", "draft_email", "finish"],
  },
  {
    id: "folder-report", name: "Folder report", needsFolder: true,
    goal: "Look through the files in my folder and write a short report: what is there, what looks outdated or duplicated, and what I should do next. Save the report as a note.",
    tools: ["list_files", "read_file", "write_note", "finish"],
  },
  {
    id: "action-items", name: "Notes to action items", needsFolder: true,
    goal: "Read my meeting notes, pull out the decisions and action items with owners and dates, and save a clean summary file named action-items.md next to them.",
    tools: ["list_files", "read_file", "search_files", "write_file", "finish"],
  },
  {
    id: "web-brief", name: "Web research brief", needsFolder: false,
    goal: "Research the topic below using two or three reliable web pages and write a one-page brief with the links you used.\n\nTopic: ",
    tools: ["fetch_url", "write_note", "finish"],
  },
];

export const MAX_STEPS = 14;

/** JSON-схема одного действия: oneOf по разрешённым инструментам (для грамматики локальной модели и format в Ollama). */
export function actionSchema(toolIds) {
  return {
    oneOf: toolIds.map((id) => ({
      type: "object",
      properties: {
        thought: { type: "string" },
        tool: { const: id },
        args: { type: "object", properties: Object.fromEntries(TOOLS[id].args.map((a) => [a, { type: "string" }])) },
      },
    })),
  };
}

export function agentSystemPrompt(agent) {
  const tools = agent.tools.filter((t) => TOOLS[t]);
  if (!tools.includes("finish")) tools.push("finish");
  const list = tools.map((t) => `- ${t}: ${TOOLS[t].help}${TOOLS[t].matters ? " (needs the user's approval)" : ""}`).join("\n");
  return `${PRESETS.orbit.system}

You are running as the agent "${agent.name}". You work step by step. At every step reply with ONE JSON object and nothing else:
{"thought": "why this step", "tool": "<tool name>", "args": { ... }}

Tools:
${list}

Rules:
- ${agent.folder ? `The user shared one folder named "${path.basename(agent.folder)}". Paths are relative to it. You cannot see anything outside it.` : "No folder is shared, so file tools are unavailable."}
- Read before you summarize; never invent file contents or page contents.
- Steps that need approval may be declined. If a step is declined, adapt or finish without it.
- Keep thoughts to one sentence. Finish with "finish" as soon as the goal is done, putting the full result in args.answer.`;
}

/** Путь внутри общей папки; выход за её пределы (в том числе через ссылки) запрещён. */
export async function resolveInFolder(folder, rel, { mustExist = true } = {}) {
  if (!folder) throw new UserError("This agent has no shared folder.");
  const root = await realpath(folder);
  const target = path.resolve(root, String(rel || "").replace(/^[/\\]+/, ""));
  if (target !== root && !target.startsWith(root + path.sep)) throw new UserError("That path is outside the shared folder.");
  if (mustExist) {
    const real = await realpath(target).catch(() => null);
    if (!real) throw new UserError(`Not found: ${rel}`);
    if (real !== root && !real.startsWith(root + path.sep)) throw new UserError("That path is outside the shared folder.");
    return real;
  }
  const parentReal = await realpath(path.dirname(target)).catch(() => null);
  if (parentReal && parentReal !== root && !parentReal.startsWith(root + path.sep)) throw new UserError("That path is outside the shared folder.");
  return target;
}

async function walk(root, dir, depth, out, limit) {
  let entries = [];
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (out.length >= limit) return;
    if (e.name.startsWith(".")) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      out.push({ rel: path.relative(root, full) + "/", dir: true });
      if (depth > 0) await walk(root, full, depth - 1, out, limit);
    } else if (e.isFile()) {
      const s = await stat(full).catch(() => null);
      out.push({ rel: path.relative(root, full), size: s?.size ?? 0, full });
    }
  }
}

// Адреса, куда агенту ходить нельзя: этот компьютер, локальная сеть, служебные диапазоны.
const BLOCKED = new net.BlockList();
for (const [a, p] of [["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["224.0.0.0", 3]]) BLOCKED.addSubnet(a, p, "ipv4");
for (const [a, p] of [["::", 128], ["::1", 128], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8], ["64:ff9b::", 96], ["2001:db8::", 32]]) BLOCKED.addSubnet(a, p, "ipv6");

export function isBlockedAddress(ip) {
  const fam = net.isIP(ip);
  if (!fam) return true;
  if (fam === 6) {
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip) || /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(ip);
    if (mapped) {
      const v4 = mapped.length === 2 ? mapped[1] : [parseInt(mapped[1], 16) >> 8, parseInt(mapped[1], 16) & 255, parseInt(mapped[2], 16) >> 8, parseInt(mapped[2], 16) & 255].join(".");
      return BLOCKED.check(v4, "ipv4");
    }
    return BLOCKED.check(ip, "ipv6");
  }
  return BLOCKED.check(ip, "ipv4");
}

/** DNS-поиск, который отдаёт только публичные адреса: соединение идёт ровно на проверенный IP. */
function safeLookup(hostname, options, cb) {
  dns.lookup(hostname, { all: true }, (err, addrs) => {
    if (err) return cb(err);
    if (!addrs.length || addrs.some((a) => isBlockedAddress(a.address))) {
      return cb(new UserError("Agents can't open addresses on this computer or your local network."));
    }
    if (options?.all) return cb(null, addrs);
    cb(null, addrs[0].address, addrs[0].family);
  });
}

function getOnce(u, signal) {
  return new Promise((resolve, reject) => {
    const mod = u.protocol === "https:" ? https : http;
    const req = mod.get(u, { lookup: safeLookup, signal, headers: { "user-agent": "pleeply-desktop-agent", accept: "text/html,text/plain,*/*", "accept-encoding": "identity" } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve({ redirect: new URL(res.headers.location, u) });
      }
      const chunks = [];
      let size = 0;
      res.on("data", (c) => {
        size += c.length;
        if (size > 2_000_000) { req.destroy(); return; }
        chunks.push(c);
      });
      res.on("end", () => resolve({ status: res.statusCode, type: res.headers["content-type"] || "", body: Buffer.concat(chunks).toString("utf8") }));
      res.on("error", reject);
    });
    req.on("error", reject);
  });
}

/** Загрузка страницы: только http(s), каждый переход по редиректу проверяется заново, не больше 5 переходов. */
export async function fetchPublicPage(url) {
  let u;
  try { u = new URL(url); } catch { throw new UserError("That is not a valid web address."); }
  const signal = AbortSignal.timeout(15000);
  for (let hop = 0; hop <= 5; hop++) {
    if (!["http:", "https:"].includes(u.protocol)) throw new UserError("Only http and https pages can be opened.");
    if (u.username || u.password) throw new UserError("Addresses with a login inside aren't allowed.");
    // Для IP-адресов Node не вызывает lookup, поэтому проверяем их напрямую.
    const literal = u.hostname.replace(/^\[|\]$/g, "");
    if (net.isIP(literal) && isBlockedAddress(literal)) throw new UserError("Agents can't open addresses on this computer or your local network.");
    const r = await getOnce(u, signal);
    if (r.redirect) { u = r.redirect; continue; }
    return { ...r, url: u.href };
  }
  throw new UserError("The page redirected too many times.");
}

/** Запись в общую папку без перехода по символическим ссылкам на любом уровне. */
export async function safeWriteInFolder(folder, rel, content) {
  if (!folder) throw new UserError("This agent has no shared folder.");
  const root = await realpath(folder);
  const target = path.resolve(root, String(rel || "").replace(/^[/\\]+/, ""));
  if (!target.startsWith(root + path.sep)) throw new UserError("That path is outside the shared folder.");
  const parts = path.relative(root, path.dirname(target)).split(path.sep).filter(Boolean);
  let dir = root;
  for (const p of parts) {
    dir = path.join(dir, p);
    const st = await lstat(dir).catch(() => null);
    if (!st) await mkdir(dir).catch((e) => { if (e.code !== "EEXIST") throw e; });
    const again = await lstat(dir);
    if (again.isSymbolicLink() || !again.isDirectory()) throw new UserError("That path goes through a link or a file, so pleeply won't write there.");
  }
  const existing = await lstat(target).catch(() => null);
  if (existing && (existing.isSymbolicLink() || !existing.isFile())) throw new UserError("That file is a link or not a regular file, so pleeply won't overwrite it.");
  const fh = await open(target, FS.O_WRONLY | FS.O_CREAT | FS.O_TRUNC | (FS.O_NOFOLLOW ?? 0), 0o644);
  try {
    const real = await realpath(target);
    if (!real.startsWith(root + path.sep)) throw new UserError("That path is outside the shared folder.");
    await fh.writeFile(String(content ?? ""), "utf8");
  } finally {
    await fh.close();
  }
  return target;
}

export function makeToolbox({ agent, store, memory, openMail }) {
  return {
    async list_files({ path: rel = "" }) {
      const dir = await resolveInFolder(agent.folder, rel);
      const out = [];
      await walk(dir, dir, 1, out, 200);
      if (!out.length) return "The folder is empty.";
      return out.map((f) => (f.dir ? f.rel : `${f.rel} (${f.size < 1024 ? f.size + " B" : Math.round(f.size / 1024) + " KB"})`)).join("\n");
    },
    async read_file({ path: rel }) {
      const file = await resolveInFolder(agent.folder, rel);
      const doc = await extractText(file);
      const text = doc.pages.map((p) => (p.page ? `[page ${p.page}]\n${p.text}` : p.text)).join("\n\n");
      return truncate(text, 12000) + (text.length > 12000 ? `\n\n(The file is longer: ${doc.chars} characters. Use search_files to find specific parts.)` : "");
    },
    async search_files({ query }) {
      const root = await resolveInFolder(agent.folder, "");
      const files = [];
      await walk(root, root, 3, files, 300);
      const chunks = [];
      for (const f of files.filter((x) => !x.dir && SUPPORTED_EXT.has(path.extname(x.rel).toLowerCase()) && x.size < 5e6).slice(0, 120)) {
        try {
          const d = await extractText(f.full);
          for (const c of chunkPages(d.pages, { size: 700, overlap: 80 })) chunks.push({ ...c, file: f.rel });
        } catch {}
      }
      const top = bm25Rank(chunks, query).filter((r) => r.score > 0).slice(0, 6);
      if (!top.length) return `Nothing found for "${query}".`;
      return top.map(({ chunk }) => `${chunk.file}${chunk.page ? `, page ${chunk.page}` : ""}:\n${chunk.text}`).join("\n\n---\n\n");
    },
    async fetch_url({ url }) {
      const res = await fetchPublicPage(url);
      if (res.status < 200 || res.status >= 300) throw new UserError(`The page returned ${res.status}.`);
      if (!/text|html|json|xml/.test(res.type)) throw new UserError(`Unsupported page type: ${res.type}`);
      const raw = res.body;
      const title = (raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "").trim();
      const text = /html/.test(res.type) ? htmlToText(raw) : raw;
      return `${title ? `Title: ${title}\n` : ""}URL: ${res.url}${res.url !== url ? ` (redirected from ${url})` : ""}\n\n${truncate(text, 12000)}`;
    },
    async write_note({ title, content }) {
      const id = uid("n_");
      await store.write(`notes/${id}.json`, { id, title: truncate(title || "Note", 120), content: String(content || ""), agentId: agent.id, agentName: agent.name, createdAt: new Date().toISOString() });
      return `Saved the note "${title}" in pleeply.`;
    },
    async write_file({ path: rel, content }) {
      if (!rel) throw new UserError("A file name is needed.");
      await safeWriteInFolder(agent.folder, rel, content);
      return `Wrote ${rel} (${String(content ?? "").length} characters).`;
    },
    async draft_email({ to = "", subject = "", body = "" }) {
      await openMail({ to, subject, body });
      return "The draft was opened in the user's mail app. It was not sent; the user will review and send it themselves.";
    },
    async remember({ fact }) {
      await memory.add(fact, { origin: "agent" });
      return `Remembered: ${fact}`;
    },
  };
}

/**
 * Цикл агента. generate({system, messages, jsonSchema}) → {text} уже знает, где выполняется модель
 * (и для облака согласие получено до старта). requestApproval(step) → Promise<{approved, args?}>.
 */
export async function runAgent({ agent, run, generate, requestApproval, toolbox, onUpdate, isStopped }) {
  const tools = [...new Set([...agent.tools.filter((t) => TOOLS[t]), "finish"])].filter((t) => agent.folder || !["list_files", "read_file", "search_files", "write_file"].includes(t));
  const system = agentSystemPrompt({ ...agent, tools });
  const schema = actionSchema(tools);
  const messages = [{ role: "user", content: `Goal: ${agent.goal}` }];
  const save = async () => onUpdate(run);

  for (let i = 0; i < MAX_STEPS; i++) {
    if (isStopped()) { run.status = "stopped"; break; }
    const lastStep = i === MAX_STEPS - 1;
    const step = { id: uid("st_"), n: i + 1, status: "thinking", startedAt: new Date().toISOString() };
    run.steps.push(step);
    await save();

    let action = null, raw = "";
    for (let attempt = 0; attempt < 2 && !action; attempt++) {
      const extra = lastStep ? [{ role: "user", content: "This is the last step. Use the finish tool now with the full result." }] : [];
      const hint = attempt ? [{ role: "user", content: "Your last reply was not a valid JSON action. Reply with exactly one JSON object." }] : [];
      const r = await generate({ system, messages: [...messages, ...extra, ...hint], jsonSchema: lastStep ? actionSchema(["finish"]) : schema });
      if (r.aborted || isStopped()) break;
      raw = r.text;
      const a = parseJsonLoose(r.text);
      if (a && typeof a.tool === "string" && tools.includes(a.tool)) action = { thought: String(a.thought || ""), tool: a.tool, args: a.args && typeof a.args === "object" ? a.args : {} };
    }
    if (isStopped()) { step.status = "stopped"; run.status = "stopped"; break; }
    if (!action) {
      step.status = "failed";
      step.result = `The model didn't produce a valid action.${raw ? ` It replied: ${truncate(raw, 300)}` : ""}`;
      run.status = "failed";
      run.error = "The model couldn't follow the agent format. Try a larger model or the Orbit setup with a cloud model.";
      break;
    }
    Object.assign(step, { thought: action.thought, tool: action.tool, args: Object.fromEntries(TOOLS[action.tool].args.map((k) => [k, String(action.args[k] ?? "")])), label: TOOLS[action.tool].label });

    if (action.tool === "finish") {
      step.status = "done";
      run.output = step.args.answer || action.thought;
      run.status = "done";
      break;
    }

    if (TOOLS[action.tool].matters) {
      step.status = "waiting";
      await save();
      const decision = await requestApproval(step);
      if (isStopped()) { step.status = "stopped"; run.status = "stopped"; break; }
      if (!decision?.approved) {
        step.status = "declined";
        step.result = "The user declined this step.";
      } else if (decision.args) {
        for (const k of TOOLS[action.tool].args) if (typeof decision.args[k] === "string") step.args[k] = decision.args[k];
      }
    }
    if (step.status !== "declined") {
      step.status = "running";
      await save();
      try {
        step.result = truncate(await toolbox[action.tool](step.args), 14000);
        step.status = "done";
      } catch (e) {
        step.result = `Error: ${e.message}`;
        step.status = "error";
      }
    }
    step.endedAt = new Date().toISOString();
    await save();
    messages.push({ role: "assistant", content: JSON.stringify({ thought: step.thought, tool: step.tool, args: step.args }) });
    messages.push({ role: "user", content: `Result of ${step.tool}:\n${step.result}\n\nReply with the next JSON action.` });
    // Держим контекст коротким: старые результаты заменяем пометкой.
    for (let k = 1; k < messages.length - 8; k += 2) {
      if (messages[k + 1]?.role === "user" && !messages[k + 1].content.startsWith("(Earlier result")) messages[k + 1].content = "(Earlier result omitted to save space.)";
    }
  }
  if (run.status === "running") {
    run.status = "done";
    run.output = run.output || "The agent reached its step limit before finishing.";
  }
  run.endedAt = new Date().toISOString();
  await save();
  return run;
}
