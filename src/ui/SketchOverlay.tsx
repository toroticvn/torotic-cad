import { useState } from "react";
import { useViewportStore } from "../state/store";
import { STANDARD_PLANES, type PlaneId } from "../sketch/SketchPlane";

const PLANE_ORDER: PlaneId[] = ["front", "top", "right"];

/** Plane picker (with optional offset) shown until a sketch plane is chosen. */
export function SketchOverlay() {
  const mode = useViewportStore((s) => s.mode);
  const sketch = useViewportStore((s) => s.sketch);
  const hasSolid = useViewportStore((s) => s.features.some((f) => f.type !== "sketch"));
  const start = useViewportStore((s) => s.startSketchOnPlane);
  const cancel = useViewportStore((s) => s.cancelSketch);
  const [offset, setOffset] = useState(0);

  if (mode !== "sketch" || sketch) return null;

  return (
    <div className="overlay-center">
      <div className="picker-card">
        <div className="picker-title">Chọn mặt phẳng để vẽ</div>
        <div className="picker-planes">
          {PLANE_ORDER.map((id) => (
            <button key={id} onClick={() => start(id, offset)}>
              {STANDARD_PLANES[id].label}
            </button>
          ))}
        </div>
        <label className="dlg-row" style={{ justifyContent: "center", marginBottom: 12 }}>
          <span>Offset mặt phẳng (mm)</span>
          <input type="number" value={offset} onChange={(e) => setOffset(parseFloat(e.target.value) || 0)} />
        </label>
        {hasSolid && (
          <div className="pm-instruction" style={{ marginBottom: 10 }}>
            …hoặc <b>click vào một mặt phẳng của khối</b> trong khung nhìn để vẽ trực tiếp lên mặt đó.
          </div>
        )}
        <button className="picker-cancel" onClick={cancel}>
          Huỷ
        </button>
      </div>
    </div>
  );
}
