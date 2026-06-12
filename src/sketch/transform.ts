import type { ParametricSketch, SketchPoint } from "./model";
import type { Point2 } from "./SketchPlane";
import type { SelRef } from "../state/store";

/**
 * Pure 2D sketch transforms (mirror / pattern). Each clones the selected
 * entities into the sketch, mapping every point through `map`. Used by the
 * Mirror, Linear Pattern and Circular Pattern tools.
 */

let seq = 0;
const tid = (p: string) => `${p}-t${++seq}`;

/** Reflect point p across the infinite line through a,b. */
export function reflectAcross(p: Point2, a: Point2, b: Point2): Point2 {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-12) return { x: p.x, y: p.y };
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  const px = a.x + t * dx;
  const py = a.y + t * dy;
  return { x: 2 * px - p.x, y: 2 * py - p.y };
}

/** Rotate point p about center c by angle (radians). */
export function rotateAbout(p: Point2, c: Point2, ang: number): Point2 {
  const co = Math.cos(ang);
  const si = Math.sin(ang);
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  return { x: c.x + dx * co - dy * si, y: c.y + dx * si + dy * co };
}

function getOrCreate(s: ParametricSketch, p: Point2): string {
  const hit = s.points.find((q) => Math.hypot(q.x - p.x, q.y - p.y) <= 1e-6);
  if (hit) return hit.id;
  const pt: SketchPoint = { id: tid("pt"), x: p.x, y: p.y };
  s.points.push(pt);
  return pt.id;
}

/**
 * Clone the selected lines/circles/arcs into the sketch, mapping each point
 * through `map`. `flipArc` reverses arc orientation (needed for mirroring).
 * Points shared between selected entities are kept shared within one pass.
 */
export function cloneEntities(
  s: ParametricSketch,
  refs: SelRef[],
  map: (p: Point2) => Point2,
  flipArc: boolean
): void {
  const remap = new Map<string, string>();
  const newId = (oldId: string): string => {
    const cached = remap.get(oldId);
    if (cached) return cached;
    const op = s.points.find((q) => q.id === oldId)!;
    const id = getOrCreate(s, map({ x: op.x, y: op.y }));
    remap.set(oldId, id);
    return id;
  };

  for (const ref of refs) {
    if (ref.kind === "line") {
      const l = s.lines.find((x) => x.id === ref.id);
      if (l) s.lines.push({ id: tid("ln"), p1: newId(l.p1), p2: newId(l.p2), construction: l.construction });
    } else if (ref.kind === "circle") {
      const c = s.circles.find((x) => x.id === ref.id);
      if (c) s.circles.push({ id: tid("cir"), center: newId(c.center), r: c.r, construction: c.construction });
    } else if (ref.kind === "arc") {
      const a = s.arcs.find((x) => x.id === ref.id);
      if (a)
        s.arcs.push({
          id: tid("arc"),
          center: newId(a.center),
          start: newId(a.start),
          end: newId(a.end),
          ccw: flipArc ? !a.ccw : a.ccw,
          construction: a.construction,
        });
    }
  }
}
