import { useViewportStore, type SketchTool } from "../state/store";

const TOOL_INFO: Record<SketchTool, { name: string; hint: string }> = {
  select: { name: "Chọn", hint: "Click để chọn đối tượng (tối đa 2) rồi thêm quan hệ bên dưới." },
  line: { name: "Đường (Line)", hint: "Click điểm đầu rồi điểm cuối; vẽ nối tiếp. Chuột phải/Esc để dừng. Gợi ý ngang/dọc/trùng điểm tự bật." },
  centerline: { name: "Đường tâm (Centerline)", hint: "Vẽ như đường thường nhưng là nét dựng (construction) — dùng làm trục, không bị đùn." },
  point: { name: "Điểm (Point)", hint: "Click để đặt một điểm tham chiếu." },
  rectCorner: { name: "Chữ nhật theo góc", hint: "Click hai góc đối nhau." },
  rectCenter: { name: "Chữ nhật theo tâm", hint: "Click tâm rồi click một góc." },
  rect3: { name: "Chữ nhật 3 điểm", hint: "Click góc A → góc B (định một cạnh, góc bất kỳ) → di chuột định bề rộng rồi click." },
  parallelogram: { name: "Hình bình hành", hint: "Click A → B (cạnh thứ nhất) → C; góc thứ tư tự suy ra." },
  circle: { name: "Đường tròn", hint: "Click tâm rồi click để định bán kính." },
  polygon: { name: "Đa giác đều", hint: "Click tâm rồi click một đỉnh. Có sẵn đường tròn dựng (nét đứt)." },
  arcCenter: { name: "Cung theo tâm", hint: "Click tâm → click điểm đầu (định bán kính) → click điểm cuối." },
  arc3: { name: "Cung 3 điểm", hint: "Click điểm đầu → điểm cuối → di chuột để định độ phồng rồi click." },
  arcTangent: { name: "Cung tiếp tuyến", hint: "Click một đầu mút của đường có sẵn → click điểm cuối; cung sẽ tiếp tuyến với đường đó." },
  slot: { name: "Slot (rãnh)", hint: "Click tâm đầu 1 → tâm đầu 2 → di chuột định bề rộng rồi click." },
  trim: { name: "Trim (cắt)", hint: "Click vào đối tượng (đường/cung/tròn) để xoá nó." },
  fillet: { name: "Sketch Fillet (bo góc)", hint: "Click vào điểm góc chung của 2 đường để bo cung tiếp tuyến." },
  sketchChamfer: { name: "Sketch Chamfer (vát góc)", hint: "Click vào điểm góc chung của 2 đường để vát thẳng theo khoảng đặt bên dưới." },
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
        {(tool === "fillet" || tool === "sketchChamfer") && (
          <label className="pm-option">
            {tool === "fillet" ? "Bán kính bo" : "Khoảng vát"}
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
      <ModifyTools />
    </aside>
  );
}

/** Offset / Mirror / pattern: operate on the current selection (pick with the Select tool first). */
function ModifyTools() {
  const selection = useViewportStore((s) => s.selection);
  const count = useViewportStore((s) => s.patternCount);
  const spacing = useViewportStore((s) => s.patternSpacing);
  const angle = useViewportStore((s) => s.patternAngle);
  const total = useViewportStore((s) => s.patternTotalAngle);
  const setParam = useViewportStore((s) => s.setPatternParam);
  const offsetDistance = useViewportStore((s) => s.offsetDistance);
  const setOffsetDistance = useViewportStore((s) => s.setOffsetDistance);
  const offset = useViewportStore((s) => s.offsetSelection);
  const mirror = useViewportStore((s) => s.mirrorSelection);
  const linear = useViewportStore((s) => s.linearPattern);
  const circular = useViewportStore((s) => s.circularPattern);

  const nEntities = selection.filter((s) => s.kind !== "point").length;

  return (
    <div className="pm-section">
      <div className="pm-heading">Offset cạnh</div>
      <div className="pm-instruction">
        Dùng công cụ Chọn để chọn các cạnh, đặt khoảng cách, rồi chọn chiều.
        {nEntities > 0 && <b> (Đang chọn {nEntities} cạnh)</b>}
      </div>
      <label className="pm-option">
        Khoảng offset
        <input
          type="number"
          min={0.1}
          value={offsetDistance}
          onChange={(e) => setOffsetDistance(parseFloat(e.target.value) || 1)}
        />
      </label>
      <div className="pm-relations">
        <button className="pm-rel-btn" disabled={nEntities < 1} onClick={() => offset(true)} title="Offset ra phía ngoài">
          ⟶ Ra ngoài
        </button>
        <button className="pm-rel-btn" disabled={nEntities < 1} onClick={() => offset(false)} title="Offset vào phía trong">
          ⟵ Vào trong
        </button>
      </div>

      <div className="pm-heading" style={{ marginTop: 14 }}>Mirror & Pattern</div>
      <div className="pm-instruction">Chọn đối tượng trước, rồi bấm nút bên dưới.</div>

      <div className="pm-relations">
        <button className="pm-rel-btn" disabled={nEntities < 1} onClick={mirror} title="Soi gương qua đường đã chọn (đường chọn cuối là trục)">
          Mirror
        </button>
        <button className="pm-rel-btn" disabled={nEntities < 1} onClick={linear} title="Sao chép thành dãy thẳng">
          Pattern thẳng
        </button>
        <button className="pm-rel-btn" disabled={nEntities < 1} onClick={circular} title="Sao chép quanh tâm (chọn 1 điểm làm tâm, nếu không lấy gốc toạ độ)">
          Pattern tròn
        </button>
      </div>

      <label className="pm-option">
        Số lượng
        <input type="number" min={2} value={count} onChange={(e) => setParam({ count: parseInt(e.target.value) || 2 })} />
      </label>
      <label className="pm-option">
        Khoảng cách (thẳng)
        <input type="number" value={spacing} onChange={(e) => setParam({ spacing: parseFloat(e.target.value) || 0 })} />
      </label>
      <label className="pm-option">
        Góc hướng (thẳng, °)
        <input type="number" value={angle} onChange={(e) => setParam({ angle: parseFloat(e.target.value) || 0 })} />
      </label>
      <label className="pm-option">
        Tổng góc (tròn, °)
        <input type="number" value={total} onChange={(e) => setParam({ total: parseFloat(e.target.value) || 360 })} />
      </label>
    </div>
  );
}

function Relations() {
  const selection = useViewportStore((s) => s.selection);
  const addConstraint = useViewportStore((s) => s.addConstraint);
  const setSelection = useViewportStore((s) => s.setSelection);

  const fixSelection = useViewportStore((s) => s.fixSelection);

  const lines = selection.filter((s) => s.kind === "line");
  const circles = selection.filter((s) => s.kind === "circle");
  const arcs = selection.filter((s) => s.kind === "arc");
  const points = selection.filter((s) => s.kind === "point");
  const curves = [...circles, ...arcs]; // entities with a center/radius
  const ents = selection.filter((s) => s.kind !== "point");
  const ref = (r: { kind: string; id: string }) => ({ kind: r.kind as "line" | "circle" | "arc", id: r.id });

  const apply = (c: Parameters<typeof addConstraint>[0]) => {
    addConstraint(c);
    setSelection([]);
  };

  const buttons: { label: string; enabled: boolean; onClick: () => void }[] = [
    { label: "Ngang", enabled: lines.length === 1, onClick: () => apply({ type: "horizontal", line: lines[0].id }) },
    { label: "Dọc", enabled: lines.length === 1, onClick: () => apply({ type: "vertical", line: lines[0].id }) },
    { label: "Song song", enabled: lines.length === 2, onClick: () => apply({ type: "parallel", line1: lines[0].id, line2: lines[1].id }) },
    { label: "Vuông góc", enabled: lines.length === 2, onClick: () => apply({ type: "perpendicular", line1: lines[0].id, line2: lines[1].id }) },
    { label: "Thẳng hàng", enabled: lines.length === 2, onClick: () => apply({ type: "collinear", line1: lines[0].id, line2: lines[1].id }) },
    {
      label: "Bằng nhau",
      enabled: lines.length === 2 || circles.length === 2,
      onClick: () =>
        lines.length === 2
          ? apply({ type: "equalLength", line1: lines[0].id, line2: lines[1].id })
          : apply({ type: "equalRadius", c1: circles[0].id, c2: circles[1].id }),
    },
    { label: "Trùng điểm", enabled: points.length === 2, onClick: () => apply({ type: "coincident", p1: points[0].id, p2: points[1].id }) },
    { label: "Trung điểm", enabled: points.length === 1 && lines.length === 1, onClick: () => apply({ type: "midpoint", point: points[0].id, line: lines[0].id }) },
    { label: "Đối xứng", enabled: points.length === 2 && lines.length === 1, onClick: () => apply({ type: "symmetric", p1: points[0].id, p2: points[1].id, line: lines[0].id }) },
    { label: "Đồng tâm", enabled: ents.length === 2 && curves.length === 2, onClick: () => apply({ type: "concentric", e1: ref(curves[0]), e2: ref(curves[1]) }) },
    { label: "Tiếp tuyến", enabled: ents.length === 2 && curves.length >= 1 && lines.length <= 1, onClick: () => apply({ type: "tangent", e1: ref(ents[0]), e2: ref(ents[1]) }) },
    { label: "Cố định", enabled: selection.length >= 1, onClick: () => fixSelection(true) },
    { label: "Bỏ cố định", enabled: selection.length >= 1, onClick: () => fixSelection(false) },
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
