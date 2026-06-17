import { useViewportStore } from "../state/store";

/** Toolbar account area: shows login button, or the user + logout when signed in. */
export function AccountButton() {
  const user = useViewportStore((s) => s.authUser);
  const openAuth = useViewportStore((s) => s.openAuth);
  const logout = useViewportStore((s) => s.logout);

  if (!user) {
    return <button className="ai-btn" onClick={openAuth} title="Đăng nhập / Đăng ký">👤 Đăng nhập</button>;
  }
  return (
    <span className="account-area" title={user.email}>
      <span className="account-name">👤 {user.ten || user.email}</span>
      <button onClick={() => void logout()} title="Đăng xuất">Đăng xuất</button>
    </span>
  );
}
