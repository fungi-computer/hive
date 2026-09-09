import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createAir } from "./index.js";

const definition = (changes = {}) => ({
  version: "voxel-air-definition-v1",
  regionId: "air-room",
  revision: 0,
  origin: [0, 0, 0],
  size: [3, 4, 2],
  spacingM: [1, 0.54, 1],
  solidCells: [],
  closedFaces: [],
  openSides: [],
  model: {
    densityKgM3: 1.2,
    heatCapacityJKgK: 1005,
    referenceTemperatureK: 293.15,
    gravityMSS: 9.81,
    viscosityM2S: 1.5e-5,
    thermalDiffusivityM2S: 2.2e-5,
    tracerDiffusivityM2S: 1e-5,
  },
  ...changes,
});

function cellStocks(d, values = () => ({ smokeKg: 0, heatJ: 0 })) {
  const cells = [];
  for (let z = 0; z < d.size[2]; z++)
    for (let y = 0; y < d.size[1]; y++)
      for (let x = 0; x < d.size[0]; x++) {
        const at = [x, y, z].map((v, i) => v + d.origin[i]),
          cellId = `cell:${at.join(",")}`;
        if (!d.solidCells.includes(cellId))
          cells.push({ cellId, ...values(at) });
      }
  return cells;
}
function initial(d, values) {
  const owner = createAir(d),
    state = owner.initial({ cells: cellStocks(d, values) });
  return { owner, state };
}
const clone = (value) => JSON.parse(JSON.stringify(value));
const unchanged = (input, call, pattern) => {
  const before = JSON.stringify(input);
  assert.throws(call, pattern);
  assert.equal(JSON.stringify(input), before);
};
const heatAt = (at) => ({
  smokeKg: at.join() === "1,1,0" ? 1e-6 : 0,
  heatJ: at.join() === "1,1,0" ? 100 : at.join() === "2,2,1" ? -40 : 0,
});

test("qualified warm/dilute method retains the independent frozen source checkpoint", () => {
  const reference = JSON.parse(
    readFileSync(
      new URL("./fixtures/qualified-warm-v1.json", import.meta.url),
      "utf8",
    ),
  );
  const { owner, state } = initial(definition(), heatAt);
  const result = owner.advance(state, 0.5, {
    dtMaxS: 0.125,
    sources: [{ cellId: "cell:1,1,0", smokeKgS: 1e-6, heatJS: 30 }],
  });
  const s = result.state,
    expected = reference.state;
  assert.deepEqual(s.velocityMPS, expected.velocity);
  assert.deepEqual(s.smokeKg, expected.smoke);
  assert.deepEqual(s.heatJ, expected.heat);
  assert.equal(s.timeS, expected.time);
  assert.equal(s.steps, expected.steps);
  for (const [key, old] of [
    ["smokeSourceKg", "smokeSource"],
    ["heatSourceJ", "heatSource"],
    ["smokeBoundaryKg", "smokeBoundary"],
    ["heatBoundaryJ", "heatBoundary"],
    ["airImportM3", "airImport"],
    ["airExportM3", "airExport"],
  ])
    assert.equal(s[key], expected[old]);
  assert.deepEqual(result.receipt.airM3, reference.receipt.air);
  assert.deepEqual(result.receipt.smokeKg, reference.receipt.smoke);
  assert.deepEqual(result.receipt.heatJ, reference.receipt.heat);
  assert.ok(result.work.projectionIterations > 0);
});

test("finite sources and an exterior vent preserve local/total smoke and heat accounting", () => {
  const d = definition(),
    { owner, state } = initial(d, () => ({ smokeKg: 1e-6, heatJ: 651.24 }));
  const source = { cellId: "cell:1,1,0", smokeKgS: 2e-6, heatJS: 20 };
  const warm = owner.advance(state, 1, { sources: [source], dtMaxS: 0.1 });
  assert.ok(Math.abs(warm.receipt.balance.totalSourceSmokeKg - 2e-6) < 1e-18);
  assert.ok(Math.abs(warm.receipt.balance.totalSourceHeatJ - 20) < 1e-12);
  const openedDefinition = definition({ revision: 1, openSides: ["x-", "x+"] });
  const opened = owner.rebind(warm.state, openedDefinition),
    next = createAir(opened.definition);
  assert.deepEqual(opened.state.smokeKg, warm.state.smokeKg);
  assert.deepEqual(opened.state.heatJ, warm.state.heatJ);
  assert.equal(opened.state.timeS, warm.state.timeS);
  assert.equal(opened.state.steps, warm.state.steps);
  assert.equal(opened.receipt.thermalTransferJ, 0);
  assert.equal(opened.receipt.smokeTransferKg, 0);
  const vented = next.advance(opened.state, 1, {
    sources: [source],
    dtMaxS: 0.1,
  });
  assert.ok(
    vented.receipt.balance.airExportM3 > 0 &&
      vented.receipt.balance.airImportM3 > 0,
  );
  assert.ok(vented.receipt.balance.boundarySmokeKg > 0);
  assert.ok(
    vented.receipt.balance.smokeKg < 1e-10 &&
      vented.receipt.balance.heatJ < 1e-5,
  );
  assert.ok(Math.abs(next.read(vented.state).balance.smokeKg) < 1e-10);
  assert.ok(Math.abs(next.read(vented.state).balance.heatJ) < 1e-5);
});

test("opening and closing internal faces split/rejoin continuity without resetting stocks or clock", () => {
  const d = definition(),
    { owner, state } = initial(d, heatAt);
  const moving = owner.advance(state, 0.5, { dtMaxS: 0.125 }).state;
  assert.ok(moving.velocityMPS.some((v) => Math.abs(v) > 1e-7));
  const walls = [];
  for (let z = 0; z < 2; z++)
    for (let y = 0; y < 4; y++) walls.push(`x:2,${y},${z}`);
  const split = owner.rebind(
    moving,
    definition({ revision: 1, closedFaces: walls }),
  );
  assert.equal(split.receipt.closedFaces.length, 8);
  assert.ok(split.receipt.kineticChangeJ <= 1e-10);
  for (const key of Object.keys(moving))
    if (!["identity", "velocityMPS"].includes(key))
      assert.deepEqual(split.state[key], moving[key]);
  const divided = createAir(split.definition);
  assert.ok(
    divided.read(split.state).faces.every((f) => !walls.includes(f.faceId)),
  );
  const after = divided.advance(split.state, 0.25, { dtMaxS: 0.125 }).state;
  const joined = divided.rebind(after, definition({ revision: 2 }));
  assert.equal(joined.receipt.newFaces.length, 8);
  assert.deepEqual(joined.state.smokeKg, after.smokeKg);
  assert.deepEqual(joined.state.heatJ, after.heatJ);
  assert.ok(joined.receipt.divergenceM3S <= 1e-10);
  createAir(joined.definition).advance(joined.state, 0.25, { dtMaxS: 0.125 });
});

test("encoded continuation rebuilds numerical caches and exactly preserves velocity history", () => {
  const d = definition(),
    { owner, state } = initial(d, heatAt);
  const first = owner.advance(state, 0.5, { dtMaxS: 0.125 }).state;
  const expected = owner.advance(first, 0.5, { dtMaxS: 0.125 });
  const fresh = createAir(clone(d)),
    restored = fresh.decode(owner.encode(first));
  const actual = fresh.advance(restored, 0.5, { dtMaxS: 0.125 });
  assert.deepEqual(actual.state, expected.state);
  assert.deepEqual(actual.receipt, expected.receipt);
  assert.deepEqual(actual.work, expected.work);
  assert.notStrictEqual(restored.velocityMPS, first.velocityMPS);
});

test("source, definition and save boundaries reject malformed plain data without invoking accessors", () => {
  const d = definition(),
    { owner, state } = initial(d);
  let calls = 0;
  const getter = Object.defineProperty({ ...d }, "model", {
    enumerable: true,
    get() {
      calls++;
      return d.model;
    },
  });
  assert.throws(() => createAir(getter), /accessor/);
  assert.equal(calls, 0);
  assert.throws(() => createAir({ ...d, temperature: 300 }), /unknown/);
  assert.throws(() => createAir(definition({ size: [11, 11, 11] })), /1024/);
  assert.throws(() => createAir(definition({ spacingM: [1, 1, 1] })), /metric/);
  assert.throws(
    () => createAir(definition({ solidCells: ["cell:99,0,0"] })),
    /domain/,
  );
  const bad = clone(state);
  bad.roomPressure = 100000;
  assert.throws(() => owner.decode(JSON.stringify(bad)), /unknown/);
  assert.throws(
    () => owner.decode(JSON.stringify({ ...state, version: "old" })),
    /identity/,
  );
  const rates = [{ cellId: "cell:0,0,0", smokeKgS: 0, heatJS: 1 }];
  unchanged(
    state,
    () => owner.advance(state, 0.1, { sources: [...rates, ...rates] }),
    /unique/,
  );
  unchanged(
    state,
    () => owner.advance(state, 0.1, { forcingAt() {} }),
    /unknown/,
  );
  const priorIdentity = owner.identity;
  d.closedFaces.push("x:1,0,0");
  d.model.gravityMSS = 0;
  assert.equal(owner.identity, priorIdentity);
  owner.advance(state, 0.1);
});

test("every scalar stage enforces warm and dilute limits before any state or source commits", () => {
  const d = definition(),
    { owner, state } = initial(d);
  const referenceJ = 1.2 * 1005 * 293.15 * 0.54,
    carrierKg = 1.2 * 0.54;
  // Each first stage is inside the envelope; the second Euler stage is not.
  unchanged(
    state,
    () =>
      owner.advance(state, 0.2, {
        sources: [
          {
            cellId: "cell:1,1,0",
            smokeKgS: 0,
            heatJS: (referenceJ * 0.04) / 0.2,
          },
        ],
      }),
    /approximation/,
  );
  unchanged(
    state,
    () =>
      owner.advance(state, 0.2, {
        sources: [
          {
            cellId: "cell:1,1,0",
            smokeKgS: (carrierKg * 0.008) / 0.2,
            heatJS: 0,
          },
        ],
      }),
    /approximation/,
  );
  assert.throws(
    () => initial(d, () => ({ smokeKg: 0, heatJ: referenceJ * 0.051 })),
    /approximation/,
  );
  assert.throws(
    () => initial(d, () => ({ smokeKg: carrierKg * 0.011, heatJ: 0 })),
    /approximation/,
  );
});

test("request-local clock solves decimal tails and512 accepted intervals without clock snapping", () => {
  const { owner, state } = initial(definition({ size: [2, 2, 2] }));
  const from64 = owner.decode(JSON.stringify({ ...state, timeS: 64 }));
  const decimal = owner.advance(from64, 1, { dtMaxS: 0.1 });
  assert.equal(decimal.state.timeS, 65);
  assert.equal(decimal.work.accepted, 10);
  assert.ok(decimal.receipt.steps.every((s) => s.dtS <= 0.2 && s.dtS >= 1e-6));
  const late = owner.decode(JSON.stringify({ ...state, timeS: 1e6 }));
  const many = owner.advance(late, 6, { dtMaxS: 6 / 512 });
  assert.equal(many.state.timeS, 1e6 + 6);
  assert.equal(many.work.accepted, 512);
  assert.equal(
    many.receipt.steps.reduce((n, s) => n + s.dtS, 0),
    6,
  );
  const coarse = owner.decode(JSON.stringify({ ...state, timeS: 1e12 }));
  unchanged(coarse, () => owner.advance(coarse, 0.2), /clock resolution/);
  assert.equal(owner.advance(coarse, 0).state.timeS, coarse.timeS);
  unchanged(state, () => owner.advance(state, 7), /bounded air interval/);
  unchanged(
    state,
    () => owner.advance(state, 0.2, { dtMaxS: 0.21 }),
    /timestep/,
  );
  unchanged(
    state,
    () => owner.advance(state, 0.2, { maxTrials: 513 }),
    /trials/,
  );
});

test("projection exhaustion and unsupported volume edits preserve the complete input", () => {
  const { owner, state } = initial(definition(), heatAt);
  unchanged(
    state,
    () => owner.advance(state, 0.1, { maxProjectionIterations: 1 }),
    /projectionIterations/,
  );
  const afterFailure = owner.advance(state, 0.1);
  const fresh = initial(definition(), heatAt);
  assert.deepEqual(
    afterFailure.state,
    fresh.owner.advance(fresh.state, 0.1).state,
  );
  unchanged(
    state,
    () =>
      owner.rebind(
        state,
        definition({ revision: 1, solidCells: ["cell:0,0,0"] }),
      ),
    /unchanged/,
  );
  unchanged(
    state,
    () =>
      owner.rebind(
        state,
        definition({
          revision: 1,
          model: { ...definition().model, densityKgM3: 1.3 },
        }),
      ),
    /unchanged/,
  );
  unchanged(state, () => owner.rebind(state, definition()), /newer/);
});

test("actual CFL retries and partial advancement cannot exceed caller work limits", () => {
  const d = definition({
    size: [2, 2, 2],
    openSides: ["x-", "x+"],
    model: {
      ...definition().model,
      gravityMSS: 0,
      viscosityM2S: 0,
      thermalDiffusivityM2S: 0,
      tracerDiffusivityM2S: 0,
    },
  });
  const { owner, state } = initial(d);
  const moving = owner.decode(
    JSON.stringify({
      ...state,
      velocityMPS: owner.read(state).faces.map((f) =>
        f.faceId.startsWith("x:") ? 5 : 0,
      ),
    }),
  );
  // Uniform open-duct velocity is divergence free; its scalar CFL requires
  // a smaller interval than the permitted .2s request. Work rejection must
  // preserve even this valid state after local, uncommitted progress.
  unchanged(
    moving,
    () => owner.advance(moving, 0.2, { maxTrials: 1 }),
    /trials work budget/,
  );
  unchanged(
    moving,
    () => owner.advance(moving, 0.2, { maxSteps: 1 }),
    /accepted step budget/,
  );
});
