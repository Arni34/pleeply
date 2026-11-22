// Главный процесс pleeply Desktop: окно, IPC и системные диалоги. Вся работа с моделями — в src/core.
import { app, BrowserWindow, ipcMain, dialog, shell, safeStorage, clipboard, Menu, screen } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeFile } from "node:fs/promises";
import { readFileSync, writeFileSync } from "node:fs";
import { Core } from "../src/core/index.js";
import { UserError } from "../src/core/util.js";
import { SUPPORTED_EXT } from "../src/core/docs.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
app.setName("pleeply");
if (process.env.PLEEPLY_DATA_DIR) app.setPath("userData", path.resolve(process.env.PLEEPLY_DATA_DIR));

if (!app.requestSingleInstanceLock()) app.quit();

let win = null;
let core = null;
const RENDERER = path.join(__dirname, "../renderer/index.html");

function send(ev) {
  if (win && !win.isDestroyed()) win.webContents.send("pleeply:event", ev);
}

function openExternalSafe(url) {
  try {
    const u = new URL(url);
    if (u.protocol === "https:" || u.protocol === "mailto:") shell.openExternal(u.href);
  } catch {}
}

const cipher = {
  available: () => safeStorage.isEncryptionAvailable(),
  encrypt: (s) => safeStorage.encryptString(s).toString("base64"),
  decrypt: (b) => safeStorage.decryptString(Buffer.from(b, "base64")),
};

async function openMail({ to, subject, body }) {
  // Письмо никогда не отправляется само: открываем черновик в почтовом приложении и кладём текст в буфер.
  clipboard.writeText(`${subject ? subject + "\n\n" : ""}${body || ""}`);
  const url = `mailto:${encodeURIComponent(to || "")}?subject=${encodeURIComponent(subject || "")}&body=${encodeURIComponent(String(body || "").slice(0, 1800))}`;
  await shell.openExternal(url);
}

const safeName = (s) => String(s || "chat").replace(/[\\/:*?"<>|]+/g, " ").trim().slice(0, 80) || "chat";

function api() {
  return {
    "app.state": () => core.state(),
    "settings.update": (patch) => core.updateSettings(patch || {}),
    "hardware.refresh": async () => { core.hardwareReady = core.refreshHardware(); await core.hardwareReady; return core.state(); },
    "engine.unload": () => core.local.mutex.run(() => core.local.unload()),

    "models.state": () => core.modelsState(),
    "models.download": (a) => core.downloadModel(a || {}),
    "models.cancel": (id) => core.cancelDownload(id),
    "models.delete": (ref) => core.deleteModel(ref),
    "models.search": (q) => core.searchHF(q),
    "models.files": (repo) => core.hfFiles(repo),
    "models.openFolder": () => shell.openPath(core.modelsDir),
    "models.chooseFolder": async () => {
      const r = await dialog.showOpenDialog(win, { title: "Choose a folder for models", properties: ["openDirectory", "createDirectory"] });
      if (r.canceled) return null;
      await core.updateSettings({ models: { dir: r.filePaths[0] } });
      return r.filePaths[0];
    },

    "account.state": () => core.account.status(),
    "account.refresh": () => core.account.refresh(),
    "account.signIn": () => core.account.signIn(),
    "account.cancel": () => core.account.cancelSignIn(),
    "account.signOut": () => core.account.signOut(),
    "account.upgrade": () => core.account.upgrade(),
    "account.manage": () => core.account.manage(),
    "providers.setKey": (a) => core.setProviderKey(a?.id, a?.key),
    "providers.removeKey": (id) => core.removeProviderKey(id),
    "providers.refresh": (id) => (id === "pleeply" ? core.refreshGateway({ force: true }) : core.refreshCloudModels(id)),

    "chats.list": () => core.listChats(),
    "chats.get": (id) => core.getChat(id),
    "chats.create": () => core.createChat(),
    "chats.rename": (a) => core.renameChat(a?.id, a?.title),
    "chats.pin": (a) => core.pinChat(a?.id, a?.pinned),
    "chats.search": (q) => core.searchChats(q),
    "chats.edit": (a) => core.editAndResend(a || {}),
    "chats.delete": (id) => core.deleteChat(id),
    "chats.export": async (id) => {
      const chat = await core.getChat(id);
      const r = await dialog.showSaveDialog(win, { defaultPath: `${safeName(chat.title)}.md`, filters: [{ name: "Markdown", extensions: ["md"] }] });
      if (r.canceled || !r.filePath) return false;
      await writeFile(r.filePath, core.exportChat(chat), "utf8");
      return true;
    },
    "chats.send": (a) => core.send(a || {}),
    "chats.regenerate": (a) => core.regenerate(a || {}),
    "chats.stop": (id) => core.stop(id),
    "chats.attach": async (chatId) => {
      const r = await dialog.showOpenDialog(win, {
        title: "Attach files",
        properties: ["openFile", "multiSelections"],
        filters: [{ name: "Documents", extensions: [...SUPPORTED_EXT].map((e) => e.slice(1)) }, { name: "All files", extensions: ["*"] }],
      });
      if (r.canceled) return null;
      return core.attachFiles(chatId || null, r.filePaths);
    },
    "chats.attachPaths": (a) => core.attachFiles(a?.chatId || null, (a?.paths || []).filter((p) => typeof p === "string" && path.isAbsolute(p))),
    "chats.removeAttachment": (a) => core.removeAttachment(a?.chatId, a?.docId),
    "route.preview": (a) => core.previewRoute(a || {}),
    "consent.respond": (a) => core.respondConsent(a || {}),

    "memory.get": () => core.memory.data(),
    "memory.add": (text) => core.memory.add(text),
    "memory.update": (a) => core.memory.update(a?.id, a?.text),
    "memory.remove": (id) => core.memory.remove(id),
    "memory.clear": () => core.memory.clear(),
    "memory.accept": (id) => core.memory.accept(id),
    "memory.dismiss": (id) => core.memory.dismiss(id),

    "agents.list": () => core.listAgents(),
    "agents.save": (a) => core.saveAgent(a || {}),
    "agents.delete": (id) => core.deleteAgent(id),
    "agents.run": (id) => core.runAgent(id),
    "agents.stop": (runId) => core.stopRun(runId),
    "agents.approve": (a) => core.approveStep(a || {}),
    "agents.runs": (agentId) => core.listRuns(agentId),
    "agents.getRun": (id) => core.getRun(id),
    "agents.pickFolder": async () => {
      const r = await dialog.showOpenDialog(win, { title: "Share a folder with this agent", properties: ["openDirectory"] });
      return r.canceled ? null : r.filePaths[0];
    },
    "notes.list": () => core.listNotes(),
    "notes.delete": (id) => core.deleteNote(id),

    "activity.list": () => core.activity(),
    "activity.clear": () => core.clearActivity(),
    "data.delete": (opts) => core.deleteData(opts || {}),
    "data.usage": () => core.storageUsage(),
    "data.openFolder": () => shell.openPath(core.store.dir),
    "shell.open": (url) => openExternalSafe(url),
    "shell.copy": (text) => clipboard.writeText(String(text ?? "").slice(0, 2_000_000)),
  };
}

// ---------- окно помнит размер и положение ----------
const windowFile = () => path.join(app.getPath("userData"), "window.json");

function loadBounds() {
  try {
    const s = JSON.parse(readFileSync(windowFile(), "utf8"));
    const b = s.bounds;
    if (!b || ![b.x, b.y, b.width, b.height].every(Number.isFinite)) return null;
    // Окно должно хотя бы частично попадать на один из подключённых экранов.
    const visible = screen.getAllDisplays().some(({ workArea: w }) => b.x < w.x + w.width - 80 && b.x + b.width > w.x + 80 && b.y < w.y + w.height - 40 && b.y >= w.y - 10);
    return visible ? { bounds: b, maximized: !!s.maximized } : null;
  } catch {
    return null;
  }
}

let saveTimer = null;
function saveBounds() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (!win || win.isDestroyed()) return;
    try { writeFileSync(windowFile(), JSON.stringify({ bounds: win.getNormalBounds(), maximized: win.isMaximized() })); } catch {}
  }, 400);
}

// ---------- меню приложения (macOS) ----------
// Сочетания клавиш обрабатывает окно (так они работают и на Windows/Linux, где меню нет),
// а меню их показывает и вызывает те же действия по клику.
function buildMenu() {
  const act = (action) => () => send({ type: "menu", action });
  const item = (label, accelerator, action) => ({ label, accelerator, registerAccelerator: false, click: act(action) });
  return Menu.buildFromTemplate([
    { label: "pleeply", submenu: [
      { role: "about" }, { type: "separator" },
      item("Control Center…", "Cmd+,", "go:control"), { type: "separator" },
      { role: "services" }, { type: "separator" }, { role: "hide" }, { role: "hideOthers" }, { role: "unhide" }, { type: "separator" }, { role: "quit" },
    ] },
    { label: "File", submenu: [
      item("New Chat", "Cmd+N", "new-chat"),
      item("Search Chats…", "Cmd+K", "search"),
      item("Attach Files…", "Cmd+O", "attach"),
      { type: "separator" },
      item("Export Chat as Markdown…", "Cmd+Shift+E", "export"),
      { type: "separator" },
      { role: "close" },
    ] },
    { role: "editMenu" },
    { label: "View", submenu: [
      item("Toggle Sidebar", "Cmd+B", "sidebar"),
      item("Toggle This Computer Panel", "Cmd+I", "hw-panel"),
      { type: "separator" },
      item("Copy Last Answer", "Cmd+Shift+C", "copy-last"),
      { type: "separator" },
      { role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" }, { type: "separator" }, { role: "togglefullscreen" },
    ] },
    { label: "Go", submenu: [
      item("Back", "Cmd+[", "back"),
      item("Forward", "Cmd+]", "forward"),
      { type: "separator" },
      item("Chat", "Cmd+1", "go:chat"),
      item("Models", "Cmd+2", "go:models"),
      item("Agents", "Cmd+3", "go:agents"),
      item("Memory", "Cmd+4", "go:memory"),
      item("Control Center", "Cmd+5", "go:control"),
    ] },
    { role: "windowMenu" },
    { role: "help", submenu: [
      item("Keyboard Shortcuts", "Cmd+/", "shortcuts"),
      { label: "pleeply Website", click: () => openExternalSafe("https://pleeply.vercel.app") },
    ] },
  ]);
}

function createWindow() {
  const saved = loadBounds();
  win = new BrowserWindow({
    width: 1320, height: 860, minWidth: 940, minHeight: 620,
    ...(saved ? saved.bounds : {}),
    title: "pleeply",
    backgroundColor: "#000000",
    show: false,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    trafficLightPosition: { x: 18, y: 18 },
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: true,
    },
  });
  win.once("ready-to-show", () => {
    if (saved?.maximized) win.maximize();
    win.show();
  });
  for (const ev of ["resize", "move", "maximize", "unmaximize"]) win.on(ev, saveBounds);
  win.webContents.setWindowOpenHandler(({ url }) => { openExternalSafe(url); return { action: "deny" }; });
  win.webContents.on("will-navigate", (e, url) => {
    if (url !== win.webContents.getURL()) { e.preventDefault(); openExternalSafe(url); }
  });
  win.on("closed", () => { win = null; });
  win.loadFile(RENDERER);
  if (process.env.PLEEPLY_DEV) win.webContents.openDevTools({ mode: "detach" });
}

app.on("second-instance", () => {
  if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
});

app.whenReady().then(async () => {
  core = await new Core({
    dataDir: app.getPath("userData"), cipher, emit: send, openMail, version: app.getVersion(),
    openUrl: openExternalSafe,
    focusApp: () => { if (!win) return; if (win.isMinimized()) win.restore(); win.show(); win.focus(); app.focus({ steal: true }); },
  }).init();
  const handlers = api();
  ipcMain.handle("pleeply:invoke", async (e, method, arg) => {
    if (!e.senderFrame || !e.senderFrame.url.startsWith("file://")) return { error: "Not allowed" };
    const fn = handlers[method];
    if (!fn) return { error: `Unknown method ${method}` };
    try {
      return { ok: (await fn(arg)) ?? null };
    } catch (err) {
      if (!(err instanceof UserError)) console.error(`[pleeply] ${method}:`, err);
      return { error: err?.message || String(err), user: err instanceof UserError };
    }
  });
  Menu.setApplicationMenu(process.platform === "darwin" ? buildMenu() : null);
  createWindow();
  app.on("activate", () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

let quitting = false;
app.on("before-quit", async (e) => {
  if (quitting || !core) return;
  e.preventDefault();
  quitting = true;
  await Promise.race([core.dispose(), new Promise((r) => setTimeout(r, 3000))]);
  app.quit();
});
