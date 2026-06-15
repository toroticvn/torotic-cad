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

  console.log("Runtime: regular polygon (hex nut blank) extrude:");
  const hex = rebuildSolids(designToFeatures({ operations: [{ shape: "regularPolygon", sides: 6, diameter: 30, h: 12 }] }));
  check("hexagon builds one body", hex.length === 1 && hex[0].indices.length > 0, `bodies=${hex.length}`);

  console.log("Runtime: slot cut into a plate (append):");
  const platforSlot = designToFeatures({ operations: [{ shape: "box", w: 80, d: 40, h: 10 }] });
  const slotCut = designToFeatures({ mode: "append", operations: [{ shape: "slot", x: 0, y: 0, length: 40, width: 12, depth: 20, op: "cut" }] }, { continueSolid: true });
  const slotSolid = rebuildSolids([...platforSlot, ...slotCut]);
  check("slot cut keeps one body", slotSolid.length === 1 && slotSolid[0].indices.length > 0, `bodies=${slotSolid.length}`);
  check("slot changed geometry", (slotSolid[0]?.positions.length ?? 0) !== (rebuildSolids(platforSlot)[0]?.positions.length ?? 0));

  console.log("Runtime: flange (disk) + bolt circle of 6 holes:");
  const disk = designToFeatures({ operations: [{ shape: "cylinder", diameter: 100, h: 12 }] });
  const bolts = designToFeatures({ mode: "append", operations: [{ shape: "boltCircle", boltCircleDiameter: 70, holeDiameter: 9, count: 6, depth: 20 }] }, { continueSolid: true });
  const flange = rebuildSolids([...disk, ...bolts]);
  check("flange with bolt circle builds one body", flange.length === 1 && flange[0].indices.length > 0, `bodies=${flange.length}`);
  check("bolt holes changed geometry", (flange[0]?.positions.length ?? 0) !== (rebuildSolids(disk)[0]?.positions.length ?? 0));

  console.log("Runtime: counterbore + countersink holes in a plate:");
  const plateH = 20;
  const plateBase = designToFeatures({ operations: [{ shape: "box", w: 80, d: 40, h: plateH }] });
  const plainHole = rebuildSolids([...plateBase, ...designToFeatures({ mode: "append", operations: [{ shape: "hole", x: -20, y: 0, diameter: 8, depth: 40 }] }, { continueSolid: true })]);
  const plainVerts = plainHole[0]?.positions.length ?? 0;

  const cbore = rebuildSolids([...plateBase, ...designToFeatures({ mode: "append", operations: [{ shape: "hole", x: -20, y: 0, diameter: 8, depth: 40, holeType: "counterbore", cboreDiameter: 16, cboreDepth: 6, topOffset: plateH }] }, { continueSolid: true })]);
  check("counterbore builds one body", cbore.length === 1 && cbore[0].indices.length > 0, `bodies=${cbore.length}`);
  check("counterbore differs from a plain hole", (cbore[0]?.positions.length ?? 0) !== plainVerts, `plain=${plainVerts} cbore=${cbore[0]?.positions.length}`);

  const csink = rebuildSolids([...plateBase, ...designToFeatures({ mode: "append", operations: [{ shape: "hole", x: 20, y: 0, diameter: 8, depth: 40, holeType: "countersink", csinkDiameter: 16, csinkAngle: 90, topOffset: plateH }] }, { continueSolid: true })]);
  check("countersink builds one body", csink.length === 1 && csink[0].indices.length > 0, `bodies=${csink.length}`);
  check("countersink differs from a plain hole", (csink[0]?.positions.length ?? 0) !== plainVerts, `plain=${plainVerts} csink=${csink[0]?.positions.length}`);

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
