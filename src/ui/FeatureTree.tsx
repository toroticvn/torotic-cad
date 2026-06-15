import { useState } from "react";
import { useViewportStore } from "../state/store";
import { consumedSketchIds, type Feature } from "../features";

const ICONS: Record<string, string> = {
  sketch: "✏️",
  extrude: "📦",
  revolve: "🔄",
  loft: "🪜",
  sweep: "〰️",
  fillet: "⌒",
  chamfer: "◣",
  thread: "🌀",
};

/** Display name (Boss-Extrude / Cut-Extrude ... like SolidWorks). */
function displayName(f: Feature): string {
  if (f.type === "extrude") return `${f.operation === "cut" ? "Cut" : "Boss"}-${f.name}`;
  if (f.type === "revolve") return `${f.operation === "cut" ? "Cut" : ""}${f.name}`;
  return f.name;
}

export function FeatureTree() {
  const features = useViewportStore((s) => s.features);
  const selectedId = useViewportStore((s) => s.selectedFeatureId);
  const select = useViewportStore((s) => s.selectFeature);
  const editSketch = useViewportStore((s) => s.editSketch);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const byId = new Map(features.map((f) => [f.id, f]));
  const consumed = new Set<string>();
  for (const f of features) consumedSketchIds(f).forEach((id) => consumed.add(id));

  // Top-level: every feature except sketches that are consumed by another feature.
  const topLevel = features.filter((f) => f.type !== "sketch" || !consumed.has(f.id));

  const row = (f: Feature, child = false) => (
    <li
      key={f.id}
      className={(f.id === selectedId ? "selected" : "") + (child ? " child" : "")}
      onClick={() => select(f.id)}
      onDoubleClick={() => f.type === "sketch" && editSketch(f.id)}
      title={f.type === "sketch" ? "Double-click để sửa sketch" : ""}
    >
      {ICONS[f.type] ?? "•"} {displayName(f)}
    </li>
  );

  return (
    <aside className="left-panel feature-tree">
      <div className="panel-title">Feature Tree</div>
      <ul>
        <li className="origin">📐 Origin</li>
        {features.length === 0 && <li className="empty">Chưa có feature. Bấm Sketch để bắt đầu.</li>}
        {topLevel.map((f) => {
          const kids = consumedSketchIds(f)
            .map((id) => byId.get(id))
            .filter((s): s is Feature => !!s);
          if (kids.length === 0) return row(f);
          const open = expanded.has(f.id);
          return (
            <li key={f.id} className="tree-group">
              <div className="tree-parent">
                <span className="tree-caret" onClick={() => toggle(f.id)}>{open ? "▾" : "▸"}</span>
                <span
                  className={"tree-label" + (f.id === selectedId ? " selected" : "")}
                  onClick={() => select(f.id)}
                >
                  {ICONS[f.type] ?? "•"} {displayName(f)}
                </span>
              </div>
              {open && <ul className="tree-children">{kids.map((k) => row(k, true))}</ul>}
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
