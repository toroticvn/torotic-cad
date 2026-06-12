import type { Point2 } from "./SketchPlane";

/** Sampling for ellipse and spline sketch entities (shared by sketcher, 3D
 * overlay and the profile/region builder). */

/** Points around an ellipse (center, radii rx/ry, rotation rot in rad). Closed:
 * the last point repeats the first so it draws/closes cleanly. */
export function ellipsePoints(cx: number, cy: number, rx: number, ry: number, rot: number, seg = 72): Point2[] {
  const co = Math.cos(rot);
  const si = Math.sin(rot);
  const out: Point2[] = [];
  for (let i = 0; i <= seg; i++) {
    const t = (i / seg) * Math.PI * 2;
    const ex = rx * Math.cos(t);
    const ey = ry * Math.sin(t);
    out.push({ x: cx + ex * co - ey * si, y: cy + ex * si + ey * co });
  }
  return out;
}

function catmull(p0: Point2, p1: Point2, p2: Point2, p3: Point2, t: number): Point2 {
  const t2 = t * t;
  const t3 = t2 * t;
  const f = (a: number, b: number, c: number, d: number) =>
    0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
  return { x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y) };
}

/** Smooth Catmull-Rom spline through the given control points. `closed` loops it. */
export function splinePoints(pts: Point2[], closed = false, perSpan = 16): Point2[] {
  const n = pts.length;
  if (n < 2) return pts.slice();
  if (n === 2) return [pts[0], pts[1]];
  const get = (i: number) => (closed ? pts[((i % n) + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
  const spans = closed ? n : n - 1;
  const out: Point2[] = [];
  for (let s = 0; s < spans; s++) {
    const p0 = get(s - 1);
    const p1 = get(s);
    const p2 = get(s + 1);
    const p3 = get(s + 2);
    for (let j = 0; j < perSpan; j++) out.push(catmull(p0, p1, p2, p3, j / perSpan));
  }
  out.push(closed ? pts[0] : pts[n - 1]);
  return out;
}
