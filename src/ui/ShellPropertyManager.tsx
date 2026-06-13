import { useViewportStore } from "../state/store";

/** SolidWorks-style left PropertyManager for the Shell (hollow) face selection. */
export function ShellPropertyManager() {
  const sel = useViewportStore((s) => s.shellSession);
  const setThickness = useViewportStore((s) => s.setShellThickness);
  const apply = useViewportStore((s) => s.applyShell);
  const cancel = useViewportStore((s) => s.cancelShell);

  if (!sel) return null;

  return (
    <aside className="left-panel">
      <div className="pm-header">
        <span className="pm-header-title">▢ Shell (khoét rỗng)</span>
        <button className="pm-ok" title="Áp dụng" onClick={apply}>✓</button>
        <button className="pm-cancel" title="Huỷ" onClick={cancel}>✕</button>
      </div>

      <div className="pm-section">
        <div className="pm-heading">Mặt cần khoét hở</div>
        <div className="pm-edgebox">
          {sel.points.length === 0 ? "Chưa chọn mặt nào" : `Đã chọn ${sel.points.length} mặt`}
        </div>
        <div className="pm-instruction">
          <b>Click</b> vào các mặt của khối muốn để hở (mặt đó sẽ bị bỏ đi, phần còn lại giữ thành mỏng).
        </div>
      </div>

      <div className="pm-section">
        <div className="pm-heading">Độ dày thành</div>
        <label className="pm-option">
          <span>Độ dày (mm)</span>
          <input type="number" min={0.1} value={sel.thickness} onChange={(e) => setThickness(parseFloat(e.target.value) || 0.1)} />
        </label>
      </div>

      <div className="pm-section">
        <button className="pm-apply-btn" onClick={apply} disabled={sel.points.length === 0}>
          ✓ Khoét rỗng ({sel.points.length} mặt)
        </button>
      </div>
    </aside>
  );
}
