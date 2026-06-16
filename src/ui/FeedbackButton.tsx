import { useState } from "react";
import { useViewportStore } from "../state/store";

/** App version sent with each report (bump on release; shows in admin view). */
const APP_VERSION = "2026-06-17";

const MODULES = ["Sketch", "Khối / Feature", "Trợ lý AI", "Nhập / Xuất", "Giao diện", "Khác"];

/**
 * Floating "báo lỗi / góp ý" button + modal. Auto-attaches the current viewport
 * screenshot + feature-tree JSON + browser context so the admin can reproduce.
 * Posts to /api/feedback (Cloudflare D1). Always mounted at the app root.
 */
export function FeedbackButton() {
  const viewport = useViewportStore((s) => s.viewport);
  const features = useViewportStore((s) => s.features);

  const [open, setOpen] = useState(false);
  const [loai, setLoai] = useState<"bao_loi" | "tinh_nang">("bao_loi");
  const [moTa, setMoTa] = useState("");
  const [mods, setMods] = useState<string[]>([]);
  const [attach, setAttach] = useState(true);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setMoTa(""); setMods([]); setLoai("bao_loi"); setAttach(true); setError(null); setDone(false);
  };

  const toggleMod = (m: string) =>
    setMods((s) => (s.includes(m) ? s.filter((x) => x !== m) : [...s, m]));

  const submit = async () => {
    if (moTa.trim().length < 5) { setError("Vui lòng mô tả rõ hơn (≥5 ký tự)."); return; }
    setBusy(true); setError(null);
    try {
      const anh = attach && viewport ? safeShot(viewport) : null;
      const payload = {
        loai,
        mo_ta: moTa.trim(),
        modules: mods,
        anh,
        cay_tinh_nang: JSON.stringify(features ?? []).slice(0, 100_000),
        phien_ban: APP_VERSION,
        trang: location.href,
        trinh_duyet: navigator.userAgent,
        man_hinh: `${window.innerWidth}x${window.innerHeight}`,
      };
      const r = await fetch("/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || `Lỗi máy chủ (${r.status}).`);
      setDone(true);
    } catch (e) {
      setError("Không gửi được: " + (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button className="feedback-fab" title="Báo lỗi / Góp ý" onClick={() => { reset(); setOpen(true); }}>
        🐞 Báo lỗi
      </button>

      {open && (
        <div className="feedback-overlay" onClick={() => !busy && setOpen(false)}>
          <div className="feedback-modal" onClick={(e) => e.stopPropagation()}>
            {done ? (
              <div className="feedback-done">
                <h3>✅ Đã gửi, cảm ơn bạn!</h3>
                <p>Phản hồi của bạn đã được ghi nhận. Chúng tôi sẽ xem và xử lý.</p>
                <div className="feedback-actions">
                  <button onClick={() => { reset(); }}>Gửi phản hồi khác</button>
                  <button className="primary" onClick={() => setOpen(false)}>Đóng</button>
                </div>
              </div>
            ) : (
              <>
                <h3>Báo lỗi / Góp ý</h3>

                <div className="feedback-row">
                  <label className={loai === "bao_loi" ? "chip active" : "chip"}>
                    <input type="radio" name="loai" checked={loai === "bao_loi"} onChange={() => setLoai("bao_loi")} />
                    🐞 Báo lỗi
                  </label>
                  <label className={loai === "tinh_nang" ? "chip active" : "chip"}>
                    <input type="radio" name="loai" checked={loai === "tinh_nang"} onChange={() => setLoai("tinh_nang")} />
                    ✨ Đề xuất tính năng
                  </label>
                </div>

                <label className="feedback-label">Mô tả chi tiết</label>
                <textarea
                  className="feedback-textarea"
                  rows={5}
                  placeholder="Bạn đang làm gì? Điều gì xảy ra? Bạn mong đợi điều gì?"
                  value={moTa}
                  onChange={(e) => setMoTa(e.target.value)}
                  disabled={busy}
                />

                <label className="feedback-label">Liên quan tới (tuỳ chọn)</label>
                <div className="feedback-mods">
                  {MODULES.map((m) => (
                    <label key={m} className={mods.includes(m) ? "chip active" : "chip"}>
                      <input type="checkbox" checked={mods.includes(m)} onChange={() => toggleMod(m)} />
                      {m}
                    </label>
                  ))}
                </div>

                <label className="feedback-attach">
                  <input type="checkbox" checked={attach} onChange={(e) => setAttach(e.target.checked)} disabled={busy} />
                  Đính kèm ảnh màn hình 3D hiện tại + dữ liệu mô hình (giúp xử lý nhanh hơn)
                </label>

                {error && <div className="feedback-error">{error}</div>}

                <div className="feedback-actions">
                  <button onClick={() => setOpen(false)} disabled={busy}>Huỷ</button>
                  <button className="primary" onClick={submit} disabled={busy}>
                    {busy ? "Đang gửi…" : "Gửi"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

/** Capture the viewport at a modest size; never throw out of the submit flow. */
function safeShot(viewport: { captureImage: (n?: number) => string }): string | null {
  try {
    return viewport.captureImage(800);
  } catch {
    return null;
  }
}
