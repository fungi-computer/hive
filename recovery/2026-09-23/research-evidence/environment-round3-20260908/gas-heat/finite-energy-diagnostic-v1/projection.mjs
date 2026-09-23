// Shared integrated-flux projection. With beta=1/rho, phi is pressure impulse
// [Pa s]: dt is absorbed into phi, not silently omitted from a pressure gradient.
import { numericalGeometry } from './geometry-owner.mjs';
const assert = (ok, message) => { if (!ok) throw new Error(message); };
export const PROJECTION_LIMITS = Object.freeze({ linearResidual: 1e-13, fluxResidual: 1e-10, compatibility: 1e-12 });
const cache = new WeakMap();
const maxAbs = (a) => a.reduce((m, x) => Math.max(m, Math.abs(x)), 0);

export function integratedDivergence(g, velocity, out) {
  g = numericalGeometry(g); out ??= new Float64Array(g.n);
  out.fill(0);
  for (const f of g.faces) {
    const flux = velocity[f.k] * f.area;
    if (f.i >= 0) out[f.i] += flux;
    if (f.j >= 0) out[f.j] -= flux;
  }
  return out;
}

function faceConnectivity(g) {
  const adjacency = Array.from({ length: g.n }, () => []), exterior = new Set();
  for (const f of g.faces) {
    if (f.i >= 0 && f.j >= 0) { adjacency[f.i].push(f.j); adjacency[f.j].push(f.i); }
    else exterior.add(Math.max(f.i, f.j));
  }
  return { adjacency, exterior };
}

function traceComponent(seed, adjacency, exterior, visited) {
  const pending = [seed], cells = []; let open = false;
  while (pending.length) {
    const at = pending.pop(); if (visited.has(at)) continue;
    visited.add(at); cells.push(at); open ||= exterior.has(at); pending.push(...adjacency[at]);
  }
  return Object.freeze({ cells: Object.freeze(cells), open });
}

function connectedComponents(g) {
  const { adjacency, exterior } = faceConnectivity(g), visited = new Set(), components = [];
  for (let i = 0; i < g.n; i++) {
    if (!g.fluid[i] || visited.has(i)) continue;
    const component = traceComponent(i, adjacency, exterior, visited);
    assert(component.cells.filter((at) => g.fixed[at]).length === (component.open ? 0 : 1), 'geometry pressure pins match component');
    components.push(component);
  }
  return Object.freeze(components);
}

function workspace(g) {
  if (cache.has(g)) return cache.get(g);
  const components = connectedComponents(g);
  const cell = () => new Float64Array(g.n), face = () => new Float64Array(g.faces.length);
  const w = { components, diagonal: cell(), weight: face(), beta: face(),
    target: cell(), rhs: cell(), phi: cell(), r: cell(), z: cell(), p: cell(), ap: cell(), velocity: face(),
    topologyBuilds: 1, coefficientBuilds: 0, pressureSolves: 0, iterations: 0, matrixProducts: 0 };
  cache.set(g, w); return w;
}

export function projectionTopology(g) { return workspace(numericalGeometry(g)).components; }
export function projectionDiagnostics(g) {
  const w = workspace(numericalGeometry(g));
  return { topologyBuilds: w.topologyBuilds, coefficientBuilds: w.coefficientBuilds,
    pressureSolves: w.pressureSolves, iterations: w.iterations, matrixProducts: w.matrixProducts,
    workspaceBytes: Object.values(w).reduce((n, v) => n + (v?.byteLength ?? 0), 0) };
}

function validateProjectionInput(g, predicted, targetVolumeFlux, faceCoefficient) {
  assert(predicted.length === g.faces.length && predicted.every(Number.isFinite), 'finite predicted face velocity');
  assert(targetVolumeFlux === undefined || (targetVolumeFlux?.length === g.n && targetVolumeFlux.every(Number.isFinite)), 'finite target flux shape');
  assert(faceCoefficient === undefined || (faceCoefficient?.length === g.faces.length && faceCoefficient.every((b) => Number.isFinite(b) && b > 0)), 'positive face coefficients');
}

function admitFluxTarget(g, w, predicted, targetVolumeFlux, faceCoefficient) {
  if (targetVolumeFlux) w.target.set(targetVolumeFlux); else w.target.fill(0);
  if (faceCoefficient) w.beta.set(faceCoefficient); else w.beta.fill(1);
  for (let i = 0; i < g.n; i++) assert(g.fluid[i] || w.target[i] === 0, 'solid cell has no target gas flux');
  integratedDivergence(g, predicted, w.rhs);
  for (const component of w.components) {
    if (component.open) continue;
    let residual = 0, scale = 0;
    for (const i of component.cells) { residual += w.target[i] - w.rhs[i]; scale += Math.abs(w.target[i]) + Math.abs(w.rhs[i]); }
    assert(Math.abs(residual) <= PROJECTION_LIMITS.compatibility * Math.max(1, scale), 'incompatible sealed component target');
  }
}

function buildNumericCoefficients(g, w) {
  // Rebuild at EVERY solve/RK stage. Only topology is reusable across density changes.
  w.diagonal.fill(0);
  for (const f of g.faces) {
    const k = w.beta[f.k] * f.area / f.distance;
    assert(Number.isFinite(k) && k > 0, 'representable pressure face coefficient');
    w.weight[f.k] = k;
    if (f.i >= 0) w.diagonal[f.i] += k;
    if (f.j >= 0) w.diagonal[f.j] += k;
  }
  w.coefficientBuilds++;
}

function matrix(g, w, x, out) {
  for (let i = 0; i < g.n; i++) out[i] = w.diagonal[i] * x[i];
  for (const f of g.faces) {
    if (f.i < 0 || f.j < 0 || g.fixed[f.i] || g.fixed[f.j]) continue;
    const k = w.weight[f.k]; out[f.i] -= k * x[f.j]; out[f.j] -= k * x[f.i];
  }
}

function initialResidual(g, w) {
  let rz = 0;
  for (let i = 0; i < g.n; i++) {
    if (g.fixed[i]) w.diagonal[i] = 1;
    assert(Number.isFinite(w.diagonal[i]) && w.diagonal[i] > 0, 'positive pressure diagonal');
    w.rhs[i] = g.fixed[i] ? 0 : w.target[i] - w.rhs[i];
    w.phi[i] = 0; w.r[i] = w.rhs[i]; w.z[i] = w.r[i] / w.diagonal[i]; w.p[i] = w.z[i]; rz += w.r[i] * w.z[i];
  }
  return rz;
}

function solvePCG(g, w) {
  let rz = initialResidual(g, w), iterations = 0;
  while (maxAbs(w.r) > PROJECTION_LIMITS.linearResidual) {
    assert(iterations < 6 * g.n + 100, 'projection iteration budget');
    matrix(g, w, w.p, w.ap); w.matrixProducts++;
    let pap = 0; for (let i = 0; i < g.n; i++) pap += w.p[i] * w.ap[i];
    assert(Number.isFinite(pap) && pap > 0, 'positive pressure operator');
    const alpha = rz / pap; let nextRz = 0;
    for (let i = 0; i < g.n; i++) {
      w.phi[i] += alpha * w.p[i]; w.r[i] -= alpha * w.ap[i]; w.z[i] = w.r[i] / w.diagonal[i]; nextRz += w.r[i] * w.z[i];
    }
    const beta = rz ? nextRz / rz : 0;
    for (let i = 0; i < g.n; i++) w.p[i] = w.z[i] + beta * w.p[i];
    rz = nextRz; iterations++;
  }
  return { iterations, linearResidual: maxAbs(w.r) };
}

function correctAndCheckFlux(g, w, predicted) {
  for (const f of g.faces) w.velocity[f.k] = predicted[f.k] + w.beta[f.k] *
    ((f.i >= 0 ? w.phi[f.i] : 0) - (f.j >= 0 ? w.phi[f.j] : 0)) / f.distance;
  assert(w.velocity.every(Number.isFinite) && w.phi.every(Number.isFinite), 'finite projection result');
  integratedDivergence(g, w.velocity, w.rhs);
  let constraintError = 0;
  for (let i = 0; i < g.n; i++) constraintError = Math.max(constraintError, Math.abs(w.rhs[i] - w.target[i]));
  assert(constraintError <= PROJECTION_LIMITS.fluxResidual, 'all-cell projection residual including gauge pin');
  return constraintError;
}

export function project(g, predicted, { targetVolumeFlux, faceCoefficient } = {}) {
  g = numericalGeometry(g);
  validateProjectionInput(g, predicted, targetVolumeFlux, faceCoefficient);
  const w = workspace(g);
  admitFluxTarget(g, w, predicted, targetVolumeFlux, faceCoefficient);
  buildNumericCoefficients(g, w);
  const { iterations, linearResidual } = solvePCG(g, w);
  const constraintError = correctAndCheckFlux(g, w, predicted);
  w.pressureSolves++; w.iterations += iterations;
  return { velocity: w.velocity, potential: w.phi, iterations, linearResidual,
    constraintError, divergence: constraintError };
}
