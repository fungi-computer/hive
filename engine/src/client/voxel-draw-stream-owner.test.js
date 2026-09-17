import assert from "node:assert/strict";
import test from "node:test";
import { createMixedRenderFixture, MIXED_FIXTURE_ORIENTATIONS } from "./mixed-render-fixture.js";
import { compileVoxelDrawStream, voxelDrawRecordKey } from "./voxel-draw-stream.js";
import { createVoxelDrawStreamOwner } from "./voxel-draw-stream-owner.js";

const keys = records => records.map(voxelDrawRecordKey);
const compareNumbers = (a, b) => {
  for (let index = 0; index < Math.max(a.length, b.length); index++) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (Math.abs(difference) > 1e-7) return difference;
  }
  return 0;
};

function splitFixture(fixture, records = fixture.input) {
  const actorKeys = new Set(fixture.actors.map(voxelDrawRecordKey));
  const dynamicRecords = [], staticRecords = [];
  for (const record of records) {
    if (actorKeys.has(voxelDrawRecordKey(record))) dynamicRecords.push(Object.freeze({ ...record, moving: true }));
    else staticRecords.push(record);
  }
  return { staticRecords, dynamicRecords };
}

function owner(fixture, options = {}) {
  return createVoxelDrawStreamOwner({ direction: fixture.projection.direction,
    verticalMetres: fixture.verticalMetres, verifyAgainstOracle: true, ...options });
}

test("retained stream equals the full compiler across the factual 4x4 scene and reversed inputs", () => {
  for (const cameraOrientation of MIXED_FIXTURE_ORIENTATIONS) {
    for (const objectOrientation of MIXED_FIXTURE_ORIENTATIONS) {
      const fixture = createMixedRenderFixture(cameraOrientation, objectOrientation);
      for (const input of [fixture.input, fixture.reversedInput]) {
        const split = splitFixture(fixture, input), retained = owner(fixture).update({
          revision: "scene", staticRecords: () => split.staticRecords, dynamicRecords: split.dynamicRecords,
        });
        const oracle = compileVoxelDrawStream([...split.staticRecords, ...split.dynamicRecords], {
          direction: fixture.projection.direction, verticalMetres: fixture.verticalMetres,
        });
        assert.deepEqual(keys(retained.records), keys(oracle.records), `${cameraOrientation}/${objectOrientation}`);
        assert(retained.records.some(record => record === split.dynamicRecords[0]), "current actor references survive insertion");
        assert(keys(retained.records).includes(voxelDrawRecordKey(fixture.bed)), "bed remains in retained stream");
        assert(fixture.grass.every(record => keys(retained.records).includes(voxelDrawRecordKey(record))), "covers remain retained");
        assert(fixture.water.every(record => keys(retained.records).includes(voxelDrawRecordKey(record))), "water remains retained");
        assert(fixture.stairs.every(record => keys(retained.records).includes(voxelDrawRecordKey(record))), "multipart stair remains retained");
      }
    }
  }
});

test("ordinary movement inserts current actors without rebuilding static terrain", () => {
  const fixture = createMixedRenderFixture("north", "west"), retained = owner(fixture);
  const split = splitFixture(fixture);
  let priorKeys;
  for (let step = 0; step < 12; step++) {
    const dynamicRecords = split.dynamicRecords.map((record, index) => {
      const feet = record.attachment.feet;
      return Object.freeze({ ...record, display: { actor: record.id, step }, attachment: Object.freeze({
        ...record.attachment,
        support: null,
        feet: Object.freeze({ x: feet.x + step * 0.43 + index * 0.03, y: feet.y, z: feet.z - step * 0.19 }),
      }) });
    });
    const result = retained.update({ revision: "unchanged-static", staticRecords: () => split.staticRecords, dynamicRecords });
    const oracle = compileVoxelDrawStream([...split.staticRecords, ...dynamicRecords], {
      direction: fixture.projection.direction, verticalMetres: fixture.verticalMetres,
    });
    assert.deepEqual(keys(result.records), keys(oracle.records));
    for (const record of dynamicRecords)
      assert.equal(result.records.find(candidate => voxelDrawRecordKey(candidate) === voxelDrawRecordKey(record)), record);
    if (priorKeys && keys(result.records).join("|") !== priorKeys) assert.equal(result.physicalOrderChanged, true);
    priorKeys = keys(result.records).join("|");
  }
  const metrics = retained.metrics();
  assert.equal(metrics.counts.staticRebuild, 1);
  assert.equal(metrics.counts.dynamicInsert, split.dynamicRecords.length * 12);
  assert.equal(metrics.counts.applyOrder, 0);
});

test("a moving actor shares the retained static stair at entrance, midpoint, and landing", () => {
  for (const cameraOrientation of MIXED_FIXTURE_ORIENTATIONS) {
    for (const objectOrientation of MIXED_FIXTURE_ORIENTATIONS) {
      const fixture = createMixedRenderFixture(cameraOrientation, objectOrientation), split = splitFixture(fixture);
      const surface = fixture.stairs.find(record => record.attachment.role === "supporting-surface");
      const direction = fixture.projection.direction;
      const traversal = point => [-(direction.x * point.x + direction.y * point.y + direction.z * point.z),
        direction.z * point.x - direction.x * point.z, point.y, point.x, point.z];
      const contacts = [...surface.attachment.geometry].sort((a, b) => compareNumbers(traversal(a), traversal(b)));
      const entrance = contacts[0], landing = contacts.at(-1);
      const midpoint = Object.freeze({ x: (entrance.x + landing.x) / 2, y: (entrance.y + landing.y) / 2,
        z: (entrance.z + landing.z) / 2 });
      const stairActor = split.dynamicRecords.find(record => record.attachment.support === "fixture:stair");
      assert(stairActor, `${cameraOrientation}/${objectOrientation}: fixture stair actor`);
      const retained = owner(fixture);
      for (const [place, feet] of [["entrance", entrance], ["midpoint", midpoint], ["landing", landing]]) {
        const current = Object.freeze({ ...stairActor, display: { place },
          attachment: Object.freeze({ ...stairActor.attachment, feet }) });
        const dynamicRecords = split.dynamicRecords.map(record => record === stairActor ? current : record);
        const result = retained.update({ revision: "static-stair", staticRecords: () => split.staticRecords, dynamicRecords });
        const oracle = compileVoxelDrawStream([...split.staticRecords, ...dynamicRecords], {
          direction, verticalMetres: fixture.verticalMetres,
        });
        assert.deepEqual(keys(result.records), keys(oracle.records),
          `${cameraOrientation}/${objectOrientation}/${place}`);
        assert.equal(result.records.find(record => voxelDrawRecordKey(record) === voxelDrawRecordKey(current)), current);
      }
      assert.equal(retained.metrics().counts.staticRebuild, 1);
    }
  }
});

test("apply measurement is explicit and unchanged records do not request another apply", () => {
  const fixture = createMixedRenderFixture(), retained = owner(fixture);
  const split = splitFixture(fixture);
  const first = retained.update({ revision: 1, staticRecords: () => split.staticRecords, dynamicRecords: split.dynamicRecords });
  assert.equal(first.applyOrderRequired, true);
  retained.measureApplyOrder(() => "applied");
  const second = retained.update({ revision: 1, staticRecords: () => { throw new Error("unchanged static supplier was called"); },
    dynamicRecords: split.dynamicRecords });
  assert.equal(second.staticRebuilt, false);
  assert.equal(second.physicalOrderChanged, false);
  assert.equal(second.displayOrderChanged, false);
  assert.equal(second.applyOrderRequired, false);
  assert.equal(retained.metrics().counts.applyOrder, 1);
});

test("unchanged static geometry keeps current picking and presentation records", () => {
  const fixture = createMixedRenderFixture(), retained = owner(fixture);
  const split = splitFixture(fixture);
  retained.update({ revision: "geometry", staticRecords: () => split.staticRecords,
    currentStaticRecords: split.staticRecords, dynamicRecords: split.dynamicRecords });
  const changedBed = Object.freeze({ ...fixture.bed, pickable: false, target: "current-bed-target",
    contains: () => false });
  const currentStaticRecords = split.staticRecords.map(record => record === fixture.bed ? changedBed : record);
  const result = retained.update({ revision: "geometry",
    staticRecords: () => { throw new Error("unchanged static terrain was compiled"); },
    currentStaticRecords: [changedBed], dynamicRecords: split.dynamicRecords });
  assert.equal(result.physicalOrderChanged, false);
  assert.equal(result.applyOrderRequired, false, "pick metadata alone does not repack terrain buffers");
  assert.equal(result.records.find(record => voxelDrawRecordKey(record) === voxelDrawRecordKey(changedBed)), changedBed);
  const oracle = compileVoxelDrawStream([...currentStaticRecords, ...split.dynamicRecords], {
    direction: fixture.projection.direction, verticalMetres: fixture.verticalMetres,
  });
  assert.deepEqual(keys(result.records), keys(oracle.records));
});

test("non-actor dynamic records fail instead of creating a second production path", () => {
  const fixture = createMixedRenderFixture(), retained = owner(fixture);
  assert.throws(() => retained.update({ revision: 1, staticRecords: () => [],
    dynamicRecords: [{ ...fixture.bed, moving: true }] }), /must be a moving supported actor/);
});
