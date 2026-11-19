// Копирует библиотеки интерфейса и шрифты из node_modules в renderer/, чтобы окно не ходило в сеть.
// Запуск: npm run vendor (выполняется и перед сборкой).
import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";

const root = new URL("..", import.meta.url);
const nm = (p) => new URL(`node_modules/${p}`, root);
const out = (p) => new URL(`renderer/${p}`, root);

await mkdir(out("vendor"), { recursive: true });
await mkdir(out("fonts"), { recursive: true });

const rewrite = (src) => src.replace(/from\s*["']preact["']/g, 'from"./preact.mjs"').replace(/from\s*["']preact\/hooks["']/g, 'from"./hooks.mjs"');

const files = [
  ["preact/dist/preact.mjs", "vendor/preact.mjs"],
  ["preact/hooks/dist/hooks.mjs", "vendor/hooks.mjs"],
  ["htm/dist/htm.mjs", "vendor/htm.mjs"],
  ["marked/lib/marked.esm.js", "vendor/marked.mjs"],
  ["dompurify/dist/purify.es.mjs", "vendor/purify.mjs"],
];
for (const [from, to] of files) {
  const src = await readFile(nm(from), "utf8");
  await writeFile(out(to), rewrite(src).replace(/\n\/\/# sourceMappingURL=.*$/m, ""));
}
for (const f of ["geist-latin-wght-normal.woff2", "geist-latin-ext-wght-normal.woff2", "geist-cyrillic-wght-normal.woff2"]) {
  await copyFile(nm(`@fontsource-variable/geist/files/${f}`), out(`fonts/${f}`));
}
for (const f of ["geist-mono-latin-wght-normal.woff2", "geist-mono-cyrillic-wght-normal.woff2"]) {
  await copyFile(nm(`@fontsource-variable/geist-mono/files/${f}`), out(`fonts/${f}`)).catch(() => {});
}
console.log("vendor: ok");
