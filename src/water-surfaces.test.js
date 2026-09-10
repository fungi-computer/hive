import test from "node:test";
import assert from "node:assert/strict";
import { visibleWaterSurfaces } from "./water-surfaces.ts";

// Authored admitted-fact query fixtures; no simulation, transfer or rendered proof.
const cell = (y, massKg, x = 0) => ({
  id: `cell:${x},${y},128`,
  at: [x, y, 128],
  kind: "void",
  massKg,
  capacityKg: 540,
  liquidVolumeM3: massKg / 1000,
});
const sight = { visible: () => true, exposed: () => true };

test("only the top wet voxel interface is projected with exact physical depth", () => {
  const facts = [cell(13, 540), cell(14, 2.25)];
  const surfaces = visibleWaterSurfaces(facts, 0, sight);
  assert.equal(surfaces.length, 1);
  assert.equal(surfaces[0].id, facts[1].id);
  assert.equal(surfaces[0].height, -0.54 + 0.00225);
  assert.deepEqual({ x: surfaces[0].x, z: surfaces[0].z }, { x: 7, z: 9 });
  assert.throws(() => {
    surfaces[0].height = 0;
  });
  assert.deepEqual(visibleWaterSurfaces([cell(14, 0)], 0, sight), []);
});

test("signed storeys preserve distinct stacked surfaces and Ground needs exposed visible pits", () => {
  const facts = [cell(-9, 1), cell(19, 1)];
  const underground = visibleWaterSurfaces(facts, -6, {
    ...sight,
    exposed: () => false,
  });
  const upper = visibleWaterSurfaces(facts, 1, sight);
  assert.equal(underground[0].id, facts[0].id);
  assert.equal(underground[0].height, -24 * 0.54 + 0.001);
  assert.equal(upper[0].id, facts[1].id);
  assert.equal(upper[0].height, 4 * 0.54 + 0.001);
  assert.deepEqual(
    visibleWaterSurfaces(facts, 0, { ...sight, exposed: () => false }),
    [],
  );
  assert.deepEqual(
    visibleWaterSurfaces(facts, 0, { ...sight, visible: () => false }),
    [],
  );
});

test("hidden live water, soil moisture and the physical collar never become displayed surfaces", () => {
  const facts = [
    cell(15, 1),
    { ...cell(14, 100), kind: "soil" },
    cell(15, 1, -8),
  ];
  assert.deepEqual(
    visibleWaterSurfaces(facts, 0, { ...sight, visible: () => false }),
    [],
  );
  assert.deepEqual(
    visibleWaterSurfaces(facts, 0, sight).map((surface) => surface.id),
    [facts[0].id],
  );
});
