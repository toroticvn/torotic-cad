import { Plane, makeLine, assembleWire, genericSweep, type EdgeFinder, type Sketch, type Shape3D } from "replicad";
import { type SketchPlane } from "../sketch/SketchPlane";
import { buildProfile, extractOpenPath } from "./profile";
import {
  isSketch,
  type EdgePoint,
  type Feature,
  type LoftFeature,
  type SketchFeature,
  type SolidFeature,
  type SweepFeature,
} from "../features";
import { planeForSketch, type ParametricSketch } from "../sketch/model";

/**
 * Parametric rebuild engine: evaluates the feature tree into one or more solid
 * bodies (multi-body) and tessellates/exports them. WASM-url free → Node-testable.
 */

export type Triple = [number, number, number];

export interface MeshData {
  positions: Float32Array;
  normals: Float32Array;
  indices: number[];
  /** Flat triplets of segment endpoints for crisp B-rep edges (display). */
  edges: Float32Array;
  /**
   * One entry per B-rep edge: `points` is a dense polyline along the edge (for
   * picking + whole-edge highlight); `rep` is a stable point on that edge used
   * as the fillet/chamfer finder reference (containsPoint matches reliably).
   */
  edgeCurves: { points: Triple[]; rep: Triple }[];
}

function makePlane(sp: SketchPlane): Plane {
  return new Plane(
    [sp.origin.x, sp.origin.y, sp.origin.z],
    [sp.u.x, sp.u.y, sp.u.z],
    [sp.normal.x, sp.normal.y, sp.normal.z]
  );
}

function sketchOnItsPlane(sketch: ParametricSketch, regions?: number[]): Sketch {
  const sp = planeForSketch(sketch);
  return buildProfile(sketch, regions).sketchOnPlane(makePlane(sp)) as Sketch;
}

function buildFeatureSolid(sketchFeat: SketchFeature, feat: SolidFeature): Shape3D {
  const sp = planeForSketch(sketchFeat.sketch);
  const regions = feat.type === "extrude" ? feat.regions : undefined;
  const sketch3 = sketchOnItsPlane(sketchFeat.sketch, regions);
  if (feat.type === "extrude") return sketch3.extrude(feat.distance) as Shape3D;
  const axis = feat.axis === "v" ? sp.v : sp.u;
  return sketch3.revolve([axis.x, axis.y, axis.z], {
    origin: [sp.origin.x, sp.origin.y, sp.origin.z],
    angle: feat.angle,
  }) as Shape3D;
}

function buildLoft(feat: LoftFeature, sketches: Map<string, SketchFeature>): Shape3D | null {
  const profs = feat.sketchIds.map((id) => sketches.get(id)).filter((s): s is SketchFeature => !!s);
  if (profs.length < 2) return null;
  const [first, ...rest] = profs.map((p) => sketchOnItsPlane(p.sketch));
  return first.loftWith(rest) as Shape3D;
}

function buildSweep(feat: SweepFeature, sketches: Map<string, SketchFeature>): Shape3D | null {
  const prof = sketches.get(feat.profileSketchId);
  const path = sketches.get(feat.pathSketchId);
  if (!prof || !path) return null;

  const profileWire = sketchOnItsPlane(prof.sketch).wires();
  const pts2 = extractOpenPath(path.sketch);
  if (!pts2 || pts2.length < 2) return null;

  const sp = planeForSketch(path.sketch);
  const pts3 = pts2.map((p) => sp.to3D(p));
  const edges = [];
  for (let i = 0; i < pts3.length - 1; i++) {
    edges.push(makeLine([pts3[i].x, pts3[i].y, pts3[i].z], [pts3[i + 1].x, pts3[i + 1].y, pts3[i + 1].z]));
  }
  const spine = assembleWire(edges);
  return genericSweep(profileWire, spine, {}) as Shape3D;
}

/**
 * Match each reference point to the body's nearest B-rep edge (by edge midpoint)
 * and return an `inList` filter. This is robust — it doesn't depend on the point
 * lying exactly on the edge (which `containsPoint` requires).
 */
function matchEdges(shape: Shape3D, points: EdgePoint[]) {
  const edges = shape.edges;
  const mids = edges.map((e) => {
    try {
      return e.pointAt(0.5).toTuple();
    } catch {
      return null;
    }
  });
  const chosen = new Set<number>();
  for (const [px, py, pz] of points) {
    let bestIdx = -1;
    let bestD = Infinity;
    mids.forEach((m, i) => {
      if (!m) return;
      const d = (m[0] - px) ** 2 + (m[1] - py) ** 2 + (m[2] - pz) ** 2;
      if (d < bestD) {
        bestD = d;
        bestIdx = i;
      }
    });
    if (bestIdx >= 0) chosen.add(bestIdx);
  }
  return [...chosen].map((i) => edges[i]);
}

/**
 * Evaluate the feature tree into solid bodies. `operation: "new"` starts a new
 * body; "add"/"cut" fuse/subtract into the most-recent body. Modifier features
 * (fillet/chamfer) transform the most-recent body. Failing features are skipped.
 */
export function rebuildBodies(features: Feature[]): Shape3D[] {
  const sketches = new Map(features.filter(isSketch).map((f) => [f.id, f]));
  const bodies: Shape3D[] = [];
  const last = () => bodies.length - 1;

  for (const f of features) {
    if (f.type === "fillet" || f.type === "chamfer") {
      if (bodies.length === 0 || f.radius <= 0) continue;
      try {
        const target = bodies[last()];
        let filt: ((e: EdgeFinder) => EdgeFinder) | undefined;
        if (f.edges && f.edges.length) {
          const matched = matchEdges(target, f.edges);
          if (matched.length === 0) continue; // no edge matched — skip
          filt = (e) => e.inList(matched);
        }
        bodies[last()] = f.type === "fillet" ? target.fillet(f.radius, filt) : target.chamfer(f.radius, filt);
      } catch {
        /* radius too large / edge not found — leave body unchanged */
      }
      continue;
    }

    // Only solid-producing features past this point (narrows `f.operation`).
    if (f.type !== "extrude" && f.type !== "revolve" && f.type !== "loft" && f.type !== "sweep") continue;

    let solid: Shape3D | null = null;
    try {
      if (f.type === "extrude" || f.type === "revolve") {
        const sk = sketches.get(f.sketchId);
        solid = sk ? buildFeatureSolid(sk, f) : null;
      } else if (f.type === "loft") {
        solid = buildLoft(f, sketches);
      } else {
        solid = buildSweep(f, sketches);
      }
    } catch {
      solid = null;
    }
    if (!solid) continue;

    if (bodies.length === 0 || f.operation === "new") bodies.push(solid);
    else bodies[last()] = f.operation === "cut" ? bodies[last()].cut(solid) : bodies[last()].fuse(solid);
  }
  return bodies;
}

function meshOf(shape: Shape3D): MeshData {
  const mesh = shape.mesh({ tolerance: 0.1, angularTolerance: 0.2 });
  const edges = shape.meshEdges({ tolerance: 0.1, angularTolerance: 0.2 });
  // A dense polyline along each B-rep edge (for picking + highlight) + a stable
  // reference point per edge (for the fillet/chamfer containsPoint finder).
  const edgeCurves: { points: Triple[]; rep: Triple }[] = [];
  for (const e of shape.edges) {
    try {
      const points: Triple[] = [];
      for (let k = 0; k <= 10; k++) points.push(e.pointAt(k / 10).toTuple());
      edgeCurves.push({ points, rep: e.pointAt(0.5).toTuple() });
    } catch {
      /* skip degenerate edges */
    }
  }
  return {
    positions: new Float32Array(mesh.vertices),
    normals: new Float32Array(mesh.normals),
    indices: mesh.triangles,
    edges: new Float32Array(edges.lines),
    edgeCurves,
  };
}

/** Rebuild and tessellate every body (one MeshData each). */
export function rebuildSolids(features: Feature[]): MeshData[] {
  return rebuildBodies(features).map(meshOf);
}

/** Every B-rep edge of every body, as a dense 3D polyline (for Convert Entities). */
export function solidEdges(features: Feature[]): Triple[][] {
  const out: Triple[][] = [];
  for (const shape of rebuildBodies(features)) {
    for (const e of shape.edges) {
      try {
        const pts: Triple[] = [];
        for (let k = 0; k <= 16; k++) pts.push(e.pointAt(k / 16).toTuple());
        out.push(pts);
      } catch {
        /* skip degenerate edges */
      }
    }
  }
  return out;
}

/** Rebuild and export as STEP/STL Blob (bodies fused into one shape). */
export function exportSolid(features: Feature[], format: "step" | "stl"): Blob | null {
  const bodies = rebuildBodies(features);
  if (bodies.length === 0) return null;
  let shape = bodies[0];
  for (let i = 1; i < bodies.length; i++) shape = shape.fuse(bodies[i]);
  return format === "step" ? shape.blobSTEP() : shape.blobSTL({});
}
