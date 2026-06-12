import { useViewportStore } from "../state/store";

/** Lightweight info modal driven by store.notice. */
export function Notice() {
  const notice = useViewportStore((s) => s.notice);
  const dismiss = useViewportStore((s) => s.dismissNotice);
  if (!notice) return null;
  return (
    <div className="overlay-center modal-backdrop ai-overlay">
      <div className="ai-card notice-card">
        <div className="ai-body notice-body">{notice}</div>
        <div className="ai-foot">
          <button onClick={dismiss}>Đã hiểu</button>
        </div>
      </div>
    </div>
  );
}
