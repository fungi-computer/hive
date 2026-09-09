import { array, assert, freeze, record, sum } from "./data.mjs";
import { integratedDivergence, PROJECTION_LIMITS } from "./projection.mjs";

export const STATE_VERSION = "voxel-boussinesq-air-state-v1";
const LEDGERS = [
  "initialSmokeKg",
  "initialHeatJ",
  "smokeSourceKg",
  "heatSourceJ",
  "smokeBoundaryKg",
  "heatBoundaryJ",
  "airImportM3",
  "airExportM3",
];
const FIELDS = [
  "version",
  "identity",
  "timeS",
  "steps",
  "velocityMPS",
  "smokeKg",
  "heatJ",
  ...LEDGERS,
];

export function physicalFields(g, state) {
  const referenceJ =
    g.model.densityKgM3 *
    g.model.heatCapacityJKgK *
    g.model.referenceTemperatureK *
    g.volume;
  return (
    state.smokeKg.length === g.n &&
    state.heatJ.length === g.n &&
    state.smokeKg.every(
      (m, i) =>
        Number.isFinite(m) &&
        m >= 0 &&
        (g.fluid[i] || (m === 0 && state.heatJ[i] === 0)),
    ) &&
    state.heatJ.every(
      (h, i) => Number.isFinite(h) && (!g.fluid[i] || h + referenceJ > 0),
    )
  );
}

export function approximationFields(g, state) {
  const carrierKg = g.model.densityKgM3 * g.volume;
  const referenceJ =
    carrierKg * g.model.heatCapacityJKgK * g.model.referenceTemperatureK;
  assert(
    state.smokeKg.every((m, i) => !g.fluid[i] || m / carrierKg <= 0.01) &&
      state.heatJ.every(
        (h, i) => !g.fluid[i] || Math.abs(h) / referenceJ <= 0.05,
      ),
    "air stage exceeds warm/dilute approximation envelope",
  );
}

function balance(state) {
  return {
    smokeKg:
      sum(state.smokeKg) +
      state.smokeBoundaryKg -
      state.smokeSourceKg -
      state.initialSmokeKg,
    heatJ:
      sum(state.heatJ) +
      state.heatBoundaryJ -
      state.heatSourceJ -
      state.initialHeatJ,
  };
}

export function validateState(g, identity, state) {
  record(state, FIELDS);
  assert(
    state.version === STATE_VERSION && state.identity === identity,
    "air state method/geometry identity",
  );
  assert(
    Number.isFinite(state.timeS) &&
      state.timeS >= 0 &&
      Number.isSafeInteger(state.steps) &&
      state.steps >= 0,
    "finite air clock",
  );
  for (const [key, count] of [
    ["velocityMPS", g.faces.length],
    ["smokeKg", g.n],
    ["heatJ", g.n],
  ]) {
    array(state[key], count);
    assert(
      state[key].length === count && state[key].every(Number.isFinite),
      "complete finite air arrays",
    );
  }
  assert(
    LEDGERS.every((key) => Number.isFinite(state[key])),
    "finite air source/boundary ledgers",
  );
  assert(
    state.initialSmokeKg >= 0 &&
      state.smokeSourceKg >= 0 &&
      state.airImportM3 >= 0 &&
      state.airExportM3 >= 0,
    "nonnegative air ledgers",
  );
  assert(physicalFields(g, state), "physical air stocks/temperature");
  approximationFields(g, state);
  const residual = balance(state);
  assert(
    Math.abs(residual.smokeKg) <= 1e-10 && Math.abs(residual.heatJ) <= 1e-5,
    "air mass/heat ledger mismatch",
  );
  const divergence = integratedDivergence(g, state.velocityMPS);
  assert(
    divergence.every((q) => Math.abs(q) <= PROJECTION_LIMITS.fluxResidual),
    "saved air velocity violates continuity",
  );
  return residual;
}

export function copyState(state) {
  return freeze({
    ...state,
    velocityMPS: [...state.velocityMPS],
    smokeKg: [...state.smokeKg],
    heatJ: [...state.heatJ],
  });
}

export function initialState(g, identity, input) {
  record(input, ["cells"]);
  array(input.cells, g.n);
  const smokeKg = Array(g.n).fill(0),
    heatJ = Array(g.n).fill(0),
    seen = new Set();
  for (const cell of input.cells) {
    record(cell, ["cellId", "smokeKg", "heatJ"]);
    const i = g.cellIndex.get(cell.cellId);
    assert(
      i !== undefined && g.fluid[i] && !seen.has(i),
      "unique known fluid initial cell",
    );
    seen.add(i);
    smokeKg[i] = cell.smokeKg;
    heatJ[i] = cell.heatJ;
  }
  assert(
    seen.size === g.fluid.reduce((n, value) => n + value, 0),
    "one explicit initial stock per fluid cell",
  );
  const state = {
    version: STATE_VERSION,
    identity,
    timeS: 0,
    steps: 0,
    velocityMPS: Array(g.faces.length).fill(0),
    smokeKg,
    heatJ,
    initialSmokeKg: sum(smokeKg),
    initialHeatJ: sum(heatJ),
    smokeSourceKg: 0,
    heatSourceJ: 0,
    smokeBoundaryKg: 0,
    heatBoundaryJ: 0,
    airImportM3: 0,
    airExportM3: 0,
  };
  validateState(g, identity, state);
  return copyState(state);
}

export function facts(g, identity, state) {
  const residual = validateState(g, identity, state),
    carrierKg = g.model.densityKgM3 * g.volume;
  return freeze({
    timeS: state.timeS,
    steps: state.steps,
    balance: residual,
    cells: g.cells
      .filter((c) => c.fluid)
      .map((c) => ({
        cellId: c.id,
        at: [...c.world],
        volumeM3: g.volume,
        smokeKg: state.smokeKg[c.i],
        smokeKgM3: state.smokeKg[c.i] / g.volume,
        heatJ: state.heatJ[c.i],
        temperatureK:
          g.model.referenceTemperatureK +
          state.heatJ[c.i] / (carrierKg * g.model.heatCapacityJKgK),
      })),
    faces: g.faces.map((f) => ({
      faceId: f.id,
      areaM2: f.area,
      distanceM: f.distance,
      leftCellId: f.i < 0 ? null : g.cellIds[f.i],
      rightCellId: f.j < 0 ? null : g.cellIds[f.j],
      velocityMPS: state.velocityMPS[f.k],
      boundary: f.boundary,
    })),
  });
}
