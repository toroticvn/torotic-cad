import { Fragment } from "react";
import { useViewportStore } from "../state/store";

/** Render **bold** spans inside a line of text. */
function inline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith("**") && p.endsWith("**") ? <strong key={i}>{p.slice(2, -2)}</strong> : <Fragment key={i}>{p}</Fragment>,
  );
}

/** Minimal, safe markdown rendering (headings, bullets, paragraphs). */
function Markdown({ text }: { text: string }) {
  const lines = text.split("\n");
  const out: React.ReactNode[] = [];
  let list: string[] = [];

  const flush = () => {
    if (list.length) {
      out.push(
        <ul key={`ul-${out.length}`}>
          {list.map((li, i) => (
            <li key={i}>{inline(li)}</li>
          ))}
        </ul>,
      );
      list = [];
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (/^#{1,6}\s/.test(line)) {
      flush();
      out.push(<h4 key={`h-${out.length}`}>{inline(line.replace(/^#{1,6}\s/, ""))}</h4>);
    } else if (/^[-*]\s/.test(line)) {
      list.push(line.replace(/^[-*]\s/, ""));
    } else if (/^\d+\.\s/.test(line)) {
      list.push(line.replace(/^\d+\.\s/, ""));
    } else if (line.trim() === "") {
      flush();
    } else {
      flush();
      out.push(<p key={`p-${out.length}`}>{inline(line)}</p>);
    }
  }
  flush();
  return <>{out}</>;
}

export function AiPanel() {
  const open = useViewportStore((s) => s.aiOpen);
  const busy = useViewportStore((s) => s.aiBusy);
  const result = useViewportStore((s) => s.aiResult);
  const error = useViewportStore((s) => s.aiError);
  const close = useViewportStore((s) => s.closeAi);
  const retry = useViewportStore((s) => s.evaluateDrawing);

  if (!open) return null;

  return (
    <div className="overlay-center modal-backdrop ai-overlay">
      <div className="ai-card">
        <div className="ai-head">
          <span className="ai-title">✨ AI đánh giá bản vẽ</span>
          <button className="ai-close" onClick={close} title="Đóng">✕</button>
        </div>
        <div className="ai-body">
          {busy && (
            <div className="ai-status">
              <span className="ai-spinner" /> Đang phân tích khối bằng Claude… (có thể mất 10–30 giây)
            </div>
          )}
          {!busy && error && <div className="ai-error">⚠️ {error}</div>}
          {!busy && !error && result && <Markdown text={result} />}
        </div>
        <div className="ai-foot">
          <button onClick={retry} disabled={busy}>↻ Đánh giá lại</button>
          <button onClick={close} disabled={busy}>Đóng</button>
        </div>
      </div>
    </div>
  );
}
