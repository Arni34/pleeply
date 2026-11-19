// pleeply Memory: личный контекст, хранится только на этом компьютере. Всё видно, всё можно изменить или удалить.
import { uid, truncate } from "./util.js";

const EMPTY = { items: [], suggestions: [] };

export const LEARN_SCHEMA = {
  type: "object",
  properties: { facts: { type: "array", items: { type: "string" }, maxItems: 3 } },
};

const LEARN_PROMPT = `You maintain a short personal memory for the user of a desktop AI app.
From the user's message below, extract at most 3 durable facts or preferences about the user that would help in future conversations
(for example: preferred language, name, profession, ongoing projects, writing style, tools they use).
Only facts about the user count. Ignore general knowledge and answers to questions (for "What is the capital of France?" there is nothing to remember),
one-off requests, facts about other people, and anything sensitive such as health, finances, passwords or addresses.
Write each fact as a short third-person sentence, like "Prefers short answers" or "Is called Dana". If there is nothing durable, return an empty list.
Respond with JSON: {"facts": ["..."]}`;

function norm(s) {
  return String(s).toLowerCase().replace(/[^\p{L}\p{N} ]/gu, "").replace(/\s+/g, " ").trim();
}

function similar(a, b) {
  const x = new Set(norm(a).split(" ")), y = new Set(norm(b).split(" "));
  if (!x.size || !y.size) return false;
  let common = 0;
  for (const w of x) if (y.has(w)) common++;
  return common / Math.min(x.size, y.size) >= 0.75;
}

export class Memory {
  constructor(store) {
    this.store = store;
  }

  async data() {
    return this.store.read("memory.json", EMPTY);
  }

  async save(d) {
    await this.store.write("memory.json", d);
    return d;
  }

  async add(text, { origin = "you", chatId = null } = {}) {
    const t = truncate(String(text || "").trim(), 400);
    if (!t) throw new Error("Memory can't be empty.");
    const d = await this.data();
    if (d.items.some((i) => similar(i.text, t))) return d;
    d.items.unshift({ id: uid("m_"), text: t, origin, chatId, createdAt: new Date().toISOString(), updatedAt: null });
    return this.save(d);
  }

  async update(id, text) {
    const d = await this.data();
    const it = d.items.find((i) => i.id === id);
    if (!it) throw new Error("Not found");
    const t = truncate(String(text || "").trim(), 400);
    if (!t) return this.remove(id);
    it.text = t;
    it.updatedAt = new Date().toISOString();
    return this.save(d);
  }

  async remove(id) {
    const d = await this.data();
    d.items = d.items.filter((i) => i.id !== id);
    return this.save(d);
  }

  async clear() {
    return this.save(structuredClone(EMPTY));
  }

  async accept(id) {
    const d = await this.data();
    const s = d.suggestions.find((x) => x.id === id);
    d.suggestions = d.suggestions.filter((x) => x.id !== id);
    await this.save(d);
    return s ? this.add(s.text, { origin: "learned", chatId: s.chatId }) : d;
  }

  async dismiss(id) {
    const d = await this.data();
    d.suggestions = d.suggestions.filter((x) => x.id !== id);
    return this.save(d);
  }

  /** Блок для системного промпта. Пусто — если памяти нет или она выключена. */
  async forPrompt(limitChars = 1500) {
    const d = await this.data();
    if (!d.items.length) return "";
    let out = "", n = 0;
    for (const i of d.items) {
      const line = `- ${i.text}\n`;
      if (out.length + line.length > limitChars) break;
      out += line;
      n++;
    }
    return n ? `What you know about the user (from pleeply Memory; the user can see and edit this):\n${out}` : "";
  }

  /**
   * Учится на сообщении пользователя — только локальной моделью, никогда через облако.
   * mode: "suggest" — кладёт в предложения, "auto" — сразу в память.
   */
  async learn({ generate, userText, chatId, mode }) {
    if (!userText || userText.length < 12) return [];
    const r = await generate({
      system: LEARN_PROMPT,
      messages: [{ role: "user", content: truncate(userText, 3000) }],
      jsonSchema: LEARN_SCHEMA,
      temperature: 0,
      maxTokens: 200,
    });
    let facts = [];
    try { facts = JSON.parse(r.text).facts || []; } catch { return []; }
    facts = facts.map((f) => truncate(String(f).trim(), 200)).filter((f) => f.length > 4).slice(0, 3);
    const d = await this.data();
    const fresh = facts.filter((f) => !d.items.some((i) => similar(i.text, f)) && !d.suggestions.some((s) => similar(s.text, f)));
    if (!fresh.length) return [];
    if (mode === "auto") {
      for (const f of fresh) d.items.unshift({ id: uid("m_"), text: f, origin: "learned", chatId, createdAt: new Date().toISOString(), updatedAt: null });
    } else {
      for (const f of fresh) d.suggestions.unshift({ id: uid("s_"), text: f, chatId, createdAt: new Date().toISOString() });
      d.suggestions = d.suggestions.slice(0, 30);
    }
    await this.save(d);
    return fresh;
  }
}
