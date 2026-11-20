// Точка входа окна pleeply.
import { render } from "./vendor/preact.mjs";
import { html, S, set, call, tryCall, toast, useStore, refreshState, refreshModels, refreshChats, go } from "./ui.js";
import { Sidebar, ConsentModal, Onboarding, Toasts, Palette, Shortcuts, runAction, IS_MAC } from "./views.js";
import { ChatView } from "./chat.js";
import { ModelsView } from "./models.js";
import { ControlView } from "./control.js";
import { AgentsView, refreshAgents } from "./agents.js";
import { MemoryView, refreshMemory } from "./memory.js";

function App() {
  useStore();
  if (!S.ready) return html`<div class="hello"><p class="shimmer">Starting pleeply…</p></div>`;
  if (!S.app.settings.onboarded) return html`<${Onboarding} /><${Toasts} />`;
  const View = { chat: ChatView, models: ModelsView, agents: AgentsView, memory: MemoryView, control: ControlView }[S.view] || ChatView;
  const side = S.app.settings.ui.sidebar;
  return html`<div class=${"shell" + (side ? "" : " no-side")}>
    ${side ? html`<${Sidebar} />` : null}
    <main class="main"><${View} /></main>
    ${S.palette ? html`<${Palette} />` : null}
    ${S.shortcuts ? html`<${Shortcuts} />` : null}
    ${S.consent ? html`<${ConsentModal} key=${S.consent.id} />` : null}
    <${Toasts} />
  </div>`;
}

let chatsTimer = null;
const refreshChatsSoon = () => { clearTimeout(chatsTimer); chatsTimer = setTimeout(refreshChats, 300); };
let modelsTimer = null;
const refreshModelsSoon = () => { clearTimeout(modelsTimer); modelsTimer = setTimeout(refreshModels, 300); };

function countApprovals() {
  return Object.values(S.runs).reduce((n, r) => n + r.steps.filter((s) => s.status === "waiting").length, 0);
}

window.pleeply.on((ev) => {
  switch (ev.type) {
    case "chat":
      if (S.chat?.id === ev.chat.id) set({ chat: ev.chat });
      else if (!S.chat && S.view === "chat" && ev.chat.messages.length <= 2) {
        // Новый чат получил id — запоминаем его в истории переходов.
        const cur = S.nav.stack[S.nav.i];
        if (cur?.view === "chat" && !cur.chatId) cur.chatId = ev.chat.id;
        set({ chat: ev.chat });
      }
      refreshChatsSoon();
      break;
    case "delta": {
      if (S.chat?.id !== ev.chatId) break;
      const m = S.chat.messages.find((x) => x.id === ev.messageId);
      if (!m) break;
      m[ev.field] = (m[ev.field] || "") + ev.text;
      if (m.status !== "streaming") m.status = "streaming";
      set();
      break;
    }
    case "consent":
      set({ consent: { id: ev.id, disclosure: ev.disclosure } });
      break;
    case "consent:cancel":
      if (S.consent?.id === ev.id) set({ consent: null });
      break;
    case "download": {
      const downloads = { ...S.downloads };
      if (ev.finished || ev.error || ev.cancelled) delete downloads[ev.id];
      else downloads[ev.id] = { id: ev.id, label: ev.label, total: ev.total, done: ev.done };
      set({ downloads });
      if (ev.finished) toast(`${ev.label} is ready to use.`, "info", { label: "Chat", run: () => go("chat") });
      if (ev.error) toast(ev.error, "err");
      if (ev.finished || ev.error || ev.cancelled) refreshModelsSoon();
      break;
    }
    case "models":
      refreshModelsSoon();
      break;
    case "hardware":
    case "settings":
      refreshState().then(refreshModelsSoon);
      break;
    case "engine":
      set({ engine: ev });
      break;
    case "memory":
      refreshMemory();
      toast(ev.mode === "auto" ? `Remembered: ${ev.learned.join("; ")}` : `pleeply suggests ${ev.learned.length} thing${ev.learned.length > 1 ? "s" : ""} to remember.`, "info", { label: "Review", run: () => go("memory") }, 6000);
      break;
    case "run": {
      set({ runs: { ...S.runs, [ev.run.id]: ev.run } });
      set({ pendingApprovals: countApprovals() });
      if (["done", "failed", "stopped"].includes(ev.run.status)) { refreshAgents(); set({ notesTick: Date.now() }); }
      break;
    }
    case "approval":
      if (S.view !== "agents") toast("An agent is waiting for your OK.", "info", { label: "Open", run: () => go("agents") }, 8000);
      break;
    case "activity":
      set({ activityTick: Date.now() });
      break;
    case "toast":
      toast(ev.text, ev.kind || "info");
      break;
    case "starter":
      refreshModelsSoon();
      break;
    case "menu":
      if (S.ready && S.app.settings.onboarded && !S.consent) { set({ palette: false, shortcuts: false }); runAction(ev.action); }
      break;
    case "data-deleted":
      set({ chat: null, memory: null, agents: null, runs: {} });
      refreshChats(); refreshMemory();
      break;
  }
});

async function boot() {
  try {
    const app = await refreshState();
    set({ mode: app.settings.mode, selection: { type: "auto" } });
    await Promise.all([refreshChats(), refreshModels(), refreshMemory()]);
    set({ ready: true });
  } catch (e) {
    document.getElementById("app").textContent = `pleeply couldn't start: ${e.message}`;
  }
}

render(html`<${App} />`, document.getElementById("app"));
boot();

// ---------- горячие клавиши (те же, что в меню macOS; на Windows/Linux — с Ctrl) ----------
const SHORTCUTS = { n: "new-chat", k: "search", o: "attach", b: "sidebar", i: "hw-panel", ",": "go:control", "/": "shortcuts", "[": "back", "]": "forward",
  1: "go:chat", 2: "go:models", 3: "go:agents", 4: "go:memory", 5: "go:control" };
const SHIFT_SHORTCUTS = { c: "copy-last", e: "export" };
const isTyping = (el) => el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

window.addEventListener("keydown", (e) => {
  if (!S.ready || !S.app?.settings.onboarded || S.consent) return;
  const mod = IS_MAC ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (mod && !e.altKey) {
    const action = e.shiftKey ? SHIFT_SHORTCUTS[key] : SHORTCUTS[key] || SHORTCUTS[e.code?.replace(/^Digit/, "")];
    if (action) {
      e.preventDefault();
      set({ palette: false, shortcuts: false });
      runAction(action);
    }
    return;
  }
  if (S.palette || S.shortcuts) return;
  if (e.key === "Escape") {
    // Esc останавливает ответ, если открыт чат и ничего другого не перехватило клавишу.
    if (S.view === "chat" && S.chat?.messages?.some((m) => ["routing", "consent", "streaming"].includes(m.status)) && !document.querySelector(".menu")) {
      e.preventDefault();
      runAction("stop");
    }
    return;
  }
  // Начали печатать в чате вне поля ввода — переносим фокус в поле сообщения.
  if (S.view === "chat" && !S.editing && e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey && !isTyping(document.activeElement)) {
    document.querySelector(".composer textarea")?.focus();
  }
});

// Перетаскивание файлов мимо поля ввода не должно открывать их в окне.
window.addEventListener("dragover", (e) => e.preventDefault());
window.addEventListener("drop", (e) => e.preventDefault());
