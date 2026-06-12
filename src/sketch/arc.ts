import type { Point2 } from "./SketchPlane";

/**
 * Arc geometry helpers shared by the sketcher (render/pick) and the kernel
 * (extrude profile). An arc is stored as center + start + end points plus a
 * sweep direction (ccw); the radius is implied by |center→start|.
 */

const TAU = Math.PI * 2;
const norm2pi = (a: number) => ((a % TAU) + TAU) % TAU;

export interface ArcGeom {
  cx: number;
  cy: number;
  r: number;
  a0: number; // start angle
  delta: number; // signed sweep (ccw positive)
}

export function arcGeom(center: Point2, start: Point2, end: Point2, ccw: boolean): ArcGeom {
  const r = Math.hypot(start.x - center.x, start.y - center.y);
  const a0 = Math.atan2(start.y - center.y, start.x - center.x);
  const a1 = Math.atan2(end.y - center.y, end.x - center.x);
  let delta = ccw ? norm2pi(a1 - a0) : -norm2pi(a0 - a1);
  if (Math.abs(delta) < 1e-9) delta = ccw ? TAU : -TAU; // full circle fallback
  return { cx: center.x, cy: center.y, r, a0, delta };
}

/** Polyline approximation of an arc (for three.js rendering). */
export function sampleArc(center: Point2, start: Point2, end: Point2, ccw: boolean, segs = 48): Point2[] {
  const g = arcGeom(center, start, end, ccw);
  const n = Math.max(2, Math.ceil((Math.abs(g.delta) / TAU) * segs));
  const pts: Point2[] = [];
  for (let i = 0; i <= n; i++) {
    const a = g.a0 + (g.delta * i) / n;
    pts.push({ x: g.cx + Math.cos(a) * g.r, y: g.cy + Math.sin(a) * g.r });
  }
  return pts;
}

/**
 * A point lying on the arc, used as the "via" point for replicad's
 * threePointsArcTo (which is direction-agnostic). `ccwTraversal` is the sweep
 * direction when traveling from `from` to `to`.
 */
export function arcViaPoint(center: Point2, from: Point2, to: Point2, ccwTraversal: boolean): Point2 {
  const r = Math.hypot(from.x - center.x, from.y - center.y);
  const a0 = Math.atan2(from.y - center.y, from.x - center.x);
  const a1 = Math.atan2(to.y - center.y, to.x - center.x);
  const delta = ccwTraversal ? norm2pi(a1 - a0) : -norm2pi(a0 - a1);
  const a = a0 + delta / 2;
  return { x: center.x + Math.cos(a) * r, y: center.y + Math.sin(a) * r };
}

/** Shortest distance from a point to the arc (for picking). */
export function distToArc(center: Point2, start: Point2, end: Point2, ccw: boolean, p: Point2): number {
  const g = arcGeom(center, start, end, ccw);
  const ang = Math.atan2(p.y - g.cy, p.x - g.cx);
  // Is the point's angle within the swept range?
  const rel = g.delta >= 0 ? norm2pi(ang - g.a0) : norm2pi(g.a0 - ang);
  if (rel <= Math.abs(g.delta)) return Math.abs(Math.hypot(p.x - g.cx, p.y - g.cy) - g.r);
  return Math.min(Math.hypot(p.x - start.x, p.y - start.y), Math.hypot(p.x - end.x, p.y - end.y));
}

/** Circumcenter of three points (center of the circle through them); null if collinear. */
export function circumcenter(a: Point2, b: Point2, c: Point2): Point2 | null {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  if (Math.abs(d) < 1e-9) return null;
  const a2 = a.x * a.x + a.y * a.y;
  const b2 = b.x * b.x + b.y * b.y;
  const c2 = c.x * c.x + c.y * c.y;
  return {
    x: (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / d,
    y: (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d,
  };
}

/** True if going start→end CCW around `center` passes through `via`. */
export function isCcwThrough(center: Point2, start: Point2, end: Point2, via: Point2): boolean {
  const a0 = Math.atan2(start.y - center.y, start.x - center.x);
  const a1 = Math.atan2(end.y - center.y, end.x - center.x);
  const av = Math.atan2(via.y - center.y, via.x - center.x);
  // CCW from start to end; does via fall inside that sweep?
  return norm2pi(av - a0) <= norm2pi(a1 - a0);
}
