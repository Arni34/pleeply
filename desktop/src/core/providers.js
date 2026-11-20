// Облачные провайдеры. Подключаются только вашим ключом; без ключа pleeply работает полностью локально.

// Адрес шлюза pleeply Cloud (для тестов можно подменить переменной окружения).
export const PLEEPLY_CLOUD_URL = process.env.PLEEPLY_CLOUD_URL || "https://pleeply.vercel.app/api/ai/v1";

export const PROVIDERS = [
  {
    id: "pleeply", name: "pleeply Cloud", product: "GPT, Claude, Gemini, DeepSeek", kind: "gateway", baseUrl: PLEEPLY_CLOUD_URL, builtIn: true,
    policy: "https://pleeply.vercel.app/info/", keyUrl: "https://pleeply.vercel.app", keyHint: "",
  },
  {
    id: "anthropic", name: "Anthropic", product: "Claude", kind: "anthropic",
    policy: "https://www.anthropic.com/legal/privacy", keyUrl: "https://console.anthropic.com/settings/keys", keyHint: "sk-ant-…",
    suggested: [
      { id: "claude-opus-5-5", label: "Claude Opus 5.5" },
      { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5" },
      { id: "claude-haiku-5-5", label: "Claude Haiku 5.5" },
    ],
  },
  { id: "openai", name: "OpenAI", product: "GPT", kind: "openai", baseUrl: "https://api.openai.com/v1", policy: "https://openai.com/policies/privacy-policy/", keyUrl: "https://platform.openai.com/api-keys", keyHint: "sk-…" },
  { id: "google", name: "Google", product: "Gemini", kind: "gemini", policy: "https://ai.google.dev/gemini-api/terms", keyUrl: "https://aistudio.google.com/apikey", keyHint: "AIza…" },
  { id: "groq", name: "Groq", product: "Groq", kind: "openai", baseUrl: "https://api.groq.com/openai/v1", policy: "https://groq.com/privacy-policy/", keyUrl: "https://console.groq.com/keys", keyHint: "gsk_…" },
  { id: "openrouter", name: "OpenRouter", product: "OpenRouter", kind: "openai", baseUrl: "https://openrouter.ai/api/v1", policy: "https://openrouter.ai/privacy", keyUrl: "https://openrouter.ai/settings/keys", keyHint: "sk-or-…" },
  { id: "deepseek", name: "DeepSeek", product: "DeepSeek", kind: "openai", baseUrl: "https://api.deepseek.com/v1", policy: "https://cdn.deepseek.com/policies/en-US/deepseek-privacy-policy.html", keyUrl: "https://platform.deepseek.com/api_keys", keyHint: "sk-…" },
  { id: "mistral", name: "Mistral AI", product: "Mistral", kind: "openai", baseUrl: "https://api.mistral.ai/v1", policy: "https://legal.mistral.ai/terms/privacy-policy", keyUrl: "https://console.mistral.ai/api-keys", keyHint: "…" },
];

// Для автотестов: поддельный провайдер на localhost (только если задана переменная окружения).
if (process.env.PLEEPLY_TEST_PROVIDER_URL) {
  PROVIDERS.push({ id: "testcloud", name: "Test Cloud", product: "Test", kind: "openai", baseUrl: process.env.PLEEPLY_TEST_PROVIDER_URL, policy: "https://example.com/privacy", keyUrl: "https://example.com", keyHint: "test" });
}

export function providerById(id) {
  return PROVIDERS.find((p) => p.id === id) || null;
}

/** Ссылка на модель: "cloud:<provider>:<model id>" (id модели может содержать двоеточия). */
export function parseCloudRef(ref) {
  const m = /^cloud:([a-z0-9]+):(.+)$/.exec(String(ref || ""));
  return m ? { providerId: m[1], modelId: m[2] } : null;
}

/**
 * Ключи API шифруются системным хранилищем (Keychain на macOS, DPAPI на Windows, libsecret на Linux)
 * через Electron safeStorage и никогда не передаются в окно приложения.
 */
export class KeyStore {
  constructor(store, cipher) {
    this.store = store;
    this.cipher = cipher; // { available(): bool, encrypt(str): string, decrypt(str): string }
    this.session = new Map(); // если шифрование недоступно — держим ключ только до закрытия приложения
  }

  async #all() {
    return this.store.read("keys.json", {});
  }

  async set(providerId, key) {
    const clean = String(key || "").trim();
    if (!providerById(providerId)) throw new Error("Unknown provider");
    if (clean.length < 8 || /\s/.test(clean)) throw new Error("That doesn't look like an API key.");
    if (!this.cipher.available()) {
      this.session.set(providerId, clean);
      return { persisted: false };
    }
    const all = await this.#all();
    all[providerId] = { enc: this.cipher.encrypt(clean), last4: clean.slice(-4), addedAt: new Date().toISOString() };
    await this.store.write("keys.json", all);
    return { persisted: true };
  }

  async get(providerId) {
    if (this.session.has(providerId)) return this.session.get(providerId);
    if (providerId === "testcloud") return "test-key";
    const all = await this.#all();
    if (!all[providerId]) return null;
    try {
      return this.cipher.decrypt(all[providerId].enc);
    } catch {
      return null;
    }
  }

  async remove(providerId) {
    this.session.delete(providerId);
    const all = await this.#all();
    delete all[providerId];
    await this.store.write("keys.json", all);
  }

  /** Что можно показать в интерфейсе: подключён ли провайдер и последние 4 символа ключа. */
  async status() {
    const all = await this.#all();
    const out = {};
    for (const p of PROVIDERS) {
      if (p.builtIn) out[p.id] = { connected: true, builtIn: true };
      else if (p.id === "testcloud") out[p.id] = { connected: true, last4: "test" };
      else if (this.session.has(p.id)) out[p.id] = { connected: true, last4: this.session.get(p.id).slice(-4), sessionOnly: true };
      else if (all[p.id]) out[p.id] = { connected: true, last4: all[p.id].last4, addedAt: all[p.id].addedAt };
      else out[p.id] = { connected: false };
    }
    return out;
  }
}
