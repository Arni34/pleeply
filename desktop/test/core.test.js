// npm test — проверки ядра без Electron и без скачивания моделей.
import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtemp, writeFile, mkdir, symlink, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const tmp = () => mkdtemp(path.join(os.tmpdir(), "pleeply-test-"));

// Поддельный облачный провайдер: должен получать запросы только после согласия.
const received = [];
const server = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    received.push({ url: req.url, body: body ? JSON.parse(body) : null, device: req.headers["x-pleeply-device"] || null });
    if (req.url === "/gw/models") {
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify({ data: [
        { id: "claude", name: "Claude Opus 5.5", vendor: "Anthropic", tier: "paid", via: "OpenRouter", policy: "https://www.anthropic.com/legal/privacy" },
        { id: "gpt-oss", name: "GPT-OSS 120B", vendor: "OpenAI", tier: "free", via: "Groq" },
        { id: "limited", name: "Limited", vendor: "DeepSeek", tier: "paid", via: "OpenRouter" },
      ], limits: { free_per_day: 60, premium_per_day: 25 } }));
    }
    if (req.url === "/gw/chat/completions" && JSON.parse(body).model === "limited") {
      res.writeHead(429, { "content-type": "application/json" });
      return res.end(JSON.stringify({ error: { message: "You've used today's 25 free premium requests in pleeply Cloud." } }));
    }
    if (req.url.endsWith("/models")) { res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify({ data: [{ id: "mock-large" }] })); }
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "Hi from cloud" } }] })}\n\n`);
    res.end("data: [DONE]\n\n");
  });
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
process.env.PLEEPLY_TEST_PROVIDER_URL = `http://127.0.0.1:${server.address().port}/v1`;
process.env.PLEEPLY_CLOUD_URL = `http://127.0.0.1:${server.address().port}/gw`;
test.after(() => server.close());

const { sanitizeSettings, DEFAULT_SETTINGS } = await import("../src/core/settings.js");
const { fitModel, fitBuckets, recommendation, memoryBudget, starterPicks } = await import("../src/core/fit.js");
const { CATALOG } = await import("../src/core/catalog.js");
const { resolvePresetLocal } = await import("../src/core/presets.js");
const { classifyTask, decideAuto } = await import("../src/core/router.js");
const { consentState, buildDisclosure } = await import("../src/core/consent.js");
const { chunkPages, bm25Rank, selectSources, formatSources, htmlToText } = await import("../src/core/docs.js");
const { parseJsonLoose } = await import("../src/core/util.js");
const { resolveInFolder, actionSchema, isBlockedAddress, fetchPublicPage, safeWriteInFolder } = await import("../src/core/agents.js");
const { KeyStore, parseCloudRef } = await import("../src/core/providers.js");
const { Memory } = await import("../src/core/memory.js");
const { Store } = await import("../src/core/store.js");
const { Core, historyFor } = await import("../src/core/index.js");

const GiB = 1073741824;
const M2_16 = { ramBytes: 16 * GiB, gpu: { backend: "metal", unified: true, vramBytes: 11.45e9 } };
const A18_8 = { ramBytes: 8 * GiB, gpu: { backend: "metal", unified: true, vramBytes: 5.73e9 } };
const RTX = { ramBytes: 32 * GiB, gpu: { backend: "cuda", unified: false, vramBytes: 12e9 } };
const CPU = { ramBytes: 16 * GiB, gpu: { backend: "cpu", unified: false, vramBytes: 0 } };
const S = sanitizeSettings({});
const cat = (id) => CATALOG.find((m) => m.id === id);

test("settings: unknown values fall back, local engines stay on loopback", () => {
  const s = sanitizeSettings({ mode: "evil", cloud: { requests: "always" }, models: { ollama: { url: "http://example.com:11434" }, lmstudio: { url: "http://127.0.0.1:1234/" } }, performance: { contextSize: 12345 } });
  assert.equal(s.mode, "auto");
  assert.equal(s.cloud.requests, "ask");
  assert.equal(s.models.ollama.url, DEFAULT_SETTINGS.models.ollama.url);
  assert.equal(s.models.lmstudio.url, "http://127.0.0.1:1234");
  assert.equal(s.performance.contextSize, 8192);
  assert.equal(s.cloud.shareMemory, false, "Memory is not shared with the cloud by default");
});

test("fit: matches the site's example (Apple M2, 16 GB → 7–8B recommended)", () => {
  assert.equal(fitModel(cat("llama3.2-3b"), M2_16, S).level, "fast");
  assert.equal(fitModel(cat("llama3.1-8b"), M2_16, S).level, "good");
  assert.equal(fitModel(cat("llama3.1-70b"), M2_16, S).level, "too-large");
  assert.equal(recommendation(CATALOG, M2_16, S).label, "7–8B");
  const b = Object.fromEntries(fitBuckets(CATALOG, M2_16, S).map((x) => [x.label, x.level]));
  assert.deepEqual(b, { "3B": "fast", "7–8B": "good", "14B": "slower", "70B": "too-large" });
});

test("fit: 8 GB laptop gets 3–4B, never a 70B", () => {
  assert.equal(recommendation(CATALOG, A18_8, S).label, "3–4B");
  assert.equal(fitModel(cat("qwen3-32b"), A18_8, S).level, "too-large");
});

test("fit: discrete GPU and CPU-only machines", () => {
  assert.equal(fitModel(cat("qwen2.5-7b"), RTX, S).level, "good");
  assert.equal(fitModel(cat("qwen2.5-14b"), RTX, S).level, "good");
  assert.equal(fitModel(cat("llama3.2-1b"), CPU, sanitizeSettings({ performance: { gpu: false } })).level, "good");
  assert.equal(fitModel(cat("llama3.1-8b"), CPU, S).level, "slower");
});

test("fit: Memory for models limit marks bigger models too large", () => {
  const s = sanitizeSettings({ performance: { memoryGB: 3 } });
  const f = fitModel(cat("llama3.1-8b"), M2_16, s);
  assert.equal(f.level, "too-large");
  assert.match(f.reason, /limit set in Control Center/);
  assert.equal(memoryBudget(M2_16, s).limitGB, 3);
});

const local = (id, extra = {}) => ({ ...cat(id), ref: `pleeply:${id}`, where: "local", fit: fitModel(cat(id), M2_16, S), ...extra });

test("starter models: two offline models that fit, chosen by memory", () => {
  assert.deepEqual(starterPicks(CATALOG, A18_8, S), ["gemma3-4b", "qwen3-1.7b"]);
  assert.deepEqual(starterPicks(CATALOG, M2_16, S), ["qwen2.5-7b", "gemma3-4b"]);
  assert.deepEqual(starterPicks(CATALOG, RTX, S), ["qwen2.5-14b", "gemma3-4b"]);
  const tiny = { ramBytes: 4 * GiB, gpu: { backend: "metal", unified: true, vramBytes: 2.7e9 } };
  assert.deepEqual(starterPicks(CATALOG, tiny, S), ["gemma3-1b", "qwen2.5-0.5b"]);
});

test("presets: each setup picks a fitting model", () => {
  const models = [local("llama3.2-1b"), local("qwen2.5-7b"), local("llama3.1-8b"), local("gemma3-4b")];
  assert.equal(resolvePresetLocal("nova", models, S).id, "llama3.2-1b");
  assert.equal(resolvePresetLocal("saturn", models, S).id, "llama3.1-8b");
  assert.equal(resolvePresetLocal("atlas", models, S).id, "llama3.1-8b");
  assert.equal(resolvePresetLocal("orbit", models, S).id, "llama3.1-8b");
  const pinned = sanitizeSettings({ presets: { models: { saturn: "pleeply:gemma3-4b" } } });
  assert.equal(resolvePresetLocal("saturn", models, pinned).id, "gemma3-4b");
  assert.equal(resolvePresetLocal("saturn", [], S), null);
});

test("router: Auto classifies tasks and only suggests cloud", () => {
  assert.equal(classifyTask({ text: "hi" }).preset, "nova");
  assert.equal(classifyTask({ text: "Summarize this PDF report" }).preset, "atlas");
  assert.equal(classifyTask({ text: "x", attachments: 1 }).preset, "atlas");
  assert.equal(classifyTask({ text: "Make a step-by-step plan to automate my invoices" }).preset, "orbit");
  const cloudModel = { ref: "cloud:anthropic:claude-opus-5-5", where: "cloud", label: "Claude Opus 5.5" };
  const withLocal = decideAuto({ text: "hi", localModels: [local("llama3.2-3b")], cloudModel, settings: S });
  assert.equal(withLocal.route.where, "local");
  const noLocal = decideAuto({ text: "hi", localModels: [], cloudModel, settings: S });
  assert.equal(noLocal.route.where, "cloud");
  assert.match(noLocal.reason, /ask before sending/);
  const off = decideAuto({ text: "hi", localModels: [], cloudModel, settings: sanitizeSettings({ cloud: { requests: "off" } }) });
  assert.ok(off.error, "cloud off + no local model → explain, never send");
});

test("consent: ask every time, once per chat, off", () => {
  assert.equal(consentState(S, { anthropic: true }, "anthropic"), "ask");
  const perChat = sanitizeSettings({ cloud: { requests: "chat" } });
  assert.equal(consentState(perChat, {}, "anthropic"), "ask");
  assert.equal(consentState(perChat, { anthropic: true }, "anthropic"), "approved");
  assert.equal(consentState(perChat, { anthropic: true }, "openai"), "ask");
  assert.equal(consentState(sanitizeSettings({ cloud: { requests: "off" } }), { anthropic: true }, "anthropic"), "blocked");
  const d = buildDisclosure({ provider: { id: "x", name: "X", policy: "https://x" }, model: { id: "m", label: "M" }, system: "SYS", messages: [{ role: "user", content: "hello" }] });
  assert.deepEqual(d.items.map((i) => i.text), ["SYS", "hello"]);
  assert.equal(d.chars, 8);
});

test("docs: chunking, BM25 and citations", () => {
  const pages = [{ page: 1, text: "Solar panels produced 21,400 kWh. ".repeat(10) }, { page: 2, text: "Dust in July reduced output by 12 percent. ".repeat(10) }];
  const chunks = chunkPages(pages, { size: 200, overlap: 20 });
  assert.ok(chunks.length >= 4);
  const top = bm25Rank(chunks, "dust july")[0].chunk;
  assert.equal(top.page, 2);
  const docs = [{ id: "d1", name: "report.pdf", chunks }];
  const sel = selectSources(docs, "dust in july", 300);
  assert.equal(sel.narrowed, true);
  assert.ok(sel.chunks.every((c) => c.page === 2));
  const f = formatSources(sel.chunks);
  assert.match(f.text, /^\[1\] report\.pdf, page 2/);
  assert.equal(f.citations[1].page, 2);
  assert.equal(htmlToText("<p>a<script>x()</script></p><p>b &amp; c</p>"), "a\nb & c");
});

test("util: loose JSON parsing", () => {
  assert.deepEqual(parseJsonLoose('Sure!\n```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(parseJsonLoose('x {"a":"}"} y'), { a: "}" });
  assert.equal(parseJsonLoose("nope"), null);
});

test("history: alternating roles, failed answers dropped", () => {
  const h = historyFor([
    { role: "assistant", text: "orphan" },
    { role: "user", text: "a" },
    { role: "assistant", text: "", status: "error" },
    { role: "user", text: "b" },
    { role: "assistant", text: "c" },
  ]);
  assert.deepEqual(h, [{ role: "user", content: "a\n\nb" }, { role: "assistant", content: "c" }]);
});

test("agents: folder sandbox blocks escapes and symlinks", async () => {
  const root = await tmp();
  const folder = path.join(root, "shared");
  await mkdir(folder);
  await writeFile(path.join(folder, "ok.txt"), "ok");
  await writeFile(path.join(root, "secret.txt"), "secret");
  await symlink(path.join(root, "secret.txt"), path.join(folder, "link.txt"));
  assert.ok((await resolveInFolder(folder, "ok.txt")).endsWith("ok.txt"));
  await assert.rejects(resolveInFolder(folder, "../secret.txt"), /outside/);
  await assert.rejects(resolveInFolder(folder, "link.txt"), /outside/);
  await assert.rejects(resolveInFolder(null, "x"), /no shared folder/);
  const schema = actionSchema(["read_file", "finish"]);
  assert.equal(schema.oneOf.length, 2);
  assert.deepEqual(Object.keys(schema.oneOf[0].properties.args.properties), ["path"]);
  await rm(root, { recursive: true, force: true });
});

test("agents: writes never follow symlinks", async () => {
  const root = await tmp();
  const folder = path.join(root, "shared");
  const outside = path.join(root, "outside");
  await mkdir(folder);
  await mkdir(outside);
  await symlink(outside, path.join(folder, "linkdir"));
  await writeFile(path.join(outside, "target.txt"), "original");
  await symlink(path.join(outside, "target.txt"), path.join(folder, "linkfile.txt"));
  await assert.rejects(safeWriteInFolder(folder, "linkdir/new.txt", "x"), /link/);
  await assert.rejects(safeWriteInFolder(folder, "linkfile.txt", "x"), /link/);
  await assert.rejects(safeWriteInFolder(folder, "../outside/x.txt", "x"), /outside/);
  const { readFile } = await import("node:fs/promises");
  assert.equal(await readFile(path.join(outside, "target.txt"), "utf8"), "original");
  await safeWriteInFolder(folder, "sub/dir/ok.md", "hello");
  assert.equal(await readFile(path.join(folder, "sub/dir/ok.md"), "utf8"), "hello");
  await rm(root, { recursive: true, force: true });
});

test("agents: web pages on this computer or the local network are refused", async () => {
  for (const ip of ["127.0.0.1", "10.1.2.3", "192.168.1.1", "172.20.0.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1", "::ffff:7f00:1"]) {
    assert.equal(isBlockedAddress(ip), true, ip);
  }
  for (const ip of ["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"]) assert.equal(isBlockedAddress(ip), false, ip);
  const port = server.address().port;
  for (const url of [`http://127.0.0.1:${port}/v1/models`, `http://localhost:${port}/v1/models`, `http://[::ffff:127.0.0.1]:${port}/`, "file:///etc/passwd", `http://user:pw@example.com/`]) {
    await assert.rejects(fetchPublicPage(url), /local network|http and https|login/, url);
  }
});

test("keys: encrypted at rest, only last 4 characters exposed", async () => {
  const store = await new Store(await tmp()).init();
  const cipher = { available: () => true, encrypt: (s) => Buffer.from(s).toString("base64").split("").reverse().join(""), decrypt: (b) => Buffer.from(b.split("").reverse().join(""), "base64").toString() };
  const ks = new KeyStore(store, cipher);
  await ks.set("anthropic", "sk-ant-secret-1234");
  const raw = JSON.stringify(await store.read("keys.json", {}));
  assert.ok(!raw.includes("sk-ant-secret"));
  assert.equal(await ks.get("anthropic"), "sk-ant-secret-1234");
  const st = await ks.status();
  assert.deepEqual({ c: st.anthropic.connected, l: st.anthropic.last4 }, { c: true, l: "1234" });
  assert.ok(!JSON.stringify(st).includes("secret"));
  await assert.rejects(ks.set("anthropic", "short"), /API key/);
  assert.deepEqual(parseCloudRef("cloud:openrouter:meta-llama/llama-3:free"), { providerId: "openrouter", modelId: "meta-llama/llama-3:free" });
});

test("memory: add, dedupe, edit, prompt block", async () => {
  const mem = new Memory(await new Store(await tmp()).init());
  await mem.add("Prefers short answers");
  await mem.add("prefers short answers!");
  await mem.add("Writes in RU and EN");
  let d = await mem.data();
  assert.equal(d.items.length, 2);
  await mem.update(d.items[0].id, "Writes in Russian and English");
  assert.match(await mem.forPrompt(), /Writes in Russian and English/);
  await mem.clear();
  assert.equal(await mem.forPrompt(), "");
});

async function makeCore(settings = {}) {
  const events = [];
  const core = await new Core({
    dataDir: await tmp(),
    cipher: { available: () => false, encrypt: (s) => s, decrypt: (s) => s },
    autoSetup: false,
    emit: (e) => { events.push(e); for (const w of [...waiters]) if (w.pred(e)) { waiters.splice(waiters.indexOf(w), 1); w.res(e); } },
  }).init();
  const waiters = [];
  core.waitFor = (pred) => new Promise((res) => waiters.push({ pred, res }));
  await core.hardwareReady;
  await core.updateSettings({ models: { ollama: { enabled: false }, lmstudio: { enabled: false } }, ...settings });
  await core.refreshCloudModels("testcloud");
  core.events = events;
  return core;
}

test("cloud: nothing reaches the provider until the user approves", async () => {
  const core = await makeCore();
  const before = received.filter((r) => r.url.endsWith("/chat/completions")).length;
  // 1) отказ
  const consent1 = core.waitFor((e) => e.type === "consent");
  let r = await core.send({ chatId: null, text: "secret plans", mode: "cloud", selection: { type: "model", ref: "cloud:testcloud:mock-large" } });
  let c = await consent1;
  assert.equal(c.disclosure.provider.name, "Test Cloud");
  assert.ok(c.disclosure.items.some((i) => i.text === "secret plans"));
  let done = core.waitFor((e) => e.type === "chat" && e.done === r.messageId);
  core.respondConsent({ id: c.id, approved: false });
  let ev = await done;
  assert.equal(ev.chat.messages.at(-1).status, "declined");
  assert.equal(received.filter((x) => x.url.endsWith("/chat/completions")).length, before, "declined request must not be sent");
  // 2) согласие — уходит ровно то, что было показано
  const consent2 = core.waitFor((e) => e.type === "consent");
  r = await core.send({ chatId: r.chatId, text: "ok, send this one", mode: "cloud", selection: { type: "model", ref: "cloud:testcloud:mock-large" } });
  c = await consent2;
  done = core.waitFor((e) => e.type === "chat" && e.done === r.messageId);
  core.respondConsent({ id: c.id, approved: true });
  ev = await done;
  const m = ev.chat.messages.at(-1);
  assert.equal(m.status, "done");
  assert.equal(m.text, "Hi from cloud");
  assert.equal(m.meta.where, "cloud");
  const sent = received.filter((x) => x.url.endsWith("/chat/completions")).at(-1).body.messages;
  assert.deepEqual(sent.map((x) => x.content), c.disclosure.items.map((i) => i.text));
  const act = await core.activity();
  assert.equal(act.filter((a) => a.kind === "cloud").length, 1);
  await core.dispose();
});

test("cloud: switched off means no request and a clear error", async () => {
  const core = await makeCore({ cloud: { requests: "off" } });
  const before = received.length;
  const r = await core.send({ chatId: null, text: "hello", mode: "cloud", selection: { type: "preset", id: "saturn" } });
  const ev = await core.waitFor((e) => e.type === "chat" && e.done === r.messageId);
  assert.equal(ev.chat.messages.at(-1).status, "error");
  assert.match(ev.chat.messages.at(-1).error, /switched off/);
  assert.equal(received.length, before);
  assert.ok(!core.events.some((e) => e.type === "consent"));
  await core.dispose();
});

test("chats: search, pin without reordering, edit and resend", async () => {
  const core = await makeCore({ cloud: { requests: "chat" } });
  const consent = core.waitFor((e) => e.type === "consent");
  let r = await core.send({ chatId: null, text: "Plan a trip to Almaty in May", mode: "cloud", selection: { type: "preset", id: "saturn" } });
  const c = await consent;
  let done = core.waitFor((e) => e.type === "chat" && e.done === r.messageId);
  core.respondConsent({ id: c.id, approved: true, remember: true });
  await done;
  const chatId = r.chatId;
  const found = await core.searchChats("almaty");
  assert.equal(found[0].id, chatId);
  assert.equal((await core.searchChats("hi from cloud"))[0].id, chatId, "matches answer text too");
  assert.deepEqual(await core.searchChats("no such words anywhere"), []);
  const before = (await core.getChat(chatId)).updatedAt;
  await core.pinChat(chatId, true);
  const listed = (await core.listChats()).find((x) => x.id === chatId);
  assert.equal(listed.pinned, true);
  assert.equal(listed.updatedAt, before, "pinning doesn't move the chat to Today");
  await core.renameChat(chatId, "Almaty trip");
  assert.equal((await core.getChat(chatId)).title, "Almaty trip");
  const userMsg = (await core.getChat(chatId)).messages[0];
  done = core.waitFor((e) => e.type === "chat" && e.done);
  await core.editAndResend({ chatId, messageId: userMsg.id, text: "Plan a trip to Almaty in June", mode: "cloud", selection: { type: "preset", id: "saturn" } });
  const ev = await done;
  assert.equal(ev.chat.messages.length, 2);
  assert.equal(ev.chat.messages[0].text, "Plan a trip to Almaty in June");
  assert.ok(ev.chat.messages[0].editedAt);
  assert.equal(ev.chat.messages[1].status, "done");
  await assert.rejects(core.editAndResend({ chatId, messageId: "msg_nope", text: "x", mode: "cloud" }), /no longer exists/);
  await core.dispose();
});

test("pleeply Cloud: built-in models, real recipient in consent, device id, readable limits", async () => {
  const core = await makeCore();
  await core.refreshGateway({ force: true });
  const cloud = await core.cloudModelList();
  const claude = cloud.find((m) => m.ref === "cloud:pleeply:claude");
  assert.ok(claude && claude.vendor === "Anthropic");
  assert.equal(core.defaultCloudModel(cloud.filter((m) => m.provider === "pleeply")).id, "claude");
  const consent = core.waitFor((e) => e.type === "consent");
  let r = await core.send({ chatId: null, text: "hello there", mode: "cloud", selection: { type: "model", ref: claude.ref } });
  const c = await consent;
  assert.equal(c.disclosure.provider.name, "Anthropic via pleeply Cloud");
  assert.equal(c.disclosure.relay.via, "OpenRouter");
  let done = core.waitFor((e) => e.type === "chat" && e.done === r.messageId);
  core.respondConsent({ id: c.id, approved: true });
  let ev = await done;
  assert.equal(ev.chat.messages.at(-1).text, "Hi from cloud");
  assert.equal(ev.chat.messages.at(-1).meta.providerName, "Anthropic via pleeply Cloud");
  const sent = received.filter((x) => x.url === "/gw/chat/completions").at(-1);
  assert.equal(sent.body.model, "claude");
  assert.equal(sent.device, core.deviceId);
  // дневной лимит шлюза — понятный текст, а не «ошибка 429»
  const consent2 = core.waitFor((e) => e.type === "consent");
  r = await core.send({ chatId: r.chatId, text: "again", mode: "cloud", selection: { type: "model", ref: "cloud:pleeply:limited" } });
  const c2 = await consent2;
  done = core.waitFor((e) => e.type === "chat" && e.done === r.messageId);
  core.respondConsent({ id: c2.id, approved: true });
  ev = await done;
  assert.match(ev.chat.messages.at(-1).error, /used today's 25 free premium requests/);
  await core.updateSettings({ cloud: { pleeplyCloud: false } });
  assert.equal((await core.cloudModelList()).filter((m) => m.provider === "pleeply").length, 0);
  await core.dispose();
});

test("cloud: once per chat remembers the approval only for that chat", async () => {
  const core = await makeCore({ cloud: { requests: "chat" } });
  const consent = core.waitFor((e) => e.type === "consent");
  let r = await core.send({ chatId: null, text: "first", mode: "cloud", selection: { type: "preset", id: "nova" } });
  const c = await consent;
  let done = core.waitFor((e) => e.type === "chat" && e.done === r.messageId);
  core.respondConsent({ id: c.id, approved: true, remember: true });
  await done;
  const asked = core.events.filter((e) => e.type === "consent").length;
  done = core.waitFor((e) => e.type === "chat" && e.done);
  r = await core.send({ chatId: r.chatId, text: "second", mode: "cloud", selection: { type: "preset", id: "nova" } });
  const ev = await done;
  assert.equal(core.events.filter((e) => e.type === "consent").length, asked, "no second prompt in the same chat");
  assert.equal(ev.chat.messages.at(-1).meta.approval, "chat");
  await core.dispose();
});

test("account: Google sign-in in the browser with PKCE, encrypted token, plan refresh, sign out", async () => {
  const { Account } = await import("../src/core/account.js");
  const crypto = await import("node:crypto");
  const pending = new Map();
  let issued = null;
  const site = http.createServer(async (req, res) => {
    const u = new URL(req.url, "http://x");
    let body = "";
    for await (const c of req) body += c;
    if (u.pathname === "/api/auth/desktop") {
      const code = "c".repeat(40);
      pending.set(code, u.searchParams.get("challenge"));
      res.writeHead(302, { location: `http://127.0.0.1:${u.searchParams.get("port")}/callback?code=${code}&state=${u.searchParams.get("state")}` });
      return res.end();
    }
    if (u.pathname === "/api/auth/token") {
      const b = JSON.parse(body);
      const ch = pending.get(b.code);
      if (!ch || crypto.createHash("sha256").update(b.verifier).digest("base64url") !== ch) { res.writeHead(400, { "content-type": "application/json" }); return res.end('{"error":"bad"}'); }
      issued = "t".repeat(43);
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify({ token: issued, account: { email: "dana@example.com", name: "Dana", plan: "free", limits: { free: 100, paid: 25 } } }));
    }
    const auth = issued && req.headers.authorization === `Bearer ${issued}`;
    if (u.pathname === "/api/account/me") {
      res.writeHead(auth ? 200 : 401, { "content-type": "application/json" });
      return res.end(JSON.stringify(auth ? { account: { email: "dana@example.com", plan: "pro", limits: { free: 1000, paid: 150 } }, usage: { paid: 3 }, price: "$19.99 / month", upgrade: true } : { error: "Signed out." }));
    }
    if (u.pathname === "/api/account/signout") { issued = null; res.writeHead(200, { "content-type": "application/json" }); return res.end("{}"); }
    res.writeHead(404);
    res.end();
  });
  await new Promise((r) => site.listen(0, "127.0.0.1", r));
  const store = await new Store(await tmp()).init();
  const cipher = { available: () => true, encrypt: (s) => Buffer.from(s).toString("base64").split("").reverse().join(""), decrypt: (b) => Buffer.from(b.split("").reverse().join(""), "base64").toString() };
  // «Браузер»: открывает адрес и проходит редирект сайта на локальный адрес приложения.
  const acct = await new Account({ store, cipher, baseUrl: `http://127.0.0.1:${site.address().port}`, openUrl: (url) => fetch(url).catch(() => {}) }).init();
  assert.equal(acct.status().signedIn, false);
  await acct.signIn();
  for (let i = 0; i < 100 && acct.status().account?.plan !== "pro"; i++) await new Promise((r) => setTimeout(r, 30));
  const st = acct.status();
  assert.equal(st.signedIn, true);
  assert.equal(st.account.plan, "pro");
  assert.equal(st.usage.paid, 3);
  assert.ok(!JSON.stringify(await store.read("account.json", {})).includes("t".repeat(43)), "token is stored encrypted");
  assert.deepEqual(await acct.authHeader(), { authorization: `Bearer ${"t".repeat(43)}` });
  await acct.signOut();
  assert.equal(acct.status().signedIn, false);
  assert.deepEqual(await acct.authHeader(), {});
  site.close();
});
