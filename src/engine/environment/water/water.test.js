import test from "node:test";
import assert from "node:assert/strict";
import { createWater } from "./index.js";
import { compileWater } from "./geometry.mjs";
import { pressureStep } from "./pressure.mjs";

const soil = {
  id: "loam",
  porosity: 0.4,
  retention: 0.1,
  absorbMPerS: 0.01,
  seepMPerS: 0.005,
};
const id = (at) => `cell:${at.join(",")}`;
function fixture(cells, faces, amounts, extra = {}) {
  const definition = {
    id: "finite-water-law",
    revision: 0,
    spacingM: [0.1, 0.1, 0.1],
    soils: [soil],
    cells,
    faces: faces.map(([a, b]) => ({ a, b, openFraction: 1 })),
    fallMPerS: 1,
    spreadMPerS: 0.5,
    pressureWetFraction: 0.999,
    ...extra,
  };
  const owner = createWater(definition);
  return {
    definition,
    owner,
    state: owner.initial({
      stocks: cells.map((cell, i) => ({ id: id(cell.at), massKg: amounts[i] })),
    }),
  };
}
const emptyCell = (at) => ({ at, kind: "void" });
const close = (a, b) => assert.ok(Math.abs(a - b) <= 1e-10, `${a} != ${b}`);
const stocks = (owner, state) =>
  new Map(owner.read(state).cells.map((cell) => [cell.id, cell.massKg]));

test("shared donors and receiver conserve finite stock independently of definition order", () => {
  const left = [-1, 0, 0],
    middle = [0, 0, 0],
    right = [1, 0, 0],
    top = [0, 1, 0];
  const a = fixture(
    [left, middle, right, top].map(emptyCell),
    [
      [left, middle],
      [middle, right],
      [top, middle],
    ],
    [0.9, 0.95, 0.9, 0.01],
  );
  const before = a.owner.encode(a.state),
    result = a.owner.advance(a.state, 1);
  const reversed = createWater({
    ...a.definition,
    cells: [...a.definition.cells].reverse(),
    faces: a.definition.faces.map((f) => ({ ...f, a: f.b, b: f.a })).reverse(),
  });
  assert.equal(a.owner.identity, reversed.identity);
  assert.deepEqual(
    result.state,
    reversed.advance(reversed.decode(before), 1).state,
  );
  close(a.owner.read(result.state).totalKg, a.owner.read(a.state).totalKg);
  assert.equal(a.owner.encode(a.state), before);
  assert.ok(result.receipt.flows.length > 0);
  for (const cell of a.owner.read(result.state).cells)
    assert.ok(cell.massKg >= 0 && cell.massKg <= cell.capacityKg);
});

test("stacked disconnected voids do not exchange through an intact intervening layer", () => {
  const high = [0, 3, 0],
    upper = [0, 2, 0],
    lower = [0, 0, 0],
    bottom = [0, -1, 0];
  const { owner, state } = fixture(
    [high, upper, lower, bottom].map(emptyCell),
    [
      [high, upper],
      [lower, bottom],
    ],
    [0.8, 0, 0.3, 0],
  );
  const next = owner.advance(state, 2),
    amounts = stocks(owner, next.state);
  assert.ok(amounts.get(id(upper)) > 0);
  assert.ok(amounts.get(id(bottom)) > 0);
  close(amounts.get(id(high)) + amounts.get(id(upper)), 0.8);
  close(amounts.get(id(lower)) + amounts.get(id(bottom)), 0.3);
  assert.ok(
    next.receipt.flows.every((flow) =>
      ["y:0,3,0", "y:0,0,0"].includes(flow.faceId),
    ),
  );
});

test("finite wet soil seeps into an opening while retained moisture remains in its one stock", () => {
  const earth = [0, 0, 0],
    hole = [1, 0, 0];
  const { owner, state } = fixture(
    [{ at: earth, kind: "soil", soilId: "loam" }, emptyCell(hole)],
    [[earth, hole]],
    [0.35, 0],
  );
  const next = owner.advance(state, 10),
    amounts = stocks(owner, next.state);
  assert.ok(amounts.get(id(hole)) > 0);
  assert.ok(amounts.get(id(earth)) >= 0.1);
  close(amounts.get(id(earth)) + amounts.get(id(hole)), 0.35);
  assert.equal(next.state.boundaryKg, 0);
});

test("dry soil absorbs from an actual wet contact without minting a separate moisture stock", () => {
  const puddle = [0, 1, 0],
    earth = [0, 0, 0];
  const { owner, state } = fixture(
    [emptyCell(puddle), { at: earth, kind: "soil", soilId: "loam" }],
    [[puddle, earth]],
    [0.2, 0],
  );
  const next = owner.advance(state, 1),
    amounts = stocks(owner, next.state);
  assert.ok(amounts.get(id(earth)) > 0);
  assert.ok(amounts.get(id(puddle)) < 0.2);
  close(owner.read(next.state).totalKg, 0.2);
});

test("current save and finite vessel exchange preserve one boundary and reject overdraft", () => {
  const at = [0, -12, 0];
  const { owner, state } = fixture([emptyCell(at)], [], [0.5]);
  const drawn = owner.exchange(state, {
    id: id(at),
    direction: "withdraw",
    massKg: 0.2,
  });
  close(owner.read(drawn.state).totalKg, 0.3);
  assert.equal(drawn.state.boundaryKg, -0.2);
  assert.deepEqual(owner.decode(owner.encode(drawn.state)), drawn.state);
  const frozen = owner.encode(drawn.state);
  assert.throws(
    () =>
      owner.exchange(drawn.state, {
        id: id(at),
        direction: "withdraw",
        massKg: 0.4,
      }),
    /available/,
  );
  assert.equal(owner.encode(drawn.state), frozen);
  close(
    owner.read(
      owner.exchange(drawn.state, {
        id: id(at),
        direction: "deposit",
        massKg: 0.2,
      }).state,
    ).totalKg,
    0.5,
  );
});

test("578 cells at the game voxel metric preserve stock across a clearing and halo", () => {
  const cells = [],
    faces = [],
    amounts = [];
  for (let x = -1; x <= 15; x++)
    for (let z = -1; z <= 15; z++)
      for (let y = -2; y < 0; y++) {
        const at = [x, y, z];
        cells.push({ at, kind: "soil", soilId: "loam" });
        amounts.push((0.15 + (x + 1) * 0.01) * 540);
        if (x < 15) faces.push([at, [x + 1, y, z]]);
        if (z < 15) faces.push([at, [x, y, z + 1]]);
        if (y < -1) faces.push([at, [x, y + 1, z]]);
      }
  const { owner, state } = fixture(cells, faces, amounts, {
    spacingM: [1, 0.54, 1],
  });
  assert.equal(owner.read(state).cells.length, 578);
  const next = owner.advance(state, 0.05);
  assert.ok(next.receipt.flows.length > 0);
  close(owner.read(next.state).totalKg, owner.read(state).totalKg);
  assert.deepEqual(owner.decode(owner.encode(next.state)), next.state);
});

test("nearly equal stocks retain unrepresentable flow without rejecting a valid step", () => {
  const a = [0, 0, 0],
    b = [1, 0, 0];
  const { owner, state } = fixture(
    [a, b].map(emptyCell),
    [[a, b]],
    [10, 10 + 160 * Number.EPSILON],
    { spacingM: [1, 1, 1] },
  );
  const next = owner.advance(state, 0.2);
  assert.deepEqual(next.state.massKg, state.massKg);
  assert.equal(next.receipt.flows.length, 0);
  assert.equal(next.work.unresolved, 1);
});

test("simultaneous wet neighbors share one retained-moisture deficit", () => {
  const earth = [0, 0, 0];
  const neighbors = [
    [-1, 0, 0],
    [1, 0, 0],
    [0, -1, 0],
    [0, 1, 0],
    [0, 0, -1],
    [0, 0, 1],
  ];
  const { owner, state } = fixture(
    [{ at: earth, kind: "soil", soilId: soil.id }, ...neighbors.map(emptyCell)],
    neighbors.map((at) => [earth, at]),
    [0, ...neighbors.map(() => 1)],
    { soils: [{ ...soil, absorbMPerS: 100 }] },
  );
  const next = owner.advance(state, 0.2);
  close(stocks(owner, next.state).get(id(earth)), 0.1);
  close(owner.read(next.state).totalKg, 6);
  assert.ok(next.receipt.flows.length >= 4);
});

test("retention must be numeric and derived face area and top must be finite", () => {
  const a = [0, 0, 0],
    b = [1, 0, 0];
  for (const retention of [null, "0"])
    assert.throws(
      () =>
        fixture([emptyCell(a)], [], [0], {
          soils: [{ ...soil, retention }],
        }),
      /soil pore/,
    );
  assert.throws(
    () =>
      fixture([emptyCell(a)], [], [0], {
        soils: [{ ...soil, retention: Infinity }],
      }),
    /region-data-invalid/,
  );
  assert.throws(
    () =>
      fixture([a, b].map(emptyCell), [[a, b]], [0, 0], {
        spacingM: [1e-300, 1e200, 1e200],
      }),
    /face area/,
  );
  assert.throws(
    () =>
      fixture([emptyCell([0, 1, 0])], [], [0], {
        spacingM: [1e-100, 1e308, 1e-208],
      }),
    /physical height/,
  );
});

test("definition admission reserves enough wire space for the complete saved stock", () => {
  const longId = "\u0000".repeat(160);
  const cells = Array.from({ length: 1900 }, (_, x) => ({
    at: [x, 0, 0],
    kind: "soil",
    soilId: longId,
  }));
  assert.throws(
    () =>
      fixture(
        cells,
        [],
        cells.map(() => 0),
        {
          soils: [{ ...soil, id: longId }],
        },
      ),
    /complete water state fits/,
  );
});

test("a roofed U passage transmits one finite quantity over every full intermediate face", () => {
  const left = [0, 1, 0],
    bottomLeft = [0, 0, 0],
    bottomMiddle = [1, 0, 0],
    bottomRight = [2, 0, 0],
    right = [2, 1, 0];
  const { owner, state, definition } = fixture(
    [left, bottomLeft, bottomMiddle, bottomRight, right].map(emptyCell),
    [
      [left, bottomLeft],
      [bottomLeft, bottomMiddle],
      [bottomMiddle, bottomRight],
      [bottomRight, right],
    ],
    [432, 540, 540, 540, 108],
    { spacingM: [1, 0.54, 1] },
  );
  const g = compileWater(definition);
  const result = pressureStep(g, state.massKg, 0.1, 262144);
  assert.equal(result.flows.length, 4);
  const amount = result.flows[0].massKg;
  assert.ok(amount > 0);
  assert.ok(result.flows.every((flow) => flow.massKg === amount));
  const next = { ...state, massKg: result.massKg };
  close(owner.read(next).totalKg, owner.read(state).totalKg);
  const balances = new Map(g.nodes.map((node) => [node.id, 0]));
  for (const flow of result.flows) {
    balances.set(flow.from, balances.get(flow.from) - flow.massKg);
    balances.set(flow.to, balances.get(flow.to) + flow.massKg);
  }
  for (const at of [bottomLeft, bottomMiddle, bottomRight]) {
    assert.equal(balances.get(id(at)), 0);
    assert.equal(result.massKg[g.index.get(id(at))], 540);
  }
  const dry = [...state.massKg];
  dry[g.index.get(id(bottomMiddle))] = 0;
  const blocked = pressureStep(g, dry, 0.1, 262144);
  assert.equal(
    blocked.massKg[g.index.get(id(right))],
    dry[g.index.get(id(right))],
  );
  assert.ok(
    !blocked.flows.some(
      (flow) => flow.from === id(bottomMiddle) && flow.to === id(bottomRight),
    ),
  );
  const joined = owner.advance(state, 0.2);
  assert.ok(
    joined.state.massKg[g.index.get(id(right))] >
      state.massKg[g.index.get(id(right))],
  );
  close(owner.read(joined.state).totalKg, owner.read(state).totalKg);
  const almost = [...state.massKg];
  almost[g.index.get(id(bottomMiddle))] -= 4 * Number.EPSILON * 540;
  const connected = pressureStep(g, almost, 0.1, 262144);
  assert.ok(
    connected.massKg[g.index.get(id(right))] > almost[g.index.get(id(right))],
  );
  assert.equal(
    connected.massKg[g.index.get(id(bottomMiddle))],
    almost[g.index.get(id(bottomMiddle))],
  );
  assert.ok(connected.massKg[g.index.get(id(bottomMiddle))] < 540);
});

test("pressure branches share a neck budget and exhausted search leaves stock owned", () => {
  const source = [0, 1, 0],
    neck = [0, 0, 0],
    fork = [1, 0, 0],
    up = [1, 1, 0],
    far = [2, 0, 0],
    farUp = [2, 1, 0];
  const { state, definition } = fixture(
    [source, neck, fork, up, far, farUp].map(emptyCell),
    [
      [source, neck],
      [neck, fork],
      [fork, up],
      [fork, far],
      [far, farUp],
    ],
    [432, 540, 540, 54, 540, 54],
    { spacingM: [1, 0.54, 1], fallMPerS: 0.001, spreadMPerS: 0.001 },
  );
  const g = compileWater(definition),
    result = pressureStep(g, state.massKg, 0.1, 262144);
  const shared = result.flows.filter((flow) => flow.faceId === "y:0,1,0");
  assert.ok(shared.length > 0);
  const gross = shared.reduce((sum, flow) => sum + flow.massKg, 0);
  assert.ok(gross <= 1000 * 1 * 0.1 * 0.001);
  const limited = pressureStep(g, state.massKg, 0.1, 0);
  assert.deepEqual(limited.massKg, state.massKg);
  assert.equal(limited.flows.length, 0);
  assert.ok(limited.work.pressureDeferred > 0);
});

test("a full source cannot drain below the roofed path crest it is supporting", () => {
  const source = [0, 1, 0],
    above = [0, 2, 0],
    roofed = [1, 1, 0],
    outlet = [2, 1, 0];
  const { state, definition } = fixture(
    [source, above, roofed, outlet].map(emptyCell),
    [
      [source, above],
      [source, roofed],
      [roofed, outlet],
    ],
    [540, 0, 540, 0],
    { spacingM: [1, 0.54, 1] },
  );
  const result = pressureStep(
    compileWater(definition),
    state.massKg,
    0.1,
    262144,
  );
  assert.deepEqual(result.massKg, state.massKg);
  assert.equal(result.flows.length, 0);
});

test("removing wet soil exports its moisture once and leaves the same-ID void dry", () => {
  const at = [0, 0, 0];
  const { owner, state, definition } = fixture(
    [{ at, kind: "soil", soilId: soil.id }],
    [],
    [0.237],
  );
  const result = owner.rebind(state, {
    ...definition,
    revision: 1,
    cells: [emptyCell(at)],
  });
  assert.equal(result.status, "applied");
  assert.equal(result.receipt.removedPoreWater.length, 1);
  assert.equal(result.receipt.removedPoreWater[0].massKg, 0.237);
  assert.equal(result.state.massKg[0], 0);
  assert.equal(result.state.initialTotalKg, state.initialTotalKg);
  assert.equal(result.state.boundaryKg, -0.237);
  const next = createWater(result.definition);
  assert.deepEqual(next.decode(next.encode(result.state)), result.state);
  assert.equal(state.massKg[0], 0.237);
});

test("solid completion displaces through surviving neighbors or waits without partial publication", () => {
  const a = [0, 0, 0],
    b = [1, 0, 0];
  const { owner, state, definition } = fixture(
    [a, b].map(emptyCell),
    [[a, b]],
    [0.4, 0.2],
  );
  const nextDefinition = {
    ...definition,
    revision: 1,
    cells: [emptyCell(b)],
    faces: [],
  };
  const result = owner.rebind(state, nextDefinition);
  assert.equal(result.status, "applied");
  close(result.state.massKg[0], 0.6);
  assert.equal(result.state.boundaryKg, 0);
  assert.equal(result.receipt.flows.length, 1);
  assert.equal(result.receipt.flows[0].faceId, "x:1,0,0");
  assert.equal(result.receipt.flows[0].massKg, 0.4);
  const full = owner.initial({
    stocks: [
      { id: id(a), massKg: 0.8 },
      { id: id(b), massKg: 0.8 },
    ],
  });
  const before = owner.encode(full);
  assert.deepEqual(owner.rebind(full, nextDefinition), {
    status: "blocked",
    reason: "liquid-needs-neighbor-space",
  });
  assert.equal(owner.encode(full), before);
});

test("stone opening adds no water and face closure preserves both existing stocks", () => {
  const a = [0, 0, 0],
    b = [1, 0, 0];
  const { owner, state, definition } = fixture([emptyCell(a)], [], [0.3]);
  const expanded = owner.rebind(state, {
    ...definition,
    revision: 1,
    cells: [emptyCell(a), emptyCell(b)],
    faces: [{ a, b, openFraction: 1 }],
  });
  assert.equal(expanded.status, "applied");
  assert.equal(expanded.state.boundaryKg, 0);
  assert.equal(expanded.receipt.removedPoreWater.length, 0);
  assert.equal(expanded.state.massKg[1], 0);
  const next = createWater(expanded.definition);
  const split = next.rebind(expanded.state, {
    ...expanded.definition,
    revision: 2,
    faces: [],
  });
  assert.deepEqual(split.state.massKg, expanded.state.massKg);
  assert.throws(
    () =>
      owner.rebind(state, {
        ...definition,
        revision: 1,
        cells: [emptyCell(a), { at: b, kind: "soil", soilId: soil.id }],
      }),
    /finite source counterpart/,
  );
});

test("definitions reject hidden data and nonphysical edges before simulation", () => {
  const a = [0, 0, 0],
    b = [1, 1, 0];
  assert.throws(
    () => fixture([a, b].map(emptyCell), [[a, b]], [0, 0]),
    /voxel face/,
  );
  const good = fixture([emptyCell(a)], [], [0]);
  let called = false;
  const raw = {
    ...good.definition,
    get fallMPerS() {
      called = true;
      return 1;
    },
  };
  assert.throws(() => createWater(raw));
  assert.equal(called, false);
});
