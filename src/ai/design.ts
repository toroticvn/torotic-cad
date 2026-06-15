import type { Feature, BoolOp, ExtrudeFeature, SketchFeature } from "../features";
import type { PlaneId } from "../sketch/SketchPlane";
import { emptySketch, type ParametricSketch, type SketchPoint } from "../sketch/model";
import { isCcwThrough } from "../sketch/arc";

/**
 * High-level "AI design" emitted by Claude tool use (/api/chat apply_design and
 * /api/generate), and the converter that expands it into the app's feature tree.
 */

export interface DesignOp {
  shape:
    | "box"
    | "cylinder"
    | "hole"
    | "fillet"
    | "chamfer"
    | "polygon"
    | "regularPolygon"
    | "slot"
    | "boltCircle"
    | "thread"
    | "mirror"
    | "patternLinear"
    | "patternCircular";
  op?: BoolOp;
  plane?: PlaneId;
  offset?: number;
  x?: number;
  y?: number;
  w?: number;
  d?: number;
  h?: number;
  diameter?: number;
  depth?: number;
  radius?: number;
  /** polygon: ordered [x,y] vertices of a closed profile (≥3). */
  points?: [number, number][];
  /** slot: length between the two end centers + width (overall = length+width). */
  length?: number;
  width?: number;
  /** thread: distance per turn (mm). Defaults to a coarse metric pitch for the diameter. */
  pitch?: number;
  /** angle of the slot axis / regularPolygon rotation, in degrees. */
  angle?: number;
  /** regularPolygon: number of sides (≥3); size given by `diameter` (across corners). */
  sides?: number;
  /** boltCircle: bolt-circle (pitch) diameter, individual hole diameter, start angle. */
  boltCircleDiameter?: number;
  holeDiameter?: number;
  startAngle?: number;
  /** hole wizard: plain / counterbore (lỗ bậc) / countersink (lỗ chìm). */
  holeType?: "simple" | "counterbore" | "countersink";
  /** Height of the top face the hole enters (for the recess/cone placement). */
  topOffset?: number;
  cboreDiameter?: number;
  cboreDepth?: number;
  csinkDiameter?: number;
  csinkAngle?: number;
  /** mirror: standard plane to mirror the whole solid about; merge=fuse (default). */
  mirrorPlane?: "XY" | "XZ" | "YZ";
  merge?: boolean;
  /** pattern: copies (incl. original), linear step, circular total angle + axis. */
  count?: number;
  dx?: number;
  dy?: number;
  dz?: number;
  totalAngle?: number;
  axis?: "x" | "y" | "z";
}

export interface Design {
  name?: string;
  /** "replace" = start a fresh model; "append" = add onto the current model. */
  mode?: "replace" | "append";
  operations: DesignOp[];
  /** Feature ids or names to remove first (only meaningful in append mode). */
  delete?: string[];
}

// Local id generator (avoids importing the store → circular dependency).
let seq = 0;
const id = (p: string) => `${p}-ai${Date.now().toString(36)}${++seq}`;

const num = (v: number | undefined, fallback: number) =>
  typeof v === "number" && isFinite(v) ? v : fallback;

function rectSketch(plane: PlaneId, offset: number, cx: number, cy: number, w: number, d: number): ParametricSketch {
  const s = emptySketch(plane, offset);
  const hw = Math.abs(w) / 2 || 5;
  const hd = Math.abs(d) / 2 || 5;
  const corners: [number, number][] = [
    [cx - hw, cy - hd],
    [cx + hw, cy - hd],
    [cx + hw, cy + hd],
    [cx - hw, cy + hd],
  ];
  const pts: SketchPoint[] = corners.map(([x, y]) => ({ id: id("pt"), x, y }));
  // Anchor the first corner so the rectangle doesn't drift when dimensioned.
  pts[0].fixed = true;
  s.points = pts;
  const lines = corners.map((_, i) => ({ id: id("ln"), p1: pts[i].id, p2: pts[(i + 1) % 4].id }));
  s.lines = lines;
  // Make it behave like a hand-drawn, fully-relational rectangle: horizontal
  // top/bottom, vertical sides → stays rectangular while editing/dimensioning.
  s.constraints.push(
    { id: id("c"), type: "horizontal", line: lines[0].id },
    { id: id("c"), type: "horizontal", line: lines[2].id },
    { id: id("c"), type: "vertical", line: lines[1].id },
    { id: id("c"), type: "vertical", line: lines[3].id },
  );
  return s;
}

function circleSketch(plane: PlaneId, offset: number, cx: number, cy: number, r: number): ParametricSketch {
  const s = emptySketch(plane, offset);
  // Anchor the centre so the circle stays put; the radius remains free to
  // dimension (Smart Dimension → Ø).
  const c = { id: id("pt"), x: cx, y: cy, fixed: true };
  s.points = [c];
  s.circles = [{ id: id("ci"), center: c.id, r: Math.abs(r) || 5 }];
  return s;
}

/** A closed free-form profile from ordered [x,y] vertices. */
function polygonSketch(plane: PlaneId, offset: number, points: [number, number][]): ParametricSketch | null {
  const valid = (points ?? []).filter((p) => Array.isArray(p) && isFinite(p[0]) && isFinite(p[1]));
  if (valid.length < 3) return null;
  const s = emptySketch(plane, offset);
  const pts = valid.map(([x, y]) => ({ id: id("pt"), x, y }));
  s.points = pts;
  for (let i = 0; i < pts.length; i++) s.lines.push({ id: id("ln"), p1: pts[i].id, p2: pts[(i + 1) % pts.length].id });
  return s;
}

/** A regular N-gon (hex nut, octagon…) inscribed in a circle of radius R. */
function regularPolygonSketch(plane: PlaneId, offset: number, cx: number, cy: number, sides: number, r: number, rotDeg: number): ParametricSketch | null {
  const n = Math.max(3, Math.round(sides));
  const R = Math.abs(r) || 10;
  const s = emptySketch(plane, offset);
  const rot = (rotDeg * Math.PI) / 180;
  const pts = Array.from({ length: n }, (_, i) => {
    const a = rot + (i * 2 * Math.PI) / n;
    return { id: id("pt"), x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) };
  });
  s.points = pts;
  for (let i = 0; i < n; i++) s.lines.push({ id: id("ln"), p1: pts[i].id, p2: pts[(i + 1) % n].id });
  return s;
}

/** A slot (obround): two end caps of radius width/2, `length` between centers. */
function slotSketch(plane: PlaneId, offset: number, cx: number, cy: number, length: number, width: number, angleDeg: number): ParametricSketch | null {
  const L = Math.abs(length);
  const r = Math.abs(width) / 2;
  if (r <= 0) return null;
  const s = emptySketch(plane, offset);
  const a = (angleDeg * Math.PI) / 180;
  const ux = Math.cos(a), uy = Math.sin(a); // slot axis
  const px = -uy, py = ux; // perpendicular
  const c1 = { id: id("pt"), x: cx - (ux * L) / 2, y: cy - (uy * L) / 2 };
  const c2 = { id: id("pt"), x: cx + (ux * L) / 2, y: cy + (uy * L) / 2 };
  const mk = (c: { x: number; y: number }, sx: number, sy: number) => ({ id: id("pt"), x: c.x + sx, y: c.y + sy });
  const P1a = mk(c1, px * r, py * r);
  const P1b = mk(c1, -px * r, -py * r);
  const P2a = mk(c2, px * r, py * r);
  const P2b = mk(c2, -px * r, -py * r);
  s.points = [c1, c2, P1a, P1b, P2a, P2b];
  s.lines.push({ id: id("ln"), p1: P1a.id, p2: P2a.id });
  s.lines.push({ id: id("ln"), p1: P1b.id, p2: P2b.id });
  const via2 = { x: c2.x + ux * r, y: c2.y + uy * r };
  s.arcs.push({ id: id("arc"), center: c2.id, start: P2a.id, end: P2b.id, ccw: isCcwThrough(c2, P2a, P2b, via2) });
  const via1 = { x: c1.x - ux * r, y: c1.y - uy * r };
  s.arcs.push({ id: id("arc"), center: c1.id, start: P1b.id, end: P1a.id, ccw: isCcwThrough(c1, P1b, P1a, via1) });
  return s;
}

/** A ring of `count` holes on a bolt-circle of diameter `pcd` (one sketch). */
function boltCircleSketch(plane: PlaneId, offset: number, cx: number, cy: number, pcd: number, holeDia: number, count: number, startDeg: number): ParametricSketch | null {
  const n = Math.max(1, Math.round(count));
  const R = Math.abs(pcd) / 2;
  const hr = Math.abs(holeDia) / 2 || 4;
  const s = emptySketch(plane, offset);
  const start = (startDeg * Math.PI) / 180;
  for (let i = 0; i < n; i++) {
    const ang = start + (i * 2 * Math.PI) / n;
    const c = { id: id("pt"), x: cx + R * Math.cos(ang), y: cy + R * Math.sin(ang) };
    s.points.push(c);
    s.circles.push({ id: id("ci"), center: c.id, r: hr });
  }
  return s;
}

function sketchFeature(name: string, sketch: ParametricSketch): SketchFeature {
  return { id: id("sketch"), type: "sketch", name, sketch };
}

function extrude(name: string, sketchId: string, distance: number, operation: BoolOp): ExtrudeFeature {
  return { id: id("extrude"), type: "extrude", name, sketchId, distance, operation };
}

/**
 * Expand an AI design into a concrete, rebuildable feature tree.
 * `continueSolid` = the design is appended onto an existing model that already
 * has a solid body, so the first op should boolean-combine (add/cut), not "new".
 */
export function designToFeatures(design: Design, opts?: { continueSolid?: boolean; nameStart?: number }): Feature[] {
  const ops = Array.isArray(design?.operations) ? design.operations : [];
  const features: Feature[] = [];
  let hasSolid = !!opts?.continueSolid;
  let n = opts?.nameStart ?? 0; // continue numbering when appending → fewer name clashes

  for (const o of ops) {
    const plane = (["top", "front", "right"] as const).includes(o.plane as PlaneId) ? (o.plane as PlaneId) : "top";
    const offset = num(o.offset, 0);
    const x = num(o.x, 0);
    const y = num(o.y, 0);
    n++;

    if (o.shape === "fillet" || o.shape === "chamfer") {
      if (!hasSolid) continue; // nothing to round yet
      features.push({ id: id(o.shape), type: o.shape, name: `${o.shape === "fillet" ? "Fillet" : "Chamfer"}${n}`, radius: num(o.radius, 2) });
      continue;
    }

    if (o.shape === "mirror") {
      if (!hasSolid) continue;
      const plane = (["XY", "XZ", "YZ"] as const).includes(o.mirrorPlane as "XY") ? (o.mirrorPlane as "XY" | "XZ" | "YZ") : "YZ";
      features.push({ id: id("mirrorBody"), type: "mirrorBody", name: `Mirror${n}`, plane, merge: o.merge !== false });
      continue;
    }

    if (o.shape === "patternLinear") {
      if (!hasSolid) continue;
      features.push({ id: id("patternLinear"), type: "patternLinear", name: `LinearPattern${n}`, count: Math.max(2, Math.round(num(o.count, 3))), dx: num(o.dx, 30), dy: num(o.dy, 0), dz: num(o.dz, 0) });
      continue;
    }

    if (o.shape === "patternCircular") {
      if (!hasSolid) continue;
      const axis = (["x", "y", "z"] as const).includes(o.axis as "z") ? (o.axis as "x" | "y" | "z") : "z";
      features.push({ id: id("patternCircular"), type: "patternCircular", name: `CircularPattern${n}`, count: Math.max(2, Math.round(num(o.count, 4))), angle: num(o.totalAngle, 360), axis });
      continue;
    }

    if (o.shape === "polygon") {
      const sk = polygonSketch(plane, offset, o.points ?? []);
      if (!sk) continue; // need ≥3 valid vertices
      const sf = sketchFeature(`Sketch${n}`, sk);
      features.push(sf);
      features.push(extrude(`Profile${n}`, sf.id, num(o.h, 20), hasSolid ? (o.op ?? "add") : "new"));
      hasSolid = true;
      continue;
    }

    if (o.shape === "regularPolygon") {
      const sk = regularPolygonSketch(plane, offset, x, y, num(o.sides, 6), num(o.diameter, 20) / 2, num(o.angle, 0));
      if (!sk) continue;
      const sf = sketchFeature(`Sketch${n}`, sk);
      features.push(sf);
      features.push(extrude(`Poly${n}`, sf.id, num(o.h, 20), hasSolid ? (o.op ?? "add") : "new"));
      hasSolid = true;
      continue;
    }

    if (o.shape === "slot") {
      const sk = slotSketch(plane, offset, x, y, num(o.length, 30), num(o.width, 10), num(o.angle, 0));
      if (!sk) continue;
      const sf = sketchFeature(`Sketch${n}`, sk);
      features.push(sf);
      // A slot is usually a through/blind cut on an existing solid; else a boss.
      const op: BoolOp = hasSolid ? (o.op ?? "cut") : "new";
      features.push(extrude(`Slot${n}`, sf.id, op === "cut" ? num(o.depth, 30) : num(o.h, 20), op));
      hasSolid = true;
      continue;
    }

    if (o.shape === "boltCircle") {
      if (!hasSolid) continue; // bolt holes cut into an existing flange/solid
      const sk = boltCircleSketch(plane, offset, x, y, num(o.boltCircleDiameter, 60), num(o.holeDiameter, 8), num(o.count, 4), num(o.startAngle, 0));
      if (!sk) continue;
      const sf = sketchFeature(`Sketch${n}`, sk);
      features.push(sf);
      features.push(extrude(`BoltHoles${n}`, sf.id, num(o.depth, 30), "cut"));
      continue;
    }

    if (o.shape === "thread") {
      const dia = num(o.diameter, 10);
      // Coarse metric pitch default (~M-series): ≈ 15% of diameter, ≥0.5mm.
      const pitch = num(o.pitch, Math.max(0.5, Math.round(dia * 0.15 * 10) / 10));
      const axis = (["x", "y", "z"] as const).includes(o.axis as "z") ? (o.axis as "x" | "y" | "z") : "z";
      features.push({
        id: id("thread"), type: "thread", name: `Thread${n}`,
        diameter: dia, pitch, length: num(o.length, 20),
        x, y, z: offset, axis, operation: "new",
      });
      hasSolid = true;
      continue;
    }

    if (o.shape === "box") {
      const sf = sketchFeature(`Sketch${n}`, rectSketch(plane, offset, x, y, num(o.w, 50), num(o.d, 50)));
      features.push(sf);
      features.push(extrude(`Box${n}`, sf.id, num(o.h, 20), hasSolid ? (o.op ?? "add") : "new"));
      hasSolid = true;
    } else if (o.shape === "cylinder") {
      const sf = sketchFeature(`Sketch${n}`, circleSketch(plane, offset, x, y, num(o.diameter, 20) / 2));
      features.push(sf);
      features.push(extrude(`Cyl${n}`, sf.id, num(o.h, 20), hasSolid ? (o.op ?? "add") : "new"));
      hasSolid = true;
    } else if (o.shape === "hole") {
      const dia = num(o.diameter, 8);
      const op: BoolOp = hasSolid ? "cut" : "new";
      // Main through hole (cut up into the solid; robust regardless of exact top).
      const sf = sketchFeature(`Sketch${n}`, circleSketch(plane, offset, x, y, dia / 2));
      features.push(sf);
      features.push(extrude(`Hole${n}`, sf.id, num(o.depth, 30), op));
      hasSolid = true;

      const ht = o.holeType ?? "simple";
      const top = num(o.topOffset, num(o.h, 20)); // top face height (recess anchor)
      if (ht === "counterbore") {
        // A wider, shallow recess cut downward from the top face.
        const D = num(o.cboreDiameter, dia * 1.8);
        const cb = sketchFeature(`Sketch${n}cb`, circleSketch(plane, top, x, y, D / 2));
        features.push(cb);
        features.push({ ...extrude(`Cbore${n}`, cb.id, num(o.cboreDepth, 5), "cut"), flip: true });
      } else if (ht === "countersink") {
        // A conical recess: loft-cut from Ø_csink at the top down to Ø_hole.
        const D = num(o.csinkDiameter, dia * 2);
        const ang = num(o.csinkAngle, 90);
        const coneDepth = ((D - dia) / 2) / Math.tan(((ang / 2) * Math.PI) / 180) || 3;
        const topC = sketchFeature(`Sketch${n}csA`, circleSketch(plane, top, x, y, D / 2));
        const botC = sketchFeature(`Sketch${n}csB`, circleSketch(plane, top - coneDepth, x, y, dia / 2));
        features.push(topC, botC);
        features.push({ id: id("loft"), type: "loft", name: `Csink${n}`, sketchIds: [topC.id, botC.id], operation: "cut" });
      }
    }
  }

  return features;
}
