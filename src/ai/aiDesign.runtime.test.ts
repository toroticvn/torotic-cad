// Verifies the AI-draw pipeline: a Claude "design" (operations) -> real feature
// tree -> rebuildable solid, for both "replace" (new model) and "append" (draw
// onto the current model). Proves the assistant's drawing works end to end in
// the kernel without needing a live Claude call.
import { loadOC } from "../kernel/loadOC";
import { rebuildSolids } from "../kernel/rebuild";
import { designToFeatures, applyModify, type Design } from "./design";
import { producesSolid, type Feature } from "../features";

const bbox = (m: { positions: number[] }) => {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < m.positions.length; i += 3) {
    minX = Math.min(minX, m.positions[i]); maxX = Math.max(maxX, m.positions[i]);
    minY = Math.min(minY, m.positions[i + 1]); maxY = Math.max(maxY, m.positions[i + 1]);
    minZ = Math.min(minZ, m.positions[i + 2]); maxZ = Math.max(maxZ, m.positions[i + 2]);
  }
  return { dx: maxX - minX, dy: maxY - minY, dz: maxZ - minZ };
};

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

  console.log("Modify: parametric edits of existing features:");
  // Plate (top plane → extrude up, so height is along Z=dz) with a hole.
  const mPlate = designToFeatures({ operations: [{ shape: "box", w: 80, d: 40, h: 10 }] });
  const mHole = designToFeatures({ mode: "append", operations: [{ shape: "hole", x: 0, y: 0, diameter: 8, depth: 30 }] }, { continueSolid: true });
  const mTree = [...mPlate, ...mHole];
  const beforeBox = rebuildSolids(mTree);
  const beforeBB = bbox(beforeBox[0]);

  // 1) Taller plate: modify the box extrude distance 10 → 25. The "top" plane
  // extrudes along Y, so the extrude height shows up as the bbox dy.
  const tallTree = applyModify(mTree, [{ target: "Box1", distance: 25 }]);
  check("modify distance applied to one feature", tallTree.applied === 1, `applied=${tallTree.applied}`);
  const tallBB = bbox(rebuildSolids(tallTree.features)[0]);
  check("box got taller (height 10 → 25)", Math.abs(tallBB.dy - 25) < 0.5 && tallBB.dy > beforeBB.dy + 10, `dy=${tallBB.dy.toFixed(2)}`);

  // 2) Bigger hole: modify the hole's circle diameter 8 → 20 (resizes the sketch).
  // A cylindrical cut has the same triangle count regardless of radius, so verify
  // the sketch radius actually changed and the solid still builds.
  const bigHole = applyModify(mTree, [{ target: "Hole1", diameter: 20 }]);
  check("modify diameter applied", bigHole.applied === 1, `applied=${bigHole.applied}`);
  const holeSketch = bigHole.features.find((f) => f.type === "sketch" && f.sketch.circles.length);
  const newR = holeSketch?.type === "sketch" ? holeSketch.sketch.circles[0]?.r : undefined;
  check("hole sketch radius updated 4 → 10", newR === 10, `r=${newR}`);
  check("bigger hole still builds one body", rebuildSolids(bigHole.features).length === 1);

  // 3) Wider box: width 80 → 120 along u (X).
  const wideBB = bbox(rebuildSolids(applyModify(mTree, [{ target: "Box1", width: 120 }]).features)[0]);
  check("box got wider (dx 80 → 120)", Math.abs(wideBB.dx - 120) < 0.5, `dx=${wideBB.dx.toFixed(2)}`);

  // 4) Match by id, and a no-op target is ignored.
  const byId = applyModify(mTree, [{ target: mPlate[1].id, distance: 15 }, { target: "DoesNotExist", distance: 99 }]);
  check("modify matches by id, ignores unknown target", byId.applied === 1, `applied=${byId.applied}`);

  // 5) Fillet radius edit lands on the fillet feature.
  const filTree = [...mPlate, ...designToFeatures({ mode: "append", operations: [{ shape: "fillet", radius: 2 }] }, { continueSolid: true })];
  const filMod = applyModify(filTree, [{ target: "Fillet1", radius: 4 }]);
  const fil = filMod.features.find((f) => f.type === "fillet");
  check("fillet radius modified 2 → 4", filMod.applied === 1 && fil?.type === "fillet" && fil.radius === 4, `r=${fil && fil.type === "fillet" ? fil.radius : "?"}`);

  console.log("Region fillet / shell (top-plane parts, +Y is up):");
  const rbox = designToFeatures({ operations: [{ shape: "box", w: 60, d: 40, h: 20 }] });
  const rbaseN = rebuildSolids(rbox)[0].positions.length;
  const filAll = rebuildSolids([...rbox, ...designToFeatures({ mode: "append", operations: [{ shape: "fillet", radius: 3, edgeRegion: "all" }] }, { continueSolid: true })]);
  const filTop = rebuildSolids([...rbox, ...designToFeatures({ mode: "append", operations: [{ shape: "fillet", radius: 3, edgeRegion: "top" }] }, { continueSolid: true })]);
  check("fillet all edges changes geometry", filAll[0].positions.length !== rbaseN, `base=${rbaseN} all=${filAll[0].positions.length}`);
  check("fillet TOP edges changes geometry", filTop[0].positions.length !== rbaseN, `top=${filTop[0].positions.length}`);
  check("fillet top differs from fillet all (rounds fewer edges)", filTop[0].positions.length !== filAll[0].positions.length, `top=${filTop[0].positions.length} all=${filAll[0].positions.length}`);

  const shellTop = rebuildSolids([...rbox, ...designToFeatures({ mode: "append", operations: [{ shape: "shell", thickness: 2, faceRegion: "top" }] }, { continueSolid: true })]);
  check("shell (open top) builds one body", shellTop.length === 1 && shellTop[0].indices.length > 0, `bodies=${shellTop.length}`);
  check("shell hollows the box (more verts than the solid)", shellTop[0].positions.length > rbaseN, `solid=${rbaseN} shell=${shellTop[0].positions.length}`);
  const shellBot = rebuildSolids([...rbox, ...designToFeatures({ mode: "append", operations: [{ shape: "shell", thickness: 2, faceRegion: "bottom" }] }, { continueSolid: true })]);
  check("shell (open bottom) also builds one body", shellBot.length === 1 && shellBot[0].indices.length > 0, `bodies=${shellBot.length}`);

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
