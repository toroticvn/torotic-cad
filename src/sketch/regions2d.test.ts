import { findRegions2D } from "./regions2d";
import { emptySketch, type ParametricSketch } from "./model";

let failures = 0;
const check = (name: string, cond: boolean, detail = "") => {
  console.log(cond ? `  ✓ ${name}` : `  ✗ ${name} ${detail}`);
  if (!cond) failures++;
};

function rect(s: ParametricSketch, id: string, x0: number, y0: number, x1: number, y1: number) {
  s.points.push({ id: id + "a", x: x0, y: y0 }, { id: id + "b", x: x1, y: y0 }, { id: id + "c", x: x1, y: y1 }, { id: id + "d", x: x0, y: y1 });
  s.lines.push(
    { id: id + "1", p1: id + "a", p2: id + "b" },
    { id: id + "2", p1: id + "b", p2: id + "c" },
    { id: id + "3", p1: id + "c", p2: id + "d" },
    { id: id + "4", p1: id + "d", p2: id + "a" }
  );
}

// 1. Single rectangle → 1 region.
{
  const s = emptySketch("front");
  rect(s, "r", 0, 0, 40, 40);
  const r = findRegions2D(s);
  check("single rect → 1 region", r.length === 1, `=${r.length}`);
}

// 2. Two OVERLAPPING rectangles → 3 regions (A\B, A∩B, B\A).
{
  const s = emptySketch("front");
  rect(s, "a", 0, 0, 40, 40);
  rect(s, "b", 20, 10, 60, 30);
  const r = findRegions2D(s);
  check("overlapping rects → 3 regions", r.length === 3, `=${r.length}`);
}

// 3. Two SEPARATE rectangles → 2 regions.
{
  const s = emptySketch("front");
  rect(s, "a", 0, 0, 20, 20);
  rect(s, "b", 40, 0, 60, 20);
  const r = findRegions2D(s);
  check("separate rects → 2 regions", r.length === 2, `=${r.length}`);
}

// 4. Rectangle with an inner (non-touching) circle → 2 regions, outer has 1 hole.
{
  const s = emptySketch("front");
  rect(s, "r", 0, 0, 60, 40);
  s.points.push({ id: "cc", x: 30, y: 20 });
  s.circles.push({ id: "c0", center: "cc", r: 8 });
  const r = findRegions2D(s);
  check("rect + inner circle → 2 regions", r.length === 2, `=${r.length}`);
  const withHole = r.filter((x) => x.holes.length > 0);
  check("one region has a hole", withHole.length === 1, `=${withHole.length}`);
}

// 5. Circle overlapping a rectangle (curve crossing) → ≥3 regions.
{
  const s = emptySketch("front");
  rect(s, "r", 0, 0, 60, 40);
  s.points.push({ id: "cc", x: 60, y: 20 });
  s.circles.push({ id: "c0", center: "cc", r: 30 });
  const r = findRegions2D(s);
  check("circle crossing rect → ≥3 regions", r.length >= 3, `=${r.length}`);
}

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
