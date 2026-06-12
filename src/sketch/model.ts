import { resolvePlane, planeFromCustom, type PlaneId, type SketchPlane } from "./SketchPlane";

/**
 * The parametric sketch model. Unlike the simple M1 entities (inline coords),
 * geometry here references shared *points*, so constraints and dimensions have
 * something stable to act on (e.g. two lines sharing an endpoint = one point).
 */

export interface SketchPoint {
  id: string;
  x: number;
  y: number;
  /** Fixed points (e.g. the origin) are pinned during solving. */
  fixed?: boolean;
}

export interface SketchLine {
  id: string;
  p1: string; // point id
  p2: string; // point id
  /** Construction (reference) geometry — drawn dashed, ignored by extrude. */
  construction?: boolean;
}

export interface SketchCircle {
  id: string;
  center: string; // point id
  r: number;
  construction?: boolean;
}

export interface SketchArc {
  id: string;
  center: string; // point id
  start: string; // point id (also defines radius = |center→start|)
  end: string; // point id
  ccw: boolean; // sweep direction from start to end
  construction?: boolean;
}

/** Reference to a curved/linear entity, for relations that span entity kinds. */
export interface EntRef {
  kind: "line" | "circle" | "arc";
  id: string;
}

export type GeomConstraint =
  | { id: string; type: "coincident"; p1: string; p2: string }
  | { id: string; type: "horizontal"; line: string }
  | { id: string; type: "vertical"; line: string }
  | { id: string; type: "parallel"; line1: string; line2: string }
  | { id: string; type: "perpendicular"; line1: string; line2: string }
  | { id: string; type: "equalLength"; line1: string; line2: string }
  | { id: string; type: "equalRadius"; c1: string; c2: string }
  | { id: string; type: "collinear"; line1: string; line2: string }
  | { id: string; type: "midpoint"; point: string; line: string }
  | { id: string; type: "symmetric"; p1: string; p2: string; line: string }
  | { id: string; type: "concentric"; e1: EntRef; e2: EntRef }
  | { id: string; type: "tangent"; e1: EntRef; e2: EntRef };

/** Omit that distributes over a union (plain Omit collapses union members). */
export type DistributiveOmit<T, K extends keyof never> = T extends unknown ? Omit<T, K> : never;

/** A geometric constraint without its id, for callers that create one. */
export type GeomConstraintInput = DistributiveOmit<GeomConstraint, "id">;

export type DimensionKind = "distance" | "radius";

export interface Dimension {
  id: string;
  /** User-referencable name in formulas, e.g. "d1". */
  name: string;
  kind: DimensionKind;
  /** distance: two point ids; radius: one circle id. */
  refs: string[];
  /** Last resolved numeric value (cache; recomputed from formula on solve). */
  value: number;
  /** Optional formula referencing other dimension names, e.g. "d1/2 + 5". */
  formula?: string;
}

/** A sketch plane taken from a solid's face: origin + normal + x direction. */
export interface CustomPlane {
  o: [number, number, number];
  n: [number, number, number];
  x: [number, number, number];
}

export interface ParametricSketch {
  planeId: PlaneId;
  /** Offset of the sketch plane along its normal (reference/datum plane). */
  offset: number;
  /** When set (sketch on a solid face), overrides planeId/offset. */
  customPlane?: CustomPlane;
  points: SketchPoint[];
  lines: SketchLine[];
  circles: SketchCircle[];
  arcs: SketchArc[];
  constraints: GeomConstraint[];
  dimensions: Dimension[];
}

export function emptySketch(planeId: PlaneId, offset = 0): ParametricSketch {
  return { planeId, offset, points: [], lines: [], circles: [], arcs: [], constraints: [], dimensions: [] };
}

/** Resolve a sketch's actual 3D plane (custom face plane if present, else standard±offset). */
export function planeForSketch(s: ParametricSketch): SketchPlane {
  return s.customPlane ? planeFromCustom(s.customPlane.o, s.customPlane.n, s.customPlane.x) : resolvePlane(s.planeId, s.offset);
}
