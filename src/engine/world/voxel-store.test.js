import test from "node:test";
import assert from "node:assert/strict";
import { createVoxelStore } from "./index.js";

const VOID = 17,
  BASALT = 513,
  TUNGSTEN = 60000;
function definition(overrides = {}) {
  return {
    identity: { world: "independent-quarry", seed: "bands-v1" },
    bounds: { minX: -8, maxX: 8, minY: -24, maxY: 16, minZ: -8, maxZ: 8 },
    brickSide: 4,
    materialIds: [TUNGSTEN, VOID, BASALT],
    generator: {
      id: "striped-quarry-v1",
      column: (x, z) => (y) =>
        y >= 0 ? VOID : y < -12 && (x + z) % 3 === 0 ? TUNGSTEN : BASALT,
    },
    ...overrides,
  };
}

test("independent palette, deep edits and inspected provenance share the public owner", () => {
  const config = definition(),
    world = createVoxelStore(config, { maxResidentBricks: 1 });
  const at = { x: -1, y: -17, z: 1 };
  assert.equal(world.readPoint(at), TUNGSTEN);
  assert.equal(world.inspect(at).source, "generated");
  assert.equal(world.stats().residentBricks, 0);
  const result = world.edit({
    expectedRevision: 0,
    cells: [{ ...at, expectedMaterial: TUNGSTEN, material: VOID }],
  });
  assert(result.ok);
  assert.deepEqual(result.changedBricks, ["-1,-5,0"]);
  const saved = world.save();
  assert.equal(world.inspect(at).source, "edit");
  assert.equal(world.inspect(at).generatedMaterial, TUNGSTEN);
  assert.equal(
    world.readBrick({ x: -1, y: -5, z: 0 }).material.BYTES_PER_ELEMENT,
    2,
  );
  world.readBrick({ x: 1, y: 1, z: 1 });
  assert.equal(world.stats().residentBricks, 1);
  assert.equal(world.inspect(at).resident, false);
  world.evictAll();
  assert.deepEqual(world.save(), saved);
  const restored = createVoxelStore(config, {
    checkpoint: JSON.parse(JSON.stringify(saved)),
  });
  assert.equal(restored.readPoint(at), VOID);
  assert.equal(restored.inspect(at).changeRevision, 1);
  assert.deepEqual(restored.save(), saved);
  // Definitions and query results cannot mutate owner state or alter the palette.
  config.materialIds.fill(0);
  config.identity.seed = "changed";
  world.describe().layout.materialIds.fill(0);
  world.readBrick({ x: -1, y: -5, z: 0 }).material.fill(0);
  saved.changes[0].material = 0;
  assert.equal(world.readPoint(at), VOID);
  assert.equal(world.save().identity.seed, "bands-v1");
});

test("aggregate edit capacity is atomic and credits base restoration in the same batch", () => {
  const world = createVoxelStore(definition(), { maxChangedCells: 1 });
  const first = { x: 0, y: 0, z: 0 },
    second = { x: 1, y: 0, z: 0 };
  const place = (at) => ({ ...at, expectedMaterial: VOID, material: BASALT });
  assert(world.edit({ expectedRevision: 0, cells: [place(first)] }).ok);
  const before = world.save();
  assert.equal(
    world.edit({ expectedRevision: 1, cells: [place(second)] }).reason,
    "edit-capacity",
  );
  assert.deepEqual(world.save(), before);
  assert(
    world.edit({
      expectedRevision: 1,
      cells: [
        place(second),
        { ...first, expectedMaterial: BASALT, material: VOID },
      ],
    }).ok,
  );
  assert.equal(world.save().changes.length, 1);
  assert.equal(world.readPoint(first), VOID);
  assert.equal(world.readPoint(second), BASALT);
  const oversized = world.save();
  oversized.changes.push({ ...first, material: BASALT, revision: 1 });
  assert.throws(
    () =>
      createVoxelStore(definition(), {
        maxChangedCells: 1,
        checkpoint: oversized,
      }),
    /budget/,
  );
});

test("checkpoint identity pins generator and storage meaning", () => {
  const config = definition(),
    saved = createVoxelStore(config).save();
  assert.throws(
    () =>
      createVoxelStore(
        definition({ generator: { ...config.generator, id: "changed-v2" } }),
        { checkpoint: saved },
      ),
    /mismatch/,
  );
  assert.throws(
    () =>
      createVoxelStore(definition({ materialIds: [VOID, BASALT] }), {
        checkpoint: saved,
      }),
    /mismatch/,
  );
  assert.throws(
    () => createVoxelStore(definition({ brickSide: 8 }), { checkpoint: saved }),
    /mismatch/,
  );
  assert.throws(
    () =>
      createVoxelStore(definition(), {
        checkpoint: { ...saved, surprise: true },
      }),
    /fields/,
  );
  const invalidIdentity = structuredClone(saved);
  invalidIdentity.identity.discarded = () => 1;
  assert.throws(
    () => createVoxelStore(definition(), { checkpoint: invalidIdentity }),
    /JSON/,
  );
  assert.throws(
    () => createVoxelStore(definition({ materialIds: [VOID, BASALT, 65536] })),
    /uint16/,
  );
  assert.throws(
    () =>
      createVoxelStore(definition({ bounds: { ...config.bounds, minX: -7 } })),
    /whole bricks/,
  );
});

test("supported large palettes restore without the smaller identity-metadata limit", () => {
  const config = definition({
    materialIds: Array.from({ length: 5000 }, (_, id) => id),
    generator: { id: "large-palette-v1", column: () => () => 4999 },
  });
  const world = createVoxelStore(config),
    saved = world.save();
  const restored = createVoxelStore(config, { checkpoint: saved });
  assert.equal(restored.readPoint({ x: 0, y: 0, z: 0 }), 4999);
  assert.deepEqual(restored.save(), saved);
});

test("misspelled options and malformed commands reject without silently changing policy", () => {
  assert.throws(
    () => createVoxelStore(definition(), { maxResidentBrick: 1 }),
    /fields/,
  );
  const config = definition();
  assert.throws(
    () => createVoxelStore({ ...config, unownedGameFlag: true }),
    /fields/,
  );
  assert.throws(
    () =>
      createVoxelStore(
        definition({
          generator: {
            id: "mutable-this",
            material: VOID,
            column() {
              return () => this.material;
            },
          },
        }),
      ),
    /fields/,
  );
  const unbound = createVoxelStore(
    definition({
      generator: {
        id: "no-receiver",
        column() {
          assert.equal(this, undefined);
          return () => VOID;
        },
      },
    }),
  );
  assert.equal(unbound.readPoint({ x: 0, y: 0, z: 0 }), VOID);
  const world = createVoxelStore(config),
    before = world.save();
  const cell = { x: 0, y: 0, z: 0, expectedMaterial: VOID, material: BASALT };
  assert.throws(
    () => world.edit({ expectedRevision: 0, cells: [cell], bypass: true }),
    /fields/,
  );
  assert.throws(
    () =>
      world.edit({ expectedRevision: 0, cells: [{ ...cell, bypass: true }] }),
    /fields/,
  );
  assert.deepEqual(world.save(), before);
});

test("query order and resident eviction do not change a seeded base or later edit", () => {
  const config = definition();
  const cells = [-23, -17, -5, 0, 7, 15].map((y, i) => ({
    x: i - 3,
    y,
    z: 1 - i,
  }));
  const first = createVoxelStore(config, { maxResidentBricks: 1 });
  const second = createVoxelStore(config, { maxResidentBricks: 2 });
  const expected = cells.map((at) => first.read(at));
  for (const at of [...cells].reverse()) second.read(at);
  first.evictAll();
  second.evictAll();
  assert.deepEqual(
    cells.map((at) => second.readPoint(at)),
    expected,
  );
  const cell = { ...cells[0], expectedMaterial: expected[0], material: VOID };
  assert(first.edit({ expectedRevision: 0, cells: [cell] }).ok);
  assert(second.edit({ expectedRevision: 0, cells: [cell] }).ok);
  assert.deepEqual(first.save(), second.save());
});

test("failed generation and invalid generated IDs cannot commit an edit or resident brick", () => {
  const valid = definition();
  const generator = {
    id: "fallible-sample-v1",
    column(x, z) {
      const normal = valid.generator.column(x, z);
      return (y) => (x === 1 && y === 1 ? 70000 : normal(y));
    },
  };
  const world = createVoxelStore(definition({ generator }));
  const before = world.save();
  assert.throws(
    () =>
      world.edit({
        expectedRevision: 0,
        cells: [
          { x: 0, y: 0, z: 0, expectedMaterial: VOID, material: BASALT },
          { x: 1, y: 1, z: 0, expectedMaterial: VOID, material: BASALT },
        ],
      }),
    /palette/,
  );
  assert.deepEqual(world.save(), before);
  assert.throws(() => world.readBrick({ x: 0, y: 0, z: 0 }), /palette/);
  assert.equal(world.stats().residentBricks, 0);
  assert.equal(world.readPoint({ x: 0, y: 0, z: 0 }), VOID);
});
