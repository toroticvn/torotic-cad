import { useState } from "react";
import { useViewportStore } from "../state/store";

const EXAMPLES = [
  "Tấm thép 100x60x10mm, 4 lỗ phi 8 ở 4 góc cách mép 12mm",
  "Trụ tròn đường kính 40, cao 80mm, khoét lỗ phi 20 xuyên tâm",
  "Hộp 80x80x40mm, bo tròn các cạnh bán kính 6mm",
  "Đế vuông 120x120x15 có trụ phi 50 cao 60 ở giữa",
];

export function AiDrawDialog() {
  const open = useViewportStore((s) => s.aiDrawOpen);
  const busy = useViewportStore((s) => s.aiDrawBusy);
  const error = useViewportStore((s) => s.aiDrawError);
  const close = useViewportStore((s) => s.closeAiDraw);
  const generate = useViewportStore((s) => s.generateDesign);
  const [text, setText] = useState("");

  if (!open) return null;

  const submit = () => {
    if (!text.trim() || busy) return;
    void generate(text);
  };

  return (
    <div className="overlay-center modal-backdrop ai-overlay">
      <div className="ai-card draw-card">
        <div className="ai-head">
          <span className="ai-title">🪄 AI vẽ khối từ mô tả</span>
          <button className="ai-close" onClick={close} disabled={busy} title="Đóng">✕</button>
        </div>
        <div className="ai-body">
          <p className="draw-hint">Mô tả chi tiết khối bạn muốn (kích thước, lỗ, bo cạnh…). AI sẽ dựng thành mô hình 3D. <b>Lưu ý:</b> sẽ thay thế mô hình hiện tại (có thể Hoàn tác).</p>
          <textarea
            className="draw-input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) submit();
            }}
            placeholder="VD: Tấm thép 100x60x10mm, 4 lỗ phi 8 ở 4 góc…"
            rows={3}
            disabled={busy}
            autoFocus
          />
          <div className="draw-examples">
            {EXAMPLES.map((ex) => (
              <button key={ex} className="draw-chip" onClick={() => setText(ex)} disabled={busy}>
                {ex}
              </button>
            ))}
          </div>
          {busy && (
            <div className="ai-status">
              <span className="ai-spinner" /> AI đang thiết kế &amp; dựng khối… (10–30 giây)
            </div>
          )}
          {error && <div className="ai-error">⚠️ {error}</div>}
        </div>
        <div className="ai-foot">
          <button onClick={close} disabled={busy}>Huỷ</button>
          <button className="draw-go" onClick={submit} disabled={busy || !text.trim()}>
            🪄 Vẽ
          </button>
        </div>
      </div>
    </div>
  );
}
