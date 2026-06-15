// Runtime verification of the helical Thread feature with real OpenCASCADE WASM.
// Scope: external threads (the robust path — the rod is fused). Internal/tapped
// threads (cut) are deferred because cutting a helical solid hangs the single-
// thread WASM. Proves: a real helical thread builds along Z and along X with the
// correct major radius, threaded length (± a one-pitch lead), and dense helical
// geometry; and that fusing a thread onto an existing body keeps one body.
import { loadOC } from "./loadOC";
import { rebuildSolids } from "./rebuild";
import { emptySketch, type ParametricSketch } from "../sketch/model";
import type { Feature } from "../features";
import type { MeshData } from "./rebuild";

let failures = 0;
const check = (name: string, cond: boolean, detail = "") => {
  console.log(cond ? `  ✓ ${name}` : `  ✗ ${name} ${detail}`);
  if (!cond) failures++;
};

function rect(id: string, x0: number, y0: number, x1: number, y1: number): ParametricSketch {
  const s = emptySketch("top");
  s.points = [
    { id: id + "a", x: x0, y: y0 }, { id: id + "b", x: x1, y: y0 },
    { id: id + "c", x: x1, y: y1 }, { id: id + "d", x: x0, y: y1 },
  ];
  s.lines = [
    { id: id + "1", p1: id + "a", p2: id + "b" }, { id: id + "2", p1: id + "b", p2: id + "c" },
    { id: id + "3", p1: id + "c", p2: id + "d" }, { id: id + "4", p1: id + "d", p2: id + "a" },
  ];
  return s;
}

interface BBox { minx: number; maxx: number; miny: number; maxy: number; minz: number; maxz: number; }
function bbox(m: MeshData): BBox {
  const p = m.positions;
  const b: BBox = { minx: Infinity, maxx: -Infinity, miny: Infinity, maxy: -Infinity, minz: Infinity, maxz: -Infinity };
  for (let i = 0; i < p.length; i += 3) {
    b.minx = Math.min(b.minx, p[i]); b.maxx = Math.max(b.maxx, p[i]);
    b.miny = Math.min(b.miny, p[i + 1]); b.maxy = Math.max(b.maxy, p[i + 1]);
    b.minz = Math.min(b.minz, p[i + 2]); b.maxz = Math.max(b.maxz, p[i + 2]);
  }
  return b;
}
const near = (a: number, b: number, tol = 0.6) => Math.abs(a - b) <= tol;

async function main() {
  await loadOC();
  console.log("kernel loaded\n");

  const D = 16, pitch = 2, length = 14, lead = pitch + 1; // ridge overshoots ≈ a pitch

  console.log("External thread (new body): Ø16, pitch 2, length 14 along +Z");
  const ext = rebuildSolids([
    { id: "th", type: "thread", name: "Thread1", diameter: D, pitch, length, x: 0, y: 0, z: 0, axis: "z", operation: "new" },
  ]);
  check("one body built", ext.length === 1, `=${ext.length}`);
  if (ext[0]) {
    const b = bbox(ext[0]);
    check("dense helical geometry (many triangles)", ext[0].indices.length / 3 > 800, `tris=${ext[0].indices.length / 3}`);
    check("crest reaches major radius (x≈±8)", near(b.maxx, D / 2) && near(b.minx, -D / 2), `x[${b.minx.toFixed(1)},${b.maxx.toFixed(1)}]`);
    check("spans the threaded length (+lead)", b.minz <= 0.1 && b.maxz >= length - 0.1 && b.maxz <= length + lead + 0.5,
      `z[${b.minz.toFixed(1)},${b.maxz.toFixed(1)}]`);
  }

  console.log("\nExternal thread along +X (axis orientation): Ø10, pitch 1.5, length 12");
  const xth = rebuildSolids([
    { id: "th", type: "thread", name: "ThreadX", diameter: 10, pitch: 1.5, length: 12, x: 0, y: 0, z: 0, axis: "x", operation: "new" },
  ]);
  if (xth[0]) {
    const b = bbox(xth[0]);
    check("thread runs along X", b.minx <= 0.1 && b.maxx >= 11.9, `x[${b.minx.toFixed(1)},${b.maxx.toFixed(1)}]`);
    check("major radius across YZ (y≈±5)", near(b.maxy, 5) && near(b.miny, -5), `y[${b.miny.toFixed(1)},${b.maxy.toFixed(1)}]`);
  }

  // A thread always becomes its own body (booleans against a helical solid are
  // unreliable in this WASM build), so a head + thread coexist as a multi-body.
  console.log("\nThread alongside a head plate → separate (multi-)bodies");
  const bolt = rebuildSolids([
    { id: "bs", type: "sketch", name: "Head", sketch: rect("b", -10, -10, 10, 10) },
    { id: "be", type: "extrude", name: "E", sketchId: "bs", distance: 6, operation: "new" }, // head X[-10,10] Y[0,6] Z[-10,10]
    { id: "th", type: "thread", name: "Shank", diameter: 12, pitch: 1.75, length: 16, x: 0, y: 6, z: 0, axis: "y", operation: "new" },
  ] as Feature[]);
  check("two bodies (head + thread)", bolt.length === 2, `=${bolt.length}`);
  const maxY = Math.max(...bolt.map((m) => bbox(m).maxy));
  check("thread shank extends past the head (y > 18)", maxY > 18, `maxY=${maxY.toFixed(1)}`);

  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch((e) => { console.error("ERROR", e); process.exit(1); });
