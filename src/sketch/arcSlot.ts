import type { ParametricSketch } from "./model";

/**
 * Build an arc (curved) slot profile into a sketch: an obround band of `width`
 * following a centreline arc (centre C, radius R, from angle a1 to a2 going
 * CCW) with semicircular end caps.
 *
 * The outline is tessellated into a closed polyline. Four true concentric arcs
 * confuse the planar region finder (the kernel fails to extrude them), so we
 * sample the boundary into short segments — robust, and smooth enough that the
 * facets are not visible at normal zoom. Adds points + lines; returns false on
 * degenerate input.
 */
let seq = 0;
const aid = (p: string) => `${p}-as${++seq}`;

export function buildArcSlot(
  s: ParametricSketch,
  cx: number,
  cy: number,
  R: number,
  a1: number,
  a2: number,
  width: number,
  construction?: boolean,
): boolean {
  const r = Math.abs(width) / 2;
  if (r <= 1e-6 || R <= 1e-6) return false;
  const Ro = R + r;
  const Ri = Math.max(0.01, R - r);
  const TAU = Math.PI * 2;
  const dccw = (((a2 - a1) % TAU) + TAU) % TAU || 1e-6; // CCW sweep a1→a2
  const S = { x: cx + R * Math.cos(a1), y: cy + R * Math.sin(a1) };
  const E = { x: cx + R * Math.cos(a2), y: cy + R * Math.sin(a2) };

  // Boundary point density: ~1 segment per 6° (min a few per piece).
  const arcSteps = Math.max(6, Math.ceil((dccw * 180) / Math.PI / 6));
  const capSteps = 10;
  const pts: { x: number; y: number }[] = [];

  // Outer arc Ro, a1 → a2.
  for (let i = 0; i <= arcSteps; i++) {
    const a = a1 + (dccw * i) / arcSteps;
    pts.push({ x: cx + Ro * Math.cos(a), y: cy + Ro * Math.sin(a) });
  }
  // End cap at E: from outer (angle a2) sweeping forward to inner (angle a2+π).
  for (let i = 1; i < capSteps; i++) {
    const a = a2 + (Math.PI * i) / capSteps;
    pts.push({ x: E.x + r * Math.cos(a), y: E.y + r * Math.sin(a) });
  }
  // Inner arc Ri, a2 → a1.
  for (let i = 0; i <= arcSteps; i++) {
    const a = a2 - (dccw * i) / arcSteps;
    pts.push({ x: cx + Ri * Math.cos(a), y: cy + Ri * Math.sin(a) });
  }
  // Start cap at S: from inner (angle a1+π) sweeping forward back to outer (a1).
  for (let i = 1; i < capSteps; i++) {
    const a = a1 + Math.PI + (Math.PI * i) / capSteps;
    pts.push({ x: S.x + r * Math.cos(a), y: S.y + r * Math.sin(a) });
  }

  // De-duplicate consecutive coincident points, then build a closed line loop.
  const ids: string[] = [];
  let prev: { x: number; y: number } | null = null;
  for (const p of pts) {
    if (prev && Math.hypot(p.x - prev.x, p.y - prev.y) < 1e-6) continue;
    const sp = { id: aid("pt"), x: p.x, y: p.y };
    s.points.push(sp);
    ids.push(sp.id);
    prev = p;
  }
  if (ids.length < 3) return false;
  const cflag = construction || undefined;
  for (let i = 0; i < ids.length; i++) {
    s.lines.push({ id: aid("ln"), p1: ids[i], p2: ids[(i + 1) % ids.length], construction: cflag });
  }
  return true;
}
