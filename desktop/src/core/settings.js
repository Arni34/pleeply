// Настройки Control Center. Любое изменение из интерфейса проходит через sanitizeSettings().

export const DEFAULT_SETTINGS = {
  onboarded: false,
  mode: "local", // режим по умолчанию в чате: local | cloud | auto
  cloud: {
    requests: "ask", // ask — спрашивать каждый раз, chat — один раз на чат и провайдера, off — облако выключено
    shareMemory: false, // отправлять ли Memory облачным моделям
    defaultModel: null, // "cloud:anthropic:claude-opus-5-5"
  },
  performance: {
    gpu: true, // GPU acceleration
    memoryGB: null, // Memory for models; null — автоматически по железу
    contextSize: 8192,
    keepLoadedMin: 10,
  },
  models: {
    dir: null, // null — папка models внутри данных pleeply
    ollama: { enabled: true, url: "http://127.0.0.1:11434" },
    lmstudio: { enabled: true, url: "http://127.0.0.1:1234" },
  },
  presets: { default: "saturn", models: { saturn: null, nova: null, atlas: null, orbit: null } },
  memory: { enabled: true, learn: "suggest" }, // learn: off | suggest | auto
  history: { keep: true },
  ui: { hwPanel: true, sidebar: true },
};

const MODES = ["local", "cloud", "auto"];
const REQUESTS = ["ask", "chat", "off"];
const LEARN = ["off", "suggest", "auto"];
const PRESET_IDS = ["saturn", "nova", "atlas", "orbit"];

export function isLoopbackUrl(u) {
  try {
    const url = new URL(u);
    return ["http:", "https:"].includes(url.protocol) && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  } catch {
    return false;
  }
}

export function mergeSettings(base, patch) {
  const out = structuredClone(base);
  const walk = (dst, src) => {
    for (const [k, v] of Object.entries(src || {})) {
      if (v && typeof v === "object" && !Array.isArray(v) && dst[k] && typeof dst[k] === "object") walk(dst[k], v);
      else dst[k] = v;
    }
  };
  walk(out, patch);
  return out;
}

/** Приводит настройки к допустимым значениям. Неизвестные ключи отбрасываются. */
export function sanitizeSettings(s) {
  const d = DEFAULT_SETTINGS;
  const m = mergeSettings(d, s);
  const out = structuredClone(d);
  out.onboarded = !!m.onboarded;
  out.mode = MODES.includes(m.mode) ? m.mode : d.mode;
  out.cloud.requests = REQUESTS.includes(m.cloud.requests) ? m.cloud.requests : d.cloud.requests;
  out.cloud.shareMemory = !!m.cloud.shareMemory;
  out.cloud.defaultModel = typeof m.cloud.defaultModel === "string" && m.cloud.defaultModel.startsWith("cloud:") ? m.cloud.defaultModel : null;
  out.performance.gpu = !!m.performance.gpu;
  const mem = Number(m.performance.memoryGB);
  out.performance.memoryGB = m.performance.memoryGB == null || !Number.isFinite(mem) ? null : Math.max(1, Math.min(1024, Math.round(mem * 2) / 2));
  const ctx = Number(m.performance.contextSize);
  out.performance.contextSize = [2048, 4096, 8192, 16384, 32768, 65536].includes(ctx) ? ctx : d.performance.contextSize;
  const keep = Number(m.performance.keepLoadedMin);
  out.performance.keepLoadedMin = [0, 2, 5, 10, 30, 60].includes(keep) ? keep : d.performance.keepLoadedMin;
  out.models.dir = typeof m.models.dir === "string" && m.models.dir.length > 1 ? m.models.dir : null;
  for (const k of ["ollama", "lmstudio"]) {
    out.models[k].enabled = !!m.models[k].enabled;
    // Локальные движки — только на этом компьютере: адрес вне loopback превратил бы «Local» в отправку по сети.
    out.models[k].url = isLoopbackUrl(m.models[k].url) ? String(m.models[k].url).replace(/\/+$/, "") : d.models[k].url;
  }
  out.presets.default = PRESET_IDS.includes(m.presets.default) ? m.presets.default : d.presets.default;
  for (const p of PRESET_IDS) {
    const v = m.presets.models?.[p];
    out.presets.models[p] = typeof v === "string" && /^(pleeply|ollama|lmstudio):/.test(v) ? v : null;
  }
  out.memory.enabled = !!m.memory.enabled;
  out.memory.learn = LEARN.includes(m.memory.learn) ? m.memory.learn : d.memory.learn;
  out.history.keep = !!m.history.keep;
  out.ui.hwPanel = !!m.ui.hwPanel;
  out.ui.sidebar = !!m.ui.sidebar;
  return out;
}
