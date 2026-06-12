import { useViewportStore } from "../state/store";
import type { BoolOp } from "../features";

/** SolidWorks-style left PropertyManager for Extrude (with contour selection). */
export function ExtrudePropertyManager() {
  const s = useViewportStore((st) => st.extrudeSession);
  const setDistance = useViewportStore((st) => st.setExtrudeDistance);
  const setOperation = useViewportStore((st) => st.setExtrudeOperation);
  const apply = useViewportStore((st) => st.applyExtrude);
  const cancel = useViewportStore((st) => st.cancelExtrude);
  const hasSolid = useViewportStore((st) => st.features.some((f) => f.type === "extrude" || f.type === "revolve" || f.type === "loft" || f.type === "sweep"));
  const kernelStatus = useViewportStore((st) => st.kernelStatus);
  const busy = useViewportStore((st) => st.busy);
  const error = useViewportStore((st) => st.featureError);

  if (!s) return null;
  const loading = kernelStatus === "loading" || busy;
  const multi = s.regionCount > 1;

  return (
    <aside className="left-panel">
      <div className="pm-header">
        <span className="pm-header-title">⬆️ Extrude</span>
        <button className="pm-ok" title="Đùn" onClick={apply} disabled={loading}>✓</button>
        <button className="pm-cancel" title="Huỷ" onClick={cancel} disabled={loading}>✕</button>
      </div>

      <div className="pm-section">
        <div className="pm-heading">Vùng (Contours)</div>
        <div className="pm-edgebox">
          {s.regionCount === 0
            ? "Không tìm thấy vùng kín nào"
            : `Đã chọn ${s.selected.length} / ${s.regionCount} vùng`}
        </div>
        <div className="pm-instruction">
          {multi
            ? "Click vào vùng (mảng xanh) trong khung nhìn để chọn/bỏ vùng cần đùn."
            : "Sketch có 1 vùng — sẽ đùn vùng đó."}
        </div>
      </div>

      <div className="pm-section">
        <div className="pm-heading">Tham số</div>
        <label className="pm-option">
          <span>Chiều cao (mm)</span>
          <input type="number" value={s.distance} onChange={(e) => setDistance(parseFloat(e.target.value) || 0)} />
        </label>
        {hasSolid && (
          <label className="pm-option">
            <span>Thao tác</span>
            <select value={s.operation} onChange={(e) => setOperation(e.target.value as BoolOp)}>
              <option value="add">Thêm khối (Boss)</option>
              <option value="cut">Cắt khối (Cut)</option>
              <option value="new">Khối mới</option>
            </select>
          </label>
        )}
      </div>

      {kernelStatus === "loading" && <div className="pm-section pm-instruction">Đang tải kernel…</div>}
      {error && <div className="pm-section dlg-error">{error}</div>}

      <div className="pm-section">
        <button className="pm-apply-btn" onClick={apply} disabled={loading || s.distance === 0}>
          {loading ? "Đang xử lý…" : "✓ Đùn khối"}
        </button>
      </div>
    </aside>
  );
}
