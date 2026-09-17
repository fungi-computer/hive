import assert from "node:assert/strict";
import test from "node:test";
import { createMixedRenderFixture, MIXED_FIXTURE_ORIENTATIONS } from "./mixed-render-fixture.js";
import { compileVoxelDrawStream, voxelDrawRecordKey } from "./voxel-draw-stream.js";
import { frontToBackVoxelDrawRecords, pickVoxelDrawRecord } from "./voxel-draw-picking.js";

const compile = fixture => compileVoxelDrawStream(fixture.input, {
  direction: fixture.projection.direction,
  verticalMetres: fixture.verticalMetres,
});

test("picking traverses the exact compiled draw records in reverse", () => {
  for (const camera of MIXED_FIXTURE_ORIENTATIONS) for (const object of MIXED_FIXTURE_ORIENTATIONS) {
    const fixture = createMixedRenderFixture(camera, object);
    const compiled = compile(fixture);
    const picking = frontToBackVoxelDrawRecords(compiled.records);
    assert.deepEqual(picking, [...compiled.records].reverse(), `${camera}/${object}`);
    assert(picking.every((record, index) => record === compiled.records.at(-1 - index)),
      `${camera}/${object}: picking retains the compiler's record identities`);
  }
});

test("mixed fixture picking reaches each authored class through one reverse stream", () => {
  const point = Object.freeze({ x: 0, y: 0 });
  for (const camera of MIXED_FIXTURE_ORIENTATIONS) for (const object of MIXED_FIXTURE_ORIENTATIONS) {
    const fixture = createMixedRenderFixture(camera, object);
    const { records } = compile(fixture);
    const cases = [
      ...fixture.actors.filter(record => record.fixturePosition?.startsWith("stair-")),
      ...fixture.actors.filter(record => record.fixturePosition?.startsWith("bed-")),
      fixture.bed,
      fixture.grass[0],
      fixture.water[0],
      fixture.guide.tiles.find(record => record.isFootprint),
    ];
    for (const target of cases) {
      const visited = [];
      const selectable = records.map(record => record === target ? { ...record, pickable: true } : record);
      const selected = pickVoxelDrawRecord(selectable, point, record => {
        visited.push(voxelDrawRecordKey(record));
        return voxelDrawRecordKey(record) === voxelDrawRecordKey(target);
      });
      assert.equal(voxelDrawRecordKey(selected), voxelDrawRecordKey(target),
        `${camera}/${object}: ${voxelDrawRecordKey(target)}`);
      const targetIndex = selectable.findIndex(record => voxelDrawRecordKey(record) === voxelDrawRecordKey(target));
      assert.deepEqual(visited, selectable.slice(targetIndex).reverse()
        .filter(record => record.visible !== false && record.pickable !== false)
        .map(voxelDrawRecordKey), `${camera}/${object}: no second picking order`);
    }
  }
});

test("a lower near actor wins over overlapping raised far terrain", () => {
  const fixture = createMixedRenderFixture("north", "north");
  const raisedCell = [-4, 2, -4], raisedY = (raisedCell[1] + 0.5) * fixture.verticalMetres;
  const terrain = Object.freeze({
    id: "physical:raised", part: "face", renderPass: "opaque", pickable: true, visible: true,
    attachment: Object.freeze({ kind: "cell-face", cell: raisedCell, face: "top" }),
  });
  const actor = Object.freeze({
    id: "physical:lower-near", part: "body", renderPass: "opaque", pickable: true, visible: true,
    attachment: Object.freeze({ kind: "supported", support: null,
      feet: Object.freeze({ x: -3, y: 0.5 * fixture.verticalMetres, z: -3 }) }),
  });
  const { records } = compileVoxelDrawStream([actor, terrain], {
    direction: fixture.projection.direction,
    verticalMetres: fixture.verticalMetres,
  });
  assert.deepEqual(records, [terrain, actor], "physical traversal paints far raised terrain first");
  assert.equal(pickVoxelDrawRecord(records, { x: 0, y: 0 }, () => true), actor,
    "reverse of that same stream picks the lower near actor first");
});

test("default picking requires authored hit geometry and never falls back to sprite bounds", () => {
  const record = Object.freeze({ id: "a", part: "body", visible: true, pickable: true,
    screenBounds: Object.freeze({ left: -100, right: 100, top: -100, bottom: 100 }) });
  assert.equal(pickVoxelDrawRecord([record], { x: 0, y: 0 }), null);
  const authored = Object.freeze({ ...record, contains: point => point.x === 0 && point.y === 0 });
  assert.equal(pickVoxelDrawRecord([authored], { x: 0, y: 0 }), authored);
});
