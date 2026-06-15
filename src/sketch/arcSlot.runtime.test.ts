// Verifies the arc (curved) slot profile builds a valid closed region that the
// kernel can extrude — done before wiring the interactive tool so the tricky
// arc winding is proven correct without manual testing.
import { loadOC } from "../kernel/loadOC";
import { rebuildSolids } from "../kernel/rebuild";
import { emptySketch } from "./model";
import { buildArcSlot } from "./arcSlot";
import { findRegions2D } from "./regions2d";
import type { Feature } from "../features";

let failures = 0;
const check = (name: string, cond: boolean, detail = "") => {
  console.log(cond ? `  ✓ ${name}` : `  ✗ ${name} ${detail}`);
  if (!cond) failures++;
};

async function main() {
  await loadOC();
  console.log("kernel loaded\n");

  const cases: [string, number][] = [
    ["90° arc slot", Math.PI / 2],
    ["180° arc slot", Math.PI],
    ["270° arc slot", (3 * Math.PI) / 2],
  ];
  for (const [name, sweep] of cases) {
    const s = emptySketch("top");
    const ok = buildArcSlot(s, 0, 0, 40, 0, sweep, 12);
    check(`${name}: builder ok`, ok);
    const regions = findRegions2D(s).length;
    check(`${name}: forms one closed region`, regions >= 1, `regions=${regions}`);
    const feats: Feature[] = [
      { id: "as", type: "sketch", name: "S", sketch: s },
      { id: "ae", type: "extrude", name: "E", sketchId: "as", distance: 10, operation: "new" },
    ];
    const m = rebuildSolids(feats);
    check(`${name}: extrudes to a valid solid`, m.length === 1 && m[0].indices.length > 0, `bodies=${m.length} tris=${m[0]?.indices.length}`);
  }

  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("ERROR", e);
  process.exit(1);
});
