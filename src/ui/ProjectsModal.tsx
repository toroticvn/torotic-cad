import { useViewportStore } from "../state/store";

/** "Dự án của tôi": tạo / mở / lưu / đổi tên / xoá dự án trên đám mây (cần đăng nhập). */
export function ProjectsModal() {
  const open = useViewportStore((s) => s.projectsOpen);
  const close = useViewportStore((s) => s.closeProjects);
  const user = useViewportStore((s) => s.authUser);
  const openAuth = useViewportStore((s) => s.openAuth);
  const projects = useViewportStore((s) => s.myProjects);
  const busy = useViewportStore((s) => s.projectBusy);
  const error = useViewportStore((s) => s.projectError);
  const curId = useViewportStore((s) => s.cloudProjectId);
  const curName = useViewportStore((s) => s.cloudProjectName);
  const newProject = useViewportStore((s) => s.newCloudProject);
  const openProject = useViewportStore((s) => s.openCloudProject);
  const saveProject = useViewportStore((s) => s.saveCloudProject);
  const renameProject = useViewportStore((s) => s.renameCloudProject);
  const deleteProject = useViewportStore((s) => s.deleteCloudProject);

  if (!open) return null;

  const onNew = () => {
    const ten = window.prompt("Tên dự án mới:", "Dự án " + new Date().toLocaleDateString("vi"));
    if (ten && ten.trim()) void newProject(ten.trim());
  };
  const onSave = () => {
    if (curId) { void saveProject(); return; }
    const ten = window.prompt("Lưu mô hình hiện tại thành dự án — đặt tên:", "Dự án " + new Date().toLocaleDateString("vi"));
    if (ten && ten.trim()) void saveProject(ten.trim());
  };

  return (
    <div className="feedback-overlay" onClick={() => !busy && close()}>
      <div className="feedback-modal proj-modal" onClick={(e) => e.stopPropagation()}>
        <h3>☁ Dự án của tôi</h3>

        {!user ? (
          <div className="proj-login">
            <p>Đăng nhập để lưu và mở dự án trên đám mây.</p>
            <button className="primary" onClick={() => { close(); openAuth(); }}>👤 Đăng nhập</button>
          </div>
        ) : (
          <>
            <div className="proj-toolbar">
              <button onClick={onNew} disabled={busy}>＋ Tạo dự án mới</button>
              <button className="primary" onClick={onSave} disabled={busy}>
                ☁ Lưu {curId ? `"${curName}"` : "mô hình hiện tại"}
              </button>
            </div>
            {curId && <div className="proj-current">Đang mở: <strong>{curName}</strong></div>}

            {error && <div className="feedback-error">{error}</div>}
            {busy && <div className="fa-muted">Đang xử lý…</div>}

            <div className="proj-list">
              {projects.length === 0 && !busy && <div className="fa-muted">Chưa có dự án. Bấm "Tạo dự án mới" hoặc "Lưu".</div>}
              {projects.map((p) => (
                <div key={p.id} className={"proj-item" + (p.id === curId ? " sel" : "")}>
                  <div className="proj-item-info">
                    <div className="proj-item-name">{p.ten}</div>
                    <div className="fa-muted fa-small">{p.updated_at}{p.size_bytes ? ` · ${Math.round(p.size_bytes / 1024)} KB` : ""}</div>
                  </div>
                  <div className="proj-item-actions">
                    <button onClick={() => void openProject(p.id)} disabled={busy}>Mở</button>
                    <button onClick={() => { const t = window.prompt("Đổi tên dự án:", p.ten); if (t && t.trim()) void renameProject(p.id, t.trim()); }} disabled={busy}>Đổi tên</button>
                    <button onClick={() => { if (window.confirm(`Xoá dự án "${p.ten}"? Không thể hoàn tác.`)) void deleteProject(p.id); }} disabled={busy}>Xoá</button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="feedback-actions">
          <button onClick={close}>Đóng</button>
        </div>
      </div>
    </div>
  );
}
