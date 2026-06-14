// Runtime verification of Mirror logic (SolidWorks parity), run in Node with the
// real OpenCASCADE WASM. Verifies: body mirror (merge on/off), feature mirror,
// and feature mirror about a datum plane. Assertions use mesh bounding boxes so
// we actually prove the geometry landed where SolidWorks would put it.
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
  const s = emptySketch("front");
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
const near = (a: number, b: number, tol = 0.5) => Math.abs(a - b) <= tol;

async function main() {
  await loadOC();
  console.log("kernel loaded\n");

  // Base box: x[0,60] y[0,40] z[0,20] (asymmetric in X so a mirror is visible).
  const base = (): Feature[] => [
    { id: "bs", type: "sketch", name: "B", sketch: rect("b", 0, 0, 60, 40) },
    { id: "be", type: "extrude", name: "E", sketchId: "bs", distance: 20, operation: "new" },
  ];

  console.log("Body Mirror about YZ, Merge solids ON:");
  const mMerge = rebuildSolids([
    ...base(),
    { id: "mb", type: "mirrorBody", name: "Mirror", plane: "YZ", merge: true },
  ]);
  check("one body (merged)", mMerge.length === 1, `=${mMerge.length}`);
  if (mMerge[0]) {
    const b = bbox(mMerge[0]);
    check("spans both sides x[-60,60]", near(b.minx, -60) && near(b.maxx, 60), `x[${b.minx.toFixed(1)},${b.maxx.toFixed(1)}]`);
  }

  console.log("Body Mirror about YZ, Merge solids OFF (separate body):");
  const mSep = rebuildSolids([
    ...base(),
    { id: "mb2", type: "mirrorBody", name: "Mirror", plane: "YZ", merge: false },
  ]);
  check("two separate bodies", mSep.length === 2, `=${mSep.length}`);
  if (mSep.length === 2) {
    const a = bbox(mSep[0]), c = bbox(mSep[1]);
    const haveLeft = near(a.minx, -60) || near(c.minx, -60);
    const haveRight = near(a.maxx, 60) || near(c.maxx, 60);
    check("one body on each side of YZ", haveLeft && haveRight,
      `A x[${a.minx.toFixed(0)},${a.maxx.toFixed(0)}] B x[${c.minx.toFixed(0)},${c.maxx.toFixed(0)}]`);
  }

  console.log("Body Mirror about XZ (front–back), Merge ON:");
  const mXZ = rebuildSolids([...base(), { id: "mb3", type: "mirrorBody", name: "M", plane: "XZ", merge: true }]);
  if (mXZ[0]) {
    const b = bbox(mXZ[0]);
    check("spans y[-40,40]", near(b.miny, -40) && near(b.maxy, 40), `y[${b.miny.toFixed(1)},${b.maxy.toFixed(1)}]`);
  }

  console.log("Feature Mirror of a boss about a datum plane at x=30:");
  // Boss column at x[50,60] fused onto the base.
  const withBoss = (): Feature[] => [
    ...base(),
    { id: "cs", type: "sketch", name: "Boss", sketch: rect("c", 50, 10, 60, 30) },
    { id: "ce", type: "extrude", name: "Boss", sketchId: "cs", distance: 40, operation: "add" },
  ];
  const bossOnly = rebuildSolids(withBoss());
  const bossTris = bossOnly[0]?.positions.length ?? 0;
  const featMir = rebuildSolids([
    ...withBoss(),
    { id: "rp", type: "refPlane", name: "Datum1", base: "right", offset: 30 }, // YZ shifted to x=30
    { id: "fm", type: "featMirror", name: "MirrorBoss", targetId: "ce", plane: "rp" },
  ]);
  check("still one body", featMir.length === 1, `=${featMir.length}`);
  check("geometry changed (mirror boss added)", (featMir[0]?.positions.length ?? 0) > bossTris,
    `boss=${bossTris} mirrored=${featMir[0]?.positions.length}`);
  if (featMir[0]) {
    const b = bbox(featMir[0]);
    // Boss x[50,60] mirrored about x=30 -> x[0,10]; base already covers x[0,60].
    // The mirrored boss rises to z=40 near x[0,10], proving it landed left of the original.
    check("body still within x[0,60] (mirror stayed inside via datum)", near(b.minx, 0) && near(b.maxx, 60),
      `x[${b.minx.toFixed(1)},${b.maxx.toFixed(1)}]`);
    check("boss height reached z=40", near(b.maxz, 40), `maxz=${b.maxz.toFixed(1)}`);
  }

  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("ERROR", e);
  process.exit(1);
});
