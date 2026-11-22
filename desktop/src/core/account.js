// Аккаунт pleeply в приложении. Вход через Google идёт в обычном браузере: сайт pleeply возвращает одноразовый код
// на http://127.0.0.1:<порт>/callback, приложение меняет его на токен с проверкой PKCE (RFC 8252 для настольных приложений).
// Пароль Google приложение не видит; токен сессии хранится зашифрованным системной связкой ключей.
import http from "node:http";
import crypto from "node:crypto";
import os from "node:os";
import { UserError } from "./util.js";

export const ACCOUNT_URL = process.env.PLEEPLY_ACCOUNT_URL || "https://pleeply.vercel.app";

const page = (ok, text) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>pleeply</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#000;color:#d4d4d4;font:16px/1.6 system-ui,-apple-system,sans-serif}
main{max-width:420px;padding:32px;text-align:center}h1{color:#fff;font-weight:500;font-size:24px;margin:0 0 8px}i{display:block;width:44px;height:44px;margin:0 auto 18px;border-radius:50%;background:${ok ? "#3e9b5a" : "#444"}}</style>
</head><body><main><i></i><h1>${ok ? "You're signed in to pleeply" : "Sign-in didn't finish"}</h1><p>${text}</p></main></body></html>`;

export class Account {
  constructor({ store, cipher, emit = () => {}, openUrl = () => {}, focusApp = () => {}, baseUrl = ACCOUNT_URL }) {
    Object.assign(this, { store, cipher, emit, openUrl, focusApp, baseUrl });
    this.memToken = null;
    this.info = null;
    this.pending = null;
    this.poll = null;
  }

  async init() {
    const s = await this.store.read("account.json", null);
    this.info = s?.info || null;
    this.hasSaved = Boolean(s?.enc);
    return this;
  }

  async token() {
    if (this.memToken) return this.memToken;
    const s = await this.store.read("account.json", null);
    if (!s?.enc) return null;
    try { return this.cipher.decrypt(s.enc); } catch { return null; }
  }

  async authHeader() {
    const t = await this.token();
    return t ? { authorization: `Bearer ${t}` } : {};
  }

  status() {
    const signedIn = Boolean(this.memToken || this.hasSaved);
    return { signedIn, signingIn: Boolean(this.pending), ...(signedIn ? this.info || {} : {}) };
  }

  async #save(token, info) {
    this.info = info;
    if (this.cipher.available()) {
      await this.store.write("account.json", { enc: this.cipher.encrypt(token), info });
      this.hasSaved = true;
    } else {
      this.memToken = token; // без системного шифрования держим вход только до закрытия приложения
    }
  }

  async #call(path, { method = "GET", body, auth = true } = {}) {
    const headers = { "content-type": "application/json", ...(auth ? await this.authHeader() : {}) };
    let r;
    try {
      r = await fetch(`${this.baseUrl}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000) });
    } catch {
      throw new UserError("Couldn't reach pleeply. Check your connection.");
    }
    const j = await r.json().catch(() => ({}));
    if (r.status === 401 && auth) { await this.forget(); throw new UserError("You were signed out. Sign in again."); }
    if (!r.ok) throw new UserError(j.error || `pleeply returned ${r.status}.`);
    return j;
  }

  /** Обновить тариф, лимиты и расход за сегодня. */
  async refresh() {
    if (!(await this.token())) return this.status();
    const j = await this.#call("/api/account/me");
    this.info = { account: j.account, usage: j.usage || {}, price: j.price, upgrade: j.upgrade, plans: j.plans };
    const s = await this.store.read("account.json", null);
    if (s?.enc) await this.store.write("account.json", { ...s, info: this.info });
    this.emit({ type: "account" });
    return this.status();
  }

  /** Открыть вход через Google в браузере и дождаться кода на локальном адресе. */
  async signIn() {
    if (this.pending) { this.openUrl(this.pending.url); return this.status(); }
    const verifier = crypto.randomBytes(48).toString("base64url");
    const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
    const state = crypto.randomBytes(24).toString("base64url");
    let finish;
    const done = new Promise((resolve) => { finish = resolve; });
    const server = http.createServer((req, res) => {
      const u = new URL(req.url, "http://127.0.0.1");
      if (u.pathname !== "/callback") { res.writeHead(404); return res.end(); }
      const q = Object.fromEntries(u.searchParams);
      if (q.state !== state) { res.writeHead(400, { "content-type": "text/html; charset=utf-8" }); return res.end(page(false, "This link isn't from your current sign-in. Start again from pleeply.")); }
      const ok = Boolean(q.code) && !q.error;
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(page(ok, ok ? "You can close this tab and return to pleeply." : q.error === "cancelled" ? "You cancelled. You can close this tab." : "Something went wrong with Google. Close this tab and try again in pleeply."));
      finish(ok ? { code: q.code } : { error: q.error || "google" });
    });
    await new Promise((resolve, reject) => server.listen(0, "127.0.0.1", resolve).on("error", reject));
    const { port } = server.address();
    const url = `${this.baseUrl}/api/auth/desktop?${new URLSearchParams({ port: String(port), state, challenge })}`;
    const timer = setTimeout(() => finish({ error: "timeout" }), 5 * 60_000);
    this.pending = { url, finish };
    this.emit({ type: "account" });
    this.openUrl(url);
    done.then(async (r) => {
      clearTimeout(timer);
      server.close();
      this.pending = null;
      try {
        if (!r.code) {
          if (r.error === "google") this.emit({ type: "toast", kind: "err", text: "Google sign-in didn't finish. Try again." });
          return;
        }
        const j = await this.#call("/api/auth/token", { method: "POST", auth: false, body: { code: r.code, verifier, device: `${os.hostname()} · ${process.platform}` } });
        await this.#save(j.token, { account: j.account, usage: {} });
        this.focusApp();
        this.emit({ type: "toast", text: `Signed in as ${j.account.email}.` });
        await this.refresh().catch(() => {});
      } catch (e) {
        this.emit({ type: "toast", kind: "err", text: e.message });
      } finally {
        this.emit({ type: "account" });
      }
    });
    return this.status();
  }

  cancelSignIn() {
    this.pending?.finish({ error: "cancelled" });
    return this.status();
  }

  async signOut() {
    if (await this.token()) await this.#call("/api/account/signout", { method: "POST" }).catch(() => {});
    await this.forget();
    return this.status();
  }

  async forget() {
    clearInterval(this.poll);
    this.memToken = null;
    this.info = null;
    this.hasSaved = false;
    await this.store.remove("account.json");
    this.emit({ type: "account" });
  }

  /** Оплата Pro в браузере (Paddle); после оплаты тариф подтягивается сам. */
  async upgrade() {
    const j = await this.#call("/api/account/checkout", { method: "POST" });
    this.openUrl(j.url);
    clearInterval(this.poll);
    const until = Date.now() + 15 * 60_000;
    this.poll = setInterval(async () => {
      const st = await this.refresh().catch(() => null);
      if (st?.account?.plan === "pro") {
        clearInterval(this.poll);
        this.emit({ type: "toast", text: "You're on pleeply Pro. Thank you!" });
      } else if (Date.now() > until) clearInterval(this.poll);
    }, 20_000);
    return { url: j.url };
  }

  async manage() {
    const j = await this.#call("/api/account/portal", { method: "POST" });
    this.openUrl(j.url);
    return { url: j.url };
  }
}
