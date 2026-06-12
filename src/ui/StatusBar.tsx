import { useViewportStore } from "../state/store";

/** SolidWorks-style sketch status line (Under Defined / Fully Defined). */
export function StatusBar() {
  const mode = useViewportStore((s) => s.mode);
  const sketch = useViewportStore((s) => s.sketch);
  useViewportStore((s) => s.sketchVersion); // re-render after solve
  const dof = useViewportStore((s) => s.dof);
  const solveOk = useViewportStore((s) => s.solveOk);

  if (mode !== "sketch" || !sketch) return null;

  const hasGeom = !!sketch && (sketch.lines.length > 0 || sketch.circles.length > 0);

  let status: { text: string; cls: string };
  if (!solveOk) status = { text: "Over Defined — ràng buộc mâu thuẫn/thừa", cls: "status-over" };
  else if (!hasGeom) status = { text: "Trống — hãy vẽ biên dạng", cls: "status-hint" };
  else if (dof === 0) status = { text: "Fully Defined — đã đủ ràng buộc", cls: "status-defined" };
  else status = { text: `Under Defined — còn ${dof} bậc tự do`, cls: "status-under" };

  return (
    <div className="status-bar">
      <span className={status.cls}>{status.text}</span>
      <span className="status-hint">Xanh = chưa đủ ràng buộc · Đen = đã đủ · Nét đứt = đường dựng</span>
    </div>
  );
}
