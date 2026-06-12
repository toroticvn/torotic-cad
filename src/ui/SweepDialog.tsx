import { useState } from "react";
import { useViewportStore } from "../state/store";
import type { BoolOp } from "../features";

/** Modal to sweep a profile sketch along a path sketch. */
export function SweepDialog() {
  const open = useViewportStore((s) => s.sweepOpen);
  const features = useViewportStore((s) => s.features);
  const kernelStatus = useViewportStore((s) => s.kernelStatus);
  const busy = useViewportStore((s) => s.busy);
  const error = useViewportStore((s) => s.featureError);
  const cancel = useViewportStore((s) => s.cancelFeatureDialog);
  const run = useViewportStore((s) => s.runSweep);
  const hasSolid = useViewportStore((s) => s.features.some((f) => f.type === "extrude" || f.type === "revolve" || f.type === "loft" || f.type === "sweep"));

  const sketches = features.filter((f) => f.type === "sketch");
  const [profile, setProfile] = useState("");
  const [pathId, setPathId] = useState("");
  const [op, setOp] = useState<BoolOp>("new");

  if (!open) return null;
  const loading = kernelStatus === "loading" || busy;
  const ok = profile && pathId && profile !== pathId;

  return (
    <div className="overlay-center modal-backdrop">
      <div className="picker-card">
        <div className="picker-title">Sweep (quét theo đường dẫn)</div>
        <div className="pm-instruction" style={{ marginBottom: 10, maxWidth: 280 }}>
          Biên dạng kín + đường dẫn (sketch hở). Nên đặt biên dạng ở đầu đường dẫn và vuông góc với nó.
        </div>
        <label className="dlg-row">
          <span>Biên dạng (profile)</span>
          <select value={profile} onChange={(e) => setProfile(e.target.value)}>
            <option value="">— chọn —</option>
            {sketches.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
        </label>
        <label className="dlg-row">
          <span>Đường dẫn (path)</span>
          <select value={pathId} onChange={(e) => setPathId(e.target.value)}>
            <option value="">— chọn —</option>
            {sketches.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
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
        {kernelStatus === "loading" && <div className="dlg-info">Đang tải kernel…</div>}
        {error && <div className="dlg-error">{error}</div>}
        <div className="dlg-actions">
          <button className="finish" onClick={() => run(profile, pathId, op)} disabled={loading || !ok}>
            {loading ? "Đang xử lý…" : "✓ Sweep"}
          </button>
          <button className="picker-cancel" onClick={cancel} disabled={loading}>Huỷ</button>
        </div>
      </div>
    </div>
  );
}
