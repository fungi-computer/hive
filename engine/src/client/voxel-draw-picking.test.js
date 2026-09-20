import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createMixedRenderFixture, MIXED_FIXTURE_ORIENTATIONS } from "./mixed-render-fixture.js";
import { compileSpatialDrawOrder } from "./spatial-draw-order.js";
const voxelDrawRecordKey = (record) => `${record.id}\u0000${record.part}`;
import { frontToBackVoxelDrawRecords, pickVoxelDrawRecord } from "./voxel-draw-picking.js";
import { parseLivingTerrainRuntimeManifest } from "../../../src/art/living-terrain-pack.js";
import { createVisibleHitArea } from "../../../src/visual-hit-geometry.js";

const compile = (fixture) => compileSpatialDrawOrder(fixture.input, { projection: fixture.projection });

test("picking traverses the exact compiled draw records in reverse", () => {
  for (const camera of MIXED_FIXTURE_ORIENTATIONS)
    for (const object of MIXED_FIXTURE_ORIENTATIONS) {
      const fixture = createMixedRenderFixture(camera, object);
      const compiled = compile(fixture);
      const picking = frontToBackVoxelDrawRecords(compiled.records);
      assert.deepEqual(picking, [...compiled.records].reverse(), `${camera}/${object}`);
      assert(
        picking.every((record, index) => record === compiled.records.at(-1 - index)),
        `${camera}/${object}: picking retains the compiler's record identities`,
      );
    }
});

test("injected fixture traversal reaches each record class through one reverse stream", () => {
  const point = Object.freeze({ x: 0, y: 0 });
  for (const camera of MIXED_FIXTURE_ORIENTATIONS)
    for (const object of MIXED_FIXTURE_ORIENTATIONS) {
      const fixture = createMixedRenderFixture(camera, object);
      const { records } = compile(fixture);
      const cases = [
        ...fixture.actors.filter((record) => record.fixturePosition?.startsWith("stair-")),
        ...fixture.actors.filter((record) => record.fixturePosition?.startsWith("bed-")),
        fixture.bed,
        fixture.grass[0],
        fixture.water[0],
        fixture.guide.tiles.find((record) => record.isFootprint),
      ];
      for (const target of cases) {
        const visited = [];
        const selectable = records.map((record) => (record === target ? { ...record, pickable: true } : record));
        const selected = pickVoxelDrawRecord(selectable, point, (record) => {
          visited.push(voxelDrawRecordKey(record));
          return voxelDrawRecordKey(record) === voxelDrawRecordKey(target);
        });
        assert.equal(selected.target, target.target ?? target.id, `${camera}/${object}: ${voxelDrawRecordKey(target)}`);
        const targetIndex = selectable.findIndex((record) => voxelDrawRecordKey(record) === voxelDrawRecordKey(target));
        assert.deepEqual(
          visited,
          selectable
            .slice(targetIndex)
            .reverse()
            .filter((record) => record.visible !== false)
            .map(voxelDrawRecordKey),
          `${camera}/${object}: no second picking order`,
        );
      }
    }
});

test("default picking requires authored hit geometry and never falls back to sprite bounds", () => {
  const record = Object.freeze({
    id: "a",
    part: "body",
    visible: true,
    pickable: true,
    screenBounds: Object.freeze({ left: -100, right: 100, top: -100, bottom: 100 }),
  });
  assert.deepEqual(pickVoxelDrawRecord([record], { x: 0, y: 0 }), { record: null, target: null, occluded: false });
  const authored = Object.freeze({ ...record, contains: (point) => point.x === 0 && point.y === 0 });
  assert.equal(pickVoxelDrawRecord([authored], { x: 0, y: 0 }).target, authored.id);
});

test("a visible non-pickable silhouette occludes selectable records behind it", () => {
  const behind = Object.freeze({ id: "behind", part: "body", visible: true, pickable: true, contains: () => true });
  const wall = Object.freeze({ id: "wall", part: "face", visible: true, pickable: false, contains: () => true });
  const result = pickVoxelDrawRecord([behind, wall], { x: 4, y: 7 });
  assert.deepEqual(result, { record: wall, target: null, occluded: true });
});

test("cover alpha admits picking through empty pixels and occludes covered pixels", () => {
  const manifest = parseLivingTerrainRuntimeManifest(JSON.parse(readFileSync("artifacts/living-terrain/manifest.json", "utf8")));
  const art = manifest.entries.get("cover/grass/green/full/0/1");
  const hit = createVisibleHitArea(art.silhouette, { x: 0, y: 0 });
  const behind = { id: "behind", visible: true, pickable: true, contains: () => true };
  const cover = { id: "cover", visible: true, pickable: false, contains: (p) => hit.contains(p.x, p.y) };
  assert.equal(pickVoxelDrawRecord([behind, cover], { x: -1, y: -1 }).target, "behind");
  const row = art.silhouette.rows.findIndex((v, i, a) => i < 64 && v < a[i + 1]);
  const x = art.silhouette.spans[art.silhouette.rows[row] * 2];
  assert.equal(pickVoxelDrawRecord([behind, cover], { x: x + 0.5, y: row + 0.5 }).occluded, true);
});

test("a production terrain face is an authored non-pickable occluder", () => {
  const fixture = createMixedRenderFixture("north", "north");
  const terrain = fixture.terrain.find((record) => record.face === "top");
  const point = Object.freeze({
    x: terrain.projected.reduce((sum, value) => sum + value.x, 0) / terrain.projected.length,
    y: terrain.projected.reduce((sum, value) => sum + value.y, 0) / terrain.projected.length,
  });
  assert.equal(terrain.contains(point), true, "production face owns its visible polygon");
  assert.deepEqual(pickVoxelDrawRecord([terrain], point), { record: terrain, target: null, occluded: true });
});

test("picking returns the established logical target identity", () => {
  const part = Object.freeze({
    id: "stair:part",
    target: "stair:owner",
    part: "rail",
    visible: true,
    pickable: true,
    contains: () => true,
  });
  assert.deepEqual(pickVoxelDrawRecord([part], { x: 1, y: 2 }), { record: part, target: "stair:owner", occluded: false });
});
