import { requireCondition } from './soil.mjs';

// Adjacent-row partial pivoting for a tridiagonal Newton matrix. Pivoting adds
// one second superdiagonal, preserving O(N) work and avoiding an SPD claim for
// the full conductivity derivative Jacobian.
export function solveTridiagonal(lower, diagonal, upper, rhs) {
  const n = diagonal.length, dl = [...lower], d = [...diagonal], du = [...upper], b = [...rhs];
  const du2 = Array(Math.max(0, n - 2)).fill(0);
  for (let i = 0; i < n - 1; i++) {
    if (Math.abs(d[i]) >= Math.abs(dl[i])) {
      requireCondition(d[i] !== 0 && Number.isFinite(d[i]), 'singular Newton pressure system');
      const factor = dl[i] / d[i];
      d[i + 1] -= factor * du[i]; b[i + 1] -= factor * b[i];
    } else {
      const factor = d[i] / dl[i], oldNext = d[i + 1], oldRhs = b[i];
      d[i] = dl[i]; d[i + 1] = du[i] - factor * oldNext;
      du[i] = oldNext; b[i] = b[i + 1]; b[i + 1] = oldRhs - factor * b[i + 1];
      if (i < n - 2) { du2[i] = du[i + 1]; du[i + 1] = -factor * du[i + 1]; }
    }
  }
  const x = Array(n);
  for (let i = n - 1; i >= 0; i--) {
    requireCondition(Number.isFinite(d[i]) && d[i] !== 0, 'singular Newton pressure system');
    x[i] = (b[i] - (i + 1 < n ? du[i] * x[i + 1] : 0) -
      (i + 2 < n ? du2[i] * x[i + 2] : 0)) / d[i];
    requireCondition(Number.isFinite(x[i]), 'nonfinite Newton direction');
  }
  return x;
}
