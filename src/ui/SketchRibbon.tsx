import { useEffect, useRef, useState, type ReactNode } from "react";
import { useViewportStore, type SketchTool } from "../state/store";

interface ToolDef {
  tool: SketchTool;
  label: string;
  icon: string;
  sub?: string;
  disabled?: boolean;
}

/** SolidWorks-style CommandManager ribbon, shown while sketching. */
export function SketchRibbon() {
  const mode = useViewportStore((s) => s.mode);
  const hasSketch = useViewportStore((s) => s.sketch !== null);
  const tool = useViewportStore((s) => s.sketchTool);
  const setTool = useViewportStore((s) => s.setSketchTool);
  const construction = useViewportStore((s) => s.construction);
  const setConstruction = useViewportStore((s) => s.setConstruction);
  const finish = useViewportStore((s) => s.finishSketch);
  const cancel = useViewportStore((s) => s.cancelSketch);
  const convertEntities = useViewportStore((s) => s.convertEntities);
  // Transform actions (operate on the current selection) — surfaced on the ribbon.
  const selection = useViewportStore((s) => s.selection);
  const mirror = useViewportStore((s) => s.mirrorSelection);
  const linear = useViewportStore((s) => s.linearPattern);
  const circular = useViewportStore((s) => s.circularPattern);
  const offset = useViewportStore((s) => s.offsetSelection);

  if (mode !== "sketch" || !hasSketch) return null;

  const nEntities = selection.filter((s) => s.kind !== "point").length;
  // Run a selection-based transform: make sure the Select tool is active first.
  const run = (fn: () => void) => {
    setTool("select");
    fn();
  };

  return (
    <div className="ribbon">
      <Group title="Thoát">
        <Btn def={{ tool: "select", label: "Chọn", icon: "🖱️" }} active={tool === "select"} onClick={setTool} />
        <button className="ribbon-btn" onClick={finish} title="Hoàn tất sketch">
          <span className="ic" style={{ color: "#1a9c54" }}>✓</span>
          Xong
        </button>
        <button className="ribbon-btn" onClick={cancel} title="Huỷ sketch">
          <span className="ic" style={{ color: "#d83a3a" }}>✕</span>
          Huỷ
        </button>
      </Group>

      <Sep />

      <Group title="Kích thước">
        <Btn
          def={{ tool: "dimension", label: "Smart Dimension", icon: "📏" }}
          active={tool === "dimension"}
          onClick={setTool}
          big
        />
      </Group>

      <Sep />

      <Group title="Đối tượng">
        <Flyout
          current={tool}
          onPick={setTool}
          variants={[
            { tool: "line", label: "Đường", icon: "／", sub: "line" },
            { tool: "centerline", label: "Đường tâm", icon: "┄", sub: "construction" },
          ]}
        />
        <Btn def={{ tool: "point", label: "Điểm", icon: "•" }} active={tool === "point"} onClick={setTool} />
        <Flyout
          current={tool}
          onPick={setTool}
          variants={[
            { tool: "rectCorner", label: "Chữ nhật (góc)", icon: "▭", sub: "2 góc đối" },
            { tool: "rectCenter", label: "Chữ nhật (tâm)", icon: "⊡", sub: "từ tâm" },
            { tool: "rect3", label: "Chữ nhật 3 điểm", icon: "◇", sub: "góc nghiêng" },
            { tool: "parallelogram", label: "Hình bình hành", icon: "▱", sub: "A→B→C" },
          ]}
        />
        <Flyout
          current={tool}
          onPick={setTool}
          variants={[
            { tool: "circle", label: "Tròn (tâm)", icon: "◯", sub: "tâm → bán kính" },
            { tool: "circle3", label: "Tròn 3 điểm", icon: "◍", sub: "qua 3 điểm" },
          ]}
        />
        <Btn def={{ tool: "ellipse", label: "Ellipse", icon: "⬭" }} active={tool === "ellipse"} onClick={setTool} />
        <Btn def={{ tool: "spline", label: "Spline", icon: "∿" }} active={tool === "spline"} onClick={setTool} />
        <Btn def={{ tool: "polygon", label: "Đa giác", icon: "⬡" }} active={tool === "polygon"} onClick={setTool} />
        <Flyout
          current={tool}
          onPick={setTool}
          variants={[
            { tool: "arcCenter", label: "Cung theo tâm", icon: "◜", sub: "tâm → đầu → cuối" },
            { tool: "arc3", label: "Cung 3 điểm", icon: "◠", sub: "đầu → cuối → phồng" },
            { tool: "arcTangent", label: "Cung tiếp tuyến", icon: "↪", sub: "nối tiếp đường" },
          ]}
        />
        <Btn def={{ tool: "slot", label: "Slot", icon: "▭" }} active={tool === "slot"} onClick={setTool} />
      </Group>

      <Sep />

      <Group title="Sửa">
        <Btn def={{ tool: "trim", label: "Trim", icon: "✂" }} active={tool === "trim"} onClick={setTool} />
        <Btn def={{ tool: "extend", label: "Extend", icon: "⊢" }} active={tool === "extend"} onClick={setTool} />
        <Btn def={{ tool: "fillet", label: "Fillet", icon: "⌒" }} active={tool === "fillet"} onClick={setTool} />
        <Btn def={{ tool: "sketchChamfer", label: "Chamfer", icon: "◣" }} active={tool === "sketchChamfer"} onClick={setTool} />
        <button className="ribbon-btn" onClick={() => void convertEntities()} title="Chiếu cạnh khối nằm trên mặt phẳng sketch thành đối tượng vẽ">
          <span className="ic">⧉</span>
          Convert
        </button>
      </Group>

      <Sep />

      <Group title="Biến đổi">
        <button className="ribbon-btn" disabled={nEntities < 1} onClick={() => run(mirror)} title="Soi gương: chọn nét + 1 đường tâm (đường chọn cuối là trục) rồi bấm">
          <span className="ic">🪞</span>
          Mirror
        </button>
        <button className="ribbon-btn" disabled={nEntities < 1} onClick={() => run(linear)} title="Sao chép thành dãy thẳng (số lượng/khoảng cách ở panel trái)">
          <span className="ic">▦</span>
          Pattern thẳng
        </button>
        <button className="ribbon-btn" disabled={nEntities < 1} onClick={() => run(circular)} title="Sao chép quanh tâm (chọn 1 điểm làm tâm; số lượng/tổng góc ở panel trái)">
          <span className="ic">🔄</span>
          Pattern tròn
        </button>
        <button className="ribbon-btn" disabled={nEntities < 1} onClick={() => run(() => offset(true))} title="Offset ra ngoài (khoảng cách + chiều vào/ra tinh chỉnh ở panel trái)">
          <span className="ic">⟶</span>
          Offset
        </button>
      </Group>

      <Group title="Hiển thị">
        <button
          className={"ribbon-btn" + (construction ? " active" : "")}
          onClick={() => setConstruction(!construction)}
          title="Vẽ dạng đường dựng (nét đứt) — không bị đùn"
        >
          <span className="ic">┄</span>
          Construction
        </button>
      </Group>
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="ribbon-group">
      <div className="ribbon-group-row">{children}</div>
      <div className="ribbon-group-title">{title}</div>
    </div>
  );
}

function Sep() {
  return <div className="ribbon-sep" />;
}

function Btn({
  def,
  active,
  onClick,
  big,
}: {
  def: ToolDef;
  active: boolean;
  onClick: (t: SketchTool) => void;
  big?: boolean;
}) {
  return (
    <button
      className={"ribbon-btn" + (active ? " active" : "") + (big ? " big" : "")}
      onClick={() => onClick(def.tool)}
      disabled={def.disabled}
      title={def.label}
    >
      <span className="ic">{def.icon}</span>
      {def.label}
    </button>
  );
}

/** Split button: main shows last-picked variant, caret opens the variant menu. */
function Flyout({
  variants,
  current,
  onPick,
  placeholder,
}: {
  variants: ToolDef[];
  current: SketchTool;
  onPick: (t: SketchTool) => void;
  placeholder?: ToolDef;
}) {
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<ToolDef>(placeholder ?? variants[0]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const active = variants.some((v) => v.tool === current && !v.disabled) && chosen.tool === current;

  return (
    <div className="ribbon-flyout" ref={ref}>
      <button
        className={"ribbon-btn" + (active ? " active" : "")}
        onClick={() => !chosen.disabled && onPick(chosen.tool)}
        disabled={chosen.disabled}
        title={chosen.label}
      >
        <span className="ic">{chosen.icon}</span>
        {chosen.label.split(" ")[0]}
      </button>
      <button className="ribbon-caret" onClick={() => setOpen((o) => !o)} title="Biến thể khác">
        ▾
      </button>
      {open && (
        <div className="flyout-menu">
          {variants.map((v, i) => (
            <button
              key={i}
              className="flyout-item"
              disabled={v.disabled}
              onClick={() => {
                setChosen(v);
                setOpen(false);
                if (!v.disabled) onPick(v.tool);
              }}
            >
              <span className="ic">{v.icon}</span>
              <span>
                {v.label}
                {v.sub && <span className="sub"> · {v.sub}</span>}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
