import { physicalFields, approximationFields } from "./state.mjs";
const require = (ok, message) => {
  if (!ok) throw new Error(message);
};
const caches = new WeakMap();
function workspace(g) {
  if (caches.has(g)) return caches.get(g);
  const cell = () => new Float64Array(g.n),
    face = () => new Float64Array(g.faces.length),
    nd = g.n * g.dimensions;
  const neighbor = new Int32Array(2 * nd).fill(-2),
    neighborFace = new Int32Array(2 * nd).fill(-1);
  for (const f of g.faces) {
    if (f.i >= 0) {
      const k = 2 * (f.i * g.dimensions + f.axis) + 1;
      neighbor[k] = f.j;
      neighborFace[k] = f.k;
    }
    if (f.j >= 0) {
      const k = 2 * (f.j * g.dimensions + f.axis);
      neighbor[k] = f.i;
      neighborFace[k] = f.k;
    }
  }
  const w = {
    neighbor,
    neighborFace,
    smokeSlope: new Float64Array(nd),
    heatSlope: new Float64Array(nd),
    outgoing: cell(),
    conductance: cell(),
    divergence: cell(),
    smokeRate: cell(),
    heatRate: cell(),
    smokeA: cell(),
    heatA: cell(),
    smokeB: cell(),
    heatB: cell(),
    smokeFluxA: face(),
    heatFluxA: face(),
    smokeFluxB: face(),
    heatFluxB: face(),
    cacheBuilds: 1,
    eulerStages: 0,
    faceEvaluations: 0,
    reconstructions: 0,
    rejectedStages: 0,
  };
  caches.set(g, w);
  return w;
}
export function transportDiagnostics(g) {
  const w = workspace(g);
  return {
    scalarCacheBuilds: w.cacheBuilds,
    scalarEulerStages: w.eulerStages,
    scalarFaceEvaluations: w.faceEvaluations,
    scalarReconstructions: w.reconstructions,
    scalarRejectedStages: w.rejectedStages,
    scalarWorkspaceBytes: Object.values(w).reduce(
      (n, x) => n + (x?.byteLength ?? 0),
      0,
    ),
  };
}
function mc(a, b) {
  if (a * b <= 0) return 0;
  return (
    Math.sign(a) *
    Math.min(2 * Math.abs(a), Math.abs(a + b) / 2, 2 * Math.abs(b))
  );
}
function slope(g, w, field, out, v) {
  for (let i = 0; i < g.n; i++)
    for (let d = 0; d < g.dimensions; d++) {
      const k = i * g.dimensions + d,
        c = field[i];
      if (!g.fluid[i]) {
        out[k] = 0;
        continue;
      }
      const value = (side) => {
        const slot = 2 * k + side,
          n = w.neighbor[slot];
        if (n >= 0) return field[n];
        if (n === -2) return c;
        const outward = (side === 1 ? 1 : -1) * v[w.neighborFace[slot]];
        return outward < 0 ? 0 : c;
      };
      out[k] = mc(c - value(0), value(1) - c);
    }
  w.reconstructions++;
}
function prepare(g, w, v, f) {
  w.outgoing.fill(0);
  w.conductance.fill(0);
  w.divergence.fill(0);
  w.smokeRate.fill(0);
  w.heatRate.fill(0);
  const diffusivity = Math.max(g.tracerDiffusivity, g.thermalDiffusivity);
  for (const face of g.faces) {
    const q = v[face.k] * face.area,
      k = (diffusivity * face.area) / face.distance;
    if (face.i >= 0) {
      w.outgoing[face.i] += Math.max(q, 0);
      w.conductance[face.i] += k;
      w.divergence[face.i] += q;
    }
    if (face.j >= 0) {
      w.outgoing[face.j] += Math.max(-q, 0);
      w.conductance[face.j] += k;
      w.divergence[face.j] -= q;
    }
  }
  for (const source of f.sources ?? []) {
    w.smokeRate[source.cell] += source.smokeKgS ?? 0;
    w.heatRate[source.cell] += source.heatJS ?? 0;
  }
  require(w.smokeRate.every(Number.isFinite) &&
    w.heatRate.every(Number.isFinite), "finite combined source rates");
}
function stageBound(g, w, s, dt) {
  let coefficient = 0;
  for (let i = 0; i < g.n; i++)
    if (g.fluid[i]) {
      const absoluteHeat =
        s.heatJ[i] +
        g.model.densityKgM3 *
          g.model.heatCapacityJKgK *
          g.model.referenceTemperatureK *
          g.volume;
      require(absoluteHeat >
        0, "positive absolute temperature before scalar stage");
      const thermalLoss =
        Math.max(-w.heatRate[i], 0) +
        Math.max(
          -(
            g.model.densityKgM3 *
            g.model.heatCapacityJKgK *
            g.model.referenceTemperatureK
          ) * w.divergence[i],
          0,
        );
      const rate =
        (2 * w.outgoing[i] + w.conductance[i]) / g.volume +
        thermalLoss / absoluteHeat;
      coefficient = Math.max(coefficient, dt * rate);
    }
  return coefficient;
}
function transferFaces(g, w, s, v, dt, outSmoke, outHeat, fluxSmoke, fluxHeat) {
  let smokeBoundaryKg = 0,
    heatBoundaryJ = 0,
    airImportM3 = 0,
    airExportM3 = 0;
  for (const face of g.faces) {
    const { i, j, axis } = face,
      q = v[face.k] * face.area,
      donor = q >= 0 ? i : j,
      sign = q >= 0 ? 1 : -1;
    const reconstructed = (field, slopes) =>
      donor < 0
        ? 0
        : (field[donor] + sign * 0.5 * slopes[donor * g.dimensions + axis]) /
          g.volume;
    const diffusion = (field) =>
      ((((i < 0 ? 0 : field[i]) - (j < 0 ? 0 : field[j])) / g.volume) *
        face.area) /
      face.distance;
    const ds =
      dt *
      (q * reconstructed(s.smokeKg, w.smokeSlope) +
        g.tracerDiffusivity * diffusion(s.smokeKg));
    const dh =
      dt *
      (q * reconstructed(s.heatJ, w.heatSlope) +
        g.thermalDiffusivity * diffusion(s.heatJ));
    fluxSmoke[face.k] = ds;
    fluxHeat[face.k] = dh;
    if (i >= 0) {
      outSmoke[i] -= ds;
      outHeat[i] -= dh;
    }
    if (j >= 0) {
      outSmoke[j] += ds;
      outHeat[j] += dh;
    }
    if (face.boundary) {
      const outward = j < 0 ? 1 : -1,
        flow = outward * q;
      smokeBoundaryKg += outward * ds;
      heatBoundaryJ += outward * dh;
      airImportM3 += dt * Math.max(-flow, 0);
      airExportM3 += dt * Math.max(flow, 0);
    }
  }
  return { smokeBoundaryKg, heatBoundaryJ, airImportM3, airExportM3 };
}
function applySources(g, w, dt, outSmoke, outHeat) {
  let smokeSourceKg = 0,
    heatSourceJ = 0;
  for (let i = 0; i < g.n; i++) {
    const ds = dt * w.smokeRate[i],
      dh = dt * w.heatRate[i];
    outSmoke[i] += ds;
    outHeat[i] += dh;
    smokeSourceKg += ds;
    heatSourceJ += dh;
  }
  return { smokeSourceKg, heatSourceJ };
}
function stage(g, w, s, v, dt, outSmoke, outHeat, fluxSmoke, fluxHeat) {
  const coefficient = stageBound(g, w, s, dt);
  if (coefficient > 0.45000000001) {
    w.rejectedStages++;
    return null;
  }
  slope(g, w, s.smokeKg, w.smokeSlope, v);
  slope(g, w, s.heatJ, w.heatSlope, v);
  outSmoke.set(s.smokeKg);
  outHeat.set(s.heatJ);
  const boundary = transferFaces(
    g,
    w,
    s,
    v,
    dt,
    outSmoke,
    outHeat,
    fluxSmoke,
    fluxHeat,
  );
  const sources = applySources(g, w, dt, outSmoke, outHeat);
  w.eulerStages++;
  w.faceEvaluations += g.faces.length;
  if (!physicalFields(g, { smokeKg: outSmoke, heatJ: outHeat })) {
    w.rejectedStages++;
    return null;
  }
  approximationFields(g, { smokeKg: outSmoke, heatJ: outHeat });
  return { coefficient, ...sources, ...boundary };
}
export function transport(g, s, v, dt, f = {}) {
  require(Number.isFinite(dt) &&
    dt > 0 &&
    v.length === g.faces.length &&
    v.every(Number.isFinite), "finite scalar interval/velocity");
  require(physicalFields(
    g,
    s,
  ), "positive scalar/absolute-temperature admission");
  const w = workspace(g);
  prepare(g, w, v, f);
  const a = stage(g, w, s, v, dt, w.smokeA, w.heatA, w.smokeFluxA, w.heatFluxA);
  if (!a) return null;
  const b = stage(
    g,
    w,
    { smokeKg: w.smokeA, heatJ: w.heatA },
    v,
    dt,
    w.smokeB,
    w.heatB,
    w.smokeFluxB,
    w.heatFluxB,
  );
  if (!b) return null;
  const average = (name) => (a[name] + b[name]) / 2;
  const state = {
    ...s,
    timeS: s.timeS + dt,
    steps: s.steps + 1,
    velocityMPS: Array.from(v),
    smokeKg: s.smokeKg.map((m, i) => (m + w.smokeB[i]) / 2),
    heatJ: s.heatJ.map((h, i) => (h + w.heatB[i]) / 2),
    smokeSourceKg: s.smokeSourceKg + average("smokeSourceKg"),
    heatSourceJ: s.heatSourceJ + average("heatSourceJ"),
    smokeBoundaryKg: s.smokeBoundaryKg + average("smokeBoundaryKg"),
    heatBoundaryJ: s.heatBoundaryJ + average("heatBoundaryJ"),
    airImportM3: s.airImportM3 + average("airImportM3"),
    airExportM3: s.airExportM3 + average("airExportM3"),
  };
  require(physicalFields(g, state), "positive SSPRK2 successor");
  approximationFields(g, state);
  return {
    state,
    courant: Math.max(a.coefficient, b.coefficient),
    receipt: {
      start: s.timeS,
      end: state.timeS,
      smokeSourceKg: average("smokeSourceKg"),
      heatSourceJ: average("heatSourceJ"),
      air: Array.from(v, (speed, i) => dt * speed * g.faces[i].area),
      smoke: Array.from(w.smokeFluxA, (q, i) => (q + w.smokeFluxB[i]) / 2),
      heat: Array.from(w.heatFluxA, (q, i) => (q + w.heatFluxB[i]) / 2),
    },
  };
}
