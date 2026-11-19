// Atlas: чтение файлов, разбиение на фрагменты и выбор самых нужных под вопрос (BM25, без облака и без эмбеддингов).
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { UserError, truncate } from "./util.js";

export const TEXT_EXT = new Set([
  ".txt", ".md", ".markdown", ".mdx", ".csv", ".tsv", ".json", ".jsonl", ".html", ".htm", ".xml", ".log", ".yaml", ".yml",
  ".toml", ".ini", ".cfg", ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".py", ".rb", ".go", ".rs", ".java", ".kt", ".swift",
  ".c", ".h", ".cpp", ".hpp", ".cs", ".php", ".sh", ".zsh", ".sql", ".css", ".scss", ".tex", ".srt", ".vtt", ".rst", ".org",
]);
export const SUPPORTED_EXT = new Set([...TEXT_EXT, ".pdf"]);
const MAX_TEXT_BYTES = 8 * 1024 * 1024;
const MAX_PDF_BYTES = 60 * 1024 * 1024;

export function htmlToText(html) {
  return String(html)
    .replace(/<(script|style|noscript|svg|head)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6]|tr|section|article)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
}

/** Текст файла по страницам. Для PDF — постранично (чтобы ссылаться на страницу), для остального — одна «страница». */
export async function extractText(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const name = path.basename(filePath);
  const s = await stat(filePath);
  if (!s.isFile()) throw new UserError(`${name} is not a file.`);
  if (ext === ".docx" || ext === ".doc" || ext === ".pages") throw new UserError(`${name}: Word and Pages files aren't supported yet. Save it as PDF or plain text.`);
  if (ext === ".pdf") {
    if (s.size > MAX_PDF_BYTES) throw new UserError(`${name} is larger than 60 MB.`);
    const { getDocumentProxy, extractText: pdfText } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(await readFile(filePath)));
    const { text } = await pdfText(pdf, { mergePages: false });
    const pages = text.map((t, i) => ({ page: i + 1, text: String(t).replace(/[ \t]+/g, " ").trim() })).filter((p) => p.text);
    if (!pages.length) throw new UserError(`${name} has no selectable text (it may be a scan).`);
    return { name, ext, pages, chars: pages.reduce((n, p) => n + p.text.length, 0) };
  }
  if (s.size > MAX_TEXT_BYTES) throw new UserError(`${name} is larger than 8 MB.`);
  const buf = await readFile(filePath);
  const sample = buf.subarray(0, 4096);
  if (!TEXT_EXT.has(ext) && sample.includes(0)) throw new UserError(`${name} doesn't look like a text file.`);
  let text = buf.toString("utf8");
  if (ext === ".html" || ext === ".htm") text = htmlToText(text);
  text = text.replace(/\r\n/g, "\n").trim();
  if (!text) throw new UserError(`${name} is empty.`);
  return { name, ext, pages: [{ page: null, text }], chars: text.length };
}

/** Режет страницы на фрагменты ~size символов по границам абзацев/предложений. */
export function chunkPages(pages, { size = 900, overlap = 120 } = {}) {
  const out = [];
  for (const p of pages) {
    const t = p.text;
    let start = 0;
    while (start < t.length) {
      let end = Math.min(t.length, start + size);
      if (end < t.length) {
        const window = t.slice(start + size * 0.6, end);
        const cut = Math.max(window.lastIndexOf("\n\n"), window.lastIndexOf(". "), window.lastIndexOf("\n"));
        if (cut > 0) end = start + Math.floor(size * 0.6) + cut + 1;
      }
      const text = t.slice(start, end).trim();
      if (text) out.push({ page: p.page, text, start });
      if (end >= t.length) break;
      start = Math.max(end - overlap, start + 1);
    }
  }
  return out.map((c, i) => ({ ...c, i }));
}

const STOP = new Set("the a an and or of to in on for is are was were be been it this that with as at by from what which who how why when where do does did can could would should will i you he she we they me my your our their not no yes about into than then so if but also any all some more most such only very just these those there here have has had у в и на с по о об от до из за что как это для не да же ли бы к мы вы они он она оно его её их я ты мне меня так тоже еще ещё или а но то все всё".split(" "));

export function tokenize(s) {
  return (String(s).toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) || []).filter((w) => !STOP.has(w));
}

/** BM25 по фрагментам: какие куски документов лучше всего отвечают на вопрос. */
export function bm25Rank(chunks, query, { k1 = 1.4, b = 0.75 } = {}) {
  const q = [...new Set(tokenize(query))];
  const docs = chunks.map((c) => tokenize(c.text));
  const N = docs.length || 1;
  const avg = docs.reduce((s, d) => s + d.length, 0) / N || 1;
  const df = new Map();
  for (const d of docs) for (const w of new Set(d)) df.set(w, (df.get(w) || 0) + 1);
  return chunks.map((chunk, i) => {
    const d = docs[i];
    const tf = new Map();
    for (const w of d) tf.set(w, (tf.get(w) || 0) + 1);
    let score = 0;
    for (const w of q) {
      const f = tf.get(w);
      if (!f) continue;
      const idf = Math.log(1 + (N - df.get(w) + 0.5) / (df.get(w) + 0.5));
      score += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.length) / avg)));
    }
    return { chunk, score };
  }).sort((a, b) => b.score - a.score);
}

/**
 * Выбирает фрагменты под вопрос в пределах бюджета символов.
 * docs: [{ id, name, chunks }]. Если всё помещается — берём всё по порядку.
 */
export function selectSources(docs, query, budgetChars) {
  const all = docs.flatMap((d) => d.chunks.map((c) => ({ ...c, docId: d.id, name: d.name })));
  const total = all.reduce((s, c) => s + c.text.length, 0);
  if (total <= budgetChars) return { chunks: all, narrowed: false };
  const ranked = bm25Rank(all, query);
  const picked = [];
  let used = 0;
  for (const { chunk, score } of ranked) {
    if (used + chunk.text.length > budgetChars) continue;
    if (score <= 0 && picked.length >= 3) break;
    picked.push(chunk);
    used += chunk.text.length;
  }
  // В исходном порядке документа, чтобы модели было легче читать.
  picked.sort((a, b) => (a.docId === b.docId ? a.i - b.i : docs.findIndex((d) => d.id === a.docId) - docs.findIndex((d) => d.id === b.docId)));
  return { chunks: picked, narrowed: true };
}

/** Нумерованные источники для промпта и карта ссылок [n] → файл/страница/отрывок для интерфейса. */
export function formatSources(chunks) {
  const citations = {};
  const parts = chunks.map((c, k) => {
    const n = k + 1;
    const where = c.page ? `${c.name}, page ${c.page}` : c.name;
    citations[n] = { name: c.name, page: c.page, docId: c.docId, excerpt: truncate(c.text, 600) };
    return `[${n}] ${where}\n${c.text}`;
  });
  return { text: parts.join("\n\n"), citations };
}
