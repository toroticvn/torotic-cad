import * as THREE from "three";

export type PlaneId = "front" | "top" | "right";

/** A 2D point in sketch (plane-local) coordinates. */
export interface Point2 {
  x: number;
  y: number;
}

/**
 * A sketch plane: an origin plus an orthonormal (u, v, normal) frame.
 * Sketch entities are stored in plane-local 2D (u, v) coordinates; this class
 * converts to/from world 3D for rendering and (later) the geometry kernel.
 */
export class SketchPlane {
  constructor(
    readonly id: PlaneId,
    readonly label: string,
    readonly origin: THREE.Vector3,
    readonly u: THREE.Vector3,
    readonly v: THREE.Vector3,
    readonly normal: THREE.Vector3
  ) {}

  /** plane-local (x,y) -> world 3D */
  to3D(p: Point2, target = new THREE.Vector3()): THREE.Vector3 {
    return target
      .copy(this.origin)
      .addScaledVector(this.u, p.x)
      .addScaledVector(this.v, p.y);
  }

  /** world 3D -> plane-local (x,y) */
  from3D(p: THREE.Vector3): Point2 {
    const d = p.clone().sub(this.origin);
    return { x: d.dot(this.u), y: d.dot(this.v) };
  }

  /** three.js math plane for raycasting. */
  mathPlane(): THREE.Plane {
    return new THREE.Plane().setFromNormalAndCoplanarPoint(this.normal, this.origin);
  }

  /** Camera position + up to look at this plane head-on (perpendicular). */
  cameraFrame(distance: number): { position: THREE.Vector3; up: THREE.Vector3 } {
    return {
      position: this.origin.clone().addScaledVector(this.normal, distance),
      up: this.v.clone(),
    };
  }
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** The three standard origin planes, matching common CAD conventions. */
export const STANDARD_PLANES: Record<PlaneId, SketchPlane> = {
  // Front: XY plane, looking down -Z. Right = +X, Up = +Y.
  front: new SketchPlane("front", "Mặt trước (Front)", V(0, 0, 0), V(1, 0, 0), V(0, 1, 0), V(0, 0, 1)),
  // Top: XZ plane, looking down -Y. Right = +X, Up = -Z.
  top: new SketchPlane("top", "Mặt trên (Top)", V(0, 0, 0), V(1, 0, 0), V(0, 0, -1), V(0, 1, 0)),
  // Right: YZ plane, looking down -X. Right = -Z, Up = +Y.
  right: new SketchPlane("right", "Mặt phải (Right)", V(0, 0, 0), V(0, 0, -1), V(0, 1, 0), V(1, 0, 0)),
};

/**
 * Resolve the actual sketch plane: a standard plane optionally offset along its
 * normal by `offset` (a reference/datum plane). Same u/v/normal, shifted origin.
 */
export function resolvePlane(id: PlaneId, offset = 0): SketchPlane {
  const base = STANDARD_PLANES[id];
  if (!offset) return base;
  const origin = base.origin.clone().addScaledVector(base.normal, offset);
  return new SketchPlane(base.id, base.label, origin, base.u, base.v, base.normal);
}

/** Build a sketch plane from an arbitrary face (origin + normal + x direction). */
export function planeFromCustom(o: [number, number, number], n: [number, number, number], x: [number, number, number]): SketchPlane {
  const origin = new THREE.Vector3(o[0], o[1], o[2]);
  const normal = new THREE.Vector3(n[0], n[1], n[2]).normalize();
  const u = new THREE.Vector3(x[0], x[1], x[2]).normalize();
  const v = new THREE.Vector3().crossVectors(normal, u).normalize();
  return new SketchPlane("front", "Mặt khối (Face)", origin, u, v, normal);
}
