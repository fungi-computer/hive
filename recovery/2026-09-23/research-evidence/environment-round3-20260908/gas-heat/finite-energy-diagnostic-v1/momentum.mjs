// Derived staggered control volumes and conservative momentum transport.
// These are three component partitions of existing cell mass, never new air.
import { numericalGeometry } from './geometry-owner.mjs';
import { project } from './projection.mjs';
import { donorEnergy, bodyEnergy, pressureEnergy } from './energy-diagnostics.mjs';
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const cache = new WeakMap();
const key = (at) => at.join(',');
const product = (a) => a.reduce((n, x) => n * x, 1);
const flat = (at, size) => at.reduceRight((n, x, d) => n * size[d] + x, 0);
const coordinates = (index, size) => size.map((n) => { const x = index % n; index = Math.floor(index / n); return x; });
const freeze = (value) => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
export const MOMENTUM_LIMITS = Object.freeze({ courant: 0.45, dualMassAbsoluteKg: 1e-12, dualMassRelative: 5e-13 });

function cellAt(g, at) {
  at = [...at];
  for (let d = 0; d < g.dimensions; d++) {
    if (g.periodic[d]) at[d] = ((at[d] % g.size[d]) + g.size[d]) % g.size[d];
    if (at[d] < 0 || at[d] >= g.size[d]) return -1;
  }
  return flat(at, g.size);
}

function primalLookup(g) {
  const faces = g.axes.map(() => new Map());
  for (const f of g.faces) faces[f.axis].set(key(f.at), f.k);
  return (axis, input) => {
    const at = [...input];
    for (let d = 0; d < g.dimensions; d++) if (g.periodic[d]) at[d] = ((at[d] % g.size[d]) + g.size[d]) % g.size[d];
    return faces[axis].get(key(at)) ?? -1;
  };
}

function dualBounds(g, axis, at) {
  const centerM = [], widthsM = [];
  for (let a = 0; a < 3; a++) {
    const d = g.axes.indexOf(['x', 'y', 'z'][a]);
    if (d < 0) { centerM[a] = (g.origin[a] + 0.5) * g.metric.extrusion; widthsM[a] = g.metric.extrusion; continue; }
    let lo = at[d] - (d === axis ? 0.5 : 0), hi = at[d] + (d === axis ? 0.5 : 1);
    if (d === axis && !g.periodic[d]) { lo = Math.max(0, lo); hi = Math.min(g.size[d], hi); }
    centerM[a] = (g.origin[a] + (lo + hi) / 2) * g.metric.spacing[d];
    widthsM[a] = (hi - lo) * g.metric.spacing[d];
  }
  return { centerM, widthsM };
}

function makeNodes(g, faceAt) {
  const nodes = [], families = [];
  for (let axis = 0; axis < g.dimensions; axis++) {
    const size = g.size.map((n, d) => n + (d === axis && !g.periodic[d] ? 1 : 0)), lookup = new Map();
    for (let index = 0; index < product(size); index++) {
      const at = coordinates(index, size), left = [...at]; left[axis]--;
      const cells = [cellAt(g, left), cellAt(g, at)].filter((i) => i >= 0);
      const face = faceAt(axis, at), k = nodes.length;
      const bounds = dualBounds(g, axis, at);
      nodes.push({ k, axis, worldAxis: g.axes[axis], at, face, fixed: face < 0,
        cells, volumeM3: cells.length * g.volume / 2, ...bounds });
      lookup.set(key(at), k);
    }
    families.push({ size, lookup });
  }
  return { nodes, families };
}

function mappedPrimalFaces(g, node, normal, faceAt) {
  if (normal === node.axis) {
    const right = [...node.at]; right[normal]++;
    return [faceAt(normal, node.at), faceAt(normal, right)].filter((i) => i >= 0);
  }
  const right = [...node.at]; right[normal]++;
  const left = [...right]; left[node.axis]--;
  return [faceAt(normal, left), faceAt(normal, right)].filter((i) => i >= 0);
}

export function momentumGeometry(input) {
  const g = numericalGeometry(input);
  if (cache.has(g)) return cache.get(g);
  assert(g.fluid.every((x) => x === 1) && g.walls.length === 0 && g.open.length === 0,
    'finite momentum requires a full periodic/sealed rectangular box');
  const faceAt = primalLookup(g), { nodes, families } = makeNodes(g, faceAt), interfaces = [];
  for (const node of nodes) for (let d = 0; d < g.dimensions; d++) {
    const at = [...node.at]; at[d]++;
    if (at[d] >= families[node.axis].size[d]) {
      if (!g.periodic[d]) continue;
      at[d] = 0;
    }
    const neighbor = families[node.axis].lookup.get(key(at));
    assert(neighbor !== undefined, 'dual neighboring control volume');
    interfaces.push({ k: interfaces.length, axis: node.axis, normal: d, i: node.k, j: neighbor,
      primalFaces: mappedPrimalFaces(g, node, d, faceAt) });
  }
  const faceNode = Array(g.faces.length).fill(-1);
  for (const node of nodes) if (!node.fixed) {
    assert(faceNode[node.face] === -1, 'unique active dual face'); faceNode[node.face] = node.k;
  }
  assert(faceNode.every((i) => i >= 0), 'all physical faces own momentum');
  const derived = freeze({ geometryIdentity: g.identity, dimensions: g.dimensions, nodes, interfaces, faceNode });
  cache.set(g, derived); return derived;
}

export function dualMasses(input, cellMassKg) {
  const d = momentumGeometry(input);
  return Float64Array.from(d.nodes, (node) => node.cells.reduce((m, i) => m + cellMassKg[i] / 2, 0));
}

export function dualTransfers(input, primalMassTransferKg) {
  const d = momentumGeometry(input);
  return Float64Array.from(d.interfaces, (face) => face.primalFaces.reduce((m, i) => m + primalMassTransferKg[i] / 2, 0));
}

export function velocityFromMomentum(input, cellMassKg, faceMomentumKgMS) {
  const d = momentumGeometry(input), mass = dualMasses(input, cellMassKg);
  return Float64Array.from(d.faceNode, (i, f) => faceMomentumKgMS[f] / mass[i]);
}

export function totalMomentum(input, faceMomentumKgMS) {
  const g = numericalGeometry(input), out = Array(g.dimensions).fill(0);
  for (const f of g.faces) out[f.axis] += faceMomentumKgMS[f.k];
  return out;
}

export function kineticEnergy(input, cellMassKg, faceMomentumKgMS) {
  const d = momentumGeometry(input), mass = dualMasses(input, cellMassKg); let total = 0;
  for (const f of d.faceNode.keys()) total += faceMomentumKgMS[f] ** 2 / (2 * mass[d.faceNode[f]]);
  return total;
}

function dualKinetic(mass, momentum) {
  return momentum.reduce((total, p, i) => total + p * p / (2 * mass[i]), 0);
}

function checkDualMass(d, before, after, transfer) {
  const fromReceipts = Float64Array.from(before), outgoing = new Float64Array(before.length);
  for (const face of d.interfaces) {
    const dm = transfer[face.k]; fromReceipts[face.i] -= dm; fromReceipts[face.j] += dm;
    outgoing[face.i] += Math.max(dm, 0); outgoing[face.j] += Math.max(-dm, 0);
  }
  let residualKg = 0, courant = 0;
  for (const node of d.nodes) {
    const error = Math.abs(fromReceipts[node.k] - after[node.k]);
    assert(error <= MOMENTUM_LIMITS.dualMassAbsoluteKg + MOMENTUM_LIMITS.dualMassRelative * before[node.k], 'dual mass flux identity');
    assert(Number.isFinite(after[node.k]) && after[node.k] > 0, 'positive derived dual mass');
    residualKg = Math.max(residualKg, error); courant = Math.max(courant, outgoing[node.k] / before[node.k]);
  }
  return { residualKg, courant };
}

export function transportMomentum(input, beforeMass, afterMass, faceMomentum, primalMassTransfer, dt, acceleration) {
  const d = momentumGeometry(input), before = dualMasses(input, beforeMass), after = dualMasses(input, afterMass);
  assert(acceleration.length === d.nodes.length && acceleration.every(Number.isFinite), 'finite dual-volume acceleration');
  const transferredMass = dualTransfers(input, primalMassTransfer), checked = checkDualMass(d, before, after, transferredMass);
  if (checked.courant > MOMENTUM_LIMITS.courant) return null;
  const momentum = Float64Array.from(d.nodes, (node) => node.fixed ? 0 : faceMomentum[node.face]);
  const velocity = Float64Array.from(momentum, (p, i) => p / before[i]), initialK = dualKinetic(before, momentum);
  const oldMomentumDiagnostic = Float64Array.from(momentum);
  const momentumTransfer = new Float64Array(d.interfaces.length), bodyImpulse = new Float64Array(d.nodes.length), wallImpulse = new Float64Array(d.nodes.length);
  for (const face of d.interfaces) {
    const dm = transferredMass[face.k], donor = dm >= 0 ? face.i : face.j, dp = dm * velocity[donor];
    momentumTransfer[face.k] = dp; momentum[face.i] -= dp; momentum[face.j] += dp;
  }
  const advectedK = dualKinetic(after, momentum);
  const advectedMomentumDiagnostic = Float64Array.from(momentum);
  const donorDiagnostic = donorEnergy(d, before, after, oldMomentumDiagnostic, velocity, momentum, transferredMass, advectedK - initialK);
  for (const node of d.nodes) { const dp = dt * before[node.k] * acceleration[node.k]; assert(Number.isFinite(dp), 'finite body impulse'); bodyImpulse[node.k] = dp; momentum[node.k] += dp; }
  const forcedK = dualKinetic(after, momentum);
  const bodyDiagnostic = bodyEnergy(d, after, velocity, advectedMomentumDiagnostic, bodyImpulse, momentum, forcedK - advectedK);
  for (const node of d.nodes) if (node.fixed) { wallImpulse[node.k] = -momentum[node.k]; momentum[node.k] = 0; }
  const constrainedK = dualKinetic(after, momentum);
  const active = Float64Array.from(d.faceNode, (i) => momentum[i]);
  assert(active.every(Number.isFinite) && momentumTransfer.every(Number.isFinite) && wallImpulse.every(Number.isFinite), 'finite transported momentum/impulses');
  return { momentum: Array.from(active), energyDiagnostic: { donor: donorDiagnostic, body: bodyDiagnostic,
    wallKChangeJ: constrainedK - forcedK, wallResidualJ: constrainedK - forcedK + bodyDiagnostic.wallRemovalNormJ }, receipt: {
    dualMassTransferKg: Array.from(transferredMass), momentumTransferKgMS: Array.from(momentumTransfer),
    bodyImpulseKgMS: Array.from(bodyImpulse), wallImpulseKgMS: Array.from(wallImpulse),
    dualMassResidualKg: checked.residualKg, dualCourant: checked.courant,
    advectionKChangeJ: advectedK - initialK, bodyKChangeJ: forcedK - advectedK, wallConstraintKChangeJ: constrainedK - forcedK,
  } };
}

export function projectMomentum(input, cellMass, faceMomentum, target) {
  const g = numericalGeometry(input), d = momentumGeometry(g), mass = dualMasses(g, cellMass);
  const velocity = velocityFromMomentum(g, cellMass, faceMomentum);
  const beta = Float64Array.from(d.faceNode, (i) => d.nodes[i].volumeM3 / mass[i]);
  const result = project(g, velocity, { targetVolumeFlux: target, faceCoefficient: beta });
  // The shared projection owns reusable scratch. Copy every retained numerical
  // output now, before the next RK stage or endpoint correction can overwrite it.
  const correctedVelocity = Array.from(result.velocity), potential = Array.from(result.potential);
  const momentum = correctedVelocity.map((u, f) => u * mass[d.faceNode[f]]);
  const impulse = momentum.map((p, f) => p - faceMomentum[f]);
  const energyDiagnostic = pressureEnergy(g, d, mass, correctedVelocity, impulse, potential, target,
    kineticEnergy(g, cellMass, momentum) - kineticEnergy(g, cellMass, faceMomentum));
  return { momentum, energyDiagnostic, receipt: { velocity: correctedVelocity, potentialPaS: potential,
    pressureImpulseKgMS: impulse, coefficient: Array.from(beta), targetVolumeFlux: Array.from(target),
    pressureKChangeJ: kineticEnergy(g, cellMass, momentum) - kineticEnergy(g, cellMass, faceMomentum),
    constraintError: result.constraintError, linearResidual: result.linearResidual, iterations: result.iterations } };
}
