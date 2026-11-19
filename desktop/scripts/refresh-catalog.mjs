// Сверяет каталог локальных моделей с Hugging Face и записывает реальные размеры файлов.
// Запуск: npm run catalog  → src/core/catalog.json
import { writeFile } from "node:fs/promises";

// kv — мегабайты KV-кэша на 1000 токенов контекста (f16): 2 × слои × kv-головы × размер головы × 2 байта.
const MODELS = [
  { id: "qwen2.5-0.5b", name: "Qwen 2.5", size: "0.5B", params: 0.5, family: "Qwen", repo: "Qwen/Qwen2.5-0.5B-Instruct-GGUF", file: "qwen2.5-0.5b-instruct-q4_k_m.gguf", ctx: 32768, kv: 12, tools: false, tags: ["tiny"] },
  { id: "llama3.2-1b", name: "Llama 3.2", size: "1B", params: 1.2, family: "Llama", repo: "bartowski/Llama-3.2-1B-Instruct-GGUF", quant: "Q4_K_M", ctx: 131072, kv: 32, tools: false, tags: ["fast"] },
  { id: "gemma3-1b", name: "Gemma 3", size: "1B", params: 1, family: "Gemma", repo: "bartowski/google_gemma-3-1b-it-GGUF", quant: "Q4_K_M", ctx: 32768, kv: 26, tools: false, tags: ["fast"] },
  { id: "qwen3-1.7b", name: "Qwen 3", size: "1.7B", params: 1.7, family: "Qwen", repo: "bartowski/Qwen_Qwen3-1.7B-GGUF", quant: "Q4_K_M", ctx: 32768, kv: 112, tools: true, tags: ["thinking"] },
  { id: "llama3.2-3b", name: "Llama 3.2", size: "3B", params: 3.2, family: "Llama", repo: "bartowski/Llama-3.2-3B-Instruct-GGUF", quant: "Q4_K_M", ctx: 131072, kv: 112, tools: true, tags: [] },
  { id: "qwen2.5-3b", name: "Qwen 2.5", size: "3B", params: 3.1, family: "Qwen", repo: "bartowski/Qwen2.5-3B-Instruct-GGUF", quant: "Q4_K_M", ctx: 32768, kv: 36, tools: true, tags: ["long-context"] },
  { id: "phi4-mini", name: "Phi-4 mini", size: "3.8B", params: 3.8, family: "Phi", repo: "bartowski/microsoft_Phi-4-mini-instruct-GGUF", quant: "Q4_K_M", ctx: 131072, kv: 128, tools: true, tags: ["reasoning"] },
  { id: "gemma3-4b", name: "Gemma 3", size: "4B", params: 4.3, family: "Gemma", repo: "bartowski/google_gemma-3-4b-it-GGUF", quant: "Q4_K_M", ctx: 131072, kv: 136, tools: false, tags: ["writing"] },
  { id: "qwen3-4b", name: "Qwen 3", size: "4B", params: 4, family: "Qwen", repo: "bartowski/Qwen_Qwen3-4B-GGUF", quant: "Q4_K_M", ctx: 32768, kv: 144, tools: true, tags: ["thinking", "agents"] },
  { id: "mistral-7b", name: "Mistral", size: "7B", params: 7.2, family: "Mistral", repo: "bartowski/Mistral-7B-Instruct-v0.3-GGUF", quant: "Q4_K_M", ctx: 32768, kv: 128, tools: true, tags: [] },
  { id: "qwen2.5-7b", name: "Qwen 2.5", size: "7B", params: 7.6, family: "Qwen", repo: "bartowski/Qwen2.5-7B-Instruct-GGUF", quant: "Q4_K_M", ctx: 32768, kv: 56, tools: true, tags: ["long-context", "agents"] },
  { id: "llama3.1-8b", name: "Llama 3.1", size: "8B", params: 8, family: "Llama", repo: "bartowski/Meta-Llama-3.1-8B-Instruct-GGUF", quant: "Q4_K_M", ctx: 131072, kv: 128, tools: true, tags: [] },
  { id: "qwen3-8b", name: "Qwen 3", size: "8B", params: 8.2, family: "Qwen", repo: "bartowski/Qwen_Qwen3-8B-GGUF", quant: "Q4_K_M", ctx: 32768, kv: 144, tools: true, tags: ["thinking", "agents"] },
  { id: "gemma3-12b", name: "Gemma 3", size: "12B", params: 12, family: "Gemma", repo: "bartowski/google_gemma-3-12b-it-GGUF", quant: "Q4_K_M", ctx: 131072, kv: 384, tools: false, tags: ["writing"] },
  { id: "qwen2.5-14b", name: "Qwen 2.5", size: "14B", params: 14.8, family: "Qwen", repo: "bartowski/Qwen2.5-14B-Instruct-GGUF", quant: "Q4_K_M", ctx: 32768, kv: 192, tools: true, tags: ["long-context"] },
  { id: "qwen3-14b", name: "Qwen 3", size: "14B", params: 14.8, family: "Qwen", repo: "bartowski/Qwen_Qwen3-14B-GGUF", quant: "Q4_K_M", ctx: 32768, kv: 160, tools: true, tags: ["thinking", "agents"] },
  { id: "mistral-small-24b", name: "Mistral Small 3.2", size: "24B", params: 24, family: "Mistral", repo: "bartowski/mistralai_Mistral-Small-3.2-24B-Instruct-2506-GGUF", quant: "Q4_K_M", ctx: 131072, kv: 160, tools: true, tags: [] },
  { id: "qwen3-32b", name: "Qwen 3", size: "32B", params: 32.8, family: "Qwen", repo: "bartowski/Qwen_Qwen3-32B-GGUF", quant: "Q4_K_M", ctx: 32768, kv: 256, tools: true, tags: ["thinking"] },
  { id: "llama3.1-70b", name: "Llama 3.1", size: "70B", params: 70.6, family: "Llama", repo: "bartowski/Meta-Llama-3.1-70B-Instruct-GGUF", quant: "Q4_K_M", ctx: 131072, kv: 320, tools: true, tags: [] },
];

async function tree(repo) {
  const r = await fetch(`https://huggingface.co/api/models/${repo}/tree/main?recursive=true`, { headers: { "User-Agent": "pleeply-desktop-catalog" } });
  if (!r.ok) throw new Error(`${repo}: HTTP ${r.status}`);
  return r.json();
}

const out = [];
for (const m of MODELS) {
  try {
    const files = (await tree(m.repo)).filter((f) => f.type === "file" && f.path.endsWith(".gguf"));
    const pick = m.file
      ? files.filter((f) => f.path === m.file)
      : files.filter((f) => f.path.toLowerCase().includes(m.quant.toLowerCase()) && !/mmproj/i.test(f.path));
    if (!pick.length) throw new Error(`${m.repo}: no ${m.file || m.quant} file`);
    const bytes = pick.reduce((s, f) => s + (f.lfs?.size ?? f.size), 0);
    const filePath = pick.length === 1 ? pick[0].path : pick.map((f) => f.path).sort()[0];
    const { quant, ...rest } = m;
    out.push({ ...rest, quant: quant || "Q4_K_M", file: filePath, parts: pick.length, bytes, uri: `hf:${m.repo}/${filePath}` });
    console.log("ok ", m.id.padEnd(20), (bytes / 1e9).toFixed(2), "GB", pick.length > 1 ? `(${pick.length} parts)` : "", filePath);
  } catch (e) {
    console.log("ERR", m.id.padEnd(20), e.message);
  }
}
await writeFile(new URL("../src/core/catalog.json", import.meta.url), JSON.stringify({ checked: new Date().toISOString().slice(0, 10), models: out }, null, 2) + "\n");
