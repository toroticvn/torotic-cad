import { useEffect, useState, useCallback } from "react";

/**
 * Admin viewer for user feedback. Hidden from normal users — only shows when the
 * URL hash is #feedback-admin, and requires the admin key (FEEDBACK_ADMIN_KEY on
 * the server). Lists reports, opens detail (screenshot + feature tree), and lets
 * the admin triage status. Lightweight: no router/auth, just hash + key.
 */

const KEY_LS = "torotic_feedback_key";
const STATUSES = ["moi", "dang_xem", "dang_lam", "da_xong", "tu_choi"] as const;
const STATUS_LABEL: Record<string, string> = {
  moi: "Mới", dang_xem: "Đang xem", dang_lam: "Đang làm", da_xong: "Đã xong", tu_choi: "Từ chối",
};

interface Row {
  id: number; loai: string; mo_ta: string; modules?: string; phien_ban?: string;
  trang?: string; man_hinh?: string; trang_thai: string; ghi_chu_admin?: string;
  ly_do_tu_choi?: string; created_at: string; co_anh?: number;
}
interface Detail extends Row { anh?: string; cay_tinh_nang?: string; trinh_duyet?: string; }

function useHash(target: string): boolean {
  const [on, setOn] = useState(() => location.hash === target);
  useEffect(() => {
    const fn = () => setOn(location.hash === target);
    window.addEventListener("hashchange", fn);
    return () => window.removeEventListener("hashchange", fn);
  }, [target]);
  return on;
}

export function FeedbackAdmin() {
  const visible = useHash("#feedback-admin");
  const [key, setKey] = useState<string>(() => localStorage.getItem(KEY_LS) ?? "");
  const [authed, setAuthed] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [filter, setFilter] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (k: string, status: string) => {
    setLoading(true); setError(null);
    try {
      const q = status ? `?trang_thai=${status}` : "";
      const r = await fetch(`/api/feedback${q}`, { headers: { "x-admin-key": k } });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || `Lỗi (${r.status})`);
      setRows(data.items ?? []);
      setAuthed(true);
      localStorage.setItem(KEY_LS, k);
    } catch (e) {
      setError((e as Error).message);
      setAuthed(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (visible && key && !authed) void load(key, filter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (!visible) return null;

  const openDetail = async (id: number) => {
    try {
      const r = await fetch(`/api/feedback?id=${id}`, { headers: { "x-admin-key": key } });
      const data = await r.json();
      if (r.ok) setDetail(data.item);
    } catch { /* ignore */ }
  };

  const update = async (id: number, patch: Record<string, unknown>) => {
    await fetch("/api/feedback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "update", key, id, ...patch }),
    });
    await load(key, filter);
    if (detail?.id === id) await openDetail(id);
  };

  return (
    <div className="fa-root">
      <div className="fa-bar">
        <strong>Torotic CAD — Feedback (admin)</strong>
        <a href="#" onClick={() => { location.hash = ""; }}>← Quay lại app</a>
      </div>

      {!authed ? (
        <div className="fa-login">
          <p>Nhập admin key (biến môi trường <code>FEEDBACK_ADMIN_KEY</code>):</p>
          <input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="admin key" />
          <button onClick={() => void load(key, filter)} disabled={loading}>Đăng nhập</button>
          {error && <div className="feedback-error">{error}</div>}
        </div>
      ) : (
        <div className="fa-body">
          <div className="fa-list">
            <div className="fa-filters">
              <button className={!filter ? "active" : ""} onClick={() => { setFilter(""); void load(key, ""); }}>Tất cả</button>
              {STATUSES.map((s) => (
                <button key={s} className={filter === s ? "active" : ""} onClick={() => { setFilter(s); void load(key, s); }}>
                  {STATUS_LABEL[s]}
                </button>
              ))}
            </div>
            {loading && <div className="fa-muted">Đang tải…</div>}
            {!loading && rows.length === 0 && <div className="fa-muted">Chưa có phản hồi.</div>}
            {rows.map((r) => (
              <div key={r.id} className={"fa-item" + (detail?.id === r.id ? " sel" : "")} onClick={() => void openDetail(r.id)}>
                <div className="fa-item-top">
                  <span>{r.loai === "bao_loi" ? "🐞" : "✨"} #{r.id}</span>
                  <span className={"fa-badge fa-" + r.trang_thai}>{STATUS_LABEL[r.trang_thai] ?? r.trang_thai}</span>
                </div>
                <div className="fa-item-desc">{r.mo_ta}</div>
                <div className="fa-muted fa-small">{r.created_at}{r.co_anh ? " · 📷" : ""}</div>
              </div>
            ))}
          </div>

          <div className="fa-detail">
            {!detail ? (
              <div className="fa-muted">Chọn một phản hồi để xem chi tiết.</div>
            ) : (
              <>
                <h3>{detail.loai === "bao_loi" ? "🐞 Báo lỗi" : "✨ Tính năng"} #{detail.id}</h3>
                <p className="fa-desc">{detail.mo_ta}</p>
                <div className="fa-meta">
                  {detail.modules && <div>Module: {safeList(detail.modules)}</div>}
                  <div>Trang: {detail.trang}</div>
                  <div>Phiên bản: {detail.phien_ban} · Màn hình: {detail.man_hinh}</div>
                  <div className="fa-small">{detail.trinh_duyet}</div>
                </div>

                {detail.anh && <img className="fa-shot" src={detail.anh} alt="screenshot" />}

                {detail.cay_tinh_nang && (
                  <details className="fa-tree">
                    <summary>Cây tính năng (JSON)</summary>
                    <pre>{pretty(detail.cay_tinh_nang)}</pre>
                  </details>
                )}

                <div className="fa-status-row">
                  {STATUSES.map((s) => (
                    <button key={s} className={detail.trang_thai === s ? "active" : ""} onClick={() => void update(detail.id, { trang_thai: s })}>
                      {STATUS_LABEL[s]}
                    </button>
                  ))}
                </div>

                <label className="fa-note">
                  Ghi chú admin
                  <textarea defaultValue={detail.ghi_chu_admin ?? ""} onBlur={(e) => void update(detail.id, { ghi_chu_admin: e.target.value })} />
                </label>
                <label className="fa-note">
                  Lý do từ chối
                  <textarea defaultValue={detail.ly_do_tu_choi ?? ""} onBlur={(e) => void update(detail.id, { ly_do_tu_choi: e.target.value })} />
                </label>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function safeList(s: string): string {
  try { return (JSON.parse(s) as string[]).join(", "); } catch { return s; }
}
function pretty(s: string): string {
  try { return JSON.stringify(JSON.parse(s), null, 2); } catch { return s; }
}
