import { draw, type Drawing } from "replicad";
import { sampleArc } from "../sketch/arc";
import { ellipsePoints, splinePoints } from "../sketch/curves";
import type { Point2 } from "../sketch/SketchPlane";
import type { ParametricSketch, SketchArc } from "../sketch/model";
import { findRegions2D, type RegionPath } from "../sketch/regions2d";

/**
 * Ellipses and splines aren't handled by the planar arrangement directly, so we
 * tessellate them into short line segments in a cloned sketch before region
 * finding. Returns the sketch unchanged when there are none (existing flow).
 */
export function expandForProfile(sketch: ParametricSketch): ParametricSketch {
  const ellipses = sketch.ellipses ?? [];
  const splines = sketch.splines ?? [];
  if (ellipses.length === 0 && splines.length === 0) return sketch;

  const s = structuredClone(sketch);
  const pt = (id: string) => s.points.find((q) => q.id === id);
  let k = 0;
  const nid = (p: string) => `ex-${p}-${++k}`;

  // Add a polyline; `ring` connects the last point back to the first.
  const addPolyline = (pts: Point2[], construction: boolean | undefined, ring: boolean) => {
    if (pts.length < 2) return;
    const ids = pts.map((p) => {
      const id = nid("p");
      s.points.push({ id, x: p.x, y: p.y });
      return id;
    });
    for (let i = 0; i < ids.length - 1; i++) s.lines.push({ id: nid("l"), p1: ids[i], p2: ids[i + 1], construction });
    if (ring) s.lines.push({ id: nid("l"), p1: ids[ids.length - 1], p2: ids[0], construction });
  };

  for (const e of ellipses) {
    const c = pt(e.center);
    if (!c) continue;
    addPolyline(ellipsePoints(c.x, c.y, e.rx, e.ry, e.rot).slice(0, -1), e.construction, true);
  }
  for (const sp of splines) {
    const ctrl = sp.points.map((id) => pt(id)).filter((p): p is NonNullable<typeof p> => !!p);
    if (ctrl.length < 2) continue;
    const sampled = splinePoints(ctrl, sp.closed);
    const ring = !!sp.closed;
    addPolyline(ring ? sampled.slice(0, -1) : sampled, sp.construction, ring);
  }

  s.ellipses = [];
  s.splines = [];
  return s;
}

/**
 * Converts a parametric sketch into a closed 2D replicad Drawing. Regions are
 * found via the planar arrangement of the sketch curves (`findRegions2D`) — so
 * intersecting curves split into selectable sub-regions (SolidWorks "contours"),
 * and holes are handled automatically. `findRegions` (polygon + deferred Drawing
 * builder) is consumed by the UI; `buildProfile` fuses the chosen regions.
 */

export class ExtrudeError extends Error {}

export interface RegionInfo {
  polygon: Point2[];
  build: () => Drawing;
}

const near = (a: Point2, b: Point2) => Math.abs(a.x - b.x) < 1e-4 && Math.abs(a.y - b.y) < 1e-4;

/** Build a replicad Drawing from an arrangement region path (outline). */
function drawPath(path: RegionPath): Drawing {
  let pen = draw([path.start.x, path.start.y]);
  path.cmds.forEach((c, i) => {
    const isLast = i === path.cmds.length - 1;
    if (c.kind === "line") {
      if (isLast && near(c.to, path.start)) return; // close() draws the final straight segment
      pen = pen.lineTo([c.to.x, c.to.y]);
    } else {
      pen = pen.threePointsArcTo([c.to.x, c.to.y], [c.via.x, c.via.y]);
    }
  });
  return pen.close();
}

/** All closed regions of the sketch (stable order), for UI + selective extrude. */
export function findRegions(sketch: ParametricSketch): RegionInfo[] {
  return findRegions2D(expandForProfile(sketch)).map((r) => ({
    polygon: r.polygon,
    build: () => {
      let d = drawPath(r.outline);
      for (const h of r.holes) d = d.cut(drawPath(h));
      return d;
    },
  }));
}

/**
 * Build a closed Drawing from the sketch. If `selected` (region indices) is given
 * and non-empty, only those regions are fused; otherwise all regions.
 */
export function buildProfile(sketch: ParametricSketch, selected?: number[]): Drawing {
  const all = findRegions(sketch);
  const chosen = selected && selected.length ? selected.filter((i) => i >= 0 && i < all.length).map((i) => all[i]) : all;
  if (chosen.length === 0) {
    throw new ExtrudeError("Chưa có biên dạng kín để đùn (chọn vùng hoặc vẽ một vùng khép kín).");
  }
  let result: Drawing | null = null;
  for (const r of chosen) result = result ? result.fuse(r.build()) : r.build();
  return result!;
}

interface LoopEdge {
  id: string;
  a: string;
  b: string;
  arc?: SketchArc;
}

/**
 * Order an OPEN chain of line/arc segments into a polyline of 2D points (arcs
 * sampled). Used as the spine for sweep. Returns null unless the geometry is a
 * single chain (≤2 endpoints, every vertex degree ≤2).
 */
export function extractOpenPath(sketch: ParametricSketch): Point2[] | null {
  const lines = sketch.lines.filter((l) => !l.construction);
  const arcs = sketch.arcs.filter((a) => !a.construction);
  const edges: LoopEdge[] = [
    ...lines.map((l) => ({ id: l.id, a: l.p1, b: l.p2 })),
    ...arcs.map((a) => ({ id: a.id, a: a.start, b: a.end, arc: a })),
  ];
  if (edges.length === 0) return null;

  const adj = new Map<string, { edge: LoopEdge; other: string }[]>();
  const link = (k: string, edge: LoopEdge, other: string) => {
    if (!adj.has(k)) adj.set(k, []);
    adj.get(k)!.push({ edge, other });
  };
  for (const e of edges) {
    if (e.a === e.b) continue;
    link(e.a, e, e.b);
    link(e.b, e, e.a);
  }
  for (const list of adj.values()) if (list.length > 2) return null;

  const endpoints = [...adj.entries()].filter(([, l]) => l.length === 1).map(([k]) => k);
  const startId = endpoints[0] ?? edges[0].a;
  const pt = (id: string) => sketch.points.find((p) => p.id === id)!;

  const out: Point2[] = [pt(startId)];
  let curr = startId;
  let prevEdgeId: string | null = null;
  for (let guard = 0; guard <= edges.length; guard++) {
    const choice = adj.get(curr)?.find((o) => o.edge.id !== prevEdgeId);
    if (!choice) break;
    if (choice.edge.arc) {
      const a = choice.edge.arc;
      const ccwTrav = curr === a.start ? a.ccw : !a.ccw;
      out.push(...sampleArc(pt(a.center), pt(curr), pt(choice.other), ccwTrav).slice(1));
    } else {
      out.push(pt(choice.other));
    }
    prevEdgeId = choice.edge.id;
    curr = choice.other;
    if (curr === startId) break;
  }
  return out.length >= 2 ? out : null;
}
