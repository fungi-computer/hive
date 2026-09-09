import test from "node:test";
import assert from "node:assert/strict";
import {
  excavationYield,
  removalYield,
  terrainYieldBalance,
  terrainYieldProblem,
  TERRAIN_YIELDS,
} from "./terrain-yields.ts";
import { createWetClearing } from "./world-presets/seepage/wet-clearing.mjs";
import { createClearing } from "./clearing.ts";
import { createGroundLot, createMaterialsState } from "./materials.ts";
import { excavateTerrain, parseTerrain, terrainDigProblem } from "./terrain.ts";
import { snapshotFor, restoreSnapshot } from "./clearing-state.ts";
const drop = { x: 7, z: 10, level: 0 };
function sourcePair() {
  const recipe = createWetClearing({ connected: true });
  const first = recipe.adapter.excavate(recipe.input, {
    at: [0, 14, 128],
  }).state;
  const second = recipe.adapter.excavate(first, { at: [0, 13, 128] }).state;
  return { recipe, first, second };
}

test("yield follows the exact target identity, not array tail or record object/key order", () => {
  const { first, second } = sourcePair();
  assert.equal(
    second.exports.at(-1).id,
    first.exports[0].id,
    "canonical record ordering places the new deeper cut before its predecessor",
  );
  const source = excavationYield(first.exports, second.exports, [0, 13, 128]);
  assert.deepEqual(source, {
    sourceId: "excavation:cell:0,13,128",
    material: "soil",
    quantity: 1,
    portionVolumeM3: 0.54,
  });
  const reconstructed = second.exports
    .toReversed()
    .map((record) => Object.fromEntries(Object.entries(record).reverse()));
  assert.deepEqual(
    excavationYield(
      structuredClone(first.exports),
      reconstructed,
      [0, 13, 128],
    ),
    source,
  );
  assert.equal(
    TERRAIN_YIELDS[1].portionVolumeM3,
    TERRAIN_YIELDS[2].portionVolumeM3,
  );
  assert.equal(
    Object.hasOwn(source, "massKg"),
    false,
    "bulk volume is not a mineral mass claim",
  );
});

test("a yield rejects changed/removed predecessor sources, unrelated additions and unsupported material", () => {
  const { recipe, first, second } = sourcePair();
  const changed = structuredClone(second.exports);
  changed.find((record) => record.id === first.exports[0].id).waterKg += 1;
  assert.throws(
    () => excavationYield(first.exports, changed, [0, 13, 128]),
    /changed predecessor/,
  );
  assert.throws(
    () =>
      excavationYield(
        first.exports,
        second.exports.filter((record) => record.id !== first.exports[0].id),
        [0, 13, 128],
      ),
    /changed predecessor/,
  );
  assert.throws(
    () => excavationYield(first.exports, second.exports, [0, 14, 128]),
    /already exists/,
  );
  assert.throws(
    () => excavationYield(first.exports, first.exports, [0, 13, 128]),
    /exact target/,
  );
  assert.throws(
    () =>
      excavationYield(
        first.exports,
        [...second.exports, second.exports[0]],
        [0, 13, 128],
      ),
    /duplicate/,
  );
  const unrelated = recipe.adapter.excavate(second, { at: [1, 14, 128] }).state;
  assert.throws(
    () => excavationYield(first.exports, unrelated.exports, [0, 13, 128]),
    /unrelated source/,
  );
  assert.throws(
    () => removalYield({ ...first.exports[0], materialId: 99 }),
    /unsupported/,
  );
  assert.throws(
    () => removalYield({ ...first.exports[0], kind: "impermeable" }),
    /unsupported/,
  );
  assert.throws(
    () => removalYield({ ...first.exports[0], sourceVoxelM3: 1 }),
    /bulk portion/,
  );
  assert.throws(
    () => removalYield({ ...first.exports[0], id: "invented" }),
    /source identity/,
  );
});

test("actual17-cell engine shaft records project3 soil and15 stone bulk portions without opening main access", () => {
  const recipe = createWetClearing({ connected: true }),
    materials = createMaterialsState();
  let state = recipe.input;
  // Existing bounded engine fixture coordinates; no flow advance, new solver,
  // main pawn access, or retrospective claim about the retained numerical run.
  const targets = [
    [0, 14, 128],
    ...Array.from({ length: 17 }, (_, i) => [1, 14 - i, 128]),
  ];
  for (const at of targets) {
    const next = recipe.adapter.excavate(state, { at }).state;
    const yielded = excavationYield(state.exports, next.exports, at);
    const admitted = createGroundLot(
      materials,
      yielded.material,
      yielded.quantity,
      drop,
    );
    assert(admitted.ok);
    assert.equal(terrainYieldProblem(next.exports, materials.lots), null);
    state = next;
  }
  assert.deepEqual(terrainYieldBalance(state.exports, materials.lots), {
    expected: { soil: 3, stone: 15 },
    actual: { soil: 3, stone: 15 },
  });
  assert(
    state.exports
      .filter((record) => record.kind === "porous")
      .some((record) => record.waterKg > 0),
  );
  assert(
    state.exports
      .filter((record) => record.kind === "impermeable")
      .every((record) => record.waterKg === 0),
  );
  assert.equal(
    state.soilState.initialTotalKg,
    recipe.input.soilState.initialTotalKg,
  );
  assert.equal(state.soilState.timeS, recipe.input.soilState.timeS);
  assert.equal(state.soilState.steps, recipe.input.soilState.steps);
  assert.throws(
    () => parseTerrain(state),
    /stone material yields are not yet supported/,
  );
  assert(
    terrainDigProblem(recipe.input, [1, 12, 128]),
    "main32-cell admission still excludes original stone",
  );
  materials.lots.find((lot) => lot.material === "stone").material = "soil";
  assert.match(
    terrainYieldProblem(state.exports, materials.lots),
    /soil conservation/,
  );
});

test("current soil completion accounting survives save and rejects forged stone, wrong quantity and predecessor format", () => {
  const state = createClearing(),
    previous = state.terrain;
  state.terrain = excavateTerrain(previous, [0, 14, 128]);
  const yielded = excavationYield(
    previous.exports,
    state.terrain.exports,
    [0, 14, 128],
  );
  const admitted = createGroundLot(
    state.materials,
    yielded.material,
    yielded.quantity,
    drop,
  );
  assert(admitted.ok);
  const saved = snapshotFor(state);
  assert.equal(saved.schema, 21);
  assert.deepEqual(restoreSnapshot(saved).state.materials, state.materials);
  const mislabeled = structuredClone(saved);
  mislabeled.savedState.materials.lots.find(
    (lot) => lot.id === admitted.value.id,
  ).material = "stone";
  assert.throws(() => restoreSnapshot(mislabeled), /soil conservation/);
  const inflated = structuredClone(saved);
  inflated.savedState.materials.lots.find(
    (lot) => lot.id === admitted.value.id,
  ).quantity = 2;
  assert.throws(() => restoreSnapshot(inflated), /soil conservation/);
  const fabricated = structuredClone(saved);
  fabricated.savedState.materials.lots.push({
    id: "invented-stone",
    material: "stone",
    quantity: 1,
    location: { kind: "ground", ...drop },
  });
  assert.throws(() => restoreSnapshot(fabricated), /stone conservation/);
  assert.throws(() => restoreSnapshot({ ...saved, schema: 20 }));
});
