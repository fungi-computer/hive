/** Isolated two-dimensional low-speed MAC reference. SI units throughout.
 * Geometry/cache are immutable derived data; velocities, heat, tracer and ledgers
 * are canonical. No game clock, worker framework, package dependency or I/O.
 */
export const RHO = 1.2, CP = 1005, TREF = 293.15, GRAVITY = 9.81;
const assert = (ok, text) => { if (!ok) throw new Error(text); };
const maxAbs = a => a.reduce((m, x) => Math.max(m, Math.abs(x)), 0);
const sum = a => a.reduce((s, x) => s + x, 0);

function cellMetric({dx,hx=dx,hz=dx,depth}) {
  assert([hx,hz,depth].every(x=>Number.isFinite(x)&&x>0),'finite positive cell metric');
  assert(dx===undefined||(dx===hx&&dx===hz),'dx is a square compatibility input');
  const volume=hx*hz*depth,uArea=hz*depth,vArea=hx*depth;
  assert([volume,uArea,vArea,hx*hx,hz*hz,1/(hx*hx),1/(hz*hz)].every(x=>Number.isFinite(x)&&x>0),'representable metric products');
  return Object.freeze({hx,hz,depth,volume,uArea,vArea});
}

export function geometry({ nx, nz, dx, hx, hz, depth = 2, domainId='isolated-study', periodicX = false,
  periodicZ = false, open = [], solid = [], walls = [], viscosity = 1.5e-5,
  thermalDiffusivity = 2.2e-5, tracerDiffusivity = 1e-5,
  buoyancy = true, revision = 0 }) {
  assert(Number.isSafeInteger(nx) && nx>1 && Number.isSafeInteger(nz) && nz>1,'positive integer grid');
  assert(typeof domainId==='string'&&domainId.trim().length>0,'nonempty numerical domain identity');
  const metric=cellMetric({dx,hx,hz,depth});
  assert([viscosity,thermalDiffusivity,tracerDiffusivity].every(x=>Number.isFinite(x)&&x>=0),'finite diffusivities');
  assert(Number.isSafeInteger(revision)&&revision>=0,'geometry revision');
  assert([periodicX,periodicZ,buoyancy].every(x=>typeof x==='boolean'),'boolean geometry switches');
  assert(open.every(side=>['left','right','top','bottom'].includes(side)),'known exterior side');
  assert(!(periodicX&&(open.includes('left')||open.includes('right'))) &&
    !(periodicZ&&(open.includes('top')||open.includes('bottom'))),'periodic/exterior conflict');
  const n = nx * nz, solidSet = new Set(solid), openings = new Set(open), wallSet = new Set(walls);
  assert(solid.every(i=>Number.isSafeInteger(i)&&i>=0&&i<n),'valid solid cells');
  for(const id of wallSet) {
    const match=/^(u|v):(\d+):(\d+)$/.exec(id);
    assert(match,'canonical wall ID');const [,axis,xText,zText]=match,x=Number(xText),z=Number(zText);
    assert(`${axis}:${x}:${z}`===id && (axis==='u'?x<=nx&&z<nz:x<nx&&z<=nz),'wall inside grid');
    assert(!(axis==='u'&&periodicX&&x===nx)&&!(axis==='v'&&periodicZ&&z===nz),'canonical periodic wall');
  }
  const fluid = Int8Array.from({ length: n }, (_, i) => !solidSet.has(i));
  const ui = new Int32Array((nx + 1) * nz).fill(-1);
  const vi = new Int32Array(nx * (nz + 1)).fill(-1);
  const cells = [];
  for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) {
    const i = z * nx + x;
    cells.push({ i, x: (x + .5) * metric.hx, z: (z + .5) * metric.hz, fluid: !!fluid[i] });
  }
  const faces = [], volume = metric.volume;
  function face(axis, x, z, i, j, boundary) {
    const k = faces.length;
    faces.push({ k, id: `${axis}:${x}:${z}`, axis, x, z, i, j,
      area:axis==='u'?metric.uArea:metric.vArea,
      distance:(axis==='u'?metric.hx:metric.hz)/(boundary?2:1),boundary });
    return k;
  }
  for (let z = 0; z < nz; z++) for (let x = 0; x <= nx; x++) {
    if (periodicX && x === nx) { ui[z * (nx + 1) + x] = ui[z * (nx + 1)]; continue; }
    const i = x > 0 ? z * nx + x - 1 : periodicX ? z * nx + nx - 1 : -1;
    const j = x < nx ? z * nx + x : -1;
    const boundary = i < 0 ? 'left' : j < 0 ? 'right' : null;
    if ((i >= 0 && !fluid[i]) || (j >= 0 && !fluid[j])) continue;
    if (boundary && !openings.has(boundary)) continue;
    if (wallSet.has(`u:${x}:${z}`)) continue;
    ui[z * (nx + 1) + x] = face('u', x, z, i, j, boundary);
  }
  for (let z = 0; z <= nz; z++) for (let x = 0; x < nx; x++) {
    if (periodicZ && z === nz) { vi[z * nx + x] = vi[x]; continue; }
    const i = z > 0 ? (z - 1) * nx + x : periodicZ ? (nz - 1) * nx + x : -1;
    const j = z < nz ? z * nx + x : -1;
    const boundary = i < 0 ? 'bottom' : j < 0 ? 'top' : null;
    if ((i >= 0 && !fluid[i]) || (j >= 0 && !fluid[j])) continue;
    if (boundary && !openings.has(boundary)) continue;
    if (wallSet.has(`v:${x}:${z}`)) continue;
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
  const g = { version: 'mac-boussinesq-2d-v2-metric', domainId, nx, nz, metric, n, volume,
    get dx(){assert(metric.hx===metric.hz,'square-only caller requires an explicit directional metric');return metric.hx;},
    get depth(){return metric.depth;},
    periodicX, periodicZ, open: [...openings], solid: [...solidSet].sort((a,b)=>a-b),
    walls: [...wallSet].sort(),
    viscosity, thermalDiffusivity, tracerDiffusivity, buoyancy, revision,
    fluid, cells, faces, ui, vi, fixed, diagonal };
  // A full canonical descriptor deliberately binds coefficients and exact face
  // identity, not only a caller-supplied revision number. No mutable cache is saved.
  g.identity=JSON.stringify({version:g.version,domainId,nx,nz,metric,periodicX,periodicZ,
    open:[...openings].sort(),solid:g.solid,walls:g.walls,viscosity,thermalDiffusivity,
    tracerDiffusivity,buoyancy,revision,faces:faces.map(f=>[f.id,f.i,f.j,f.area,f.distance])});
  // Derived wall/neighbor coefficients are shared by momentum and its bound.
  g.momentumStencil=faces.map(f=>[[-1,0],[1,0],[0,-1],[0,1]].map(([ox,oz])=>neighborRelation(g,f,ox,oz)));
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
  assert(Number.isFinite(temperature)&&temperature+TREF>0,'finite physical initial temperature');
  return { version: g.version, geometryRevision: g.revision, geometryIdentity:g.identity, time: 0, steps: 0,
    velocity: Array(g.faces.length).fill(0), smoke: Array(g.n).fill(0),
    heat: g.cells.map(c => c.fluid ? RHO * CP * g.volume * temperature : 0),
    initialSmoke:0,initialHeat:g.cells.filter(c=>c.fluid).length*RHO*CP*g.volume*temperature,
    smokeSource: 0, heatSource: 0, smokeBoundary: 0, heatBoundary: 0,
    airImport: 0, airExport: 0 };
}

export function validateState(g,state) {
  assert(state.version===g.version&&state.geometryRevision===g.revision&&state.geometryIdentity===g.identity,'state/geometry identity');
  assert(Number.isFinite(state.time)&&state.time>=0&&Number.isSafeInteger(state.steps)&&state.steps>=0,'finite canonical time');
  for(const [key,length] of [['velocity',g.faces.length],['smoke',g.n],['heat',g.n]]) {
    assert(Array.isArray(state[key])&&state[key].length===length&&state[key].every(Number.isFinite),`finite ${key} shape`);
  }
  for(const key of ['initialSmoke','initialHeat','smokeSource','heatSource','smokeBoundary','heatBoundary','airImport','airExport']) assert(Number.isFinite(state[key]),`finite ${key}`);
  assert(state.initialSmoke>=0&&state.smokeSource>=0&&state.airImport>=0&&state.airExport>=0,'nonnegative source/air ledger');
  assert(state.smoke.every((m,i)=>m>=-1e-14&&(g.fluid[i]||(m===0&&state.heat[i]===0))),'physical cell stock');
  assert(Math.abs(sum(state.smoke)+state.smokeBoundary-state.smokeSource-state.initialSmoke)<1e-10,'saved tracer ledger');
  assert(Math.abs(sum(state.heat)+state.heatBoundary-state.heatSource-state.initialHeat)<1e-5,'saved heat ledger');
}

function validateForcing(g,forcing) {
  assert(Number.isFinite(forcing.accelerationX??0)&&Number.isFinite(forcing.accelerationZ??0),'finite acceleration');
  assert(Array.isArray(forcing.sources??[]),'source list');
  for(const source of forcing.sources??[]) {
    assert(Number.isSafeInteger(source.cell)&&source.cell>=0&&source.cell<g.n&&g.fluid[source.cell],'source fluid cell');
    assert(Number.isFinite(source.smokeKgS??0)&&(source.smokeKgS??0)>=0&&Number.isFinite(source.heatJS??0),'finite source rate');
  }
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
  assert(velocity.length===g.faces.length&&velocity.every(Number.isFinite),'finite projection velocity');
  assert(Number.isFinite(tolerance)&&tolerance>0&&tolerance<=1e-9,'bounded projection tolerance');
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

function neighborRelation(g,f,ox,oz) {
  const x = f.x + ox, z = f.z + oz, k = faceIndex(g, f.axis, x, z);
  const tangential = f.axis === 'u' ? oz !== 0 : ox !== 0;
  if (k >= 0) {
    if (!tangential) return {index:k,other:1,center:0};
    // A thin interior wall may separate two existing parallel face velocities.
    // Each half of this staggered dual face has its own connectivity; no-slip
    // ghosts replace the blocked half instead of diffusing through the wall.
    const a = f.axis === 'u' ? faceIndex(g,'v',f.x-1,f.z+(oz>0?1:0)) : faceIndex(g,'u',f.x+(ox>0?1:0),f.z-1);
    const b = f.axis === 'u' ? faceIndex(g,'v',f.x,f.z+(oz>0?1:0)) : faceIndex(g,'u',f.x+(ox>0?1:0),f.z);
    const fraction = ((a>=0?1:0)+(b>=0?1:0))/2;
    return {index:k,other:fraction,center:-(1-fraction)};
  }
  if (outsideOpen(g, f.axis, x, z)) return {index:-1,other:0,center:1};
  return {index:-1,other:0,center:tangential?-1:0};
}

function neighbor(g,velocity,f,direction) {
  const relation=g.momentumStencil[f.k][direction];
  return (relation.index>=0?relation.other*velocity[relation.index]:0)+relation.center*velocity[f.k];
}

function crossVelocity(g,velocity,f) {
  return f.axis === 'u' ? (
    value(g, velocity, 'v', f.x - 1, f.z) + value(g, velocity, 'v', f.x, f.z) +
    value(g, velocity, 'v', f.x - 1, f.z + 1) + value(g, velocity, 'v', f.x, f.z + 1)) / 4 : (
    value(g, velocity, 'u', f.x, f.z - 1) + value(g, velocity, 'u', f.x + 1, f.z - 1) +
    value(g, velocity, 'u', f.x, f.z) + value(g, velocity, 'u', f.x + 1, f.z)) / 4;
}

/** Sum actual directional upwind+viscous coefficients from the same derived
 * wall relations used in predict. No-slip ghosts can double a center term;
 * open zero-gradient ghosts contribute zero. This is one stability owner.
 */
export function momentumRate(g,velocity) {
  let maxRate=0;
  const {hx,hz}=g.metric;
  const coefficient=relation=>1-relation.center;
  for(const f of g.faces) {
    const c=velocity[f.k],cross=crossVelocity(g,velocity,f);
    const ux=f.axis==='u'?c:cross,uz=f.axis==='u'?cross:c;
    const [left,right,down,up]=g.momentumStencil[f.k];
    const advective=Math.abs(ux)/hx*coefficient(ux>=0?left:right)+
      Math.abs(uz)/hz*coefficient(uz>=0?down:up);
    const viscous=g.viscosity*((coefficient(left)+coefficient(right))/(hx*hx)+
      (coefficient(down)+coefficient(up))/(hz*hz));
    maxRate=Math.max(maxRate,advective+viscous);
  }
  return maxRate;
}

export function predict(g, state, dt, forcing = {}) {
  assert(Number.isFinite(dt)&&dt>0,'finite predictor timestep');validateForcing(g,forcing);
  const velocity = state.velocity, out = g.workspace.predicted;
  const forceX = forcing.accelerationX ?? 0, forceZ = forcing.accelerationZ ?? 0;
  for (const f of g.faces) {
    const c = velocity[f.k], left = neighbor(g, velocity, f, 0),
      right = neighbor(g, velocity, f, 1), down = neighbor(g, velocity, f, 2),
      up = neighbor(g, velocity, f, 3);
    const cross=crossVelocity(g,velocity,f);
    const ux = f.axis === 'u' ? c : cross, uz = f.axis === 'u' ? cross : c;
    const {hx,hz}=g.metric;
    const advection = ux * (ux >= 0 ? c - left : right - c) / hx +
      uz * (uz >= 0 ? c - down : up - c) / hz;
    const diffusion = g.viscosity * ((left+right-2*c)/(hx*hx)+(down+up-2*c)/(hz*hz));
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
  assert(Number.isFinite(dt)&&dt>0,'finite transport timestep');validateForcing(g,forcing);
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
    smokeSource, heatSource, air: Array.from(velocity, (v,i) => dt * v * g.faces[i].area),
    smoke: Array.from(w.faceSmoke), heat: Array.from(w.faceHeat) } };
}

export function advance(g, input, interval, { dtMax = .05, forcingAt = () => ({}), events = [] } = {}) {
  validateState(g,input);
  assert(Number.isFinite(interval)&&interval>=0&&Number.isFinite(dtMax)&&dtMax>0,'finite positive interval');
  assert(Number.isFinite(input.time+interval)&&events.every(Number.isFinite),'finite interval end/events');
  let state = input, rejected = 0, maxDivergence = 0, maxCourant = 0, maxMomentumCourant=0;
  const end = input.time + interval, receipt = { start: input.time, end,
    smokeSource:0, heatSource:0, air:Array(g.faces.length).fill(0),
    smoke:Array(g.faces.length).fill(0),heat:Array(g.faces.length).fill(0) };
  while (state.time < end) {
    const initialRate=momentumRate(g,state.velocity);
    let dt = Math.min(dtMax, end-state.time,initialRate>.0?.45/initialRate:Infinity);
    for (const event of events) if (event > state.time) dt = Math.min(dt, event - state.time);
    const forcing = forcingAt(state.time);
    validateForcing(g,forcing);
    let accepted;
    for (;;) {
      assert(dt > 0 && state.time+dt>state.time, 'representable substep');
      const projection = project(g, predict(g, state, dt, forcing));
      const momentumCourant = Math.max(initialRate,momentumRate(g,projection.velocity))*dt;
      if (momentumCourant <= .45000000001) accepted = transport(g, state, projection.velocity, dt, forcing);
      if (accepted) {
        maxDivergence = Math.max(maxDivergence, projection.divergence);
        maxMomentumCourant=Math.max(maxMomentumCourant,momentumCourant);break;
      }
      dt /= 2; rejected++;
    }
    maxCourant = Math.max(maxCourant, accepted.courant);
    state = accepted.state;
    receipt.smokeSource+=accepted.receipt.smokeSource;receipt.heatSource+=accepted.receipt.heatSource;
    for(let i=0;i<g.faces.length;i++) {
      receipt.air[i]+=accepted.receipt.air[i];receipt.smoke[i]+=accepted.receipt.smoke[i];receipt.heat[i]+=accepted.receipt.heat[i];
    }
  }
  return { state, receipt, rejected, maxDivergence, maxCourant,maxMomentumCourant };
}

export function totals(g, state) {
  return { smoke: sum(state.smoke), heat: sum(state.heat),
    maxVelocity: maxAbs(state.velocity), divergence: maxAbs(divergence(g, state.velocity)),
    minSmoke: Math.min(...state.smoke),
    minTheta: Math.min(...state.heat.filter((_, i) => g.fluid[i])) / (RHO * CP * g.volume),
    maxTheta: Math.max(...state.heat) / (RHO * CP * g.volume) };
}
