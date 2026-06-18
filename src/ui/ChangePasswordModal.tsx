import { useState } from "react";
import { useViewportStore } from "../state/store";

/** Đổi mật khẩu cho tài khoản đang đăng nhập. */
export function ChangePasswordModal() {
  const open = useViewportStore((s) => s.pwOpen);
  const busy = useViewportStore((s) => s.authBusy);
  const error = useViewportStore((s) => s.authError);
  const close = useViewportStore((s) => s.closePwChange);
  const changePassword = useViewportStore((s) => s.changePassword);

  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [done, setDone] = useState(false);

  if (!open) return null;

  const submit = async () => {
    const ok = await changePassword(oldPw, newPw);
    if (ok) { setDone(true); setOldPw(""); setNewPw(""); }
  };

  return (
    <div className="feedback-overlay" onClick={() => !busy && close()}>
      <div className="feedback-modal auth-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Đổi mật khẩu</h3>
        {done ? (
          <>
            <p style={{ color: "var(--ok)" }}>✅ Đã đổi mật khẩu. Lần sau đăng nhập bằng mật khẩu mới.</p>
            <div className="feedback-actions"><button className="primary" onClick={close}>Đóng</button></div>
          </>
        ) : (
          <>
            <label className="feedback-label">Mật khẩu hiện tại</label>
            <input className="auth-input" type="password" value={oldPw} onChange={(e) => setOldPw(e.target.value)} disabled={busy} />
            <label className="feedback-label">Mật khẩu mới (≥6 ký tự)</label>
            <input className="auth-input" type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} disabled={busy}
              onKeyDown={(e) => e.key === "Enter" && submit()} />
            {error && <div className="feedback-error">{error}</div>}
            <div className="feedback-actions">
              <button onClick={close} disabled={busy}>Huỷ</button>
              <button className="primary" onClick={submit} disabled={busy}>{busy ? "Đang đổi…" : "Đổi mật khẩu"}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
