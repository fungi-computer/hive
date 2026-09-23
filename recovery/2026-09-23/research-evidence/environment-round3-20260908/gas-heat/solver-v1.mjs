/** Isolated two-dimensional low-speed MAC reference. SI units throughout.
 * Geometry/cache are immutable derived data; velocities, heat, tracer and ledgers
 * are canonical. No game clock, worker framework, package dependency or I/O.
 */
export const RHO = 1.2, CP = 1005, TREF = 293.15, GRAVITY = 9.81;
const assert = (ok, text) => { if (!ok) throw new Error(text); };
const maxAbs = a => a.reduce((m, x) => Math.max(m, Math.abs(x)), 0);
const sum = a => a.reduce((s, x) => s + x, 0);

export function geometry({ nx, nz, dx, depth = 2, periodicX = false,
  periodicZ = false, open = [], solid = [], viscosity = 1.5e-5,
  thermalDiffusivity = 2.2e-5, tracerDiffusivity = 1e-5,
  buoyancy = true, revision = 0 }) {
  assert(nx > 1 && nz > 1 && dx > 0 && depth > 0, 'positive grid');
  const n = nx * nz, solidSet = new Set(solid), openings = new Set(open);
  const fluid = Int8Array.from({ length: n }, (_, i) => !solidSet.has(i));
  const ui = new Int32Array((nx + 1) * nz).fill(-1);
  const vi = new Int32Array(nx * (nz + 1)).fill(-1);
  const cells = [];
  for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) {
    const i = z * nx + x;
    cells.push({ i, x: (x + .5) * dx, z: (z + .5) * dx, fluid: !!fluid[i] });
  }
  const faces = [], area = depth * dx, volume = depth * dx * dx;
  function face(axis, x, z, i, j, boundary) {
    const k = faces.length;
    faces.push({ k, id: `${axis}:${x}:${z}`, axis, x, z, i, j,
      area, distance: boundary ? dx / 2 : dx, boundary });
    return k;
  }
  for (let z = 0; z < nz; z++) for (let x = 0; x <= nx; x++) {
    if (periodicX && x === nx) { ui[z * (nx + 1) + x] = ui[z * (nx + 1)]; continue; }
    const i = x > 0 ? z * nx + x - 1 : periodicX ? z * nx + nx - 1 : -1;
    const j = x < nx ? z * nx + x : -1;
    const boundary = i < 0 ? 'left' : j < 0 ? 'right' : null;
    if ((i >= 0 && !fluid[i]) || (j >= 0 && !fluid[j])) continue;
    if (boundary && !openings.has(boundary)) continue;
    ui[z * (nx + 1) + x] = face('u', x, z, i, j, boundary);
  }
  for (let z = 0; z <= nz; z++) for (let x = 0; x < nx; x++) {
    if (periodicZ && z === nz) { vi[z * nx + x] = vi[x]; continue; }
    const i = z > 0 ? (z - 1) * nx + x : periodicZ ? (nz - 1) * nx + x : -1;
    const j = z < nz ? z * nx + x : -1;
    const boundary = i < 0 ? 'bottom' : j < 0 ? 'top' : null;
    if ((i >= 0 && !fluid[i]) || (j >= 0 && !fluid[j])) continue;
    if (boundary && !openings.has(boundary)) continue;
    vi[z * nx + x] = face('v', x, z, i, j, boundary);
  }
  const adjacency = Array.from({ length: n }, () => []), external = new Set();
  for (const f of faces) {
    if (f.i >= 0 && f.j >= 0) { adjacency[f.i].push(f.j); adjacency[f.j].push(f.i); }
    else external.add(Math.max(f.i, f.j));
  }
  const seen = new Set(), pins = new Set();
  for (let i = 0; i < n; i++) {
    if (!fluid[i] || seen.has(i)) continue;
    const stack = [i], component = []; let hasOutside = false;
    while (stack.length) {
      const j = stack.pop(); if (seen.has(j)) continue;
      seen.add(j); component.push(j); hasOutside ||= external.has(j);
      stack.push(...adjacency[j]);
    }
    if (!hasOutside) pins.add(Math.min(...component));
  }
  const diagonal = new Float64Array(n);
  for (const f of faces) {
    const k = f.area / f.distance;
    if (f.i >= 0) diagonal[f.i] += k;
    if (f.j >= 0) diagonal[f.j] += k;
  }
  const fixed = Int8Array.from({ length: n }, (_, i) => !fluid[i] || pins.has(i));
  for (let i = 0; i < n; i++) if (fixed[i]) diagonal[i] = 1;
  const g = { version: 'mac-boussinesq-2d-v1', nx, nz, dx, depth, n, volume,
    periodicX, periodicZ, open: [...openings], solid: [...solidSet].sort((a,b)=>a-b),
    viscosity, thermalDiffusivity, tracerDiffusivity, buoyancy, revision,
    fluid, cells, faces, ui, vi, fixed, diagonal };
  g.workspace = workspace(g);
  return g;
}

function workspace(g) {
  const cell = () => new Float64Array(g.n), face = () => new Float64Array(g.faces.length);
  return { rhs: cell(), phi: cell(), r: cell(), z: cell(), p: cell(), ap: cell(),
    predicted: face(), projected: face(), deltaSmoke: cell(), deltaHeat: cell(),
    outgoing: cell(), faceSmoke: face(), faceHeat: face(),
    pressureSolves: 0, iterations: 0, matrixProducts: 0, operatorBuilds: 1 };
}

export function initial(g, temperature = 0) {
  return { version: g.version, geometryRevision: g.revision, time: 0, steps: 0,
    velocity: Array(g.faces.length).fill(0), smoke: Array(g.n).fill(0),
    heat: g.cells.map(c => c.fluid ? RHO * CP * g.volume * temperature : 0),
    smokeSource: 0, heatSource: 0, smokeBoundary: 0, heatBoundary: 0,
    airImport: 0, airExport: 0 };
}

function matrix(g, x, out) {
  for (let i = 0; i < g.n; i++) out[i] = g.diagonal[i] * x[i];
  for (const f of g.faces) {
    if (f.i < 0 || f.j < 0 || g.fixed[f.i] || g.fixed[f.j]) continue;
    const k = f.area / f.distance;
    out[f.i] -= k * x[f.j]; out[f.j] -= k * x[f.i];
  }
}

export function divergence(g, velocity, out = new Float64Array(g.n)) {
  out.fill(0);
  for (const f of g.faces) {
    const q = velocity[f.k] * f.area;
    if (f.i >= 0) out[f.i] += q;
    if (f.j >= 0) out[f.j] -= q;
  }
  return out;
}

/** Solve a velocity potential, not pressure as canonical state. A cold derived
 * solve has no hidden history dependence; cached geometry contains no pressure.
 */
export function project(g, velocity, tolerance = 1e-11) {
  const w = g.workspace;
  divergence(g, velocity, w.rhs);
  let rz = 0;
  for (let i = 0; i < g.n; i++) {
    w.rhs[i] = g.fixed[i] ? 0 : -w.rhs[i]; w.phi[i] = 0;
    w.r[i] = w.rhs[i]; w.z[i] = w.r[i] / g.diagonal[i];
    w.p[i] = w.z[i]; rz += w.r[i] * w.z[i];
  }
  let iterations = 0;
  while (maxAbs(w.r) > tolerance) {
    assert(iterations < 6 * g.n + 100, 'projection convergence');
    matrix(g, w.p, w.ap); w.matrixProducts++;
    let pap = 0;
    for (let i = 0; i < g.n; i++) pap += w.p[i] * w.ap[i];
    assert(pap > 0 && Number.isFinite(pap), 'positive pressure operator');
    const alpha = rz / pap;
    let nextRz = 0;
    for (let i = 0; i < g.n; i++) {
      w.phi[i] += alpha * w.p[i]; w.r[i] -= alpha * w.ap[i];
      w.z[i] = w.r[i] / g.diagonal[i]; nextRz += w.r[i] * w.z[i];
    }
    const beta = rz ? nextRz / rz : 0;
    for (let i = 0; i < g.n; i++) w.p[i] = w.z[i] + beta * w.p[i];
    rz = nextRz; iterations++;
  }
  for (const f of g.faces) w.projected[f.k] = velocity[f.k] +
    ((f.i >= 0 ? w.phi[f.i] : 0) - (f.j >= 0 ? w.phi[f.j] : 0)) / f.distance;
  w.pressureSolves++; w.iterations += iterations;
  const error = maxAbs(divergence(g, w.projected, w.rhs));
  assert(error < 1e-8, `projection residual ${error}`);
  return { velocity: w.projected, iterations, divergence: error };
}

function faceIndex(g, axis, x, z) {
  if (g.periodicX) x = ((x % g.nx) + g.nx) % g.nx;
  if (g.periodicZ) z = ((z % g.nz) + g.nz) % g.nz;
  if (axis === 'u') return x < 0 || x > g.nx || z < 0 || z >= g.nz ? -1 : g.ui[z * (g.nx + 1) + x];
  return x < 0 || x >= g.nx || z < 0 || z > g.nz ? -1 : g.vi[z * g.nx + x];
}

function outsideOpen(g, axis, x, z) {
  return (x < 0 && g.open.includes('left')) ||
    (x > g.nx - (axis === 'v' ? 1 : 0) && g.open.includes('right')) ||
    (z < 0 && g.open.includes('bottom')) ||
    (z > g.nz - (axis === 'u' ? 1 : 0) && g.open.includes('top'));
}

function value(g, velocity, axis, x, z) {
  const k = faceIndex(g, axis, x, z); return k < 0 ? 0 : velocity[k];
}

function neighbor(g, velocity, f, ox, oz) {
  const x = f.x + ox, z = f.z + oz, k = faceIndex(g, f.axis, x, z);
  if (k >= 0) return velocity[k];
  const center = velocity[f.k];
  if (outsideOpen(g, f.axis, x, z)) return center; // ambient far edge: zero normal derivative
  const tangential = f.axis === 'u' ? oz !== 0 : ox !== 0;
  return tangential ? -center : 0; // no-slip half-cell wall / exact normal wall face
}

export function predict(g, state, dt, forcing = {}) {
  const velocity = state.velocity, out = g.workspace.predicted;
  const forceX = forcing.accelerationX ?? 0, forceZ = forcing.accelerationZ ?? 0;
  for (const f of g.faces) {
    const c = velocity[f.k], left = neighbor(g, velocity, f, -1, 0),
      right = neighbor(g, velocity, f, 1, 0), down = neighbor(g, velocity, f, 0, -1),
      up = neighbor(g, velocity, f, 0, 1);
    const cross = f.axis === 'u' ? (
      value(g, velocity, 'v', f.x - 1, f.z) + value(g, velocity, 'v', f.x, f.z) +
      value(g, velocity, 'v', f.x - 1, f.z + 1) + value(g, velocity, 'v', f.x, f.z + 1)) / 4 : (
      value(g, velocity, 'u', f.x, f.z - 1) + value(g, velocity, 'u', f.x + 1, f.z - 1) +
      value(g, velocity, 'u', f.x, f.z) + value(g, velocity, 'u', f.x + 1, f.z)) / 4;
    const ux = f.axis === 'u' ? c : cross, uz = f.axis === 'u' ? cross : c;
    const advection = ux * (ux >= 0 ? c - left : right - c) / g.dx +
      uz * (uz >= 0 ? c - down : up - c) / g.dx;
    const diffusion = g.viscosity * (left + right + down + up - 4 * c) / (g.dx * g.dx);
    let acceleration = f.axis === 'u' ? forceX : forceZ;
    if (f.axis === 'v' && g.buoyancy) {
      const ti = f.i >= 0 ? state.heat[f.i] / (RHO * CP * g.volume) : 0;
      const tj = f.j >= 0 ? state.heat[f.j] / (RHO * CP * g.volume) : 0;
      acceleration += GRAVITY * (ti + tj) / (2 * TREF);
    }
    out[f.k] = c + dt * (-advection + diffusion + acceleration);
  }
  return out;
}

/** One conservative scalar update using the projected carrier on all faces.
 * Returns null if aggregate outgoing advection+diffusion would violate bounds.
 */
export function transport(g, state, velocity, dt, forcing = {}) {
  const w = g.workspace;
  w.outgoing.fill(0); w.deltaSmoke.fill(0); w.deltaHeat.fill(0);
  const maxD = Math.max(g.tracerDiffusivity, g.thermalDiffusivity);
  for (const f of g.faces) {
    const q = velocity[f.k] * f.area, mix = maxD * f.area / f.distance;
    if (f.i >= 0) w.outgoing[f.i] += Math.max(q, 0) + mix;
    if (f.j >= 0) w.outgoing[f.j] += Math.max(-q, 0) + mix;
  }
  const courant = dt * Math.max(...w.outgoing) / g.volume;
  if (courant > .45000000001) return null;
  let smokeBoundary = 0, heatBoundary = 0, airImport = 0, airExport = 0;
  for (const f of g.faces) {
    const q = velocity[f.k] * f.area, donor = q >= 0 ? f.i : f.j;
    const cs = donor < 0 ? 0 : state.smoke[donor] / g.volume;
    const ch = donor < 0 ? 0 : state.heat[donor] / g.volume;
    const ds = dt * (q * cs + g.tracerDiffusivity * f.area / f.distance *
      ((f.i < 0 ? 0 : state.smoke[f.i]) - (f.j < 0 ? 0 : state.smoke[f.j])) / g.volume);
    const dh = dt * (q * ch + g.thermalDiffusivity * f.area / f.distance *
      ((f.i < 0 ? 0 : state.heat[f.i]) - (f.j < 0 ? 0 : state.heat[f.j])) / g.volume);
    w.faceSmoke[f.k] = ds; w.faceHeat[f.k] = dh;
    if (f.i >= 0) { w.deltaSmoke[f.i] -= ds; w.deltaHeat[f.i] -= dh; }
    if (f.j >= 0) { w.deltaSmoke[f.j] += ds; w.deltaHeat[f.j] += dh; }
    if (f.boundary) {
      const sign = f.j < 0 ? 1 : -1, flow = sign * q;
      smokeBoundary += sign * ds; heatBoundary += sign * dh;
      airExport += dt * Math.max(flow, 0); airImport += dt * Math.max(-flow, 0);
    }
  }
  let smokeSource = 0, heatSource = 0;
  for (const source of forcing.sources ?? []) {
    assert(g.fluid[source.cell], 'source must occupy fluid');
    const ds = dt * (source.smokeKgS ?? 0), dh = dt * (source.heatJS ?? 0);
    assert(ds >= 0 && Number.isFinite(dh), 'finite smoke/heat source');
    w.deltaSmoke[source.cell] += ds; w.deltaHeat[source.cell] += dh;
    smokeSource += ds; heatSource += dh;
  }
  const next = { ...state, velocity: Array.from(velocity),
    smoke: state.smoke.map((v, i) => v + w.deltaSmoke[i]),
    heat: state.heat.map((v, i) => v + w.deltaHeat[i]),
    time: state.time + dt, steps: state.steps + 1,
    smokeSource: state.smokeSource + smokeSource, heatSource: state.heatSource + heatSource,
    smokeBoundary: state.smokeBoundary + smokeBoundary, heatBoundary: state.heatBoundary + heatBoundary,
    airImport: state.airImport + airImport, airExport: state.airExport + airExport };
  assert(Math.min(...next.smoke) >= -1e-14, 'nonnegative tracer');
  assert(next.heat.every(Number.isFinite) && next.velocity.every(Number.isFinite), 'finite successor');
  return { state: next, courant, receipt: { start: state.time, end: next.time,
    smokeSource, heatSource, air: Array.from(velocity, v => dt * v * g.faces[0].area),
    smoke: Array.from(w.faceSmoke), heat: Array.from(w.faceHeat) } };
}

export function advance(g, input, interval, { dtMax = .05, forcingAt = () => ({}), events = [] } = {}) {
  assert(input.version === g.version && input.geometryRevision === g.revision, 'state/geometry version');
  assert(interval >= 0 && dtMax > 0, 'positive interval');
  let state = input, rejected = 0, maxDivergence = 0, maxCourant = 0;
  const end = input.time + interval, receipts = [];
  while (state.time < end - 1e-12) {
    const maxV = maxAbs(state.velocity);
    let dt = Math.min(dtMax, end - state.time,
      .20 * g.dx / Math.max(maxV, 1e-12), .20 * g.dx * g.dx / Math.max(g.viscosity, 1e-30));
    for (const event of events) if (event > state.time + 1e-12) dt = Math.min(dt, event - state.time);
    const forcing = forcingAt(state.time);
    let accepted;
    for (;;) {
      assert(dt > 1e-10, 'substep underflow');
      const projection = project(g, predict(g, state, dt, forcing));
      const momentumCourant = 2 * maxAbs(projection.velocity) * dt / g.dx;
      if (momentumCourant <= .45000000001) accepted = transport(g, state, projection.velocity, dt, forcing);
      if (accepted) { maxDivergence = Math.max(maxDivergence, projection.divergence); break; }
      dt /= 2; rejected++;
    }
    maxCourant = Math.max(maxCourant, accepted.courant);
    state = accepted.state; receipts.push(accepted.receipt);
  }
  return { state, receipts, rejected, maxDivergence, maxCourant };
}

export function totals(g, state) {
  return { smoke: sum(state.smoke), heat: sum(state.heat),
    maxVelocity: maxAbs(state.velocity), divergence: maxAbs(divergence(g, state.velocity)),
    minSmoke: Math.min(...state.smoke),
    minTheta: Math.min(...state.heat.filter((_, i) => g.fluid[i])) / (RHO * CP * g.volume),
    maxTheta: Math.max(...state.heat) / (RHO * CP * g.volume) };
}
