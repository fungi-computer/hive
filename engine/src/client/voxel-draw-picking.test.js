import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createMixedRenderFixture, MIXED_FIXTURE_ORIENTATIONS } from "./mixed-render-fixture.js";
import { compileVoxelDrawStream, voxelDrawRecordKey } from "./voxel-draw-stream.js";
import { frontToBackVoxelDrawRecords, pickVoxelDrawRecord } from "./voxel-draw-picking.js";
import { parseLivingTerrainRuntimeManifest } from "../../../src/art/living-terrain-pack.js";
import { createVisibleHitArea } from "../../../src/visual-hit-geometry.js";

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

test("injected fixture traversal reaches each record class through one reverse stream", () => {
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
      assert.equal(selected.target, target.target ?? target.id,
        `${camera}/${object}: ${voxelDrawRecordKey(target)}`);
      const targetIndex = selectable.findIndex(record => voxelDrawRecordKey(record) === voxelDrawRecordKey(target));
      assert.deepEqual(visited, selectable.slice(targetIndex).reverse()
        .filter(record => record.visible !== false)
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
  assert.equal(pickVoxelDrawRecord(records, { x: 0, y: 0 }, () => true).target, actor.id,
    "reverse of that same stream picks the lower near actor first");
});

test("default picking requires authored hit geometry and never falls back to sprite bounds", () => {
  const record = Object.freeze({ id: "a", part: "body", visible: true, pickable: true,
    screenBounds: Object.freeze({ left: -100, right: 100, top: -100, bottom: 100 }) });
  assert.deepEqual(pickVoxelDrawRecord([record], { x: 0, y: 0 }),
    { record: null, target: null, occluded: false });
  const authored = Object.freeze({ ...record, contains: point => point.x === 0 && point.y === 0 });
  assert.equal(pickVoxelDrawRecord([authored], { x: 0, y: 0 }).target, authored.id);
});

test("a visible non-pickable silhouette occludes selectable records behind it", () => {
  const behind = Object.freeze({ id: "behind", part: "body", visible: true, pickable: true,
    contains: () => true });
  const wall = Object.freeze({ id: "wall", part: "face", visible: true, pickable: false,
    contains: () => true });
  const result = pickVoxelDrawRecord([behind, wall], { x: 4, y: 7 });
  assert.deepEqual(result, { record: wall, target: null, occluded: true });
});

test("original cover alpha occludes on grass pixels and leaves its empty atlas padding clickable", () => {
  const fixture = createMixedRenderFixture("north", "north");
  const cover = fixture.grass[0];
  const manifest = parseLivingTerrainRuntimeManifest(JSON.parse(readFileSync("artifacts/living-terrain/manifest.json", "utf8")));
  const authored = manifest.entries.get(`cover/grass/green/full/0/${cover.mask}`);
  assert(authored, "the original art bank has this cover mask");
  const hitArea = createVisibleHitArea(authored.silhouette, { x: 0.5, y: 0.5 });
  const center = { x: (cover.projected[0].x + cover.projected[2].x) / 2,
    y: (cover.projected[0].y + cover.projected[2].y) / 2 };
  const actualCover = Object.freeze({ ...cover,
    contains: point => hitArea.contains(point.x - center.x, point.y - center.y) });
  const actor = Object.freeze({
    id: "actor-on-cover", part: "body", role: "actor", renderPass: "opaque",
    attachment: Object.freeze({ kind: "supported", support: null, feet: cover.attachment.point }),
    moving: true, pickable: true, visible: true, contains: () => true,
  });
  const { records } = compileVoxelDrawStream([actor, actualCover], {
    direction: fixture.projection.direction,
    verticalMetres: fixture.verticalMetres,
  });
  const empty = { x: center.x - 31.5, y: center.y - 31.5 };
  assert.equal(hitArea.contains(empty.x - center.x, empty.y - center.y), false);
  assert.equal(pickVoxelDrawRecord(records, empty).target, actor.id);
  const row = authored.silhouette.rows.findIndex((value, index, values) => index < 64 && value < values[index + 1]);
  const x = authored.silhouette.spans[authored.silhouette.rows[row] * 2];
  const solid = { x: center.x + x - 31.5, y: center.y + row - 31.5 };
  assert.equal(actualCover.contains(solid), true);
  assert.equal(pickVoxelDrawRecord(records, solid).occluded, true);
});

test("a production terrain face is an authored non-pickable occluder", () => {
  const fixture = createMixedRenderFixture("north", "north");
  const terrain = fixture.terrain.find(record => record.face === "top");
  const point = Object.freeze({
    x: terrain.projected.reduce((sum, value) => sum + value.x, 0) / terrain.projected.length,
    y: terrain.projected.reduce((sum, value) => sum + value.y, 0) / terrain.projected.length,
  });
  assert.equal(terrain.contains(point), true, "production face owns its visible polygon");
  assert.deepEqual(pickVoxelDrawRecord([terrain], point),
    { record: terrain, target: null, occluded: true });
});

test("picking returns the established logical target identity", () => {
  const part = Object.freeze({ id: "stair:part", target: "stair:owner", part: "rail", visible: true,
    pickable: true, contains: () => true });
  assert.deepEqual(pickVoxelDrawRecord([part], { x: 1, y: 2 }),
    { record: part, target: "stair:owner", occluded: false });
});
