/**
 * Cloudflare Pages Function — /api/feedback
 *
 * Báo lỗi / góp ý từ người dùng Torotic CAD, lưu vào Cloudflare D1.
 *  - POST (công khai): tạo một feedback. Body gồm loại + mô tả + (tuỳ chọn)
 *    ảnh viewport base64 + cây tính năng + bối cảnh trình duyệt.
 *  - POST { action: "update", key, ... }: admin đổi trạng thái/ghi chú (cần key).
 *  - GET (admin, cần header x-admin-key hoặc ?key=): danh sách / chi tiết.
 *
 * Yêu cầu: bind một D1 database tên `DB` cho Pages project, và (cho phần admin)
 * đặt biến môi trường `FEEDBACK_ADMIN_KEY`. Xem docs/FEEDBACK-SETUP.md.
 */

interface D1Result<T = Record<string, unknown>> {
  results?: T[];
  success: boolean;
}
interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  run(): Promise<D1Result>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  first<T = unknown>(col?: string): Promise<T | null>;
}
interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

interface Env {
  DB?: D1Database;
  FEEDBACK_ADMIN_KEY?: string;
}

const LOAI = new Set(["bao_loi", "tinh_nang"]);
const TRANG_THAI = new Set(["moi", "dang_xem", "dang_lam", "da_xong", "tu_choi"]);
const MAX_IMG = 800_000; // ~800KB base64 — bỏ ảnh nếu lớn hơn để an toàn với D1

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function adminOk(req: Request, env: Env): boolean {
  if (!env.FEEDBACK_ADMIN_KEY) return false;
  const url = new URL(req.url);
  const key = req.headers.get("x-admin-key") ?? url.searchParams.get("key") ?? "";
  return key === env.FEEDBACK_ADMIN_KEY;
}

export const onRequestPost = async (ctx: { request: Request; env: Env }): Promise<Response> => {
  const { request, env } = ctx;
  if (!env.DB) return json({ error: "Chưa cấu hình D1 (binding DB). Xem docs/FEEDBACK-SETUP.md." }, 500);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "Body JSON không hợp lệ." }, 400);
  }

  // --- Admin: đổi trạng thái / ghi chú / lý do từ chối ---
  if (body.action === "update") {
    if (!adminOk(request, env)) return json({ error: "unauthorized" }, 401);
    const id = Number(body.id);
    if (!id) return json({ error: "Thiếu id." }, 400);
    const trangThai = typeof body.trang_thai === "string" && TRANG_THAI.has(body.trang_thai) ? body.trang_thai : null;
    const ghiChu = typeof body.ghi_chu_admin === "string" ? body.ghi_chu_admin : null;
    const lyDo = typeof body.ly_do_tu_choi === "string" ? body.ly_do_tu_choi : null;
    await env.DB.prepare(
      `update feedback set
         trang_thai = coalesce(?1, trang_thai),
         ghi_chu_admin = coalesce(?2, ghi_chu_admin),
         ly_do_tu_choi = coalesce(?3, ly_do_tu_choi),
         updated_at = datetime('now')
       where id = ?4`,
    ).bind(trangThai, ghiChu, lyDo, id).run();
    return json({ ok: true });
  }

  // --- Công khai: tạo feedback ---
  const loai = String(body.loai ?? "");
  const moTa = String(body.mo_ta ?? "").trim();
  if (!LOAI.has(loai)) return json({ error: "Loại không hợp lệ." }, 400);
  if (moTa.length < 5) return json({ error: "Mô tả quá ngắn (≥5 ký tự)." }, 400);

  let anh = typeof body.anh === "string" ? body.anh : null;
  if (anh && anh.length > MAX_IMG) anh = null; // ảnh quá lớn → bỏ để không vượt giới hạn D1
  const modules = Array.isArray(body.modules) ? JSON.stringify(body.modules) : null;
  const cay = typeof body.cay_tinh_nang === "string" ? body.cay_tinh_nang.slice(0, 100_000) : null;

  const r = await env.DB.prepare(
    `insert into feedback (loai, mo_ta, modules, anh, cay_tinh_nang, phien_ban, trang, trinh_duyet, man_hinh)
     values (?1,?2,?3,?4,?5,?6,?7,?8,?9)`,
  ).bind(
    loai, moTa, modules, anh, cay,
    String(body.phien_ban ?? "").slice(0, 80),
    String(body.trang ?? "").slice(0, 300),
    String(body.trinh_duyet ?? "").slice(0, 400),
    String(body.man_hinh ?? "").slice(0, 40),
  ).run();

  return json({ ok: true, success: r.success });
};

export const onRequestGet = async (ctx: { request: Request; env: Env }): Promise<Response> => {
  const { request, env } = ctx;
  if (!env.DB) return json({ error: "Chưa cấu hình D1 (binding DB)." }, 500);
  if (!adminOk(request, env)) return json({ error: "unauthorized" }, 401);

  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  // Chi tiết 1 feedback (kèm ảnh + cây tính năng).
  if (id) {
    const row = await env.DB.prepare(`select * from feedback where id = ?1`).bind(Number(id)).all();
    return json({ item: row.results?.[0] ?? null });
  }

  // Danh sách (bỏ trường nặng anh/cay_tinh_nang để payload nhẹ).
  const status = url.searchParams.get("trang_thai");
  const where = status && TRANG_THAI.has(status) ? `where trang_thai = ?1` : "";
  const stmt = env.DB.prepare(
    `select id, loai, mo_ta, modules, phien_ban, trang, man_hinh, trang_thai, ghi_chu_admin, ly_do_tu_choi, created_at, updated_at,
            (anh is not null) as co_anh
     from feedback ${where} order by created_at desc limit 200`,
  );
  const rows = where ? await stmt.bind(status).all() : await stmt.all();
  return json({ items: rows.results ?? [] });
};
