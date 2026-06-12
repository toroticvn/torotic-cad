/**
 * A small Levenberg–Marquardt least-squares solver.
 *
 * The sketch constraint problem reduces to: find variable values that drive a
 * set of residual functions to zero. Each constraint contributes one or more
 * residuals (e.g. "distance(a,b) - L"). We minimize the sum of squares.
 *
 * The solver is generic and has no knowledge of sketches — geometry-specific
 * residuals are defined in constraints.ts. This keeps it swappable (e.g. for
 * PlaneGCS later) behind the same "values in, values out" contract.
 */

export type VarId = number;

export interface Constraint {
  /** Residual values; the solver drives these toward 0. */
  residuals(get: (id: VarId) => number): number[];
  /** Variable ids this constraint reads (used for a targeted Jacobian). */
  vars: VarId[];
}

export interface SolveOptions {
  maxIterations?: number;
  tolerance?: number; // stop when max residual below this
}

export interface SolveResult {
  ok: boolean;
  iterations: number;
  maxResidual: number;
}

/**
 * Solve in place: mutates `values` toward a configuration satisfying the
 * constraints. `locked[i] === true` pins values[i] (e.g. fixed points, or the
 * point currently being dragged), excluding it from the optimization.
 */
export function solve(
  values: number[],
  locked: boolean[],
  constraints: Constraint[],
  opts: SolveOptions = {}
): SolveResult {
  const maxIterations = opts.maxIterations ?? 100;
  const tolerance = opts.tolerance ?? 1e-7;

  // Map each free (unlocked) variable to a column index.
  const freeIndex: number[] = [];
  const colOf = new Map<VarId, number>();
  for (let i = 0; i < values.length; i++) {
    if (!locked[i]) {
      colOf.set(i, freeIndex.length);
      freeIndex.push(i);
    }
  }
  const n = freeIndex.length;
  const get = (id: VarId) => values[id];

  const allResiduals = (): number[] => {
    const r: number[] = [];
    for (const c of constraints) for (const v of c.residuals(get)) r.push(v);
    return r;
  };

  const maxAbs = (a: number[]) => a.reduce((m, v) => Math.max(m, Math.abs(v)), 0);

  let r = allResiduals();
  if (n === 0) return { ok: maxAbs(r) <= tolerance, iterations: 0, maxResidual: maxAbs(r) };

  let lambda = 1e-3;
  const EPS = 1e-6;

  for (let iter = 1; iter <= maxIterations; iter++) {
    const m = r.length;
    if (maxAbs(r) <= tolerance) {
      return { ok: true, iterations: iter - 1, maxResidual: maxAbs(r) };
    }

    // Numeric Jacobian J (m x n), perturbing only variables each constraint uses.
    const J: number[][] = Array.from({ length: m }, () => new Array(n).fill(0));
    let row = 0;
    for (const c of constraints) {
      const base = c.residuals(get);
      for (const vId of c.vars) {
        const col = colOf.get(vId);
        if (col === undefined) continue; // locked
        const old = values[vId];
        const h = EPS * (Math.abs(old) + 1);
        values[vId] = old + h;
        const pert = c.residuals(get);
        values[vId] = old;
        for (let k = 0; k < base.length; k++) {
          J[row + k][col] = (pert[k] - base[k]) / h;
        }
      }
      row += base.length;
    }

    // Normal equations: (JᵀJ + λ·diag) dx = -Jᵀr
    const JtJ: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
    const Jtr: number[] = new Array(n).fill(0);
    for (let i = 0; i < m; i++) {
      for (let a = 0; a < n; a++) {
        const Jia = J[i][a];
        if (Jia === 0) continue;
        Jtr[a] += Jia * r[i];
        for (let b = a; b < n; b++) JtJ[a][b] += Jia * J[i][b];
      }
    }
    for (let a = 0; a < n; a++) for (let b = 0; b < a; b++) JtJ[a][b] = JtJ[b][a];

    const prevCost = r.reduce((s, v) => s + v * v, 0);
    let applied = false;

    // LM damping loop: grow λ until the step reduces cost.
    for (let attempt = 0; attempt < 12; attempt++) {
      const A = JtJ.map((rowArr, a) => rowArr.map((val, b) => (a === b ? val + lambda * (val + 1e-9) : val)));
      const b = Jtr.map((v) => -v);
      const dx = solveLinear(A, b);
      if (!dx) {
        lambda *= 10;
        continue;
      }
      const trial = values.slice();
      for (let a = 0; a < n; a++) trial[freeIndex[a]] += dx[a];
      const trialR: number[] = [];
      const getTrial = (id: VarId) => trial[id];
      for (const c of constraints) for (const v of c.residuals(getTrial)) trialR.push(v);
      const trialCost = trialR.reduce((s, v) => s + v * v, 0);

      if (trialCost < prevCost) {
        for (let a = 0; a < n; a++) values[freeIndex[a]] = trial[freeIndex[a]];
        r = trialR;
        lambda = Math.max(lambda * 0.5, 1e-9);
        applied = true;
        break;
      }
      lambda *= 10;
    }

    if (!applied) {
      // Could not improve — stuck (likely over/under-constrained).
      return { ok: maxAbs(r) <= tolerance, iterations: iter, maxResidual: maxAbs(r) };
    }
  }

  return { ok: maxAbs(r) <= tolerance, iterations: maxIterations, maxResidual: maxAbs(r) };
}

/**
 * Remaining degrees of freedom = (free variables) − rank(constraint Jacobian).
 * 0 ⇒ fully constrained; >0 ⇒ under-defined; <0 should not happen (redundant
 * constraints inflate rank deficiency, so we clamp at 0 elsewhere).
 */
export function computeDof(values: number[], locked: boolean[], constraints: Constraint[]): number {
  const freeIndex: number[] = [];
  const colOf = new Map<VarId, number>();
  for (let i = 0; i < values.length; i++) {
    if (!locked[i]) {
      colOf.set(i, freeIndex.length);
      freeIndex.push(i);
    }
  }
  const n = freeIndex.length;
  if (n === 0) return 0;

  const get = (id: VarId) => values[id];
  const rows: number[][] = [];
  const EPS = 1e-6;
  for (const c of constraints) {
    const base = c.residuals(get);
    const block: number[][] = base.map(() => new Array(n).fill(0));
    for (const vId of c.vars) {
      const col = colOf.get(vId);
      if (col === undefined) continue;
      const old = values[vId];
      const h = EPS * (Math.abs(old) + 1);
      values[vId] = old + h;
      const pert = c.residuals(get);
      values[vId] = old;
      for (let k = 0; k < base.length; k++) block[k][col] = (pert[k] - base[k]) / h;
    }
    rows.push(...block);
  }

  return n - matrixRank(rows, n);
}

/** Numerical rank via Gaussian elimination with partial pivoting. */
function matrixRank(rows: number[][], cols: number): number {
  const M = rows.map((r) => r.slice());
  const m = M.length;
  let rank = 0;
  const tol = 1e-7;
  for (let col = 0; col < cols && rank < m; col++) {
    let pivot = -1;
    let max = tol;
    for (let r = rank; r < m; r++) {
      const v = Math.abs(M[r][col]);
      if (v > max) {
        max = v;
        pivot = r;
      }
    }
    if (pivot === -1) continue;
    [M[rank], M[pivot]] = [M[pivot], M[rank]];
    const pv = M[rank][col];
    for (let r = 0; r < m; r++) {
      if (r === rank) continue;
      const f = M[r][col] / pv;
      if (f === 0) continue;
      for (let c = col; c < cols; c++) M[r][c] -= f * M[rank][c];
    }
    rank++;
  }
  return rank;
}

/** Gaussian elimination with partial pivoting. Returns null if singular. */
function solveLinear(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    if (Math.abs(M[pivot][col]) < 1e-12) return null;
    [M[col], M[pivot]] = [M[pivot], M[col]];

    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col] / M[col][col];
      if (f === 0) continue;
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }

  const x = new Array(n);
  for (let i = 0; i < n; i++) x[i] = M[i][n] / M[i][i];
  return x;
}
