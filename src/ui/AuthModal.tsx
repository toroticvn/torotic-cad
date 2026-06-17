import { useState } from "react";
import { useViewportStore } from "../state/store";

/** Đăng nhập / đăng ký bằng email + mật khẩu (tài khoản lưu trên Cloudflare D1). */
export function AuthModal() {
  const open = useViewportStore((s) => s.authOpen);
  const busy = useViewportStore((s) => s.authBusy);
  const error = useViewportStore((s) => s.authError);
  const close = useViewportStore((s) => s.closeAuth);
  const login = useViewportStore((s) => s.login);
  const signup = useViewportStore((s) => s.signup);

  const [tab, setTab] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [ten, setTen] = useState("");

  if (!open) return null;

  const submit = () => {
    if (tab === "login") void login(email.trim(), password);
    else void signup(email.trim(), password, ten.trim());
  };

  return (
    <div className="feedback-overlay" onClick={() => !busy && close()}>
      <div className="feedback-modal auth-modal" onClick={(e) => e.stopPropagation()}>
        <div className="auth-tabs">
          <button className={tab === "login" ? "active" : ""} onClick={() => setTab("login")}>Đăng nhập</button>
          <button className={tab === "signup" ? "active" : ""} onClick={() => setTab("signup")}>Đăng ký</button>
        </div>

        {tab === "signup" && (
          <>
            <label className="feedback-label">Tên hiển thị</label>
            <input className="auth-input" value={ten} onChange={(e) => setTen(e.target.value)} placeholder="Tên của bạn" disabled={busy} />
          </>
        )}

        <label className="feedback-label">Email</label>
        <input className="auth-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ban@email.com" disabled={busy}
          onKeyDown={(e) => e.key === "Enter" && submit()} />

        <label className="feedback-label">Mật khẩu</label>
        <input className="auth-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={tab === "signup" ? "Tối thiểu 6 ký tự" : "Mật khẩu"} disabled={busy}
          onKeyDown={(e) => e.key === "Enter" && submit()} />

        {error && <div className="feedback-error">{error}</div>}

        <div className="feedback-actions">
          <button onClick={close} disabled={busy}>Huỷ</button>
          <button className="primary" onClick={submit} disabled={busy}>
            {busy ? "Đang xử lý…" : tab === "login" ? "Đăng nhập" : "Tạo tài khoản"}
          </button>
        </div>
      </div>
    </div>
  );
}
