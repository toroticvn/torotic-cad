/**
 * Cloudflare Pages Function — /api/auth
 *   GET                    → { user } hiện tại (theo cookie) hoặc { user: null }
 *   POST { action:"signup", email, password, ten }
 *   POST { action:"login",  email, password }
 *   POST { action:"logout" }
 * Tài khoản email + mật khẩu, lưu trong D1 (binding `DB`). Xem docs/AUTH-SETUP.md.
 */
import {
  type D1Database, COOKIE, SESSION_DAYS,
  hashPassword, verifyPassword, randomToken,
  sessionCookie, clearCookie, getCookie, currentUser, json,
} from "../_lib/auth";

interface Env { DB?: D1Database; }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const onRequestGet = async (ctx: { request: Request; env: Env }): Promise<Response> => {
  if (!ctx.env.DB) return json({ user: null });
  const user = await currentUser(ctx.request, ctx.env.DB);
  return json({ user });
};

export const onRequestPost = async (ctx: { request: Request; env: Env }): Promise<Response> => {
  const { request, env } = ctx;
  if (!env.DB) return json({ error: "Chưa cấu hình D1 (binding DB). Xem docs/AUTH-SETUP.md." }, 500);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "Body JSON không hợp lệ." }, 400);
  }
  const action = String(body.action ?? "");

  if (action === "logout") {
    const token = getCookie(request, COOKIE);
    if (token) await env.DB.prepare(`delete from sessions where token = ?1`).bind(token).run();
    return json({ ok: true }, 200, { "set-cookie": clearCookie() });
  }

  if (action === "change_password") {
    const me = await currentUser(request, env.DB);
    if (!me) return json({ error: "Chưa đăng nhập." }, 401);
    const oldPw = String(body.oldPassword ?? "");
    const newPw = String(body.newPassword ?? "");
    if (newPw.length < 6) return json({ error: "Mật khẩu mới tối thiểu 6 ký tự." }, 400);
    const row = await env.DB.prepare(`select password_hash from users where id = ?1`).bind(me.id).all<{ password_hash: string }>();
    const h = row.results?.[0]?.password_hash;
    if (!h || !(await verifyPassword(oldPw, h))) return json({ error: "Mật khẩu hiện tại không đúng." }, 401);
    await env.DB.prepare(`update users set password_hash = ?1 where id = ?2`).bind(await hashPassword(newPw), me.id).run();
    // đăng xuất các phiên khác cho an toàn (giữ phiên hiện tại)
    const token = getCookie(request, COOKIE);
    if (token) await env.DB.prepare(`delete from sessions where user_id = ?1 and token != ?2`).bind(me.id, token).run();
    return json({ ok: true });
  }

  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");

  if (action === "signup") {
    const ten = String(body.ten ?? "").trim().slice(0, 80) || email.split("@")[0];
    if (!EMAIL_RE.test(email)) return json({ error: "Email không hợp lệ." }, 400);
    if (password.length < 6) return json({ error: "Mật khẩu tối thiểu 6 ký tự." }, 400);
    const exists = await env.DB.prepare(`select id from users where email = ?1`).bind(email).all();
    if (exists.results?.length) return json({ error: "Email đã được đăng ký." }, 409);

    const hash = await hashPassword(password);
    await env.DB.prepare(`insert into users (email, password_hash, ten) values (?1,?2,?3)`).bind(email, hash, ten).run();
    const idRow = await env.DB.prepare(`select id, email, ten from users where email = ?1`).bind(email).all<{ id: number; email: string; ten: string }>();
    const user = idRow.results?.[0];
    if (!user) return json({ error: "Tạo tài khoản thất bại." }, 500);

    const cookie = await startSession(env.DB, user.id);
    return json({ user }, 200, { "set-cookie": cookie });
  }

  if (action === "login") {
    if (!email || !password) return json({ error: "Thiếu email hoặc mật khẩu." }, 400);
    const row = await env.DB.prepare(`select id, email, ten, password_hash from users where email = ?1`).bind(email).all<{ id: number; email: string; ten: string; password_hash: string }>();
    const u = row.results?.[0];
    if (!u || !(await verifyPassword(password, u.password_hash))) {
      return json({ error: "Email hoặc mật khẩu không đúng." }, 401);
    }
    const cookie = await startSession(env.DB, u.id);
    return json({ user: { id: u.id, email: u.email, ten: u.ten } }, 200, { "set-cookie": cookie });
  }

  return json({ error: "Hành động không hợp lệ." }, 400);
};

async function startSession(db: D1Database, userId: number): Promise<string> {
  const token = randomToken();
  const expires = new Date(Date.now() + SESSION_DAYS * 86400 * 1000).toISOString();
  await db.prepare(`insert into sessions (token, user_id, expires_at) values (?1,?2,?3)`).bind(token, userId, expires).run();
  // best-effort cleanup of expired sessions
  try { await db.prepare(`delete from sessions where expires_at < ?1`).bind(new Date().toISOString()).run(); } catch { /* ignore */ }
  return sessionCookie(token);
}
