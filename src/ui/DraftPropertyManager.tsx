import { useViewportStore } from "../state/store";

/** SolidWorks-style left PropertyManager for Draft (taper) face selection. */
export function DraftPropertyManager() {
  const sel = useViewportStore((s) => s.draftSession);
  const setAngle = useViewportStore((s) => s.setDraftAngle);
  const setNeutral = useViewportStore((s) => s.setDraftNeutral);
  const apply = useViewportStore((s) => s.applyDraft);
  const cancel = useViewportStore((s) => s.cancelDraft);

  if (!sel) return null;

  return (
    <aside className="left-panel">
      <div className="pm-header">
        <span className="pm-header-title">◹ Draft (vát mặt)</span>
        <button className="pm-ok" title="Áp dụng" onClick={apply}>✓</button>
        <button className="pm-cancel" title="Huỷ" onClick={cancel}>✕</button>
      </div>

      <div className="pm-section">
        <div className="pm-heading">Mặt cần vát</div>
        <div className="pm-edgebox">
          {sel.points.length === 0 ? "Chưa chọn mặt nào" : `Đã chọn ${sel.points.length} mặt`}
        </div>
        <div className="pm-instruction"><b>Click</b> các mặt cần vát nghiêng trong khung nhìn.</div>
      </div>

      <div className="pm-section">
        <div className="pm-heading">Tham số</div>
        <label className="pm-option">
          <span>Góc vát (độ)</span>
          <input type="number" value={sel.angle} onChange={(e) => setAngle(parseFloat(e.target.value) || 0)} />
        </label>
        <label className="pm-option">
          <span>Mặt phẳng gốc</span>
          <select value={sel.neutralPlane} onChange={(e) => setNeutral(e.target.value as "XY" | "XZ" | "YZ")}>
            <option value="XY">XY (trên–dưới)</option>
            <option value="XZ">XZ (trước–sau)</option>
            <option value="YZ">YZ (trái–phải)</option>
          </select>
        </label>
      </div>

      <div className="pm-section">
        <button className="pm-apply-btn" onClick={apply} disabled={sel.points.length === 0}>
          ✓ Vát ({sel.points.length} mặt)
        </button>
      </div>
    </aside>
  );
}
