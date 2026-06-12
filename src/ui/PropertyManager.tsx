import { useViewportStore, type SketchTool } from "../state/store";

const TOOL_INFO: Record<SketchTool, { name: string; hint: string }> = {
  select: { name: "Chọn", hint: "Click để chọn đối tượng (tối đa 2) rồi thêm quan hệ bên dưới." },
  line: { name: "Đường (Line)", hint: "Click điểm đầu rồi điểm cuối; vẽ nối tiếp. Chuột phải/Esc để dừng. Gợi ý ngang/dọc/trùng điểm tự bật." },
  rectCorner: { name: "Chữ nhật theo góc", hint: "Click hai góc đối nhau." },
  rectCenter: { name: "Chữ nhật theo tâm", hint: "Click tâm rồi click một góc." },
  circle: { name: "Đường tròn", hint: "Click tâm rồi click để định bán kính." },
  polygon: { name: "Đa giác đều", hint: "Click tâm rồi click một đỉnh. Có sẵn đường tròn dựng (nét đứt)." },
  arcCenter: { name: "Cung theo tâm", hint: "Click tâm → click điểm đầu (định bán kính) → click điểm cuối." },
  arc3: { name: "Cung 3 điểm", hint: "Click điểm đầu → điểm cuối → di chuột để định độ phồng rồi click." },
  arcTangent: { name: "Cung tiếp tuyến", hint: "Click một đầu mút của đường có sẵn → click điểm cuối; cung sẽ tiếp tuyến với đường đó." },
  slot: { name: "Slot (rãnh)", hint: "Click tâm đầu 1 → tâm đầu 2 → di chuột định bề rộng rồi click." },
  trim: { name: "Trim (cắt)", hint: "Click vào đối tượng (đường/cung/tròn) để xoá nó." },
  fillet: { name: "Sketch Fillet (bo góc)", hint: "Click vào điểm góc chung của 2 đường để bo cung tiếp tuyến." },
  dimension: { name: "Smart Dimension", hint: "Click một cạnh để gán chiều dài, đường tròn để gán bán kính, hoặc 2 điểm để gán khoảng cách." },
};

/** SolidWorks-style PropertyManager: active tool options + relations + status. */
export function PropertyManager() {
  const tool = useViewportStore((s) => s.sketchTool);
  const construction = useViewportStore((s) => s.construction);
  const setConstruction = useViewportStore((s) => s.setConstruction);
  const polygonSides = useViewportStore((s) => s.polygonSides);
  const setPolygonSides = useViewportStore((s) => s.setPolygonSides);
  const filletRadius = useViewportStore((s) => s.filletRadius);
  const setFilletRadius = useViewportStore((s) => s.setFilletRadius);

  const info = TOOL_INFO[tool];

  return (
    <aside className="left-panel">
      <div className="panel-title">PropertyManager</div>

      <div className="pm-section">
        <div className="pm-heading">{info.name}</div>
        <div className="pm-instruction">{info.hint}</div>
      </div>

      <div className="pm-section">
        <div className="pm-heading">Tùy chọn</div>
        <label className="pm-option">
          <input type="checkbox" checked={construction} onChange={(e) => setConstruction(e.target.checked)} />
          For construction (nét đứt)
        </label>
        {tool === "polygon" && (
          <label className="pm-option">
            Số cạnh
            <input
              type="number"
              min={3}
              value={polygonSides}
              onChange={(e) => setPolygonSides(parseInt(e.target.value) || 3)}
            />
          </label>
        )}
        {tool === "fillet" && (
          <label className="pm-option">
            Bán kính bo
            <input
              type="number"
              min={0.1}
              value={filletRadius}
              onChange={(e) => setFilletRadius(parseFloat(e.target.value) || 1)}
            />
          </label>
        )}
      </div>

      <Relations />
    </aside>
  );
}

function Relations() {
  const selection = useViewportStore((s) => s.selection);
  const addConstraint = useViewportStore((s) => s.addConstraint);
  const setSelection = useViewportStore((s) => s.setSelection);

  const lines = selection.filter((s) => s.kind === "line");
  const circles = selection.filter((s) => s.kind === "circle");
  const points = selection.filter((s) => s.kind === "point");

  const apply = (c: Parameters<typeof addConstraint>[0]) => {
    addConstraint(c);
    setSelection([]);
  };

  const buttons: { label: string; enabled: boolean; onClick: () => void }[] = [
    { label: "Ngang", enabled: lines.length === 1, onClick: () => apply({ type: "horizontal", line: lines[0].id }) },
    { label: "Dọc", enabled: lines.length === 1, onClick: () => apply({ type: "vertical", line: lines[0].id }) },
    { label: "Song song", enabled: lines.length === 2, onClick: () => apply({ type: "parallel", line1: lines[0].id, line2: lines[1].id }) },
    { label: "Vuông góc", enabled: lines.length === 2, onClick: () => apply({ type: "perpendicular", line1: lines[0].id, line2: lines[1].id }) },
    {
      label: "Bằng nhau",
      enabled: lines.length === 2 || circles.length === 2,
      onClick: () =>
        lines.length === 2
          ? apply({ type: "equalLength", line1: lines[0].id, line2: lines[1].id })
          : apply({ type: "equalRadius", c1: circles[0].id, c2: circles[1].id }),
    },
    { label: "Trùng điểm", enabled: points.length === 2, onClick: () => apply({ type: "coincident", p1: points[0].id, p2: points[1].id }) },
  ];

  return (
    <div className="pm-section">
      <div className="pm-heading">Add Relations (quan hệ)</div>
      {selection.length === 0 ? (
        <div className="pm-instruction">Chọn 1–2 đối tượng bằng công cụ Chọn để thêm quan hệ.</div>
      ) : (
        <div className="pm-relations">
          {buttons.map((b) => (
            <button key={b.label} className="pm-rel-btn" disabled={!b.enabled} onClick={b.onClick}>
              {b.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
