import type { Font } from "opentype.js";
import { emptySketch, type ParametricSketch, type SketchPoint } from "./model";
import type { PlaneId } from "./SketchPlane";

/**
 * Text → sketch profile. Converts a string into closed sketch contours using a
 * loaded font's glyph outlines (Bézier segments tessellated to line segments,
 * font Y flipped so text reads upright). The resulting sketch extrudes like any
 * other profile — inner contours (holes in o/a/e/ó…) are classified as holes by
 * the region finder (profile.ts/regions2d.ts), so engraved/embossed text works.
 *
 * Pure & environment-agnostic: the font is injected via setFont() so this module
 * is Node-testable (no Vite `?url`); the browser glue lives in fonts/loadFont.ts.
 */

let FONT: Font | null = null;

/** Inject the parsed font (called by the browser font loader or the Node test). */
export function setFont(f: Font): void {
  FONT = f;
}

/** Whether a font has been loaded yet (text ops need this). */
export function fontReady(): boolean {
  return !!FONT;
}

type Pt = { x: number; y: number };

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

/** Segments to tessellate a curve of approximate length `len` at text `size`. */
function steps(len: number, size: number): number {
  return Math.max(2, Math.min(24, Math.round(len / Math.max(0.4, size * 0.06))));
}

/**
 * Tessellate a string into closed contours (font Y already flipped to +up).
 * Each contour is an ordered list of points (start not duplicated at the end).
 */
export function textContours(text: string, size: number): Pt[][] {
  if (!FONT || !text) return [];
  // baseline at y=0; opentype y grows downward, so we negate y on capture.
  const path = FONT.getPath(text, 0, 0, size);
  const contours: Pt[][] = [];
  let cur: Pt[] = [];
  let cx = 0, cy = 0; // current pen (raw font coords, y-down)
  let sx = 0, sy = 0; // contour start
  const put = (x: number, y: number) => cur.push({ x, y: -y });

  for (const c of path.commands) {
    if (c.type === "M") {
      if (cur.length >= 2) contours.push(cur);
      cur = [];
      put(c.x, c.y);
      cx = sx = c.x; cy = sy = c.y;
    } else if (c.type === "L") {
      put(c.x, c.y);
      cx = c.x; cy = c.y;
    } else if (c.type === "Q") {
      const n = steps(dist({ x: cx, y: cy }, { x: c.x1, y: c.y1 }) + dist({ x: c.x1, y: c.y1 }, { x: c.x, y: c.y }), size);
      for (let i = 1; i <= n; i++) {
        const t = i / n, mt = 1 - t;
        put(mt * mt * cx + 2 * mt * t * c.x1 + t * t * c.x, mt * mt * cy + 2 * mt * t * c.y1 + t * t * c.y);
      }
      cx = c.x; cy = c.y;
    } else if (c.type === "C") {
      const n = steps(dist({ x: cx, y: cy }, { x: c.x1, y: c.y1 }) + dist({ x: c.x1, y: c.y1 }, { x: c.x2, y: c.y2 }) + dist({ x: c.x2, y: c.y2 }, { x: c.x, y: c.y }), size);
      for (let i = 1; i <= n; i++) {
        const t = i / n, mt = 1 - t;
        put(
          mt * mt * mt * cx + 3 * mt * mt * t * c.x1 + 3 * mt * t * t * c.x2 + t * t * t * c.x,
          mt * mt * mt * cy + 3 * mt * mt * t * c.y1 + 3 * mt * t * t * c.y2 + t * t * t * c.y,
        );
      }
      cx = c.x; cy = c.y;
    } else if (c.type === "Z") {
      if (cur.length >= 2) contours.push(cur);
      cur = [];
      cx = sx; cy = sy;
    }
  }
  if (cur.length >= 2) contours.push(cur);
  return contours;
}

let seq = 0;
const tid = (p: string) => `${p}-txt${++seq}`;

/**
 * Build a sketch whose closed loops are the outlines of `text`. The text is
 * centred on (x, y) of the sketch plane. Returns null if no font is loaded or
 * the string produced no usable contour.
 */
export function textSketch(text: string, size: number, plane: PlaneId, offset: number, x: number, y: number): ParametricSketch | null {
  const contours = textContours(text, Math.abs(size) || 10);
  if (!contours.length) return null;

  // Centre the whole string about (x, y).
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const ct of contours) for (const p of ct) {
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
  }
  const ox = x - (minX + maxX) / 2;
  const oy = y - (minY + maxY) / 2;

  const s = emptySketch(plane, offset);
  const tol = Math.max(1e-4, (Math.abs(size) || 10) * 0.002);
  for (const raw of contours) {
    // Drop consecutive near-duplicate points and a closing point equal to start.
    const ct: Pt[] = [];
    for (const p of raw) {
      if (ct.length === 0 || dist(ct[ct.length - 1], p) > tol) ct.push(p);
    }
    if (ct.length >= 2 && dist(ct[0], ct[ct.length - 1]) <= tol) ct.pop();
    if (ct.length < 3) continue;

    const pts: SketchPoint[] = ct.map((p) => ({ id: tid("pt"), x: p.x + ox, y: p.y + oy }));
    s.points.push(...pts);
    for (let i = 0; i < pts.length; i++) {
      s.lines.push({ id: tid("ln"), p1: pts[i].id, p2: pts[(i + 1) % pts.length].id });
    }
  }
  return s.lines.length ? s : null;
}
