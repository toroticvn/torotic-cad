import type { Point2 } from "./SketchPlane";
import { sampleArc } from "./arc";
import type { ParametricSketch } from "./model";

/**
 * Planar arrangement of the sketch's curves: finds every closed region formed by
 * the curves AND their intersection points (like SolidWorks "contours"). Curves
 * are sampled into segments, all segment intersections are computed, the planar
 * graph is split at them, and its minimal faces are traced (DCEL, angular order).
 * Pure geometry (no replicad) so the UI can hit-test/display regions; the kernel
 * turns a region's path into a Drawing.
 *
 * Each region carries a sampled `polygon` (display/area/containment), an `outline`
 * path, and `holes` paths. A path is reconstructed with arcs where consecutive
 * sub-segments came from the same original arc/circle (so curved borders stay
 * curved, not faceted).
 */

const EPS = 1e-9;
const NODE_EPS = 1e-3; // merge nodes closer than this

export type PathCmd = { kind: "line"; to: Point2 } | { kind: "arc"; to: Point2; via: Point2 };
export interface RegionPath {
  start: Point2;
  cmds: PathCmd[];
}
export interface Region2D {
  polygon: Point2[];
  outline: RegionPath;
  holes: RegionPath[];
}

interface Seg {
  a: Point2;
  b: Point2;
  src: string; // originating entity id
  arc?: { cx: number; cy: number; r: number };
}

/** Tessellate all non-construction sketch geometry into tagged segments. */
function segmentsFromSketch(sketch: ParametricSketch): Seg[] {
  const pt = (id: string) => sketch.points.find((p) => p.id === id)!;
  const segs: Seg[] = [];

  for (const l of sketch.lines) {
    if (l.construction) continue;
    segs.push({ a: pt(l.p1), b: pt(l.p2), src: l.id });
  }
  for (const a of sketch.arcs) {
    if (a.construction) continue;
    const c = pt(a.center);
    const start = pt(a.start);
    const r = Math.hypot(start.x - c.x, start.y - c.y);
    const pts = sampleArc(c, start, pt(a.end), a.ccw, 64);
    for (let i = 0; i < pts.length - 1; i++) segs.push({ a: pts[i], b: pts[i + 1], src: a.id, arc: { cx: c.x, cy: c.y, r } });
  }
  for (const ci of sketch.circles) {
    if (ci.construction) continue;
    const c = pt(ci.center);
    const n = 72;
    for (let i = 0; i < n; i++) {
      const t0 = (i / n) * Math.PI * 2;
      const t1 = ((i + 1) / n) * Math.PI * 2;
      segs.push({
        a: { x: c.x + Math.cos(t0) * ci.r, y: c.y + Math.sin(t0) * ci.r },
        b: { x: c.x + Math.cos(t1) * ci.r, y: c.y + Math.sin(t1) * ci.r },
        src: ci.id,
        arc: { cx: c.x, cy: c.y, r: ci.r },
      });
    }
  }
  return segs;
}

/** Find every region (face) of the sketch's planar arrangement. */
export function findRegions2D(sketch: ParametricSketch): Region2D[] {
  const segs = segmentsFromSketch(sketch);
  if (segs.length === 0) return [];

  // 1. Split each segment at interior intersections with every other segment.
  const splits: number[][] = segs.map(() => [0, 1]);
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      const A = segs[i];
      const B = segs[j];
      const r1x = A.b.x - A.a.x, r1y = A.b.y - A.a.y;
      const r2x = B.b.x - B.a.x, r2y = B.b.y - B.a.y;
      const denom = r1x * r2y - r1y * r2x;
      if (Math.abs(denom) < EPS) continue; // parallel
      const t = ((B.a.x - A.a.x) * r2y - (B.a.y - A.a.y) * r2x) / denom;
      const u = ((B.a.x - A.a.x) * r1y - (B.a.y - A.a.y) * r1x) / denom;
      if (t < -1e-9 || t > 1 + 1e-9 || u < -1e-9 || u > 1 + 1e-9) continue;
      if (t > 1e-7 && t < 1 - 1e-7) splits[i].push(t);
      if (u > 1e-7 && u < 1 - 1e-7) splits[j].push(u);
    }
  }

  // 2. Build nodes (deduped) + mini-edges (straight pieces between split points).
  const nodes: Point2[] = [];
  const nodeId = (p: Point2): number => {
    for (let k = 0; k < nodes.length; k++) {
      if (Math.abs(nodes[k].x - p.x) < NODE_EPS && Math.abs(nodes[k].y - p.y) < NODE_EPS) return k;
    }
    nodes.push(p);
    return nodes.length - 1;
  };

  interface Mini { from: number; to: number; fromP: Point2; toP: Point2; src: string; arc?: Seg["arc"] }
  const minis: Mini[] = [];
  segs.forEach((s, i) => {
    const ts = [...new Set(splits[i])].sort((x, y) => x - y);
    for (let k = 0; k < ts.length - 1; k++) {
      const pA = { x: s.a.x + (s.b.x - s.a.x) * ts[k], y: s.a.y + (s.b.y - s.a.y) * ts[k] };
      const pB = { x: s.a.x + (s.b.x - s.a.x) * ts[k + 1], y: s.a.y + (s.b.y - s.a.y) * ts[k + 1] };
      const na = nodeId(pA);
      const nb = nodeId(pB);
      if (na !== nb) minis.push({ from: na, to: nb, fromP: nodes[na], toP: nodes[nb], src: s.src, arc: s.arc });
    }
  });
  if (minis.length === 0) return [];

  // 3. Half-edges + per-node CCW ordering.
  interface HE { from: number; to: number; fromP: Point2; toP: Point2; src: string; arc?: Seg["arc"]; ang: number; twin: number }
  const hes: HE[] = [];
  for (const m of minis) {
    const ang1 = Math.atan2(m.toP.y - m.fromP.y, m.toP.x - m.fromP.x);
    const ang2 = Math.atan2(m.fromP.y - m.toP.y, m.fromP.x - m.toP.x);
    const i1 = hes.length;
    hes.push({ from: m.from, to: m.to, fromP: m.fromP, toP: m.toP, src: m.src, arc: m.arc, ang: ang1, twin: i1 + 1 });
    hes.push({ from: m.to, to: m.from, fromP: m.toP, toP: m.fromP, src: m.src, arc: m.arc, ang: ang2, twin: i1 });
  }
  const outgoing = new Map<number, number[]>();
  hes.forEach((h, i) => {
    if (!outgoing.has(h.from)) outgoing.set(h.from, []);
    outgoing.get(h.from)!.push(i);
  });
  for (const list of outgoing.values()) list.sort((x, y) => hes[x].ang - hes[y].ang);

  // 4. Trace faces: next(he) = clockwise neighbor of twin at the arrival node.
  const visited = new Array(hes.length).fill(false);
  const cycles: HE[][] = [];
  for (let start = 0; start < hes.length; start++) {
    if (visited[start]) continue;
    const cycle: HE[] = [];
    let cur = start;
    let guard = 0;
    while (!visited[cur] && guard++ < hes.length + 5) {
      visited[cur] = true;
      cycle.push(hes[cur]);
      const arr = hes[cur].to;
      const list = outgoing.get(arr)!;
      const twin = hes[cur].twin;
      const idx = list.indexOf(twin);
      cur = list[(idx + 1) % list.length];
    }
    if (cycle.length >= 2) cycles.push(cycle);
  }

  // 5. Classify cycles by signed area: positive = region outline, negative = hole/outer.
  const polyOf = (cyc: HE[]) => cyc.map((h) => h.fromP);
  const signedArea = (poly: Point2[]) => {
    let a = 0;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) a += (poly[j].x + poly[i].x) * (poly[j].y - poly[i].y);
    return a / 2;
  };
  const positives: { cyc: HE[]; poly: Point2[]; area: number }[] = [];
  const negatives: { cyc: HE[]; poly: Point2[]; area: number }[] = [];
  for (const cyc of cycles) {
    const poly = polyOf(cyc);
    const area = signedArea(poly);
    if (area > 1e-6) positives.push({ cyc, poly, area });
    else if (area < -1e-6) negatives.push({ cyc, poly, area });
  }

  // 6. Assign each negative (hole) to the smallest positive region containing it.
  const regions: Region2D[] = positives.map((p) => ({ polygon: p.poly, outline: pathOf(p.cyc), holes: [] }));
  for (const neg of negatives) {
    const probe = centroid(neg.poly);
    const negArea = Math.abs(neg.area);
    let bestIdx = -1;
    let bestArea = Infinity;
    positives.forEach((p, i) => {
      // A hole must sit inside a STRICTLY larger region. This rejects the
      // unbounded/outer face (which coincides with, or is bigger than, the
      // region it borders) so it isn't mistaken for a hole.
      if (p.area > negArea + 1e-6 && p.area < bestArea && pointInPolygon(probe, p.poly)) {
        bestArea = p.area;
        bestIdx = i;
      }
    });
    if (bestIdx >= 0) regions[bestIdx].holes.push(pathOf(neg.cyc));
  }
  return regions;
}

/** Turn a traced cycle into a path, grouping same-source arc runs into arcs. */
function pathOf(input: { fromP: Point2; toP: Point2; src: string; arc?: Seg["arc"] }[]): RegionPath {
  // Rotate so a straight edge is last (lets the kernel's close() draw it).
  let cyc = input;
  const li = cyc.findIndex((h) => !h.arc);
  if (li >= 0) cyc = cyc.slice(li + 1).concat(cyc.slice(0, li + 1));

  const start = cyc[0].fromP;
  const cmds: PathCmd[] = [];
  let i = 0;
  while (i < cyc.length) {
    const h = cyc[i];
    if (!h.arc) {
      cmds.push({ kind: "line", to: h.toP });
      i++;
      continue;
    }
    // Group consecutive arc sub-edges from the same source curve.
    let j = i;
    while (j + 1 < cyc.length && cyc[j + 1].arc && cyc[j + 1].src === h.src) j++;
    const run = cyc.slice(i, j + 1);
    emitArcRun(run, cmds);
    i = j + 1;
  }
  return { start, cmds };
}

/** Emit one or two arc commands approximating a run of arc sub-edges. */
function emitArcRun(run: { fromP: Point2; toP: Point2 }[], cmds: PathCmd[]) {
  const end = run[run.length - 1].toP;
  const startP = run[0].fromP;
  const full = Math.hypot(end.x - startP.x, end.y - startP.y) < NODE_EPS * 5;
  if (full && run.length >= 2) {
    const midA = run[Math.floor(run.length / 3)].fromP;
    const midB = run[Math.floor((2 * run.length) / 3)].fromP;
    cmds.push({ kind: "arc", to: midB, via: midA });
    cmds.push({ kind: "arc", to: end, via: run[run.length - 1].fromP });
  } else {
    const via = run[Math.floor(run.length / 2)].fromP;
    cmds.push({ kind: "arc", to: end, via });
  }
}

function centroid(poly: Point2[]): Point2 {
  let x = 0, y = 0;
  for (const p of poly) {
    x += p.x;
    y += p.y;
  }
  return { x: x / poly.length, y: y / poly.length };
}

function pointInPolygon(p: Point2, poly: Point2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
    if (yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
