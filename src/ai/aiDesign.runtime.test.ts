// Verifies the AI-draw pipeline: a Claude "design" (operations) -> real feature
// tree -> rebuildable solid, for both "replace" (new model) and "append" (draw
// onto the current model). Proves the assistant's drawing works end to end in
// the kernel without needing a live Claude call.
import { loadOC } from "../kernel/loadOC";
import { rebuildSolids } from "../kernel/rebuild";
import { designToFeatures, type Design } from "./design";
import { producesSolid, type Feature } from "../features";

let failures = 0;
const check = (name: string, cond: boolean, detail = "") => {
  console.log(cond ? `  ✓ ${name}` : `  ✗ ${name} ${detail}`);
  if (!cond) failures++;
};

async function main() {
  await loadOC();
  console.log("kernel loaded\n");

  console.log("Pure: op classification (new / cut on append):");
  const plate: Design = { operations: [{ shape: "box", w: 100, d: 60, h: 10 }] };
  const fPlate = designToFeatures(plate);
  const ex = fPlate.find((f) => f.type === "extrude");
  check("box -> extrude op = new", ex?.type === "extrude" && ex.operation === "new", `op=${ex && ex.type === "extrude" ? ex.operation : "?"}`);

  const holeAppend: Design = { mode: "append", operations: [{ shape: "hole", x: 0, y: 0, diameter: 8, depth: 30 }] };
  const fHole = designToFeatures(holeAppend, { continueSolid: true });
  const exH = fHole.find((f) => f.type === "extrude");
  check("hole appended onto a solid -> op = cut", exH?.type === "extrude" && exH.operation === "cut", `op=${exH && exH.type === "extrude" ? exH.operation : "?"}`);

  console.log("Runtime: build a plate (replace), then append 4 corner holes:");
  const base = designToFeatures(plate); // replace
  const baseSolid = rebuildSolids(base);
  check("plate builds one body", baseSolid.length === 1 && baseSolid[0].indices.length > 0, `bodies=${baseSolid.length}`);
  const baseVerts = baseSolid[0]?.positions.length ?? 0;

  const holes: Design = {
    mode: "append",
    operations: [
      { shape: "hole", x: -38, y: -18, diameter: 8, depth: 30 },
      { shape: "hole", x: 38, y: -18, diameter: 8, depth: 30 },
      { shape: "hole", x: 38, y: 18, diameter: 8, depth: 30 },
      { shape: "hole", x: -38, y: 18, diameter: 8, depth: 30 },
    ],
  };
  const existingSolid = base.some(producesSolid);
  const appendFeats = designToFeatures(holes, { continueSolid: existingSolid });
  const combined: Feature[] = [...base, ...appendFeats]; // exactly what sendChat does for append
  const drilled = rebuildSolids(combined);
  check("after drilling: still one body", drilled.length === 1, `bodies=${drilled.length}`);
  check("geometry changed (holes cut in)", (drilled[0]?.positions.length ?? 0) !== baseVerts,
    `before=${baseVerts} after=${drilled[0]?.positions.length}`);

  console.log("Runtime: append a boss cylinder, then fillet all edges:");
  const more: Design = {
    mode: "append",
    operations: [
      { shape: "cylinder", x: 0, y: 0, diameter: 20, h: 25, offset: 10, op: "add" },
      { shape: "fillet", radius: 2 },
    ],
  };
  const withBoss = [...base, ...designToFeatures(more, { continueSolid: true })];
  const bossSolid = rebuildSolids(withBoss);
  check("boss + fillet builds a valid body", bossSolid.length >= 1 && bossSolid[0].indices.length > 0,
    `bodies=${bossSolid.length} tris=${bossSolid[0]?.indices.length}`);

  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("ERROR", e);
  process.exit(1);
});
