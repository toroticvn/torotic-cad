import * as THREE from "three";
import { type Point2 } from "./SketchPlane";
import { sampleArc } from "./arc";
import { planeForSketch, type ParametricSketch } from "./model";

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
  return group;
}
