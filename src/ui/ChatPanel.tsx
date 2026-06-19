import { Fragment, useEffect, useRef, useState } from "react";
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

export function ChatPanel() {
  const open = useViewportStore((s) => s.chatOpen);
  const busy = useViewportStore((s) => s.chatBusy);
  const error = useViewportStore((s) => s.chatError);
  const messages = useViewportStore((s) => s.chatMessages);
  const close = useViewportStore((s) => s.closeChat);
  const send = useViewportStore((s) => s.sendChat);
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to the newest message / status.
  useEffect(() => {
    if (open && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [open, messages, busy, error]);

  if (!open) return null;

  const submit = () => {
    const t = draft.trim();
    if (!t || busy) return;
    setDraft("");
    void send(t);
  };

  return (
    <div className="chat-panel">
      <div className="chat-head">
        <span className="chat-title">💬 Trợ lý AI</span>
        <button className="chat-close" onClick={close} title="Đóng">✕</button>
      </div>

      <div className="chat-scroll" ref={scrollRef}>
        {messages.length === 0 && !busy && (
          <div className="chat-empty">
            <p><b>Trợ lý có thể TỰ VẼ và TỰ SỬA mô hình cho bạn.</b> Cứ chat như nói với một kỹ sư:</p>
            <ul>
              <li>"Vẽ tấm 100×60 dày 10mm"</li>
              <li>"Khoan 4 lỗ φ8 ở 4 góc, cách mép 12mm"</li>
              <li>"Thêm trụ φ20 cao 30 ở giữa"</li>
              <li>"Bo tròn các cạnh R3"</li>
            </ul>
            <p>Hoặc hỏi để được hướng dẫn / đánh giá thiết kế — AI tự xem ảnh + cây tính năng hiện tại.</p>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`chat-msg ${m.role}`}>
            {m.role === "assistant" ? <Markdown text={m.text} /> : m.text}
            {m.role === "assistant" && m.model && (
              <div className="chat-model">{m.model === "deepseek" ? "⚡ DeepSeek" : "🧠 Claude"}</div>
            )}
          </div>
        ))}
        {busy && (
          <div className="chat-msg assistant chat-status">
            <span className="ai-spinner" /> AI đang xử lý…
          </div>
        )}
        {error && <div className="chat-error">⚠️ {error}</div>}
      </div>

      <div className="chat-input">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Nhờ AI vẽ/sửa hoặc hỏi… (Enter gửi, Shift+Enter xuống dòng)"
          rows={2}
        />
        <button onClick={submit} disabled={busy || !draft.trim()}>Gửi</button>
      </div>
    </div>
  );
}
