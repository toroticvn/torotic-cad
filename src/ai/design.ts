import type { Feature, BoolOp, ExtrudeFeature, SketchFeature } from "../features";
import type { PlaneId } from "../sketch/SketchPlane";
import { emptySketch, type ParametricSketch } from "../sketch/model";

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
  const pts = corners.map(([x, y]) => ({ id: id("pt"), x, y }));
  s.points = pts;
  for (let i = 0; i < 4; i++) s.lines.push({ id: id("ln"), p1: pts[i].id, p2: pts[(i + 1) % 4].id });
  return s;
}

function circleSketch(plane: PlaneId, offset: number, cx: number, cy: number, r: number): ParametricSketch {
  const s = emptySketch(plane, offset);
  const c = { id: id("pt"), x: cx, y: cy };
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
      const sf = sketchFeature(`Sketch${n}`, circleSketch(plane, offset, x, y, num(o.diameter, 8) / 2));
      features.push(sf);
      // A hole cuts; if there's no solid yet, fall back to creating one.
      features.push(extrude(`Hole${n}`, sf.id, num(o.depth, 30), hasSolid ? "cut" : "new"));
      hasSolid = true;
    }
  }

  return features;
}
