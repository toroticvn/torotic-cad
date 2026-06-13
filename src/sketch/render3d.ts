import * as THREE from "three";
import { type Point2, type SketchPlane } from "./SketchPlane";
import { sampleArc } from "./arc";
import { ellipsePoints, splinePoints } from "./curves";
import { planeForSketch, type ParametricSketch } from "./model";

/** A faint translucent square + border representing a datum/reference plane. */
export function buildDatumPlane(plane: SketchPlane, size = 70): THREE.Group {
  const g = new THREE.Group();
  const c = [
    [-size, -size],
    [size, -size],
    [size, size],
    [-size, size],
  ].map(([x, y]) => plane.to3D({ x, y }));
  const fill = new THREE.Mesh(
    new THREE.BufferGeometry().setFromPoints([c[0], c[1], c[2], c[0], c[2], c[3]]),
    new THREE.MeshBasicMaterial({ color: 0x2f6fea, transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false }),
  );
  g.add(fill);
  g.add(
    new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([...c, c[0]]),
      new THREE.LineBasicMaterial({ color: 0x2f6fea, transparent: true, opacity: 0.5 }),
    ),
  );
  return g;
}

const COLOR = 0x6a7a8c;
const CIRCLE_SEGMENTS = 64;

/**
 * Build a faint 3D representation of a committed sketch (lines/arcs/circles on
 * its plane), shown in model mode so the user can see the sketches behind the
 * solid. Construction geometry is omitted.
 */
export function buildSketchGroup(sketch: ParametricSketch): THREE.Group {
  const sp = planeForSketch(sketch);
  const group = new THREE.Group();
  const mat = new THREE.LineBasicMaterial({ color: COLOR, transparent: true, opacity: 0.5 });
  const pt = (id: string) => sketch.points.find((q) => q.id === id);

  const polyline = (pts: Point2[]) =>
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts.map((p) => sp.to3D(p))), mat));

  for (const ln of sketch.lines) {
    if (ln.construction) continue;
    const a = pt(ln.p1);
    const b = pt(ln.p2);
    if (a && b) polyline([a, b]);
  }
  for (const arc of sketch.arcs) {
    if (arc.construction) continue;
    const c = pt(arc.center);
    const a = pt(arc.start);
    const b = pt(arc.end);
    if (c && a && b) polyline(sampleArc(c, a, b, arc.ccw));
  }
  for (const circle of sketch.circles) {
    if (circle.construction) continue;
    const c = pt(circle.center);
    if (!c) continue;
    const pts: Point2[] = [];
    for (let i = 0; i <= CIRCLE_SEGMENTS; i++) {
      const t = (i / CIRCLE_SEGMENTS) * Math.PI * 2;
      pts.push({ x: c.x + Math.cos(t) * circle.r, y: c.y + Math.sin(t) * circle.r });
    }
    polyline(pts);
  }
  for (const e of sketch.ellipses ?? []) {
    if (e.construction) continue;
    const c = pt(e.center);
    if (c) polyline(ellipsePoints(c.x, c.y, e.rx, e.ry, e.rot));
  }
  for (const sp of sketch.splines ?? []) {
    if (sp.construction) continue;
    const ctrl = sp.points.map((id) => pt(id)).filter((p): p is NonNullable<typeof p> => !!p);
    if (ctrl.length >= 2) polyline(splinePoints(ctrl, sp.closed));
  }
  return group;
}
