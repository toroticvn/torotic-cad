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

  console.log("Runtime: free-form polygon profile (L-shape) extrude:");
  const lShape: Design = {
    operations: [
      {
        shape: "polygon",
        h: 10,
        points: [
          [0, 0], [60, 0], [60, 20], [20, 20], [20, 50], [0, 50],
        ],
      },
    ],
  };
  const lSolid = rebuildSolids(designToFeatures(lShape));
  check("L-shape polygon builds one body", lSolid.length === 1 && lSolid[0].indices.length > 0, `bodies=${lSolid.length}`);

  console.log("Runtime: mirror the whole solid about YZ (append):");
  const asym: Feature[] = designToFeatures({ operations: [{ shape: "box", x: 30, y: 0, w: 40, d: 20, h: 10 }] });
  const mir = designToFeatures({ mode: "append", operations: [{ shape: "mirror", mirrorPlane: "YZ", merge: true }] }, { continueSolid: true });
  const mirSolid = rebuildSolids([...asym, ...mir]);
  check("mirror keeps one merged body", mirSolid.length === 1 && mirSolid[0].indices.length > 0, `bodies=${mirSolid.length}`);

  console.log("Runtime: linear pattern of the solid (append):");
  const pat = designToFeatures({ mode: "append", operations: [{ shape: "patternLinear", count: 3, dx: 50 }] }, { continueSolid: true });
  const baseBox = designToFeatures({ operations: [{ shape: "box", w: 20, d: 20, h: 10 }] });
  const patSolid = rebuildSolids([...baseBox, ...pat]);
  check("linear pattern builds a body", patSolid.length >= 1 && patSolid[0].indices.length > 0, `bodies=${patSolid.length}`);

  console.log("Pure: delete-target matching (by name) filters the tree:");
  const tree = designToFeatures({ operations: [{ shape: "box", w: 40, d: 40, h: 10 }] });
  const holeF = designToFeatures({ mode: "append", operations: [{ shape: "hole", diameter: 8, depth: 20 }] }, { continueSolid: true });
  const full = [...tree, ...holeF];
  const targets = new Set(["hole1"]); // matches the appended hole's extrude name
  const kept = full.filter((f) => !targets.has(f.name.toLowerCase()));
  check("delete by name removes the hole feature", kept.length === full.length - 1, `before=${full.length} after=${kept.length}`);

  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("ERROR", e);
  process.exit(1);
});
