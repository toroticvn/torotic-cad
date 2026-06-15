// Verifies the "point on edge" relation (pointOnLine): a point constrained to an
// edge stays ON that edge when the sketch changes — the fix for "I put a line's
// endpoints on the rectangle edges but they drift off when I change the angle".
import { solveSketch } from "./solveSketch";
import { emptySketch, type ParametricSketch } from "./model";

let failures = 0;
const check = (name: string, cond: boolean, detail = "") => {
  console.log(cond ? `  ✓ ${name}` : `  ✗ ${name} ${detail}`);
  if (!cond) failures++;
};
const near = (a: number, b: number, tol = 1e-3) => Math.abs(a - b) <= tol;

function edge(s: ParametricSketch, id: string, x1: number, y1: number, x2: number, y2: number) {
  s.points.push({ id: id + "1", x: x1, y: y1, fixed: true }, { id: id + "2", x: x2, y: y2, fixed: true });
  s.lines.push({ id, p1: id + "1", p2: id + "2" });
}

console.log("pointOnLine: point snaps back onto a horizontal edge:");
{
  const s = emptySketch("front");
  edge(s, "bottom", 0, 0, 100, 0);
  s.points.push({ id: "P", x: 40, y: 15 }); // off the edge
  s.constraints.push({ id: "c", type: "pointOnLine", point: "P", line: "bottom" });
  solveSketch(s);
  const P = s.points.find((p) => p.id === "P")!;
  check("point pulled onto the edge (y→0)", near(P.y, 0, 1e-2), `P=(${P.x.toFixed(2)}, ${P.y.toFixed(2)})`);
}

console.log("pointOnLine: point lands on a slanted (45°) edge:");
{
  const s = emptySketch("front");
  edge(s, "diag", 0, 0, 50, 50);
  s.points.push({ id: "P", x: 30, y: 0 });
  s.constraints.push({ id: "c", type: "pointOnLine", point: "P", line: "diag" });
  solveSketch(s);
  const P = s.points.find((p) => p.id === "P")!;
  check("point lies on y=x line", near(P.x, P.y, 1e-2), `P=(${P.x.toFixed(2)}, ${P.y.toFixed(2)})`);
}

console.log("pointOnLine: endpoint stays on edge while a diagonal is angled:");
{
  // Two fixed edges (a corner). A diagonal from a point on the left edge to a
  // point on the bottom edge; give it an angle and check both ends stay on edges.
  const s = emptySketch("front");
  edge(s, "left", 0, 0, 0, 100); // vertical
  edge(s, "bottom", 0, 0, 100, 0); // horizontal
  s.points.push({ id: "A", x: 0, y: 60 }, { id: "B", x: 50, y: 0 });
  s.lines.push({ id: "diag", p1: "A", p2: "B" });
  s.constraints.push({ id: "ca", type: "pointOnLine", point: "A", line: "left" });
  s.constraints.push({ id: "cb", type: "pointOnLine", point: "B", line: "bottom" });
  // Drive the diagonal to 30° from the bottom edge.
  s.dimensions.push({ id: "d", name: "a1", kind: "angle", refs: ["bottom", "diag"], value: 30 });
  solveSketch(s);
  const A = s.points.find((p) => p.id === "A")!;
  const B = s.points.find((p) => p.id === "B")!;
  check("A stays on the left edge (x=0)", near(A.x, 0, 1e-2), `A=(${A.x.toFixed(2)}, ${A.y.toFixed(2)})`);
  check("B stays on the bottom edge (y=0)", near(B.y, 0, 1e-2), `B=(${B.x.toFixed(2)}, ${B.y.toFixed(2)})`);
}

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
