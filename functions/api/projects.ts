/**
 * Cloudflare Pages Function — /api/projects (cần đăng nhập)
 *   GET                      → danh sách dự án của tôi (metadata)
 *   GET ?id=N                → 1 dự án của tôi (kèm `data`)
 *   POST { action:"create", ten }
 *   POST { action:"save",   id, ten?, data }   (data = JSON dự án)
 *   POST { action:"rename", id, ten }
 *   POST { action:"delete", id }
 *
 * Lưu trong D1 (binding `DB`) — cả metadata lẫn nội dung (cột `data`), KHÔNG cần
 * R2 (nên không cần thẻ). Giới hạn ~900KB/ dự án để an toàn với D1; dự án nhúng
 * file STEP/STL nặng nên lưu ra file .json trên máy thay vì đám mây.
 */
import { type D1Database, currentUser, json } from "../_lib/auth";

interface Env { DB?: D1Database; }

const MAX_DATA = 900_000; // ~900KB — an toàn cho một bản ghi D1

export const onRequestGet = async (ctx: { request: Request; env: Env }): Promise<Response> => {
  const { request, env } = ctx;
  if (!env.DB) return json({ error: "Chưa cấu hình D1 (binding DB)." }, 500);
  const user = await currentUser(request, env.DB);
  if (!user) return json({ error: "Chưa đăng nhập." }, 401);

  const id = new URL(request.url).searchParams.get("id");
  if (id) {
    const row = await env.DB.prepare(`select id, ten, data, updated_at, created_at from projects where id = ?1 and user_id = ?2`)
      .bind(Number(id), user.id).all<{ id: number; ten: string; data: string; updated_at: string; created_at: string }>();
    const p = row.results?.[0];
    if (!p) return json({ error: "Không tìm thấy dự án." }, 404);
    return json({ item: { id: p.id, ten: p.ten, updated_at: p.updated_at, created_at: p.created_at, data: p.data || '{"version":1,"features":[]}' } });
  }

  const rows = await env.DB.prepare(`select id, ten, size_bytes, updated_at, created_at from projects where user_id = ?1 order by updated_at desc limit 200`)
    .bind(user.id).all();
  return json({ items: rows.results ?? [] });
};

export const onRequestPost = async (ctx: { request: Request; env: Env }): Promise<Response> => {
  const { request, env } = ctx;
  if (!env.DB) return json({ error: "Chưa cấu hình D1 (binding DB)." }, 500);
  const user = await currentUser(request, env.DB);
  if (!user) return json({ error: "Chưa đăng nhập." }, 401);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "Body JSON không hợp lệ." }, 400);
  }
  const action = String(body.action ?? "");

  if (action === "create") {
    const ten = String(body.ten ?? "").trim().slice(0, 120) || "Dự án mới";
    await env.DB.prepare(`insert into projects (user_id, ten) values (?1, ?2)`).bind(user.id, ten).run();
    const row = await env.DB.prepare(`select id, ten, updated_at, created_at from projects where user_id = ?1 order by id desc limit 1`)
      .bind(user.id).all<{ id: number; ten: string; updated_at: string; created_at: string }>();
    return json({ item: row.results?.[0] });
  }

  const id = Number(body.id);
  if (!id) return json({ error: "Thiếu id." }, 400);
  const own = await env.DB.prepare(`select id from projects where id = ?1 and user_id = ?2`).bind(id, user.id).all();
  if (!own.results?.length) return json({ error: "Không có quyền với dự án này." }, 403);

  if (action === "save") {
    const data = typeof body.data === "string" ? body.data : null;
    if (!data) return json({ error: "Thiếu dữ liệu dự án." }, 400);
    if (data.length > MAX_DATA) return json({ error: "Dự án quá lớn để lưu đám mây (>900KB). Hãy dùng '💾 Lưu file' cho dự án nhúng file STEP/STL nặng." }, 413);
    const ten = typeof body.ten === "string" && body.ten.trim() ? body.ten.trim().slice(0, 120) : null;
    await env.DB.prepare(`update projects set data = ?1, size_bytes = ?2, ten = coalesce(?3, ten), updated_at = datetime('now') where id = ?4`)
      .bind(data, data.length, ten, id).run();
    return json({ ok: true });
  }

  if (action === "rename") {
    const ten = String(body.ten ?? "").trim().slice(0, 120);
    if (!ten) return json({ error: "Tên trống." }, 400);
    await env.DB.prepare(`update projects set ten = ?1, updated_at = datetime('now') where id = ?2`).bind(ten, id).run();
    return json({ ok: true });
  }

  if (action === "delete") {
    await env.DB.prepare(`delete from projects where id = ?1`).bind(id).run();
    return json({ ok: true });
  }

  return json({ error: "Hành động không hợp lệ." }, 400);
};
