import { mkdir, readFile, writeFile, rename, rm, readdir, appendFile, stat } from "node:fs/promises";
import path from "node:path";

/**
 * Всё, что pleeply хранит, лежит в одной папке на этом компьютере (userData).
 * JSON-файлы пишутся атомарно (tmp + rename), запись в один файл сериализуется.
 */
export class Store {
  constructor(dir) {
    this.dir = path.resolve(dir);
    this.queues = new Map();
  }

  async init() {
    for (const sub of ["", "chats", "docs", "runs", "notes"]) await mkdir(path.join(this.dir, sub), { recursive: true });
    return this;
  }

  file(name) {
    const p = path.resolve(this.dir, name);
    if (p !== this.dir && !p.startsWith(this.dir + path.sep)) throw new Error("Path outside data folder");
    return p;
  }

  async read(name, fallback) {
    try {
      return JSON.parse(await readFile(this.file(name), "utf8"));
    } catch (e) {
      if (e.code === "ENOENT" || e instanceof SyntaxError) return structuredClone(fallback);
      throw e;
    }
  }

  write(name, data) {
    const target = this.file(name);
    const prev = this.queues.get(target) || Promise.resolve();
    const next = prev.catch(() => {}).then(async () => {
      await mkdir(path.dirname(target), { recursive: true });
      const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
      await writeFile(tmp, JSON.stringify(data, null, 1));
      await rename(tmp, target);
    });
    this.queues.set(target, next);
    return next;
  }

  async remove(name) {
    await rm(this.file(name), { force: true, recursive: true });
  }

  async list(sub) {
    try {
      return (await readdir(this.file(sub))).filter((f) => f.endsWith(".json"));
    } catch (e) {
      if (e.code === "ENOENT") return [];
      throw e;
    }
  }

  async append(name, line) {
    await appendFile(this.file(name), JSON.stringify(line) + "\n");
  }

  async readLines(name, limit = 500) {
    try {
      const text = await readFile(this.file(name), "utf8");
      return text.trim().split("\n").filter(Boolean).slice(-limit).map((l) => {
        try { return JSON.parse(l); } catch { return null; }
      }).filter(Boolean);
    } catch (e) {
      if (e.code === "ENOENT") return [];
      throw e;
    }
  }

  async size(name = "") {
    let total = 0;
    const walk = async (p) => {
      let s;
      try { s = await stat(p); } catch { return; }
      if (s.isDirectory()) for (const f of await readdir(p)) await walk(path.join(p, f));
      else total += s.size;
    };
    await walk(this.file(name || "."));
    return total;
  }
}
