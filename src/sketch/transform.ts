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

/** What `cloneEntities` produced, so callers can add relations (Mirror). */
export interface CloneResult {
  /** source point id -> cloned point id (same id when point landed on an existing one). */
  points: Map<string, string>;
  /** source circle id -> cloned circle id. */
  circles: { src: string; id: string }[];
}

/**
 * Clone the selected lines/circles/arcs into the sketch, mapping each point
 * through `map`. `flipArc` reverses arc orientation (needed for mirroring).
 * Points shared between selected entities are kept shared within one pass.
 * Returns the id mapping so Mirror can link copies with symmetric relations.
 */
export function cloneEntities(
  s: ParametricSketch,
  refs: SelRef[],
  map: (p: Point2) => Point2,
  flipArc: boolean
): CloneResult {
  const remap = new Map<string, string>();
  const circles: { src: string; id: string }[] = [];
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
      if (c) {
        const id = tid("cir");
        s.circles.push({ id, center: newId(c.center), r: c.r, construction: c.construction });
        circles.push({ src: c.id, id });
      }
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
  return { points: remap, circles };
}

/** Id generator for relations created alongside a clone (e.g. Mirror symmetry). */
export function relId(prefix: string): string {
  return tid(prefix);
}

/** Unique point ids referenced by the selected entities. */
export function refPointIds(s: ParametricSketch, refs: SelRef[]): Set<string> {
  const ids = new Set<string>();
  for (const r of refs) {
    if (r.kind === "point") ids.add(r.id);
    else if (r.kind === "line") {
      const l = s.lines.find((x) => x.id === r.id);
      if (l) [l.p1, l.p2].forEach((i) => ids.add(i));
    } else if (r.kind === "circle") {
      const c = s.circles.find((x) => x.id === r.id);
      if (c) ids.add(c.center);
    } else if (r.kind === "arc") {
      const a = s.arcs.find((x) => x.id === r.id);
      if (a) [a.center, a.start, a.end].forEach((i) => ids.add(i));
    }
  }
  return ids;
}

/** Move the points of the selected entities in place via `map`. */
export function transformPoints(s: ParametricSketch, refs: SelRef[], map: (p: Point2) => Point2): void {
  for (const id of refPointIds(s, refs)) {
    const p = s.points.find((q) => q.id === id);
    if (p) {
      const np = map({ x: p.x, y: p.y });
      p.x = np.x;
      p.y = np.y;
    }
  }
}

/** Scale the radii of selected circles by `factor` (for in-place scale). */
export function scaleSelectionRadii(s: ParametricSketch, refs: SelRef[], factor: number): void {
  for (const r of refs) {
    if (r.kind === "circle") {
      const c = s.circles.find((x) => x.id === r.id);
      if (c) c.r = Math.max(0.01, c.r * factor);
    }
  }
}

/** Centroid of all points referenced by the selected entities. */
export function selectionCentroid(s: ParametricSketch, refs: SelRef[]): Point2 {
  const ids = new Set<string>();
  for (const r of refs) {
    if (r.kind === "line") {
      const l = s.lines.find((x) => x.id === r.id);
      if (l) [l.p1, l.p2].forEach((i) => ids.add(i));
    } else if (r.kind === "circle") {
      const c = s.circles.find((x) => x.id === r.id);
      if (c) ids.add(c.center);
    } else if (r.kind === "arc") {
      const a = s.arcs.find((x) => x.id === r.id);
      if (a) [a.center, a.start, a.end].forEach((i) => ids.add(i));
    }
  }
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (const id of ids) {
    const p = s.points.find((q) => q.id === id);
    if (p) {
      sx += p.x;
      sy += p.y;
      n++;
    }
  }
  return n ? { x: sx / n, y: sy / n } : { x: 0, y: 0 };
}

/**
 * Offset the selected lines/arcs/circles by `dist`. `outward` = away from the
 * selection centroid (lines) / larger radius (arcs, circles); otherwise inward.
 * Lines offset along their normal; arcs/circles change radius about their center.
 */
export function offsetEntities(s: ParametricSketch, refs: SelRef[], dist: number, outward: boolean): void {
  const c = selectionCentroid(s, refs);
  const sign = outward ? 1 : -1;
  const d = Math.abs(dist);

  for (const ref of refs) {
    if (ref.kind === "line") {
      const l = s.lines.find((x) => x.id === ref.id);
      if (!l) continue;
      const a = s.points.find((p) => p.id === l.p1)!;
      const b = s.points.find((p) => p.id === l.p2)!;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy);
      if (len < 1e-9) continue;
      let nx = -dy / len;
      let ny = dx / len;
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      if (nx * (mx - c.x) + ny * (my - c.y) < 0) {
        nx = -nx; // make the normal point outward (away from centroid)
        ny = -ny;
      }
      const ox = nx * d * sign;
      const oy = ny * d * sign;
      const na = getOrCreate(s, { x: a.x + ox, y: a.y + oy });
      const nb = getOrCreate(s, { x: b.x + ox, y: b.y + oy });
      s.lines.push({ id: tid("ln"), p1: na, p2: nb, construction: l.construction });
    } else if (ref.kind === "circle") {
      const cir = s.circles.find((x) => x.id === ref.id);
      if (!cir) continue;
      const nr = outward ? cir.r + d : Math.max(0.1, cir.r - d);
      s.circles.push({ id: tid("cir"), center: cir.center, r: nr, construction: cir.construction });
    } else if (ref.kind === "arc") {
      const arc = s.arcs.find((x) => x.id === ref.id);
      if (!arc) continue;
      const ctr = s.points.find((p) => p.id === arc.center)!;
      const st = s.points.find((p) => p.id === arc.start)!;
      const en = s.points.find((p) => p.id === arc.end)!;
      const r = Math.hypot(st.x - ctr.x, st.y - ctr.y);
      const nr = outward ? r + d : Math.max(0.1, r - d);
      const scale = (p: Point2) => {
        const ux = p.x - ctr.x;
        const uy = p.y - ctr.y;
        const l = Math.hypot(ux, uy) || 1;
        return { x: ctr.x + (ux / l) * nr, y: ctr.y + (uy / l) * nr };
      };
      const ns = getOrCreate(s, scale(st));
      const ne = getOrCreate(s, scale(en));
      s.arcs.push({ id: tid("arc"), center: arc.center, start: ns, end: ne, ccw: arc.ccw, construction: arc.construction });
    }
  }
}
