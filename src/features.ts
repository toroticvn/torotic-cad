import type { ParametricSketch } from "./sketch/model";

/**
 * The parametric feature tree. A SolidFeature consumes a sketch and produces a
 * solid that is combined into the running result by a boolean `operation`. The
 * kernel rebuilds the whole tree in order, so editing any feature/sketch and
 * re-running rebuild reflects the change everywhere downstream.
 */

/** How a solid feature combines with the accumulated result. */
export type BoolOp = "new" | "add" | "cut";

export interface SketchFeature {
  id: string;
  type: "sketch";
  name: string;
  sketch: ParametricSketch;
}

/** Reference geometry: a datum plane parallel to a standard plane, offset along its normal. */
export interface RefPlaneFeature {
  id: string;
  type: "refPlane";
  name: string;
  base: "front" | "top" | "right";
  offset: number;
}

export interface ExtrudeFeature {
  id: string;
  type: "extrude";
  name: string;
  sketchId: string;
  distance: number;
  operation: BoolOp;
  /** Reverse the extrude direction (extrude along −normal, e.g. cut into a face). */
  flip?: boolean;
  /** Symmetric about the sketch plane (Mid Plane end condition). */
  midplane?: boolean;
  /** Selected sketch region indices to extrude (undefined/empty = all regions). */
  regions?: number[];
}

export interface RevolveFeature {
  id: string;
  type: "revolve";
  name: string;
  sketchId: string;
  /** Sweep angle in degrees. */
  angle: number;
  /** Axis in the sketch plane to revolve about: u (horizontal) or v (vertical). */
  axis: "u" | "v";
  operation: BoolOp;
}

export interface LoftFeature {
  id: string;
  type: "loft";
  name: string;
  /** Ordered list of sketch feature ids (≥2) to loft between. */
  sketchIds: string[];
  operation: BoolOp;
}

export interface SweepFeature {
  id: string;
  type: "sweep";
  name: string;
  profileSketchId: string;
  pathSketchId: string;
  operation: BoolOp;
}

/** A 3D point lying on a selected edge (used by edge-specific fillet/chamfer). */
export type EdgePoint = [number, number, number];

/** Modifier features transform the running solid (no sketch of their own). */
export interface FilletFeature {
  id: string;
  type: "fillet";
  name: string;
  radius: number;
  /** Selected edges (by a point on each). Empty/undefined ⇒ all edges. */
  edges?: EdgePoint[];
}
export interface ChamferFeature {
  id: string;
  type: "chamfer";
  name: string;
  radius: number;
  edges?: EdgePoint[];
}

/** Mirror the running solid about a standard plane and fuse the copy. */
export interface MirrorBodyFeature {
  id: string;
  type: "mirrorBody";
  name: string;
  plane: "XY" | "XZ" | "YZ";
}

/** Duplicate the running solid in a linear array (fused). */
export interface LinearPatternFeature {
  id: string;
  type: "patternLinear";
  name: string;
  count: number;
  dx: number;
  dy: number;
  dz: number;
}

/** Duplicate the running solid around an axis through the origin (fused). */
export interface CircularPatternFeature {
  id: string;
  type: "patternCircular";
  name: string;
  count: number;
  angle: number; // total sweep in degrees
  axis: "x" | "y" | "z";
}

/** Repeat a single solid feature (extrude/revolve) in a linear array. */
export interface FeaturePatternLinear {
  id: string;
  type: "featPatternLinear";
  name: string;
  targetId: string; // the extrude/revolve feature to repeat
  count: number;
  dx: number;
  dy: number;
  dz: number;
}

/** Repeat a single solid feature (extrude/revolve) around an axis through origin. */
export interface FeaturePatternCircular {
  id: string;
  type: "featPatternCircular";
  name: string;
  targetId: string;
  count: number;
  angle: number; // total sweep, degrees
  axis: "x" | "y" | "z";
}

/** Mirror a single solid feature (extrude/revolve) across a standard plane. */
export interface FeatureMirror {
  id: string;
  type: "featMirror";
  name: string;
  targetId: string;
  plane: "XY" | "XZ" | "YZ";
}

/** Hollow out the running solid, removing the picked faces, keeping `thickness`. */
export interface ShellFeature {
  id: string;
  type: "shell";
  name: string;
  thickness: number;
  /** Faces to remove (open), referenced by a point on each. */
  faces?: EdgePoint[];
}

/** Apply a draft (taper) angle to picked faces, relative to a neutral plane. */
export interface DraftFeature {
  id: string;
  type: "draft";
  name: string;
  angle: number; // degrees
  neutralPlane: "XY" | "XZ" | "YZ";
  faces?: EdgePoint[];
}

export type SolidFeature = ExtrudeFeature | RevolveFeature;
export type ModifierFeature = FilletFeature | ChamferFeature;
export type BodyOpFeature =
  | MirrorBodyFeature
  | LinearPatternFeature
  | CircularPatternFeature
  | ShellFeature
  | DraftFeature
  | FeaturePatternLinear
  | FeaturePatternCircular
  | FeatureMirror;
export type Feature = SketchFeature | RefPlaneFeature | SolidFeature | LoftFeature | SweepFeature | ModifierFeature | BodyOpFeature;

export const isSketch = (f: Feature): f is SketchFeature => f.type === "sketch";
/** Solid features that consume a single sketch (have a `sketchId`). */
export const isSolid = (f: Feature): f is SolidFeature => f.type === "extrude" || f.type === "revolve";
export const isModifier = (f: Feature): f is ModifierFeature =>
  f.type === "fillet" || f.type === "chamfer";
/** Any feature that contributes a solid body (for "has a solid?" checks). */
export const producesSolid = (f: Feature): boolean =>
  f.type === "extrude" || f.type === "revolve" || f.type === "loft" || f.type === "sweep";

/** Sketch ids consumed by a feature (for delete-cascade). */
export function consumedSketchIds(f: Feature): string[] {
  if (f.type === "extrude" || f.type === "revolve") return [f.sketchId];
  if (f.type === "loft") return f.sketchIds;
  if (f.type === "sweep") return [f.profileSketchId, f.pathSketchId];
  return [];
}
