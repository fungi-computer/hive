import test from "node:test";
import assert from "node:assert/strict";
import { fixedExcavationFixture } from "../../fixtures/generated-seepage.mjs";
import { createExcavationAdapter } from "./excavation.mjs";
import { createVolume, createVolumeGeometry } from "../../engine/environment/soil/index.js";

test("generated voxel excavation conserves pore water and resumes seepage exactly", () => {
  const { adapter, input, command } = fixedExcavationFixture();
  const frozen = JSON.stringify(input);
  const dug = adapter.excavate(input, command);
  assert.equal(JSON.stringify(input), frozen);
  assert.equal(dug.state.world.schema, 1);
  assert.equal(dug.state.world.changes.length, 1);
  assert.equal(dug.state.exports.length, 1);
  assert.equal(dug.balance.pitWaterKg, 0);
  assert.equal(dug.state.exports[0].sourceVoxelM3, 0.54);
  const moving = adapter.advance(dug.state, 300, { dtMaxS: 6 });
  const whole = adapter.advance(dug.state, 600, { dtMaxS: 6 });
  const fresh = createExcavationAdapter({ worldIdentity: input.world.identity,
    regionId: input.soilGeometry.regionId });
  const restored = fresh.decode(adapter.encode(moving.state));
  const resumed = fresh.advance(restored, 300, { dtMaxS: 6 });
  assert.deepEqual(resumed.state, whole.state);
  assert.ok(Math.abs(whole.balance.pitWaterKg - 12.565428851627985) < 1e-10);
  assert.ok(Math.abs(whole.balance.residualKg) < 2e-9);
  assert.deepEqual(fresh.excavate(resumed.state, command).state, resumed.state);
  assert.throws(() => adapter.excavate(input, { ...command, expectedWorldRevision: 1 }), /stale/);
  assert.throws(() => adapter.backfill(whole.state), /displaced finite water/);
});

test("legacy combined save validates custody before its explicit world codec migration", () => {
  const { adapter, input, command } = fixedExcavationFixture();
  const state = adapter.excavate(input, command).state;
  const legacy = structuredClone(state);
  legacy.version = "one-vented-soil-excavation-with-finite-pit-v1";
  legacy.identity = JSON.stringify({ version: legacy.version,
    worldIdentity: JSON.parse(state.identity).worldIdentity,
    regionId: input.soilGeometry.regionId });
  legacy.world = { schema: 2, identity: state.world.identity,
    revision: state.world.revision, changes: state.world.changes };
  const raw = JSON.stringify(legacy);
  assert.deepEqual(adapter.decode(raw), state);
  assert.equal(JSON.stringify(legacy), raw);
  const corrupt = structuredClone(legacy);
  corrupt.exports[0].waterKg += 1;
  assert.throws(() => adapter.decode(JSON.stringify(corrupt)), /retain the original water/);
  const wrongMetric = structuredClone(state);
  wrongMetric.soilGeometry.spacingM = [1, 1, 1];
  assert.throws(() => adapter.decode(JSON.stringify(wrongMetric)), /world metric/);
});

test("shared soil geometry takes consumer metric and coefficients, outside world bounds/content", () => {
  const { input } = fixedExcavationFixture();
  const definition = { ...input.soilGeometry.definitions[0], id: "other-soil" };
  const descriptor = { regionId: "independent-soil", revision: 0,
    spacingM: [2, 1, 3], exterior: "closed", definitions: [definition],
    cells: [{ at: [3000, 70, 0], soilId: definition.id },
      { at: [3001, 70, 0], soilId: definition.id }],
    reservoirs: [], ports: [], closedFaces: [] };
  const geometry = createVolumeGeometry(descriptor), owner = createVolume(descriptor);
  assert.equal(geometry.nodes[0].volumeM3, 6);
  assert.equal(geometry.faces[0].areaM2, 3);
  const theta = geometry.soils[definition.id].at(-0.5).theta;
  const state = owner.initial({ stocks: geometry.nodes.map(node => ({
    nodeId: node.id, massKg: 1000 * node.volumeM3 * theta })) });
  const next = owner.advance(state, 6, { dtMaxS: 6 });
  assert.deepEqual(next.state.massKg, state.massKg);
  assert.equal(next.receipt.faceTransferKg[0], 0);
});
