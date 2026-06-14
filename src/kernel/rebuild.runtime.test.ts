// Runtime verification: multi-body, boolean cut, revolve, loft, sweep, edge fillet, export.
import { loadOC } from "./loadOC";
import { rebuildSolids, exportSolid } from "./rebuild";
import { emptySketch, type ParametricSketch } from "../sketch/model";
import type { Feature } from "../features";
import type { PlaneId as PId } from "../sketch/SketchPlane";
import { findRegions2D } from "../sketch/regions2d";

let failures = 0;
const check = (name: string, cond: boolean, detail = "") => {
  console.log(cond ? `  ✓ ${name}` : `  ✗ ${name} ${detail}`);
  if (!cond) failures++;
};

function rect(id: string, x0: number, y0: number, x1: number, y1: number, offset = 0, plane: PId = "front"): ParametricSketch {
  const s = emptySketch(plane, offset);
  s.points = [
    { id: id + "a", x: x0, y: y0 },
    { id: id + "b", x: x1, y: y0 },
    { id: id + "c", x: x1, y: y1 },
    { id: id + "d", x: x0, y: y1 },
  ];
  s.lines = [
    { id: id + "1", p1: id + "a", p2: id + "b" },
    { id: id + "2", p1: id + "b", p2: id + "c" },
    { id: id + "3", p1: id + "c", p2: id + "d" },
    { id: id + "4", p1: id + "d", p2: id + "a" },
  ];
  return s;
}

function circle(id: string, cx: number, cy: number, r: number, plane: PId = "front"): ParametricSketch {
  const s = emptySketch(plane);
  s.points = [{ id: id + "c", x: cx, y: cy }];
  s.circles = [{ id: id + "0", center: id + "c", r }];
  return s;
}

/** Open polyline path (2 segments) on a plane, for sweep. */
function path2(id: string, pts: [number, number][], plane: PId): ParametricSketch {
  const s = emptySketch(plane);
  s.points = pts.map((p, i) => ({ id: `${id}p${i}`, x: p[0], y: p[1] }));
  for (let i = 0; i < pts.length - 1; i++) s.lines.push({ id: `${id}l${i}`, p1: `${id}p${i}`, p2: `${id}p${i + 1}` });
  return s;
}

async function main() {
  await loadOC();
  console.log("kernel loaded");

  const box = (id: string, x0: number, y0: number, x1: number, y1: number, dist: number, op: "new" | "add" | "cut"): Feature[] => [
    { id: id + "s", type: "sketch", name: id, sketch: rect(id, x0, y0, x1, y1) },
    { id: id + "e", type: "extrude", name: id, sketchId: id + "s", distance: dist, operation: op },
  ];

  console.log("Extrude + boolean Cut:");
  const cut: Feature[] = [
    ...box("b", 0, 0, 60, 40, 20, "new"),
    { id: "hs", type: "sketch", name: "H", sketch: circle("h", 30, 20, 10) },
    { id: "he", type: "extrude", name: "Cut", sketchId: "hs", distance: 20, operation: "cut" },
  ];
  const m1 = rebuildSolids(cut);
  check("one body", m1.length === 1, `=${m1.length}`);
  check("has triangles", m1[0]?.indices.length > 0);

  console.log("Extrude a region WITH A HOLE (rect + inner circle in one sketch):");
  const holed = emptySketch("front");
  holed.points = [
    { id: "ra", x: 0, y: 0 }, { id: "rb", x: 60, y: 0 }, { id: "rc", x: 60, y: 40 }, { id: "rd", x: 0, y: 40 },
    { id: "hc", x: 30, y: 20 },
  ];
  holed.lines = [
    { id: "rl1", p1: "ra", p2: "rb" }, { id: "rl2", p1: "rb", p2: "rc" },
    { id: "rl3", p1: "rc", p2: "rd" }, { id: "rl4", p1: "rd", p2: "ra" },
  ];
  holed.circles = [{ id: "hc0", center: "hc", r: 8 }];
  const holedF: Feature[] = [
    { id: "hs", type: "sketch", name: "H", sketch: holed },
    { id: "he", type: "extrude", name: "E", sketchId: "hs", distance: 15, operation: "new" },
  ];
  check("has triangles", rebuildSolids(holedF)[0]?.indices.length > 0);

  console.log("Extrude TWO separate regions in one sketch:");
  const two = emptySketch("front");
  const mkSq = (id: string, x0: number) => {
    two.points.push({ id: id + "a", x: x0, y: 0 }, { id: id + "b", x: x0 + 20, y: 0 }, { id: id + "c", x: x0 + 20, y: 20 }, { id: id + "d", x: x0, y: 20 });
    two.lines.push({ id: id + "1", p1: id + "a", p2: id + "b" }, { id: id + "2", p1: id + "b", p2: id + "c" }, { id: id + "3", p1: id + "c", p2: id + "d" }, { id: id + "4", p1: id + "d", p2: id + "a" });
  };
  mkSq("q1", 0);
  mkSq("q2", 40);
  const twoF: Feature[] = [
    { id: "ts", type: "sketch", name: "T", sketch: two },
    { id: "te", type: "extrude", name: "E", sketchId: "ts", distance: 10, operation: "new" },
  ];
  const bothTris = rebuildSolids(twoF)[0]?.indices.length;
  check("has triangles", bothTris > 0);

  console.log("Extrude only ONE selected region (Selected Contours):");
  const oneF: Feature[] = [
    { id: "ts2", type: "sketch", name: "T", sketch: two },
    { id: "te2", type: "extrude", name: "E", sketchId: "ts2", distance: 10, operation: "new", regions: [0] },
  ];
  const oneTris = rebuildSolids(oneF)[0]?.indices.length;
  check("has triangles", oneTris > 0);
  check("fewer triangles than both regions", oneTris < bothTris, `one=${oneTris} both=${bothTris}`);

  console.log("Arrangement: extrude EACH sub-region of a circle crossing a rectangle:");
  const arr = emptySketch("front");
  arr.points = [
    { id: "a", x: 0, y: 0 }, { id: "b", x: 60, y: 0 }, { id: "c", x: 60, y: 40 }, { id: "d", x: 0, y: 40 },
    { id: "cc", x: 60, y: 20 },
  ];
  arr.lines = [
    { id: "l1", p1: "a", p2: "b" }, { id: "l2", p1: "b", p2: "c" }, { id: "l3", p1: "c", p2: "d" }, { id: "l4", p1: "d", p2: "a" },
  ];
  arr.circles = [{ id: "circ", center: "cc", r: 30 }];
  const nReg = findRegions2D(arr).length;
  check("circle crosses rect → ≥3 sub-regions", nReg >= 3, `=${nReg}`);
  let allRegionsOk = true;
  for (let i = 0; i < nReg; i++) {
    const f: Feature[] = [
      { id: "as", type: "sketch", name: "S", sketch: arr },
      { id: "ae", type: "extrude", name: "E", sketchId: "as", distance: 10, operation: "new", regions: [i] },
    ];
    const m = rebuildSolids(f)[0];
    if (!m || m.indices.length === 0) allRegionsOk = false;
  }
  check("every sub-region extrudes to a valid solid (incl. curved lens)", allRegionsOk);

  console.log("Multi-body (two separate boxes):");
  const multi: Feature[] = [...box("m1", 0, 0, 30, 30, 20, "new"), ...box("m2", 100, 0, 130, 30, 20, "new")];
  const mm = rebuildSolids(multi);
  check("two bodies", mm.length === 2, `=${mm.length}`);

  console.log("Revolve 360°:");
  const rev: Feature[] = [
    { id: "rs", type: "sketch", name: "R", sketch: rect("r", 10, 0, 30, 40) },
    { id: "rv", type: "revolve", name: "Rev", sketchId: "rs", angle: 360, axis: "v", operation: "new" },
  ];
  check("has triangles", rebuildSolids(rev)[0]?.indices.length > 0);

  console.log("Loft (offset sketches):");
  const loft: Feature[] = [
    { id: "l1", type: "sketch", name: "L1", sketch: rect("u", -20, -20, 20, 20, 0) },
    { id: "l2", type: "sketch", name: "L2", sketch: rect("w", -8, -8, 8, 8, 50) },
    { id: "lf", type: "loft", name: "Loft", sketchIds: ["l1", "l2"], operation: "new" },
  ];
  check("has triangles", rebuildSolids(loft)[0]?.indices.length > 0);

  console.log("Sweep (circle profile along L path):");
  const sweep: Feature[] = [
    { id: "ps", type: "sketch", name: "P", sketch: circle("pc", 0, 0, 5, "front") },
    { id: "pa", type: "sketch", name: "Path", sketch: path2("pa", [[0, 0], [-40, 0], [-40, 30]], "right") },
    { id: "sw", type: "sweep", name: "Sweep", profileSketchId: "ps", pathSketchId: "pa", operation: "new" },
  ];
  const ms = rebuildSolids(sweep);
  check("produced a body", ms.length >= 1, `=${ms.length}`);
  check("has triangles", ms[0]?.indices.length > 0, `=${ms[0]?.indices.length}`);

  console.log("Edge fillet (one edge by an APPROXIMATE point — nearest-edge match):");
  const plain = rebuildSolids(box("e0", 0, 0, 40, 40, 20, "new"))[0];
  const efill: Feature[] = [
    ...box("e", 0, 0, 40, 40, 20, "new"),
    { id: "ef", type: "fillet", name: "Fillet", radius: 4, edges: [[1.2, 1.1, 8.5]] }, // off the edge
  ];
  const me = rebuildSolids(efill)[0];
  check("has triangles", me?.indices.length > 0, `=${me?.indices.length}`);
  check("geometry actually changed (filleted)", !!me && me.positions.length !== plain.positions.length,
    `plain=${plain.positions.length} filleted=${me?.positions.length}`);

  console.log("Sketch on a custom (face) plane → extrude:");
  const faceSk = rect("fc", -10, -10, 10, 10);
  faceSk.customPlane = { o: [0, 0, 20], n: [0, 0, 1], x: [1, 0, 0] }; // a face at z=20
  const faceF: Feature[] = [
    { id: "fs", type: "sketch", name: "FS", sketch: faceSk },
    { id: "fe", type: "extrude", name: "E", sketchId: "fs", distance: 8, operation: "new" },
  ];
  check("custom-plane extrude has triangles", rebuildSolids(faceF)[0]?.indices.length > 0);

  console.log("Export:");
  const step = exportSolid(cut, "step");
  const stl = exportSolid(multi, "stl");
  check("STEP non-empty", !!step && step.size > 0);
  check("STL (multi-body) non-empty", !!stl && stl.size > 0);

  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("ERROR", e);
  process.exit(1);
});
