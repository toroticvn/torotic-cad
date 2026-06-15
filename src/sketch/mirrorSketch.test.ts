// Verifies Sketch Mirror is PARAMETRIC (SolidWorks logic): the mirror copy is
// linked to the original through a `symmetric` relation (+ `equalRadius` for
// circles), so editing the original drags the mirror. Pure solver test, no WASM.
import { solveSketch } from "./solveSketch";
import { emptySketch, type ParametricSketch } from "./model";
import { reflectAcross } from "./transform";

let failures = 0;
const check = (name: string, cond: boolean, detail = "") => {
  console.log(cond ? `  ✓ ${name}` : `  ✗ ${name} ${detail}`);
  if (!cond) failures++;
};
const near = (a: number, b: number, tol = 1e-3) => Math.abs(a - b) <= tol;

function pt(s: ParametricSketch, id: string, x: number, y: number, fixed = false) {
  s.points.push({ id, x, y, fixed });
}

console.log("Sketch Mirror — symmetric point follows the original:");
{
  const s = emptySketch("front");
  // Vertical centerline (the mirror axis), pinned.
  pt(s, "c1", 0, -50, true);
  pt(s, "c2", 0, 50, true);
  s.lines.push({ id: "axis", p1: "c1", p2: "c2", construction: true });
  // Original point P and its mirror Q (created at the reflected position).
  pt(s, "P", 10, 3);
  pt(s, "Q", -10, 3);
  s.constraints.push({ id: "sym", type: "symmetric", p1: "P", p2: "Q", line: "axis" });

  // Edit the original: move P, lock it, and re-solve. Q must follow.
  const P = s.points.find((p) => p.id === "P")!;
  P.x = 25; P.y = 8;
  solveSketch(s, "P");
  const Q = s.points.find((p) => p.id === "Q")!;
  check("mirror tracked original to (-25, 8)", near(Q.x, -25) && near(Q.y, 8), `Q=(${Q.x.toFixed(2)}, ${Q.y.toFixed(2)})`);
}

console.log("Sketch Mirror — mirror across a slanted axis:");
{
  const s = emptySketch("front");
  pt(s, "c1", 0, 0, true);
  pt(s, "c2", 50, 50, true); // 45° axis
  s.lines.push({ id: "axis", p1: "c1", p2: "c2", construction: true });
  pt(s, "P", 20, 0);
  const expected = reflectAcross({ x: 20, y: 0 }, { x: 0, y: 0 }, { x: 50, y: 50 }); // = (0,20)
  pt(s, "Q", expected.x, expected.y);
  s.constraints.push({ id: "sym", type: "symmetric", p1: "P", p2: "Q", line: "axis" });
  // Move P, lock it, solve.
  const P = s.points.find((p) => p.id === "P")!;
  P.x = 30; P.y = 5;
  solveSketch(s, "P");
  const exp2 = reflectAcross({ x: 30, y: 5 }, { x: 0, y: 0 }, { x: 50, y: 50 }); // = (5,30)
  const Q = s.points.find((p) => p.id === "Q")!;
  check("mirror reflects across 45° axis", near(Q.x, exp2.x) && near(Q.y, exp2.y),
    `Q=(${Q.x.toFixed(2)}, ${Q.y.toFixed(2)}) exp=(${exp2.x.toFixed(2)}, ${exp2.y.toFixed(2)})`);
}

console.log("Sketch Mirror — equalRadius: mirror circle follows the original's dimension:");
{
  const s = emptySketch("front");
  s.points.push({ id: "oc", x: 10, y: 0 }, { id: "mc", x: -10, y: 0 });
  s.circles.push({ id: "O", center: "oc", r: 5 }, { id: "M", center: "mc", r: 5 });
  s.constraints.push({ id: "eqr", type: "equalRadius", c1: "O", c2: "M" });
  // A radius dimension drives the ORIGINAL to 15; the mirror should equalize.
  s.dimensions.push({ id: "d1", name: "r1", kind: "radius", refs: ["O"], value: 15 });
  solveSketch(s);
  const M = s.circles.find((c) => c.id === "M")!;
  const O = s.circles.find((c) => c.id === "O")!;
  check("original radius driven to 15", near(O.r, 15, 0.05), `O.r=${O.r.toFixed(3)}`);
  check("mirror radius equalized to 15", near(M.r, 15, 0.05), `M.r=${M.r.toFixed(3)}`);
}

console.log("Diameter dimension drives radius = value/2:");
{
  const s = emptySketch("front");
  s.points.push({ id: "c", x: 0, y: 0 });
  s.circles.push({ id: "C", center: "c", r: 3 });
  s.dimensions.push({ id: "d1", name: "dia1", kind: "diameter", refs: ["C"], value: 20 });
  solveSketch(s);
  const C = s.circles.find((c) => c.id === "C")!;
  check("Ø20 → radius 10", near(C.r, 10, 0.05), `r=${C.r.toFixed(3)}`);
}

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
