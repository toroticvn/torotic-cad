import { solveSketch } from "./solveSketch";
import { emptySketch, type ParametricSketch } from "./model";

let failures = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) console.log(`  ✓ ${name}`);
  else {
    console.log(`  ✗ ${name} ${detail}`);
    failures++;
  }
}
const near = (a: number, b: number, eps = 1e-3) => Math.abs(a - b) < eps;

// ---------------------------------------------------------------------------
// Test 1: A roughly-drawn quad constrained into a 60 x 40 rectangle.
// Corner p0 fixed at origin; horizontal/vertical edges; width + height dims.
// ---------------------------------------------------------------------------
function rectangleTest() {
  console.log("Test 1: rectangle from messy quad");
  const s: ParametricSketch = emptySketch("front");
  s.points = [
    { id: "p0", x: 0, y: 0, fixed: true },
    { id: "p1", x: 55, y: 3 },
    { id: "p2", x: 58, y: 44 },
    { id: "p3", x: -2, y: 38 },
  ];
  s.lines = [
    { id: "l0", p1: "p0", p2: "p1" },
    { id: "l1", p1: "p1", p2: "p2" },
    { id: "l2", p1: "p2", p2: "p3" },
    { id: "l3", p1: "p3", p2: "p0" },
  ];
  s.constraints = [
    { id: "c0", type: "horizontal", line: "l0" },
    { id: "c1", type: "vertical", line: "l1" },
    { id: "c2", type: "horizontal", line: "l2" },
    { id: "c3", type: "vertical", line: "l3" },
  ];
  s.dimensions = [
    { id: "w", name: "w", kind: "distance", refs: ["p0", "p1"], value: 60 },
    { id: "h", name: "h", kind: "distance", refs: ["p1", "p2"], value: 40 },
  ];

  const res = solveSketch(s);
  const p = (id: string) => s.points.find((q) => q.id === id)!;
  check("converged", res.ok, `maxResidual=${res.maxResidual}`);
  check("p0 stays at origin", near(p("p0").x, 0) && near(p("p0").y, 0));
  check("width = 60", near(Math.hypot(p("p1").x - p("p0").x, p("p1").y - p("p0").y), 60));
  check("height = 40", near(Math.hypot(p("p2").x - p("p1").x, p("p2").y - p("p1").y), 40));
  check("bottom edge horizontal", near(p("p0").y, p("p1").y));
  check("right edge vertical", near(p("p1").x, p("p2").x));
  check("fully defined (dof 0)", res.dof === 0, `dof=${res.dof}`);
}

// ---------------------------------------------------------------------------
// Test 0: an unconstrained free line has 4 DOF (2 points × x,y).
// ---------------------------------------------------------------------------
function dofTest() {
  console.log("Test 0: DOF of a free line");
  const s: ParametricSketch = emptySketch("front");
  s.points = [
    { id: "a", x: 0, y: 0 },
    { id: "b", x: 30, y: 10 },
  ];
  s.lines = [{ id: "l", p1: "a", p2: "b" }];
  const res = solveSketch(s);
  check("free line has 4 DOF", res.dof === 4, `dof=${res.dof}`);
}

// ---------------------------------------------------------------------------
// Test 2: formula linking — h = w/2. Change w, h must follow.
// ---------------------------------------------------------------------------
function formulaTest() {
  console.log("Test 2: linked dimensions (h = w/2)");
  const s: ParametricSketch = emptySketch("front");
  s.points = [
    { id: "p0", x: 0, y: 0, fixed: true },
    { id: "p1", x: 50, y: 0 },
    { id: "p2", x: 50, y: 20 },
    { id: "p3", x: 0, y: 20 },
  ];
  s.lines = [
    { id: "l0", p1: "p0", p2: "p1" },
    { id: "l1", p1: "p1", p2: "p2" },
    { id: "l2", p1: "p2", p2: "p3" },
    { id: "l3", p1: "p3", p2: "p0" },
  ];
  s.constraints = [
    { id: "c0", type: "horizontal", line: "l0" },
    { id: "c1", type: "vertical", line: "l1" },
    { id: "c2", type: "horizontal", line: "l2" },
    { id: "c3", type: "vertical", line: "l3" },
  ];
  s.dimensions = [
    { id: "w", name: "w", kind: "distance", refs: ["p0", "p1"], value: 80 },
    { id: "h", name: "h", kind: "distance", refs: ["p1", "p2"], value: 0, formula: "w/2" },
  ];

  const res = solveSketch(s);
  const p = (id: string) => s.points.find((q) => q.id === id)!;
  check("converged", res.ok, `maxResidual=${res.maxResidual}`);
  check("no formula errors", Object.keys(res.dimErrors).length === 0, JSON.stringify(res.dimErrors));
  check("width = 80", near(Math.hypot(p("p1").x - p("p0").x, p("p1").y - p("p0").y), 80));
  check("height = 40 (w/2)", near(Math.hypot(p("p2").x - p("p1").x, p("p2").y - p("p1").y), 40));
}

// ---------------------------------------------------------------------------
// Test 3: radius dimension + equal radius between two circles.
// ---------------------------------------------------------------------------
function radiusTest() {
  console.log("Test 3: radius dimension + equalRadius");
  const s: ParametricSketch = emptySketch("front");
  s.points = [
    { id: "c0c", x: 0, y: 0, fixed: true },
    { id: "c1c", x: 50, y: 0, fixed: true },
  ];
  s.circles = [
    { id: "circA", center: "c0c", r: 7 },
    { id: "circB", center: "c1c", r: 30 },
  ];
  s.dimensions = [{ id: "rA", name: "rA", kind: "radius", refs: ["circA"], value: 12 }];
  s.constraints = [{ id: "eq", type: "equalRadius", c1: "circA", c2: "circB" }];

  const res = solveSketch(s);
  check("converged", res.ok, `maxResidual=${res.maxResidual}`);
  check("circA radius = 12", near(s.circles[0].r, 12));
  check("circB equals circA", near(s.circles[1].r, 12));
}

dofTest();
rectangleTest();
formulaTest();
radiusTest();

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`);
if (failures > 0) process.exit(1);
