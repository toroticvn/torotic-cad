import { useEffect, useRef, useState } from "react";
import { useViewportStore } from "../state/store";
import { AccountButton } from "./AccountButton";
import { CloudSaveIndicator } from "./CloudSaveIndicator";

/** A compact dropdown menu: a labelled button that reveals a column of actions. */
function Menu({ label, title, children }: { label: string; title?: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);
  return (
    <div className="tb-menu" ref={ref}>
      <button className={"tb-menu-btn" + (open ? " open" : "")} title={title} onClick={() => setOpen((o) => !o)}>
        {label} <span className="tb-caret">▾</span>
      </button>
      {open && (
        <div className="tb-menu-pop" onClick={() => setOpen(false)}>
          {children}
        </div>
      )}
    </div>
  );
}

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
  const addText = useViewportStore((s) => s.addText);
  const addRefPlane = useViewportStore((s) => s.addRefPlane);
  const exportModel = useViewportStore((s) => s.exportModel);
  const saveProject = useViewportStore((s) => s.saveProject);
  const loadProject = useViewportStore((s) => s.loadProject);
  const importFile = useViewportStore((s) => s.importFile);
  const openProjects = useViewportStore((s) => s.openProjects);
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
  const importRef = useRef<HTMLInputElement>(null);

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

  const onAddText = () => {
    const text = window.prompt("Nội dung chữ cần khắc/đắp:", "TOROTIC");
    if (text == null || !text.trim()) return;
    const size = parseFloat(window.prompt("Cỡ chữ (mm):", "10") ?? "10") || 10;
    const depth = parseFloat(window.prompt("Độ dày đùn (mm):", "2") ?? "2") || 2;
    void addText(text, size, depth);
  };

  const onOpenFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    file.text().then(loadProject);
    e.target.value = "";
  };

  const onImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void importFile(file);
    e.target.value = "";
  };

  return (
    <div className="toolbar">
      <span className="brand">Torotic CAD</span>

      {/* Lệnh hay dùng để ngoài */}
      <div className="tool-group">
        <button className={mode === "sketch" ? "active" : ""} onClick={enterSketch} disabled={mode === "sketch"} title="Tạo Sketch mới">✏️ Sketch</button>
        <button onClick={() => selected && openExtrude(selected.id)} disabled={!canSolid} title="Đùn sketch đã chọn">⬆️ Extrude</button>
        <button onClick={() => selected && openRevolve(selected.id)} disabled={!canSolid} title="Xoay tròn sketch đã chọn">🔄 Revolve</button>
      </div>

      <Menu label="🧱 Dựng hình" title="Loft / Sweep / Ren / Text / Mặt phẳng">
        <button className="tb-item" onClick={openLoft} disabled={!canLoft}>🪜 Loft (nối ≥2 sketch)</button>
        <button className="tb-item" onClick={openSweep} disabled={!canLoft}>〰️ Sweep (quét theo đường dẫn)</button>
        <button className="tb-item" onClick={addThread}>🌀 Ren xoắn</button>
        <button className="tb-item" onClick={onAddText}>🔤 Text (khắc/đắp chữ)</button>
        <button className="tb-item" onClick={addRefPlane}>▭ Mặt phẳng tham chiếu</button>
      </Menu>

      <Menu label="🛠 Sửa khối" title="Fillet / Chamfer / Shell / Draft">
        <button className="tb-item" onClick={() => startEdgeSelect("fillet")} disabled={!hasSolid}>⌒ Fillet (bo cạnh)</button>
        <button className="tb-item" onClick={() => startEdgeSelect("chamfer")} disabled={!hasSolid}>◣ Chamfer (vát cạnh)</button>
        <button className="tb-item" onClick={startShell} disabled={!hasSolid}>▢ Shell (khoét rỗng)</button>
        <button className="tb-item" onClick={startDraft} disabled={!hasSolid}>◹ Draft (vát nghiêng)</button>
      </Menu>

      <Menu label="🔁 Mảng" title="Mirror / Pattern">
        <button className="tb-item" onClick={() => addBodyOp("mirrorBody")} disabled={!hasSolid}>🪞 Mirror (soi gương)</button>
        <button className="tb-item" onClick={() => addBodyOp("patternLinear")} disabled={!hasSolid}>▦ Pattern thẳng</button>
        <button className="tb-item" onClick={() => addBodyOp("patternCircular")} disabled={!hasSolid}>🔄 Pattern tròn</button>
      </Menu>

      <div className="tool-group">
        <button onClick={undo} disabled={!canUndo} title="Hoàn tác (Ctrl+Z)">↩︎</button>
        <button onClick={redo} disabled={!canRedo} title="Làm lại (Ctrl+Y)">↪︎</button>
      </div>

      <Menu label="📁 Tệp" title="Dự án đám mây / Lưu / Mở / Nhập / Xuất">
        <button className="tb-item" onClick={openProjects}>☁ Dự án đám mây</button>
        <div className="tb-sep" />
        <button className="tb-item" onClick={saveProject}>💾 Lưu file (.json)</button>
        <button className="tb-item" onClick={() => fileRef.current?.click()}>📂 Mở file (.json)</button>
        <button className="tb-item" onClick={() => importRef.current?.click()}>📥 Nhập STEP/STL</button>
        <div className="tb-sep" />
        <button className="tb-item" onClick={() => exportModel("step")} disabled={!hasSolid}>⬇ Xuất STEP</button>
        <button className="tb-item" onClick={() => exportModel("stl")} disabled={!hasSolid}>⬇ Xuất STL (in 3D)</button>
      </Menu>

      <Menu label="✨ AI" title="Trợ lý AI / vẽ / đánh giá">
        <button className="tb-item" onClick={openChat}>💬 Trợ lý AI</button>
        <button className="tb-item" onClick={openAiDraw}>🪄 AI vẽ từ mô tả</button>
        <button className="tb-item" onClick={evaluateDrawing} disabled={features.length === 0}>✨ Đánh giá bản vẽ</button>
        <button className="tb-item" onClick={explainSelected} disabled={mode !== "model" || !selectedId}>🔍 Giải thích feature</button>
        <button className="tb-item" onClick={askClaudeAi} disabled={features.length === 0}>📋 Hỏi qua Claude.ai</button>
      </Menu>

      <input ref={fileRef} type="file" accept=".json,application/json" style={{ display: "none" }} onChange={onOpenFile} />
      <input ref={importRef} type="file" accept=".step,.stp,.stl" style={{ display: "none" }} onChange={onImportFile} />

      <span className="mode-badge">{mode === "sketch" ? "Sketch" : "Model"}</span>

      <div className="tool-group toolbar-right">
        <CloudSaveIndicator />
        <AccountButton />
      </div>
    </div>
  );
}
