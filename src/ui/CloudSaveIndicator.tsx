import { useEffect } from "react";
import { useViewportStore } from "../state/store";

/**
 * When a cloud project is open (and the user is logged in), auto-saves the model
 * to that project ~1.5s after the feature tree changes, and shows the save state
 * in the toolbar. Subscribes to the store directly so it catches every edit path.
 */
export function CloudSaveIndicator() {
  const user = useViewportStore((s) => s.authUser);
  const pid = useViewportStore((s) => s.cloudProjectId);
  const name = useViewportStore((s) => s.cloudProjectName);
  const saveState = useViewportStore((s) => s.saveState);

  useEffect(() => {
    if (!pid || !user) return;
    let t: ReturnType<typeof setTimeout> | undefined;
    const unsub = useViewportStore.subscribe((s, prev) => {
      if (s.features !== prev.features && s.cloudProjectId && s.authUser) {
        clearTimeout(t);
        t = setTimeout(() => void useViewportStore.getState().autoSaveProject(), 1500);
      }
    });
    return () => { unsub(); clearTimeout(t); };
  }, [pid, user]);

  if (!user || !pid) return null;
  const status =
    saveState === "saving" ? "Đang lưu…" :
    saveState === "saved" ? "Đã lưu ✓" :
    saveState === "error" ? "⚠ Lỗi lưu" : "";
  return (
    <span className={"cloud-save-indicator css-" + saveState} title={`Dự án đám mây: ${name}`}>
      ☁ {name}{status ? ` · ${status}` : ""}
    </span>
  );
}
