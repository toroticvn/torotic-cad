/**
 * Shared auth helpers for Cloudflare Pages Functions (runs on the Workers
 * runtime: Web Crypto, btoa/atob, TextEncoder are all available).
 *
 * Passwords: PBKDF2-SHA256, 100k iterations, random 16-byte salt, stored as
 * `pbkdf2$<iter>$<saltB64>$<hashB64>`. Sessions: random 256-bit hex token in the
 * `sessions` table + an HttpOnly cookie. (Cookie is intentionally NOT `Secure` so
 * it also works through the localhost dev proxy on this machine; the production
 * site is HTTPS-only anyway, and the cookie stays HttpOnly + SameSite=Lax.)
 *
 * Underscore folder (`_lib`) → not routed by Pages, only imported.
 */

export interface D1Result<T = Record<string, unknown>> {
  results?: T[];
  success: boolean;
}
export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  run(): Promise<D1Result>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  first<T = unknown>(col?: string): Promise<T | null>;
}
export interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

const ITER = 100_000;
export const COOKIE = "tcad_session";
export const SESSION_DAYS = 30;

function b64(buf: ArrayBuffer): string {
  let s = "";
  for (const b of new Uint8Array(buf)) s += String.fromCharCode(b);
  return btoa(s);
}
function fromB64(s: string): Uint8Array {
  const bin = atob(s);
  const a = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
  return a;
}

async function deriveBits(pw: string, salt: Uint8Array, iter: number): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pw), "PBKDF2", false, ["deriveBits"]);
  return crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: iter, hash: "SHA-256" }, key, 256);
}

export async function hashPassword(pw: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const bits = await deriveBits(pw, salt, ITER);
  return `pbkdf2$${ITER}$${b64(salt.buffer)}$${b64(bits)}`;
}

export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const iter = parseInt(parts[1], 10) || ITER;
  const salt = fromB64(parts[2]);
  const expect = fromB64(parts[3]);
  const got = new Uint8Array(await deriveBits(pw, salt, iter));
  if (got.length !== expect.length) return false;
  let r = 0;
  for (let i = 0; i < got.length; i++) r |= got[i] ^ expect[i];
  return r === 0;
}

export function randomToken(): string {
  return [...crypto.getRandomValues(new Uint8Array(32))].map((x) => x.toString(16).padStart(2, "0")).join("");
}

export function sessionCookie(token: string, maxAgeSec = SESSION_DAYS * 86400): string {
  return `${COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAgeSec}`;
}
export function clearCookie(): string {
  return `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;
}
export function getCookie(req: Request, name: string): string | null {
  const c = req.headers.get("cookie");
  if (!c) return null;
  for (const part of c.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    if (part.slice(0, idx).trim() === name) return part.slice(idx + 1).trim();
  }
  return null;
}

export interface UserRow { id: number; email: string; ten: string | null; }

/** Resolve the logged-in user from the session cookie (null if none/expired). */
export async function currentUser(req: Request, db: D1Database): Promise<UserRow | null> {
  const token = getCookie(req, COOKIE);
  if (!token) return null;
  const row = await db
    .prepare(`select u.id, u.email, u.ten, s.expires_at from sessions s join users u on u.id = s.user_id where s.token = ?1`)
    .bind(token)
    .all<{ id: number; email: string; ten: string | null; expires_at: string }>();
  const r = row.results?.[0];
  if (!r) return null;
  if (new Date(r.expires_at).getTime() < Date.now()) return null;
  return { id: r.id, email: r.email, ten: r.ten };
}

export function json(data: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...extraHeaders },
  });
}
