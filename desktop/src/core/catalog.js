import { readFileSync } from "node:fs";

const data = JSON.parse(readFileSync(new URL("./catalog.json", import.meta.url), "utf8"));

/** Проверенный каталог локальных моделей (GGUF с Hugging Face, Q4_K_M). Обновляется `npm run catalog`. */
export const CATALOG = data.models.map((m) => ({
  ...m,
  label: `${m.name} · ${m.size}`,
}));

export const CATALOG_CHECKED = data.checked;

export function catalogById(id) {
  return CATALOG.find((m) => m.id === id) || null;
}

/** Угадывает параметры модели по имени файла (для моделей из Discover и Ollama). */
export function guessParams(name) {
  const m = String(name).match(/(\d+(?:\.\d+)?)\s*[bB](?![a-z])/);
  return m ? Number(m[1]) : null;
}
