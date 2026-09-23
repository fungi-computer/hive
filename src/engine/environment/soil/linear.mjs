import { requireCondition } from './soil.mjs';
import { REGION_LIMITS } from './geometry.mjs';
import { NUMERICS, maxAbs } from './state.mjs';

function assemble(g, evaluation, dtS, work) {
  const n = g.nodes.length, matrix = new Float64Array(n * n), rhs = Float64Array.from(evaluation.residualKg, r => -r);
  for (let i = 0; i < n; i++) matrix[i * n + i] = evaluation.capacityKgPerM[i];
  for (const [k, face] of g.faces.entries()) {
    const left = g.densityKgM3 * dtS * evaluation.derivativeLeftM2S[k];
    const right = g.densityKgM3 * dtS * evaluation.derivativeRightM2S[k];
    matrix[face.left * n + face.left] += left; matrix[face.left * n + face.right] += right;
    matrix[face.right * n + face.left] -= left; matrix[face.right * n + face.right] -= right;
    work.matrixAssemblyAdds += 4;
  }
  work.matrixBuilds++; work.peakDenseBytes = Math.max(work.peakDenseBytes, matrix.byteLength);
  return { matrix, rhs, n };
}

function pivotRow(matrix, rhs, n, k, work) {
  let pivot = k;
  for (let row = k + 1; row < n; row++) {
    work.pivotComparisons++;
    if (Math.abs(matrix[row * n + k]) > Math.abs(matrix[pivot * n + k])) pivot = row;
  }
  requireCondition(Number.isFinite(matrix[pivot * n + k]) && matrix[pivot * n + k] !== 0,
    'singular/nonfinite physical Newton matrix; no diagonal regularization');
  if (pivot === k) return;
  for (let col = 0; col < n; col++) {
    const old = matrix[k * n + col]; matrix[k * n + col] = matrix[pivot * n + col]; matrix[pivot * n + col] = old;
    work.matrixSwapEntries++;
  }
  const old = rhs[k]; rhs[k] = rhs[pivot]; rhs[pivot] = old;
}

function eliminate(matrix, rhs, n, k, work) {
  for (let row = k + 1; row < n; row++) {
    const factor = matrix[row * n + k] / matrix[k * n + k];
    matrix[row * n + k] = factor; work.factorDivisions++;
    for (let col = k + 1; col < n; col++) {
      requireCondition(work.matrixUpdates < work.matrixUpdateLimit, 'request dense elimination work budget');
      matrix[row * n + col] -= factor * matrix[k * n + col]; work.matrixUpdates++;
    }
    rhs[row] -= factor * rhs[k]; work.rhsUpdates++;
  }
}

function substitute(matrix, rhs, n, work) {
  const direction = new Float64Array(n);
  for (let row = n - 1; row >= 0; row--) {
    let value = rhs[row];
    for (let col = row + 1; col < n; col++) {
      value -= matrix[row * n + col] * direction[col]; work.backSubProducts++;
    }
    direction[row] = value / matrix[row * n + row]; work.backSubDivisions++;
  }
  requireCondition(direction.every(Number.isFinite), 'finite pivoted Newton direction');
  return direction;
}

function residualOfDirection(g, evaluation, dtS, direction) {
  const result = Float64Array.from(evaluation.residualKg, (r, i) => r + evaluation.capacityKgPerM[i] * direction[i]);
  for (const [k, face] of g.faces.entries()) {
    const change = g.densityKgM3 * dtS * (evaluation.derivativeLeftM2S[k] * direction[face.left] +
      evaluation.derivativeRightM2S[k] * direction[face.right]);
    result[face.left] += change; result[face.right] -= change;
  }
  return maxAbs(result);
}

export function solveNewtonDirection(g, evaluation, dtS, work) {
  requireCondition(g.nodes.length <= REGION_LIMITS.maxUnknowns, 'bounded dense Newton unknowns');
  const { matrix, rhs, n } = assemble(g, evaluation, dtS, work);
  for (let k = 0; k < n; k++) { pivotRow(matrix, rhs, n, k, work); eliminate(matrix, rhs, n, k, work); }
  const direction = substitute(matrix, rhs, n, work);
  // Reuse original physical coefficients, not an unreported second dense copy.
  const residual = residualOfDirection(g, evaluation, dtS, direction);
  work.maxLinearResidualKg = Math.max(work.maxLinearResidualKg, residual);
  requireCondition(residual <= NUMERICS.linearKg + 64 * Number.EPSILON * Math.max(1, maxAbs(evaluation.residualKg)),
    'full nonsymmetric Newton direction fails original physical Jacobian residual');
  return direction;
}
