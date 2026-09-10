import assert from "node:assert/strict";
import test from "node:test";
import { encode } from "../../engine/region/codec.ts";
import { STEP_SECONDS } from "../../ticker.js";
import { GOBLIN_BREW_ATMOSPHERE_RELEASE } from "../goblin-atmosphere.ts";
import {
  admitPaidAtmosphereReceivers,
  initialPaidAtmosphereReleases,
  paidAtmosphereRelease,
  paidAtmosphereReleaseFacts,
  parsePaidAtmosphereReleases,
  planPaidAtmosphereTicks,
  registerPaidAtmosphereRelease,
} from "./paid-releases.ts";

const durationS = GOBLIN_BREW_ATMOSPHERE_RELEASE.durationS;
const releaseTicks = durationS / STEP_SECONDS;
const totals = GOBLIN_BREW_ATMOSPHERE_RELEASE.totals;

function transformation(id, settlement = null) {
  return {
    id,
    definition: GOBLIN_BREW_ATMOSPHERE_RELEASE.paidInput.recipe,
    inputs: [
      { role: "malt", lot: `${id}:malt`, material: "malt", quantity: 2 },
      { role: "water", lot: `${id}:water`, material: "water", quantity: 2 },
      {
        role: "mugwort",
        lot: `${id}:mugwort`,
        material: "mugwort",
        quantity: 1,
      },
      {
        role: GOBLIN_BREW_ATMOSPHERE_RELEASE.paidInput.role,
        lot: `${id}:fuel`,
        material: GOBLIN_BREW_ATMOSPHERE_RELEASE.paidInput.material,
        quantity: GOBLIN_BREW_ATMOSPHERE_RELEASE.paidInput.quantity,
      },
    ],
    settlement,
  };
}

function materials(transformations = []) {
  return {
    lots: [],
    transfers: [],
    bindings: [],
    transformations,
    consumptions: [],
    sinks: [],
    embedded: [],
    nextLotId: 1,
    consumedWood: transformations.length,
  };
}

function air(smokeKg = 0, heatJ = 0, cellIds = ["gas:hearth"]) {
  return {
    source: { smokeKg, heatJ },
    cells: cellIds.map((id) => ({ id })),
  };
}

function released(...elapsed) {
  return {
    smokeKg: elapsed.reduce(
      (sum, seconds) => sum + totals.smokeKg * (seconds / durationS),
      0,
    ),
    heatJ: elapsed.reduce(
      (sum, seconds) => sum + totals.heatJ * (seconds / durationS),
      0,
    ),
  };
}

function register(state, owner, facts, id, cellId = "gas:hearth") {
  const result = registerPaidAtmosphereRelease(state, owner, facts, id, cellId);
  assert.equal(result.status, "applied");
  return result.state;
}

const longCellId = `gas:${"c".repeat(156)}`;
function longTransformationId(index) {
  const prefix = `brew:${index}:`;
  return `${prefix}${"t".repeat(160 - prefix.length)}`;
}
function wireState(entries, count, elapsedTicks) {
  return {
    version: "goblin-paid-atmosphere-releases-v1",
    obligations: entries.slice(0, count).map((entry) => ({
      transformationId: entry.id,
      cellId: longCellId,
      elapsedTicks,
    })),
  };
}
function maximumWireCount(entries, elapsedTicks) {
  let lower = 0,
    upper = entries.length;
  while (lower < upper) {
    const count = Math.ceil((lower + upper) / 2);
    try {
      encode(wireState(entries, count, elapsedTicks), 1_048_576, 65_536);
      lower = count;
    } catch (error) {
      assert.match(error.message, /region-byte-budget/);
      upper = count - 1;
    }
  }
  return lower;
}

test("cold admission binds every paid transformation once to an exact zero source ledger", () => {
  const emptyMaterials = materials(),
    facts = air(),
    initial = initialPaidAtmosphereReleases(emptyMaterials, facts),
    paidMaterials = materials([transformation("brew:1")]);
  assert.deepEqual(initial.obligations, []);
  assert.throws(
    () => initialPaidAtmosphereReleases(emptyMaterials, air(1e-9, 0)),
    /source totals/,
  );
  assert.throws(
    () => parsePaidAtmosphereReleases(initial, paidMaterials, facts),
    /transformations.*obligations/,
  );

  const state = register(initial, paidMaterials, facts, "brew:1");
  assert.deepEqual(state.obligations, [
    { transformationId: "brew:1", cellId: "gas:hearth", elapsedTicks: 0 },
  ]);
  assert.deepEqual(
    parsePaidAtmosphereReleases(structuredClone(state), paidMaterials, facts),
    state,
  );
  assert.throws(
    () =>
      parsePaidAtmosphereReleases(
        { ...state, obligations: [...state.obligations, state.obligations[0]] },
        paidMaterials,
        facts,
      ),
    /invalid paid atmosphere release obligations/,
  );
  assert.throws(
    () =>
      parsePaidAtmosphereReleases(
        { ...state, extra: true },
        paidMaterials,
        facts,
      ),
    /unrecognized|key/i,
  );

  let reads = 0;
  const accessor = {};
  Object.defineProperty(accessor, "version", {
    enumerable: true,
    get() {
      reads++;
      return state.version;
    },
  });
  accessor.obligations = [];
  assert.throws(
    () => parsePaidAtmosphereReleases(accessor, emptyMaterials, facts),
    /record|data/i,
  );
  assert.equal(reads, 0);
});

test("registration is detached and blocks an unavailable physical source cell", () => {
  const initial = initialPaidAtmosphereReleases(materials(), air()),
    paidMaterials = materials([transformation("brew:1")]),
    before = structuredClone(initial),
    blocked = registerPaidAtmosphereRelease(
      initial,
      paidMaterials,
      air(0, 0, []),
      "brew:1",
      "gas:occluded",
    );
  assert.deepEqual(blocked, {
    status: "blocked",
    reason: "source-cell-unavailable",
  });
  assert.deepEqual(initial, before);
  const state = register(initial, paidMaterials, air(), "brew:1");
  assert.deepEqual(admitPaidAtmosphereReceivers(state, air()), {
    status: "ready",
  });
  assert.deepEqual(admitPaidAtmosphereReceivers(state, air(0, 0, [])), {
    status: "blocked",
    reason: "source-cell-unavailable",
  });
  assert.throws(
    () => parsePaidAtmosphereReleases(state, paidMaterials, air(0, 0, [])),
    /source cell unavailable/,
  );
  assert.throws(
    () =>
      registerPaidAtmosphereRelease(
        state,
        paidMaterials,
        air(),
        "brew:1",
        "gas:hearth",
      ),
    /transformations.*obligations/,
  );
});

test("one host interval returns cell rates and detached progress for paired publication", () => {
  const owner = materials([transformation("brew:1")]),
    facts = air(),
    initial = initialPaidAtmosphereReleases(materials(), facts),
    state = register(initial, owner, facts, "brew:1"),
    before = structuredClone(state),
    result = planPaidAtmosphereTicks(state, owner, facts, 40);
  assert.equal(result.status, "ready");
  assert.deepEqual(state, before);
  assert.equal(result.segments.length, 1);
  assert.equal(result.segments[0].ticks, 40);
  assert.equal(result.segments[0].seconds, 2);
  assert.equal(result.segments[0].sources.length, 1);
  assert.equal(result.segments[0].sources[0].cellId, "gas:hearth");
  assert.ok(
    Math.abs(
      result.segments[0].sources[0].smokeKgS - totals.smokeKg / durationS,
    ) < 1e-20,
  );
  assert.equal(result.segments[0].sources[0].heatJS, totals.heatJ / durationS);
  assert.equal(result.state.obligations[0].elapsedTicks, 40);
  assert.throws(
    () => parsePaidAtmosphereReleases(result.state, owner, facts),
    /source totals/,
  );
  const emitted = released(2),
    nextAir = air(emitted.smokeKg, emitted.heatJ);
  assert.deepEqual(
    parsePaidAtmosphereReleases(result.state, owner, nextAir),
    result.state,
  );
  assert.deepEqual(
    paidAtmosphereReleaseFacts(result.state, owner, nextAir).released,
    emitted,
  );
  assert.equal(paidAtmosphereRelease(result.state, "missing"), null);
  assert.equal(
    paidAtmosphereRelease(result.state, "brew:1").fraction,
    2 / durationS,
  );
});

test("multiple paid releases share source-end boundaries and restore independent of order", () => {
  const firstOwner = materials([transformation("brew:1")]),
    zero = air(0, 0, ["gas:left", "gas:right"]),
    baseline = initialPaidAtmosphereReleases(materials(), zero),
    first = register(baseline, firstOwner, zero, "brew:1", "gas:left"),
    partial = planPaidAtmosphereTicks(first, firstOwner, zero, 20);
  assert.equal(partial.status, "ready");
  const oneReleased = released(1),
    partialAir = air(oneReleased.smokeKg, oneReleased.heatJ, [
      "gas:left",
      "gas:right",
    ]),
    owner = materials([transformation("brew:1"), transformation("brew:2")]),
    both = register(partial.state, owner, partialAir, "brew:2", "gas:right"),
    reversed = {
      ...both,
      obligations: [...both.obligations].reverse(),
    };
  assert.deepEqual(
    parsePaidAtmosphereReleases(reversed, owner, partialAir),
    both,
  );

  const result = planPaidAtmosphereTicks(both, owner, partialAir, releaseTicks);
  assert.equal(result.status, "ready");
  assert.deepEqual(
    result.segments.map((segment) => [
      segment.ticks,
      segment.seconds,
      segment.sources.length,
    ]),
    [
      [100, 5, 2],
      [20, 1, 1],
    ],
  );
  assert.deepEqual(
    result.state.obligations.map((entry) => entry.elapsedTicks),
    [releaseTicks, releaseTicks],
  );
  const allReleased = released(durationS, durationS);
  assert.deepEqual(
    parsePaidAtmosphereReleases(
      result.state,
      owner,
      air(allReleased.smokeKg, allReleased.heatJ, []),
    ),
    result.state,
  );
});

test("active releases block when occluded while completed provenance can coast", () => {
  const owner = materials([transformation("brew:1")]),
    zero = air(),
    initial = initialPaidAtmosphereReleases(materials(), zero),
    state = register(initial, owner, zero, "brew:1"),
    blocked = planPaidAtmosphereTicks(state, owner, air(0, 0, []), 1);
  assert.deepEqual(blocked, {
    status: "blocked",
    reason: "source-cell-unavailable",
  });

  const complete = planPaidAtmosphereTicks(state, owner, zero, releaseTicks);
  assert.equal(complete.status, "ready");
  const settledOwner = materials([
      transformation("brew:1", {
        station: "brew-station:1",
        retained: [
          { role: "catalyst", lot: "barm:1", material: "barm", quantity: 1 },
          { role: "package", lot: "keg:1", material: "keg", quantity: 1 },
        ],
        outputs: [
          { role: "ale", destination: "keg:1", material: "ale", quantity: 4 },
          {
            role: "spent-grain",
            destination: "tray:1",
            material: "spent-grain",
            quantity: 1,
          },
        ],
      }),
    ]),
    fullAir = air(totals.smokeKg, totals.heatJ, []),
    restored = parsePaidAtmosphereReleases(
      structuredClone(complete.state),
      settledOwner,
      fullAir,
    ),
    coast = planPaidAtmosphereTicks(restored, settledOwner, fullAir, 20);
  assert.equal(coast.status, "ready");
  assert.deepEqual(coast.segments, [{ ticks: 20, seconds: 1, sources: [] }]);
  assert.equal(coast.state.obligations[0].transformationId, "brew:1");
});

test("tick admission rejects invalid batches and reaches exact completion in ordinary play", () => {
  const empty = initialPaidAtmosphereReleases(materials(), air());
  assert.throws(
    () => planPaidAtmosphereTicks(empty, materials(), air(), -1),
    /greater than or equal|nonnegative/i,
  );
  const owner = materials([transformation("brew:1")]),
    state = register(empty, owner, air(), "brew:1"),
    smokeDeltas = [],
    heatDeltas = [];
  let current = state;
  for (let tick = 1; tick <= releaseTicks; tick++) {
    const currentAir = air(
        smokeDeltas.reduce((sum, value) => sum + value, 0),
        heatDeltas.reduce((sum, value) => sum + value, 0),
      ),
      plan = planPaidAtmosphereTicks(current, owner, currentAir, 1);
    assert.equal(plan.status, "ready");
    assert.deepEqual(
      plan.segments.map((segment) => [segment.ticks, segment.seconds]),
      [[1, STEP_SECONDS]],
    );
    for (const segment of plan.segments)
      for (const source of segment.sources) {
        smokeDeltas.push(source.smokeKgS * segment.seconds);
        heatDeltas.push(source.heatJS * segment.seconds);
      }
    current = plan.state;
    assert.equal(current.obligations[0].elapsedTicks, tick);
  }
  const fullAir = air(
    smokeDeltas.reduce((sum, value) => sum + value, 0),
    heatDeltas.reduce((sum, value) => sum + value, 0),
    [],
  );
  assert.deepEqual(
    parsePaidAtmosphereReleases(current, owner, fullAir),
    current,
  );
  assert.equal(current.obligations[0].elapsedTicks, releaseTicks);
  const coast = planPaidAtmosphereTicks(current, owner, fullAir, 1);
  assert.equal(coast.status, "ready");
  assert.deepEqual(coast.segments, [
    { ticks: 1, seconds: STEP_SECONDS, sources: [] },
  ]);
});

test("canonical tick endpoints finish a 107 plus 13 batch without a decimal coast", () => {
  const owner = materials([transformation("brew:1")]),
    zero = air(),
    initial = initialPaidAtmosphereReleases(materials(), zero),
    state = register(initial, owner, zero, "brew:1"),
    first = planPaidAtmosphereTicks(state, owner, zero, 107);
  assert.equal(first.status, "ready");
  const before = released(107 * STEP_SECONDS),
    currentAir = air(before.smokeKg, before.heatJ),
    final = planPaidAtmosphereTicks(first.state, owner, currentAir, 13);
  assert.equal(final.status, "ready");
  assert.deepEqual(
    final.segments.map((segment) => [segment.ticks, segment.seconds]),
    [[13, 13 * STEP_SECONDS]],
  );
  const segment = final.segments[0],
    source = segment.sources[0];
  assert.ok(
    Math.abs(
      before.smokeKg + source.smokeKgS * segment.seconds - totals.smokeKg,
    ) < 1e-18,
  );
  assert.ok(
    Math.abs(before.heatJ + source.heatJS * segment.seconds - totals.heatJ) <
      1e-10,
  );
  assert.deepEqual(
    parsePaidAtmosphereReleases(
      final.state,
      owner,
      air(totals.smokeKg, totals.heatJ, []),
    ),
    final.state,
  );
});

test("full retained provenance returns an explicit history-capacity block", () => {
  const historySize = 4_096,
    receipts = Array.from({ length: historySize + 1 }, (_, index) =>
      transformation(`brew:${index}`),
    ),
    obligations = receipts.slice(0, historySize).map((entry) => ({
      transformationId: entry.id,
      cellId: "gas:retired",
      elapsedTicks: releaseTicks,
    })),
    history = {
      version: "goblin-paid-atmosphere-releases-v1",
      obligations,
    },
    source = air(totals.smokeKg * historySize, totals.heatJ * historySize, [
      "gas:new",
    ]),
    result = registerPaidAtmosphereRelease(
      history,
      materials(receipts),
      source,
      receipts[historySize].id,
      "gas:new",
    );
  assert.deepEqual(result, {
    status: "blocked",
    reason: "history-capacity",
  });
});

test("cold admission reserves the final cursor wire and registration reports byte capacity", () => {
  const entries = Array.from({ length: 4_096 }, (_, index) =>
      transformation(longTransformationId(index)),
    ),
    currentMaximum = maximumWireCount(entries, 0),
    finalMaximum = maximumWireCount(entries, releaseTicks);
  assert(currentMaximum > finalMaximum);
  const currentOnly = wireState(entries, currentMaximum, 0);
  assert.doesNotThrow(() => encode(currentOnly, 1_048_576, 65_536));
  assert.throws(
    () => parsePaidAtmosphereReleases(currentOnly, materials(), air()),
    /region-byte-budget/,
  );

  const history = wireState(entries, finalMaximum, releaseTicks),
    paid = entries.slice(0, finalMaximum + 1),
    result = registerPaidAtmosphereRelease(
      history,
      materials(paid),
      air(totals.smokeKg * finalMaximum, totals.heatJ * finalMaximum, [
        longCellId,
      ]),
      paid[finalMaximum].id,
      longCellId,
    );
  assert(finalMaximum < 4_096);
  assert.deepEqual(result, {
    status: "blocked",
    reason: "history-byte-capacity",
  });
});
