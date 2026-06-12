import { useState } from "react";
import { useViewportStore } from "../state/store";
import type { BoolOp } from "../features";

/** Modal to pick ≥2 sketches (in order) and loft between them. */
export function LoftDialog() {
  const open = useViewportStore((s) => s.loftOpen);
  const features = useViewportStore((s) => s.features);
  const kernelStatus = useViewportStore((s) => s.kernelStatus);
  const busy = useViewportStore((s) => s.busy);
  const error = useViewportStore((s) => s.featureError);
  const cancel = useViewportStore((s) => s.cancelFeatureDialog);
  const run = useViewportStore((s) => s.runLoft);
  const hasSolid = useViewportStore((s) => s.features.some((f) => f.type === "extrude" || f.type === "revolve" || f.type === "loft"));

  const [picked, setPicked] = useState<string[]>([]);
  const [op, setOp] = useState<BoolOp>("new");

  if (!open) return null;
  const sketches = features.filter((f) => f.type === "sketch");
  const loading = kernelStatus === "loading" || busy;

  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  return (
    <div className="overlay-center modal-backdrop">
      <div className="picker-card">
        <div className="picker-title">Loft (nối biên dạng)</div>
        <div className="pm-instruction" style={{ marginBottom: 10 }}>
          Chọn ≥2 sketch theo thứ tự nối. Nên ở các mặt phẳng song song khác cao độ (dùng offset).
        </div>
        <div className="loft-list">
          {sketches.length === 0 && <div className="params-empty">Chưa có sketch nào.</div>}
          {sketches.map((f) => {
            const order = picked.indexOf(f.id);
            return (
              <button key={f.id} className={"loft-item" + (order >= 0 ? " on" : "")} onClick={() => toggle(f.id)}>
                <span className="loft-order">{order >= 0 ? order + 1 : "○"}</span> {f.name}
              </button>
            );
          })}
        </div>
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
        {kernelStatus === "loading" && <div className="dlg-info">Đang tải kernel…</div>}
        {error && <div className="dlg-error">{error}</div>}
        <div className="dlg-actions">
          <button className="finish" onClick={() => run(picked, op)} disabled={loading || picked.length < 2}>
            {loading ? "Đang xử lý…" : `✓ Loft (${picked.length})`}
          </button>
          <button className="picker-cancel" onClick={cancel} disabled={loading}>
            Huỷ
          </button>
        </div>
      </div>
    </div>
  );
}
