import { useViewportStore } from "../state/store";

/** SolidWorks-style left PropertyManager for 3D Fillet/Chamfer edge selection. */
export function FilletPropertyManager() {
  const sel = useViewportStore((s) => s.edgeSelect);
  const setRadius = useViewportStore((s) => s.setEdgeSelectRadius);
  const apply = useViewportStore((s) => s.applyEdgeSelect);
  const cancel = useViewportStore((s) => s.cancelEdgeSelect);

  if (!sel) return null;
  const isFillet = sel.kind === "fillet";

  return (
    <aside className="left-panel">
      <div className="pm-header">
        <span className="pm-header-title">{isFillet ? "⌒ Fillet" : "◣ Chamfer"}</span>
        <button className="pm-ok" title="Áp dụng" onClick={apply}>✓</button>
        <button className="pm-cancel" title="Huỷ" onClick={cancel}>✕</button>
      </div>

      <div className="pm-section">
        <div className="pm-heading">Cạnh cần {isFillet ? "bo" : "vát"}</div>
        <div className="pm-edgebox">
          {sel.points.length === 0 ? "Chưa chọn cạnh nào" : `Đã chọn ${sel.points.length} cạnh`}
        </div>
        <div className="pm-instruction">
          Rê chuột tới cạnh khối (cạnh sáng vàng) rồi <b>click</b> để chọn. Click lại vùng trống để bỏ qua.
          Không chọn cạnh nào ⇒ áp cho <b>tất cả</b> cạnh.
        </div>
      </div>

      <div className="pm-section">
        <div className="pm-heading">{isFillet ? "Bán kính bo" : "Khoảng vát"}</div>
        <label className="pm-option">
          <span>{isFillet ? "Bán kính" : "Kích thước"} (mm)</span>
          <input type="number" min={0.1} value={sel.radius} onChange={(e) => setRadius(parseFloat(e.target.value) || 0.1)} />
        </label>
      </div>

      <div className="pm-section">
        <button className="pm-apply-btn" onClick={apply}>
          {sel.points.length === 0 ? `✓ ${isFillet ? "Bo" : "Vát"} TẤT CẢ cạnh` : `✓ Áp dụng (${sel.points.length} cạnh)`}
        </button>
      </div>
    </aside>
  );
}
