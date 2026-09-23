// Isolated full-SWE optimization of the pinned round-two dense reference.
// One stepper owns its current state and reusable buffers. Returned arrays are
// borrowed until the next step/replace; checkpoint() creates a retained snapshot.
// No cell clock, dry threshold, modified physical law or game import is added.
import { G, restore, serialize } from './reference/solver.mjs';

export function createStepper(initial, { active = true } = {}) {
  if (initial.model !== 'swe') throw Error('candidate requires full SWE');
  let state = restore(serialize(initial));
  const N = state.V.length, E = state.geom.faces.length;
  let allocatedArrays = 0, allocatedBytes = 0;
  const allocate = (Type, n) => {
    const a = new Type(n);
    allocatedArrays++;
    allocatedBytes += a.byteLength;
    return a;
  };
  const f64 = n => allocate(Float64Array, n);
  const h = f64(N), requested = f64(N), factor = f64(N);
  const withdrawal = f64(N), withdrawals = f64(N);
  const flux = f64(E), ax = f64(E), ay = f64(E), bx = f64(E), by = f64(E);
  const exchanges = f64(E);
  const activeIds = allocate(Int32Array, E), withdrawIds = allocate(Int32Array, N);
  const buffers = Array.from({ length: 2 }, () => ({
    V: f64(N), q: f64(E), mx: f64(N), my: f64(N),
  }));
  let nextBuffer = 0;
  const stats = {
    steps: 0, faceEvaluations: 0, faceScans: 0, activeCells: 0,
    peakActiveFaces: 0, allocatedArrays, allocatedBytes,
    substepTypedArrays: 0, substepTypedBytes: 0,
  };

  function step(dt, { withdrawRate = 0 } = {}) {
    if (!(dt > 0 && Number.isFinite(dt))) throw Error('invalid dt');
    const { geom, V, mx, my, q } = state;
    const { faces, area, dx, z, solid } = geom;
    let activeCount = 0, wetCells = 0, withdrawCount = 0;
    for (let i = 0; i < N; i++) {
      h[i] = V[i] / area;
      if (V[i] !== 0 || mx[i] !== 0 || my[i] !== 0) wetCells++;
      if (withdrawRate > 0 && geom.region[i] === 6) withdrawIds[withdrawCount++] = i;
    }
    // Build canonical order anew, so forcing/geometry changes cannot leave stale
    // activity. All wet faces, including solid/exterior wall pressures, stay in.
    // Full-domain scan is retained and measured; this is not an active-tile index.
    for (let id = 0; id < E; id++) {
      const { a, b } = faces[id];
      if (!active || q[id] !== 0 ||
        (a >= 0 && (V[a] !== 0 || mx[a] !== 0 || my[a] !== 0)) ||
        (b >= 0 && (V[b] !== 0 || mx[b] !== 0 || my[b] !== 0))) {
        activeIds[activeCount++] = id;
      }
    }
    flux.fill(0); ax.fill(0); ay.fill(0); bx.fill(0); by.fill(0);
    requested.fill(0); withdrawal.fill(0); withdrawals.fill(0); exchanges.fill(0);
    for (let slot = 0; slot < activeCount; slot++) {
      const id = activeIds[slot], f = faces[id], { a, b, axis } = f;
      if (!f.open) {
        // Same reflected wall pressure as the dense reference, without transient
        // side-pair arrays. Pressure must not be skipped merely because q is zero.
        if (a >= 0 && !solid[a]) {
          const hi = h[a], un = hi > 1e-12 ? (axis === 0 ? mx[a] : my[a]) / hi : 0;
          const pressure = hi * un * un + G * hi * hi / 2 + (Math.abs(un) + Math.sqrt(G * hi)) * hi * un;
          if (axis === 0) ax[id] = pressure; else ay[id] = pressure;
        }
        if (b >= 0 && !solid[b]) {
          const hi = h[b], un = hi > 1e-12 ? (axis === 0 ? mx[b] : my[b]) / hi : 0;
          const pressure = hi * un * un + G * hi * hi / 2 - (Math.abs(un) + Math.sqrt(G * hi)) * hi * un;
          if (axis === 0) bx[id] = pressure; else by[id] = pressure;
        }
        continue;
      }
      const za = Math.max(z[a], z[b]);
      const ha = Math.max(0, z[a] + h[a] - za), hb = Math.max(0, z[b] + h[b] - za);
      const ua = h[a] > 1e-12 ? mx[a] / h[a] : 0, va = h[a] > 1e-12 ? my[a] / h[a] : 0;
      const ub = h[b] > 1e-12 ? mx[b] / h[b] : 0, vb = h[b] > 1e-12 ? my[b] / h[b] : 0;
      const unA = axis === 0 ? ua : va, unB = axis === 0 ? ub : vb;
      const speed = Math.max(Math.abs(unA) + Math.sqrt(G * ha), Math.abs(unB) + Math.sqrt(G * hb));
      flux[id] = (ha * unA + hb * unB - speed * (hb - ha)) / 2;
      const fx = (ha * unA * ua + hb * unB * ub + (axis === 0 ? G * (ha * ha + hb * hb) / 2 : 0) - speed * (hb * ub - ha * ua)) / 2;
      const fy = (ha * unA * va + hb * unB * vb + (axis === 1 ? G * (ha * ha + hb * hb) / 2 : 0) - speed * (hb * vb - ha * va)) / 2;
      ax[id] = fx + (axis === 0 ? G * (h[a] * h[a] - ha * ha) / 2 : 0);
      ay[id] = fy + (axis === 1 ? G * (h[a] * h[a] - ha * ha) / 2 : 0);
      bx[id] = fx + (axis === 0 ? G * (h[b] * h[b] - hb * hb) / 2 : 0);
      by[id] = fy + (axis === 1 ? G * (h[b] * h[b] - hb * hb) / 2 : 0);
    }
    for (let slot = 0; slot < activeCount; slot++) {
      const f = faces[activeIds[slot]];
      if (f.open) {
        const d = flux[f.id] >= 0 ? f.a : f.b;
        requested[d] += Math.abs(flux[f.id]) * dx * dt;
      }
    }
    for (let slot = 0; slot < withdrawCount; slot++) {
      const i = withdrawIds[slot];
      withdrawal[i] = withdrawRate * dt / withdrawCount;
      requested[i] += withdrawal[i];
    }
    let limitedDonors = 0, minFactor = 1;
    for (let i = 0; i < N; i++) {
      if (V[i] < 0) throw Error('negative input stock');
      factor[i] = requested[i] > V[i] ? (V[i] / requested[i]) * (1 - 8 * Number.EPSILON) : 1;
      if (factor[i] < 1 && requested[i] > 1e-16) {
        limitedDonors++;
        minFactor = Math.min(minFactor, factor[i]);
      }
      if (requested[i] - withdrawal[i] > V[i] + 1e-12) throw Error('SWE outgoing budget: reject dt');
    }
    const { V: nextV, q: acceptedQ, mx: nextMx, my: nextMy } = buffers[nextBuffer];
    nextV.set(V); nextMx.set(mx); nextMy.set(my); acceptedQ.fill(0);
    for (let slot = 0; slot < activeCount; slot++) {
      const f = faces[activeIds[slot]], { a, b, id } = f;
      if (f.open) {
        acceptedQ[id] = flux[id];
        const dV = acceptedQ[id] * dx * dt;
        exchanges[id] = dV; nextV[a] -= dV; nextV[b] += dV;
      }
      if (a >= 0 && !solid[a]) { nextMx[a] -= dt / dx * ax[id]; nextMy[a] -= dt / dx * ay[id]; }
      if (b >= 0 && !solid[b]) { nextMx[b] += dt / dx * bx[id]; nextMy[b] += dt / dx * by[id]; }
    }
    let collected = state.collected;
    for (let slot = 0; slot < withdrawCount; slot++) {
      const i = withdrawIds[slot];
      const take = Math.min(withdrawal[i], Math.max(0, nextV[i]));
      const ratio = nextV[i] > 0 ? (nextV[i] - take) / nextV[i] : 0;
      nextV[i] -= take; nextMx[i] *= ratio; nextMy[i] *= ratio;
      collected += take; withdrawals[i] = take;
    }
    let maxFr = 0, wet = 0, frAboveHalf = 0, frAboveOne = 0, maxGradient = 0, minDepth = Infinity;
    for (let i = 0; i < N; i++) {
      if (nextV[i] < -1e-12 || !Number.isFinite(nextV[i])) throw Error(`inadmissible V ${i}: ${nextV[i]}`);
      const depth = nextV[i] / area;
      minDepth = Math.min(minDepth, depth);
      if (depth > 0) {
        const speed = Math.hypot(nextMx[i], nextMy[i]) / Math.max(depth, 1e-12);
        const drag = 1 + dt * G * state.roughness ** 2 * speed / Math.max(depth, 1e-12) ** (4 / 3);
        nextMx[i] /= drag; nextMy[i] /= drag;
      }
      if (depth <= 0 && (nextMx[i] !== 0 || nextMy[i] !== 0)) throw Error('dry momentum');
    }
    for (let slot = 0; slot < activeCount; slot++) {
      const f = faces[activeIds[slot]];
      if (!f.open) continue;
      const hf = Math.max(0, Math.max(z[f.a] + h[f.a], z[f.b] + h[f.b]) - Math.max(z[f.a], z[f.b]));
      if (hf >= .01) maxGradient = Math.max(maxGradient, Math.abs(z[f.a] + h[f.a] - z[f.b] - h[f.b]) / dx);
    }
    for (let i = 0; i < N; i++) if (h[i] >= .01) {
      const fr = Math.hypot(mx[i], my[i]) / (h[i] * Math.sqrt(G * h[i]));
      maxFr = Math.max(maxFr, fr); wet++; if (fr > .5) frAboveHalf++; if (fr > 1) frAboveOne++;
    }
    const interval = { start: state.time, end: state.time + dt, dt, geometryRevision: geom.revision };
    state = { ...state, V: nextV, q: acceptedQ, mx: nextMx, my: nextMy, time: interval.end, stepCount: state.stepCount + 1, collected };
    nextBuffer = 1 - nextBuffer;
    stats.steps++; stats.faceScans += E; stats.faceEvaluations += activeCount;
    stats.activeCells += wetCells; stats.peakActiveFaces = Math.max(stats.peakActiveFaces, activeCount);
    return { state, interval, exchanges, withdrawals,
      diagnostics: { limitedDonors, minFactor, maxFr, wetFaces: wet, frAboveHalf, frAboveOne, maxGradient, minDepth } };
  }

  return {
    get state() { return state; },
    step,
    checkpoint() { return serialize(state); },
    replace(replacement) {
      if (replacement.model !== 'swe' || replacement.V.length !== N || replacement.geom.faces.length !== E) throw Error('replacement shape/model mismatch');
      state = restore(serialize(replacement));
    },
    stats() { return { ...stats }; },
  };
}
