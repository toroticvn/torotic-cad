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

  for (const c of sketch.constraints) constraints.push(buildGeomConstraint(c, px, py, cr, lineXY));

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
  px: Map<string, VarId>,
  py: Map<string, VarId>,
  cr: Map<string, VarId>,
  lineXY: (id: string) => { x1: VarId; y1: VarId; x2: VarId; y2: VarId }
): Constraint {
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
