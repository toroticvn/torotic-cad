import { solve, computeDof, type Constraint, type VarId } from "./solver/lm";
import { evaluateExpr, referencedNames } from "./solver/expr";
import type { Dimension, GeomConstraint, ParametricSketch } from "./model";

export interface SketchSolveResult {
  ok: boolean;
  maxResidual: number;
  /** Remaining degrees of freedom (0 ⇒ fully defined). */
  dof: number;
  /** Dimension formula errors keyed by dimension id. */
  dimErrors: Record<string, string>;
}

/**
 * Resolve dimension values (evaluating formulas in dependency order), build the
 * numeric problem from the sketch, solve it, and write solved coordinates back
 * into the sketch points/circles in place.
 *
 * `lockedPointId` pins a point (used when dragging) so the solver moves the rest
 * of the geometry to accommodate it.
 */
export function solveSketch(sketch: ParametricSketch, lockedPointId?: string): SketchSolveResult {
  const dimErrors: Record<string, string> = {};
  const resolved = resolveDimensions(sketch.dimensions, dimErrors);

  // --- Variable layout: points (x,y) then circle radii ---
  const values: number[] = [];
  const locked: boolean[] = [];
  const px = new Map<string, VarId>();
  const py = new Map<string, VarId>();
  const cr = new Map<string, VarId>();

  for (const p of sketch.points) {
    const isLocked = !!p.fixed || p.id === lockedPointId;
    px.set(p.id, values.length);
    values.push(p.x);
    locked.push(isLocked);
    py.set(p.id, values.length);
    values.push(p.y);
    locked.push(isLocked);
  }
  for (const c of sketch.circles) {
    cr.set(c.id, values.length);
    values.push(c.r);
    locked.push(false);
  }

  const lineXY = (lineId: string) => {
    const line = sketch.lines.find((l) => l.id === lineId)!;
    return {
      x1: px.get(line.p1)!,
      y1: py.get(line.p1)!,
      x2: px.get(line.p2)!,
      y2: py.get(line.p2)!,
    };
  };

  const constraints: Constraint[] = [];

  for (const c of sketch.constraints) constraints.push(buildGeomConstraint(c, sketch, px, py, cr, lineXY));

  // Implicit per-arc relation: start and end are equidistant from the center
  // (keeps it a valid circular arc as points move).
  for (const a of sketch.arcs) {
    const cx = px.get(a.center)!, cy = py.get(a.center)!;
    const sx = px.get(a.start)!, sy = py.get(a.start)!;
    const ex = px.get(a.end)!, ey = py.get(a.end)!;
    constraints.push({
      vars: [cx, cy, sx, sy, ex, ey],
      residuals: (g) => [
        Math.hypot(g(sx) - g(cx), g(sy) - g(cy)) - Math.hypot(g(ex) - g(cx), g(ey) - g(cy)),
      ],
    });
  }

  for (const d of sketch.dimensions) {
    const target = resolved[d.id];
    if (target === undefined) continue;
    if (d.kind === "distance" && d.refs.length === 2) {
      const [a, b] = d.refs;
      const ax = px.get(a)!, ay = py.get(a)!, bx = px.get(b)!, by = py.get(b)!;
      constraints.push({
        vars: [ax, ay, bx, by],
        residuals: (g) => [Math.hypot(g(ax) - g(bx), g(ay) - g(by)) - target],
      });
    } else if (d.kind === "radius" && d.refs.length === 1) {
      const r = cr.get(d.refs[0]);
      if (r !== undefined) constraints.push({ vars: [r], residuals: (g) => [g(r) - target] });
    } else if (d.kind === "diameter" && d.refs.length === 1) {
      const r = cr.get(d.refs[0]);
      if (r !== undefined) constraints.push({ vars: [r], residuals: (g) => [g(r) - target / 2] });
    } else if (d.kind === "angle" && d.refs.length === 2) {
      const a = lineXY(d.refs[0]);
      const b = lineXY(d.refs[1]);
      const targetRad = (target * Math.PI) / 180;
      constraints.push({
        vars: [a.x1, a.y1, a.x2, a.y2, b.x1, b.y1, b.x2, b.y2],
        residuals: (g) => {
          const d1x = g(a.x2) - g(a.x1), d1y = g(a.y2) - g(a.y1);
          const d2x = g(b.x2) - g(b.x1), d2y = g(b.y2) - g(b.y1);
          const cross = d1x * d2y - d1y * d2x;
          const dot = d1x * d2x + d1y * d2y;
          return [Math.atan2(cross, dot) - targetRad];
        },
      });
    }
  }

  const result = solve(values, locked, constraints, { maxIterations: 200, tolerance: 1e-6 });
  const dof = Math.max(0, computeDof(values, locked, constraints));

  // Write solved values back.
  for (const p of sketch.points) {
    p.x = values[px.get(p.id)!];
    p.y = values[py.get(p.id)!];
  }
  for (const c of sketch.circles) c.r = values[cr.get(c.id)!];

  return { ok: result.ok, maxResidual: result.maxResidual, dof, dimErrors };
}

function buildGeomConstraint(
  c: GeomConstraint,
  sketch: ParametricSketch,
  px: Map<string, VarId>,
  py: Map<string, VarId>,
  cr: Map<string, VarId>,
  lineXY: (id: string) => { x1: VarId; y1: VarId; x2: VarId; y2: VarId }
): Constraint {
  // A circle or arc as a center + radius (radius is a var for circles, or
  // |start − center| for arcs). Used by tangent/concentric relations.
  const curveLike = (
    ref: { kind: "line" | "circle" | "arc"; id: string }
  ): { cx: VarId; cy: VarId; rOf: (g: (id: VarId) => number) => number; vars: VarId[] } => {
    if (ref.kind === "circle") {
      const c2 = sketch.circles.find((x) => x.id === ref.id)!;
      const cx = px.get(c2.center)!;
      const cy = py.get(c2.center)!;
      const rv = cr.get(c2.id)!;
      return { cx, cy, rOf: (g) => g(rv), vars: [cx, cy, rv] };
    }
    const a = sketch.arcs.find((x) => x.id === ref.id)!;
    const cx = px.get(a.center)!;
    const cy = py.get(a.center)!;
    const sx = px.get(a.start)!;
    const sy = py.get(a.start)!;
    return { cx, cy, rOf: (g) => Math.hypot(g(sx) - g(cx), g(sy) - g(cy)), vars: [cx, cy, sx, sy] };
  };

  switch (c.type) {
    case "coincident": {
      const ax = px.get(c.p1)!, ay = py.get(c.p1)!, bx = px.get(c.p2)!, by = py.get(c.p2)!;
      return { vars: [ax, ay, bx, by], residuals: (g) => [g(ax) - g(bx), g(ay) - g(by)] };
    }
    case "horizontal": {
      const l = lineXY(c.line);
      return { vars: [l.y1, l.y2], residuals: (g) => [g(l.y1) - g(l.y2)] };
    }
    case "vertical": {
      const l = lineXY(c.line);
      return { vars: [l.x1, l.x2], residuals: (g) => [g(l.x1) - g(l.x2)] };
    }
    case "parallel": {
      const a = lineXY(c.line1), b = lineXY(c.line2);
      return {
        vars: [a.x1, a.y1, a.x2, a.y2, b.x1, b.y1, b.x2, b.y2],
        residuals: (g) => {
          const dax = g(a.x2) - g(a.x1), day = g(a.y2) - g(a.y1);
          const dbx = g(b.x2) - g(b.x1), dby = g(b.y2) - g(b.y1);
          return [dax * dby - day * dbx];
        },
      };
    }
    case "perpendicular": {
      const a = lineXY(c.line1), b = lineXY(c.line2);
      return {
        vars: [a.x1, a.y1, a.x2, a.y2, b.x1, b.y1, b.x2, b.y2],
        residuals: (g) => {
          const dax = g(a.x2) - g(a.x1), day = g(a.y2) - g(a.y1);
          const dbx = g(b.x2) - g(b.x1), dby = g(b.y2) - g(b.y1);
          return [dax * dbx + day * dby];
        },
      };
    }
    case "equalLength": {
      const a = lineXY(c.line1), b = lineXY(c.line2);
      return {
        vars: [a.x1, a.y1, a.x2, a.y2, b.x1, b.y1, b.x2, b.y2],
        residuals: (g) => [
          Math.hypot(g(a.x2) - g(a.x1), g(a.y2) - g(a.y1)) -
            Math.hypot(g(b.x2) - g(b.x1), g(b.y2) - g(b.y1)),
        ],
      };
    }
    case "equalRadius": {
      const r1 = cr.get(c.c1)!, r2 = cr.get(c.c2)!;
      return { vars: [r1, r2], residuals: (g) => [g(r1) - g(r2)] };
    }
    case "collinear": {
      const a = lineXY(c.line1), b = lineXY(c.line2);
      return {
        vars: [a.x1, a.y1, a.x2, a.y2, b.x1, b.y1, b.x2, b.y2],
        residuals: (g) => {
          const dax = g(a.x2) - g(a.x1), day = g(a.y2) - g(a.y1);
          const dbx = g(b.x2) - g(b.x1), dby = g(b.y2) - g(b.y1);
          const parallel = dax * dby - day * dbx;
          const onLine = dax * (g(b.y1) - g(a.y1)) - day * (g(b.x1) - g(a.x1));
          return [parallel, onLine];
        },
      };
    }
    case "midpoint": {
      const l = lineXY(c.line);
      const pxi = px.get(c.point)!, pyi = py.get(c.point)!;
      return {
        vars: [pxi, pyi, l.x1, l.y1, l.x2, l.y2],
        residuals: (g) => [g(pxi) - (g(l.x1) + g(l.x2)) / 2, g(pyi) - (g(l.y1) + g(l.y2)) / 2],
      };
    }
    case "pointOnLine": {
      // The point must lie on the infinite line through the edge (it can slide
      // along it). Residual = cross product of edge dir and (point − p1) = 0.
      const l = lineXY(c.line);
      const pxi = px.get(c.point)!, pyi = py.get(c.point)!;
      return {
        vars: [pxi, pyi, l.x1, l.y1, l.x2, l.y2],
        residuals: (g) => {
          const ex = g(l.x2) - g(l.x1), ey = g(l.y2) - g(l.y1);
          return [ex * (g(pyi) - g(l.y1)) - ey * (g(pxi) - g(l.x1))];
        },
      };
    }
    case "symmetric": {
      const l = lineXY(c.line);
      const p1x = px.get(c.p1)!, p1y = py.get(c.p1)!, p2x = px.get(c.p2)!, p2y = py.get(c.p2)!;
      return {
        vars: [p1x, p1y, p2x, p2y, l.x1, l.y1, l.x2, l.y2],
        residuals: (g) => {
          const ax = g(l.x1), ay = g(l.y1);
          const ex = g(l.x2) - ax, ey = g(l.y2) - ay;
          const len2 = ex * ex + ey * ey || 1e-9;
          const t = ((g(p1x) - ax) * ex + (g(p1y) - ay) * ey) / len2;
          const projx = ax + t * ex, projy = ay + t * ey;
          return [2 * projx - g(p1x) - g(p2x), 2 * projy - g(p1y) - g(p2y)];
        },
      };
    }
    case "concentric": {
      const a = curveLike(c.e1), b = curveLike(c.e2);
      return { vars: [a.cx, a.cy, b.cx, b.cy], residuals: (g) => [g(a.cx) - g(b.cx), g(a.cy) - g(b.cy)] };
    }
    case "tangent": {
      const e1Line = c.e1.kind === "line";
      const e2Line = c.e2.kind === "line";
      if (e1Line && e2Line) {
        // tangent between two lines is undefined — no-op constraint.
        return { vars: [], residuals: () => [] };
      }
      if (e1Line || e2Line) {
        const lref = e1Line ? c.e1 : c.e2;
        const cref = e1Line ? c.e2 : c.e1;
        const l = lineXY(lref.id);
        const cv = curveLike(cref);
        return {
          vars: [l.x1, l.y1, l.x2, l.y2, ...cv.vars],
          residuals: (g) => {
            const ax = g(l.x1), ay = g(l.y1);
            const ex = g(l.x2) - ax, ey = g(l.y2) - ay;
            const len2 = ex * ex + ey * ey || 1e-9;
            const cross = ex * (g(cv.cy) - ay) - ey * (g(cv.cx) - ax);
            const r = cv.rOf(g);
            return [(cross * cross) / len2 - r * r]; // dist(center,line)² = r²
          },
        };
      }
      const a = curveLike(c.e1), b = curveLike(c.e2);
      return {
        vars: [...a.vars, ...b.vars],
        residuals: (g) => {
          const d = Math.hypot(g(a.cx) - g(b.cx), g(a.cy) - g(b.cy));
          return [d - (a.rOf(g) + b.rOf(g))]; // external tangency
        },
      };
    }
  }
}

/**
 * Resolve each dimension to a number. Literal dimensions use their value;
 * formula dimensions are evaluated in dependency order (iterative passes).
 */
function resolveDimensions(dims: Dimension[], errors: Record<string, string>): Record<string, number> {
  const byName = new Map(dims.map((d) => [d.name, d]));
  const resolvedByName: Record<string, number> = {};
  const resolvedById: Record<string, number> = {};

  const pending = new Set(dims);
  let progressed = true;
  while (pending.size > 0 && progressed) {
    progressed = false;
    for (const d of [...pending]) {
      if (!d.formula || d.formula.trim() === "") {
        resolvedByName[d.name] = d.value;
        resolvedById[d.id] = d.value;
        pending.delete(d);
        progressed = true;
        continue;
      }
      const deps = referencedNames(d.formula);
      if (deps.every((name) => name in resolvedByName || !byName.has(name))) {
        try {
          const v = evaluateExpr(d.formula, resolvedByName);
          d.value = v;
          resolvedByName[d.name] = v;
          resolvedById[d.id] = v;
        } catch (e) {
          errors[d.id] = (e as Error).message;
          resolvedById[d.id] = d.value; // fall back to cached value
          resolvedByName[d.name] = d.value;
        }
        pending.delete(d);
        progressed = true;
      }
    }
  }
  // Anything left is part of a cycle.
  for (const d of pending) {
    errors[d.id] = "Công thức vòng lặp (circular)";
    resolvedById[d.id] = d.value;
  }
  return resolvedById;
}
