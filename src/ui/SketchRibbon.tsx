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

  if (mode !== "sketch" || !hasSketch) return null;

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
        <Btn def={{ tool: "circle", label: "Tròn", icon: "◯" }} active={tool === "circle"} onClick={setTool} />
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
        <Btn def={{ tool: "fillet", label: "Fillet", icon: "⌒" }} active={tool === "fillet"} onClick={setTool} />
        <Btn def={{ tool: "sketchChamfer", label: "Chamfer", icon: "◣" }} active={tool === "sketchChamfer"} onClick={setTool} />
        <Btn def={{ tool: "offset", label: "Offset", icon: "⇉" }} active={tool === "offset"} onClick={setTool} />
      </Group>

      <Sep />

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
