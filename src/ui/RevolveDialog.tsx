import { useState } from "react";
import { useViewportStore } from "../state/store";
import type { BoolOp } from "../features";

/** Modal to revolve a sketch about an in-plane axis. */
export function RevolveDialog() {
  const targetId = useViewportStore((s) => s.revolveTargetId);
  const kernelStatus = useViewportStore((s) => s.kernelStatus);
  const busy = useViewportStore((s) => s.busy);
  const error = useViewportStore((s) => s.featureError);
  const cancel = useViewportStore((s) => s.cancelFeatureDialog);
  const run = useViewportStore((s) => s.runRevolve);
  const hasSolid = useViewportStore((s) => s.features.some((f) => f.type === "extrude" || f.type === "revolve"));

  const [angle, setAngle] = useState(360);
  const [axis, setAxis] = useState<"u" | "v">("v");
  const [op, setOp] = useState<BoolOp>("new");

  if (!targetId) return null;
  const loading = kernelStatus === "loading" || busy;

  return (
    <div className="overlay-center modal-backdrop">
      <div className="picker-card">
        <div className="picker-title">Xoay tròn (Revolve)</div>
        <label className="dlg-row">
          <span>Góc (độ)</span>
          <input type="number" value={angle} autoFocus onChange={(e) => setAngle(parseFloat(e.target.value) || 0)} />
        </label>
        <label className="dlg-row">
          <span>Trục xoay</span>
          <select value={axis} onChange={(e) => setAxis(e.target.value as "u" | "v")}>
            <option value="v">Trục dọc (vertical)</option>
            <option value="u">Trục ngang (horizontal)</option>
          </select>
        </label>
        {hasSolid && (
          <label className="dlg-row">
            <span>Thao tác</span>
            <select value={op} onChange={(e) => setOp(e.target.value as BoolOp)}>
              <option value="add">Thêm khối</option>
              <option value="cut">Cắt khối</option>
              <option value="new">Khối mới</option>
            </select>
          </label>
        )}
        {kernelStatus === "loading" && <div className="dlg-info">Đang tải kernel OpenCASCADE (~11MB)…</div>}
        {error && <div className="dlg-error">{error}</div>}
        <div className="dlg-actions">
          <button className="finish" onClick={() => run(angle, axis, op)} disabled={loading || angle === 0}>
            {loading ? "Đang xử lý…" : "✓ Xoay"}
          </button>
          <button className="picker-cancel" onClick={cancel} disabled={loading}>
            Huỷ
          </button>
        </div>
      </div>
    </div>
  );
}
