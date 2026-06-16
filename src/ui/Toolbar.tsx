import { useEffect, useRef } from "react";
import { useViewportStore } from "../state/store";

export function Toolbar() {
  const mode = useViewportStore((s) => s.mode);
  const enterSketch = useViewportStore((s) => s.enterSketch);
  const openExtrude = useViewportStore((s) => s.openExtrude);
  const openRevolve = useViewportStore((s) => s.openRevolve);
  const openLoft = useViewportStore((s) => s.openLoft);
  const openSweep = useViewportStore((s) => s.openSweep);
  const startEdgeSelect = useViewportStore((s) => s.startEdgeSelect);
  const startShell = useViewportStore((s) => s.startShell);
  const startDraft = useViewportStore((s) => s.startDraft);
  const addBodyOp = useViewportStore((s) => s.addBodyOp);
  const addThread = useViewportStore((s) => s.addThread);
  const addRefPlane = useViewportStore((s) => s.addRefPlane);
  const exportModel = useViewportStore((s) => s.exportModel);
  const saveProject = useViewportStore((s) => s.saveProject);
  const loadProject = useViewportStore((s) => s.loadProject);
  const undo = useViewportStore((s) => s.undo);
  const redo = useViewportStore((s) => s.redo);
  const evaluateDrawing = useViewportStore((s) => s.evaluateDrawing);
  const explainSelected = useViewportStore((s) => s.explainSelected);
  const openChat = useViewportStore((s) => s.openChat);
  const openAiDraw = useViewportStore((s) => s.openAiDraw);
  const askClaudeAi = useViewportStore((s) => s.askClaudeAi);
  const canUndo = useViewportStore((s) => s.past.length > 0);
  const canRedo = useViewportStore((s) => s.future.length > 0);
  const selectedId = useViewportStore((s) => s.selectedFeatureId);
  const features = useViewportStore((s) => s.features);
  const fileRef = useRef<HTMLInputElement>(null);

  const selected = features.find((f) => f.id === selectedId);
  const canSolid = mode === "model" && selected?.type === "sketch";
  const hasSolid = features.some((f) => f.type === "extrude" || f.type === "revolve" || f.type === "loft");
  const canLoft = mode === "model" && features.filter((f) => f.type === "sketch").length >= 2;

  // Ctrl+Z / Ctrl+Y (or Ctrl+Shift+Z) for undo/redo, only in model mode.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey || useViewportStore.getState().mode !== "model") return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) {
        e.preventDefault();
        useViewportStore.getState().undo();
      } else if (k === "y" || (k === "z" && e.shiftKey)) {
        e.preventDefault();
        useViewportStore.getState().redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const onOpenFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    file.text().then(loadProject);
    e.target.value = "";
  };

  return (
    <div className="toolbar">
      <span className="brand">Torotic CAD</span>

      <div className="tool-group">
        <button className={mode === "sketch" ? "active" : ""} onClick={enterSketch} disabled={mode === "sketch"} title="Tạo Sketch mới">
          ✏️ Sketch
        </button>
        <button onClick={() => selected && openExtrude(selected.id)} disabled={!canSolid} title="Đùn sketch đã chọn">
          ⬆️ Extrude
        </button>
        <button onClick={() => selected && openRevolve(selected.id)} disabled={!canSolid} title="Xoay tròn sketch đã chọn">
          🔄 Revolve
        </button>
        <button onClick={openLoft} disabled={!canLoft} title="Loft: nối ≥2 sketch">
          🪜 Loft
        </button>
        <button onClick={openSweep} disabled={!canLoft} title="Sweep: quét biên dạng theo đường dẫn">
          〰️ Sweep
        </button>
      </div>

      <div className="tool-group">
        <button onClick={() => startEdgeSelect("fillet")} disabled={!hasSolid} title="Bo cạnh (chọn cạnh, hoặc tất cả)">⌒ Fillet</button>
        <button onClick={() => startEdgeSelect("chamfer")} disabled={!hasSolid} title="Vát cạnh (chọn cạnh, hoặc tất cả)">◣ Chamfer</button>
        <button onClick={startShell} disabled={!hasSolid} title="Khoét rỗng khối (chọn mặt để hở)">▢ Shell</button>
        <button onClick={startDraft} disabled={!hasSolid} title="Vát nghiêng mặt (draft cho khuôn đúc)">◹ Draft</button>
      </div>

      <div className="tool-group">
        <button onClick={() => addBodyOp("mirrorBody")} disabled={!hasSolid} title="Soi gương khối qua mặt phẳng">🪞 Mirror</button>
        <button onClick={() => addBodyOp("patternLinear")} disabled={!hasSolid} title="Sao chép khối thành dãy thẳng">▦ Pattern thẳng</button>
        <button onClick={() => addBodyOp("patternCircular")} disabled={!hasSolid} title="Sao chép khối quanh trục">🔄 Pattern tròn</button>
      </div>

      <div className="tool-group">
        <button onClick={addThread} title="Ren xoắn ngoài (helix thật) — tạo thành khối ren riêng">🌀 Ren</button>
        <button onClick={addRefPlane} title="Tạo mặt phẳng tham chiếu (datum) để vẽ sketch trên đó">▭ Mặt phẳng</button>
      </div>

      <div className="tool-group">
        <button onClick={undo} disabled={!canUndo} title="Hoàn tác (Ctrl+Z)">↩︎</button>
        <button onClick={redo} disabled={!canRedo} title="Làm lại (Ctrl+Y)">↪︎</button>
      </div>

      <div className="tool-group">
        <button onClick={saveProject} title="Lưu project (.json)">💾 Lưu</button>
        <button onClick={() => fileRef.current?.click()} title="Mở project">📂 Mở</button>
        <button onClick={() => exportModel("step")} disabled={!hasSolid} title="Xuất STEP">⬇ STEP</button>
        <button onClick={() => exportModel("stl")} disabled={!hasSolid} title="Xuất STL (in 3D)">⬇ STL</button>
        <input ref={fileRef} type="file" accept=".json,application/json" style={{ display: "none" }} onChange={onOpenFile} />
      </div>

      <div className="tool-group">
        <button className="ai-btn" onClick={openAiDraw} title="Nhập mô tả, AI tự dựng khối 3D">
          🪄 AI vẽ
        </button>
        <button className="ai-btn" onClick={openChat} title="Mở trợ lý AI (Claude) để hỏi đáp về mô hình">
          💬 Trợ lý AI
        </button>
        <button onClick={evaluateDrawing} disabled={features.length === 0} title="Nhờ AI đánh giá bản vẽ hiện tại">
          ✨ Đánh giá
        </button>
        <button onClick={explainSelected} disabled={mode !== "model" || !selectedId} title="Nhờ AI giải thích feature đang chọn trong cây tính năng">
          🔍 Giải thích
        </button>
        <button onClick={askClaudeAi} disabled={features.length === 0} title="Tải ảnh + copy nội dung để hỏi trên claude.ai (dùng gói Pro/Max, miễn phí)">
          📋 Claude.ai
        </button>
      </div>

      <span className="mode-badge">Chế độ: {mode === "sketch" ? "Sketch" : "Model"}</span>
    </div>
  );
}
