// Runtime verification of extruding profiles that contain ARCS (slot, half-disk).
import { Plane, type Sketch, type Shape3D } from "replicad";
import { loadOC } from "./loadOC";
import { buildProfile } from "./profile";
import { isCcwThrough } from "../sketch/arc";
import { emptySketch, type ParametricSketch } from "../sketch/model";

let failures = 0;
const check = (name: string, cond: boolean, detail = "") => {
  console.log(cond ? `  ✓ ${name}` : `  ✗ ${name} ${detail}`);
  if (!cond) failures++;
};

function extrude(sketch: ParametricSketch, dist: number) {
  const plane = new Plane([0, 0, 0], [1, 0, 0], [0, 0, 1]);
  const solid = (buildProfile(sketch).sketchOnPlane(plane) as Sketch).extrude(dist) as Shape3D;
  return solid.mesh({ tolerance: 0.1, angularTolerance: 0.2 });
}

function slot(): ParametricSketch {
  const s = emptySketch("front");
  const c1 = { x: 0, y: 0 };
  const c2 = { x: 60, y: 0 };
  const r = 15;
  const P1a = { x: 0, y: r }, P1b = { x: 0, y: -r }, P2a = { x: 60, y: r }, P2b = { x: 60, y: -r };
  s.points = [
    { id: "c1", ...c1 }, { id: "c2", ...c2 },
    { id: "P1a", ...P1a }, { id: "P1b", ...P1b }, { id: "P2a", ...P2a }, { id: "P2b", ...P2b },
  ];
  s.lines = [
    { id: "lt", p1: "P1a", p2: "P2a" },
    { id: "lb", p1: "P1b", p2: "P2b" },
  ];
  s.arcs = [
    { id: "a2", center: "c2", start: "P2a", end: "P2b", ccw: isCcwThrough(c2, P2a, P2b, { x: 75, y: 0 }) },
    { id: "a1", center: "c1", start: "P1b", end: "P1a", ccw: isCcwThrough(c1, P1b, P1a, { x: -15, y: 0 }) },
  ];
  return s;
}

function halfDisk(): ParametricSketch {
  const s = emptySketch("front");
  const A = { x: -20, y: 0 }, B = { x: 20, y: 0 }, C = { x: 0, y: 0 };
  s.points = [
    { id: "A", ...A }, { id: "B", ...B }, { id: "C", ...C },
  ];
  s.lines = [{ id: "base", p1: "A", p2: "B" }];
  s.arcs = [{ id: "top", center: "C", start: "B", end: "A", ccw: isCcwThrough(C, B, A, { x: 0, y: 20 }) }];
  return s;
}

async function main() {
  await loadOC();
  console.log("kernel loaded");

  console.log("Slot (2 lines + 2 arcs) extrude:");
  const m1 = extrude(slot(), 10);
  check("has vertices", m1.vertices.length > 0, `=${m1.vertices.length}`);
  check("has triangles", m1.triangles.length > 0, `=${m1.triangles.length}`);

  console.log("Half-disk (1 line + 1 arc) extrude:");
  const m2 = extrude(halfDisk(), 8);
  check("has triangles", m2.triangles.length > 0, `=${m2.triangles.length}`);

  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("ERROR", e);
  process.exit(1);
});
