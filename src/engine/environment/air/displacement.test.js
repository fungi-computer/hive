import test from "node:test";
import assert from "node:assert/strict";
import { createAir } from "./index.js";

const id = (x, y = 0, z = 0) => `cell:${x},${y},${z}`;
function domain({ size = [4, 2, 2], fluid, ...changes } = {}) {
  const solidCells = [];
  for (let z = 0; z < size[2]; z++)
    for (let y = 0; y < size[1]; y++)
      for (let x = 0; x < size[0]; x++)
        if (fluid && !fluid.includes(id(x, y, z))) solidCells.push(id(x, y, z));
  return {
    version: "voxel-air-definition-v1",
    regionId: "edit-duct",
    revision: 0,
    origin: [0, 0, 0],
    size,
    spacingM: [1, 0.54, 1],
    solidCells,
    closedFaces: [],
    openSides: ["x-"],
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
  };
}
function start(d) {
  const cells = [];
  for (let z = 0; z < d.size[2]; z++)
    for (let y = 0; y < d.size[1]; y++)
      for (let x = 0; x < d.size[0]; x++) {
        const cellId = id(x, y, z),
          marker = x + 1 + 4 * y + 16 * z;
        if (!d.solidCells.includes(cellId))
          cells.push({
            cellId,
            smokeKg: marker * 1e-5,
            heatJ: marker * -10,
          });
      }
  const owner = createAir(d);
  return { owner, state: owner.initial({ cells }) };
}
const stock = (owner, state, cellId) =>
  owner.read(state).cells.find((c) => c.cellId === cellId);
function rejectsUnchanged(state, call, message) {
  const before = JSON.stringify(state);
  assert.throws(call, message);
  assert.equal(JSON.stringify(state), before);
}
function blocksUnchanged(state, call) {
  const before = JSON.stringify(state);
  assert.deepEqual(call(), { status: "blocked", reason: "no-outdoor-route" });
  assert.equal(JSON.stringify(state), before);
}

test("closing a duct removes its deepest cells first and exports the actual boundary parcel", () => {
  const d = domain({ fluid: [id(0), id(1), id(2), id(3)] }),
    { owner, state } = start(d);
  const edited = owner.rebind(state, {
    ...d,
    revision: 1,
    solidCells: [...d.solidCells, id(1), id(2)],
  });
  const next = createAir(edited.definition),
    r = edited.receipt;
  assert.deepEqual(
    r.boundaryCrossings.map((c) => c.cellId),
    [id(2), id(1)],
  );
  assert.deepEqual(
    r.boundaryCrossings.map((c) => c.faceId),
    ["x:0,0,0", "x:0,0,0"],
  );
  assert.deepEqual(
    r.boundaryCrossings.map((c) => c.smokeKg),
    [1e-5, 2e-5],
  );
  assert.equal(r.thermalTransferJ, -30);
  assert.equal(r.airExportM3, 1.08);
  assert.equal(r.volumeChangeM3, -1.08);
  assert.equal(
    stock(next, edited.state, id(0)).smokeKg,
    stock(owner, state, id(2)).smokeKg,
  );
  assert.deepEqual(
    stock(next, edited.state, id(3)),
    stock(owner, state, id(3)),
    "unaffected sealed component",
  );
  for (const key of [
    "timeS",
    "steps",
    "initialSmokeKg",
    "initialHeatJ",
    "smokeSourceKg",
    "heatSourceJ",
  ])
    assert.equal(edited.state[key], state[key]);
  assert.deepEqual(next.decode(next.encode(edited.state)), edited.state);
  assert.deepEqual(
    owner.rebind(state, {
      ...edited.definition,
      solidCells: [...edited.definition.solidCells].reverse(),
    }),
    edited,
  );
});

test("opening a frontier draws existing air inward instead of creating ambient in the hole", () => {
  const open = domain({ fluid: [id(0), id(1), id(2), id(3)] });
  const d = { ...open, solidCells: [...open.solidCells, id(1), id(2)] };
  const { owner, state } = start(d);
  const edited = owner.rebind(state, { ...open, revision: 1 }),
    next = createAir(edited.definition);
  assert.deepEqual(
    edited.receipt.boundaryCrossings.map((c) => c.cellId),
    [id(1), id(2)],
  );
  assert.equal(stock(next, edited.state, id(2)).smokeKg, 1e-5);
  assert.equal(stock(next, edited.state, id(0)).smokeKg, 0);
  assert.equal(stock(next, edited.state, id(1)).heatJ, 0);
  assert.deepEqual(
    stock(next, edited.state, id(3)),
    stock(owner, state, id(3)),
  );
  assert.equal(edited.receipt.airImportM3, 1.08);
  assert.equal(edited.receipt.volumeChangeM3, 1.08);
  assert.equal(edited.state.smokeBoundaryKg, state.smokeBoundaryKg);
  assert.equal(edited.state.heatBoundaryJ, state.heatBoundaryJ);
  assert(
    edited.receipt.boundaryCrossings.every(
      (c) => c.direction === "import" && c.smokeKg === 0 && c.heatJ === 0,
    ),
  );
  assert.deepEqual(next.decode(next.encode(edited.state)), edited.state);
});

test("a four-voxel wall preserves budgets and accepts retained-face projection", () => {
  const d = domain({ size: [3, 4, 2], openSides: ["x-", "x+"] }),
    { owner, state } = start(d);
  const moving = owner.decode(
    JSON.stringify({
      ...state,
      velocityMPS: owner
        .read(state)
        .faces.map((f) => (f.faceId.startsWith("x:") ? 0.1 : 0)),
    }),
  );
  const wall = Array.from({ length: 4 }, (_, y) => id(1, y));
  const edited = owner.rebind(moving, { ...d, revision: 1, solidCells: wall });
  const next = createAir(edited.definition),
    facts = next.read(edited.state);
  assert.equal(edited.receipt.boundaryCrossings.length, 4);
  assert.equal(edited.receipt.airExportM3, 2.16);
  assert.equal(facts.cells.length, 20);
  assert(
    Math.abs(facts.balance.smokeKg) <= 1e-10 &&
      Math.abs(facts.balance.heatJ) <= 1e-5,
  );
  assert(edited.receipt.kineticChangeJ <= 1e-10);
  assert(edited.receipt.divergenceM3S <= 1e-10);
  assert.equal(edited.state.timeS, moving.timeS);
  assert.deepEqual(next.decode(next.encode(edited.state)), edited.state);
});

test("masked exterior and a later sealed parcel return blocked with no candidate to commit", () => {
  const isolated = id(1, 1, 1),
    fluid = [id(0), id(1), id(2), isolated];
  const d = domain({ fluid }),
    { owner, state } = start(d);
  blocksUnchanged(state, () =>
    owner.rebind(state, {
      ...d,
      revision: 1,
      solidCells: [...d.solidCells, id(2), isolated],
    }),
  );
  const masked = domain({
    fluid: [id(0), id(1), id(2)],
    closedFaces: ["x:0,0,0"],
  });
  const blocked = start(masked);
  blocksUnchanged(blocked.state, () =>
    blocked.owner.rebind(blocked.state, {
      ...masked,
      revision: 1,
      solidCells: [...masked.solidCells, id(2)],
    }),
  );
});

test("volume edits reject mixed topology, simultaneous openings and oversized event shapes", () => {
  const d = domain(),
    { owner, state } = start(d);
  rejectsUnchanged(
    state,
    () =>
      owner.rebind(state, {
        ...d,
        revision: 1,
        solidCells: [id(0)],
        openSides: ["x+"],
      }),
    /simultaneously/,
  );
  rejectsUnchanged(
    state,
    () =>
      owner.rebind(state, {
        ...d,
        revision: 1,
        solidCells: [id(0), id(1), id(2), id(3), id(0, 1)],
      }),
    /at most four/,
  );
  const solid = { ...d, solidCells: [id(0)] },
    mixed = start(solid);
  rejectsUnchanged(
    mixed.state,
    () =>
      mixed.owner.rebind(mixed.state, {
        ...solid,
        revision: 1,
        solidCells: [id(1)],
      }),
    /monotone/,
  );
  rejectsUnchanged(
    state,
    () => owner.rebind(state, { ...d, revision: 1, size: [5, 2, 2] }),
    /unchanged domain/,
  );
});

test("tiny boundary parcels survive from zero but reject unresolved historical-ledger increments", () => {
  const d = domain({ fluid: [id(0), id(1), id(2)] }),
    owner = createAir(d);
  const state = owner.initial({
    cells: [
      { cellId: id(0), smokeKg: 2e-16, heatJ: -2e-16 },
      { cellId: id(1), smokeKg: 0, heatJ: 0 },
      { cellId: id(2), smokeKg: 0, heatJ: 0 },
    ],
  });
  const next = { ...d, revision: 1, solidCells: [...d.solidCells, id(2)] };
  const moved = owner.rebind(state, next);
  assert.equal(moved.state.smokeBoundaryKg, 2e-16);
  assert.equal(moved.state.heatBoundaryJ, -2e-16);
  const coarse = owner.decode(
    JSON.stringify({ ...state, smokeSourceKg: 1, smokeBoundaryKg: 1 }),
  );
  rejectsUnchanged(
    coarse,
    () => owner.rebind(coarse, next),
    /arithmetic resolution/,
  );
});
