import { test } from "node:test";
import assert from "node:assert/strict";
import { clearPlacementGhosts, createPlacementAdvisory, disposePlacementGhosts, placementCells, placementFootprintCells, placementGuideTiles, placementVisualSpec, syncPlacementGhosts } from "./placement-preview.js";

function fakeSprite() {
  return {
    visible: false, texture: null, alpha: 0, destroyed: false,
    anchor: { set() {} }, position: { set() {} }, scale: { set() {} },
    destroy(options) { this.destroyed = options.texture === false && options.textureSource === false; },
  };
}

test("placement ghost pool reuses, shrinks, clears and disposes owned sprites", () => {
  const pool = { entries: [], factory: fakeSprite };
  const art = { propAnchor: { x: .5, y: 1 }, buildings: { stair: { finished: ["north", "east"] } } };
  const bindings = { stair: { kind: "static", path: ["buildings", "stair", "finished"], facing: true, anchor: "propAnchor" } };
  const resolve = (_art, _binding, facing) => ({ texture: facing ? "east" : "north", anchor: art.propAnchor });
  const common = { art, bindings, resolve, project: () => ({ x: 1, y: 2 }), zoom: { x: 1, y: 1, scale: 1, offsetX: 0, offsetY: 0 }, verticalMetres: 1 };
  syncPlacementGhosts(pool, placementVisualSpec({ input: { catalog: "stair", orientation: "north" } }, [[0, 0, 0], [1, 0, 0]], { stair: { visual: "stair", alignment: "fixed", facing: { north: 0, east: 1, south: 2, west: 3 } } }), common);
  assert.equal(pool.entries.length, 2);
  const first = pool.entries[0].sprite;
  syncPlacementGhosts(pool, placementVisualSpec({ input: { catalog: "stair", orientation: "east" } }, [[0, 0, 0]], { stair: { visual: "stair", alignment: "fixed", facing: { north: 0, east: 1, south: 2, west: 3 } } }), common);
  assert.equal(pool.entries.length, 2);
  assert.equal(pool.entries[0].sprite, first);
  assert.equal(pool.entries[1].sprite.visible, false);
  clearPlacementGhosts(pool);
  assert.equal(pool.entries[0].sprite.visible, false);
  disposePlacementGhosts(pool);
  assert.equal(pool.entries.length, 0);
  assert.equal(first.destroyed, true);
});

test("selected-plane guide owns stable world cells and projected corners", () => {
  const project = (x, y, z) => ({ x: x * 10 - z * 10, y: x * 5 + z * 5 - y * 2 });
  const tiles = placementGuideTiles({ hoveredCell: [4, 2, 7], planeY: 2, radius: 1,
    footprintCells: [[4, 2, 7], [5, 2, 7]], verticalMetres: 0.54, project });
  assert.equal(tiles.length, 9);
  assert.deepEqual(tiles.map(tile => tile.cell), [
    [3,2,6],[4,2,6],[5,2,6],
    [3,2,7],[4,2,7],[5,2,7],
    [3,2,8],[4,2,8],[5,2,8],
  ]);
  assert.equal(tiles.find(tile => tile.hovered)?.id, "placement-guide:4:2:7");
  assert.deepEqual(tiles.filter(tile => tile.isFootprint).map(tile => tile.cell), [[4,2,7],[5,2,7]]);
  assert(tiles.every(tile => tile.attachment.kind === "surface-mark" && tile.renderPass === "opaque"));
  assert(tiles.every(tile => tile.footprint.length === 4));
  assert.equal(tiles[0].worldCorners.every(point => point.y === 1.35), true);
  assert.deepEqual(tiles[0].projected, tiles[0].worldCorners.map(point => project(point.x, point.y, point.z)));
});


test("ghost strokes reject oversized selections but expose programming errors", () => {
  assert.deepEqual(placementCells({ area: { mode: "rectangle", start: [0, 0, 0], current: [1000000, 0, 1000000] } }), []);
  assert.deepEqual(placementCells({ area: { mode: "line", start: [0, 0, 0], current: [2, 0, 2] } }), [[0, 0, 0], [1, 0, 0], [2, 0, 0]]);
  assert.throws(() => placementCells({ area: { mode: "typo", start: [0, 0, 0], current: [2, 0, 2] } }), /mode is invalid/);
});

test("one point target produces one object origin regardless of its physical footprint", () => {
  assert.deepEqual(placementCells({ target: [3, 8, -2] }), [[3, 8, -2]]);
  assert.deepEqual(placementCells({ target: null }), []);
});

test("definition-derived footprint rotates around one preview origin", () => {
  const base = { footprint: [[0, 0], [0, 1]], input: { orientation: "north" } };
  assert.deepEqual(placementFootprintCells(base, [4, 8, 4]), [[4, 8, 4], [4, 8, 5]]);
  assert.deepEqual(placementFootprintCells({ ...base, input: { orientation: "east" } }, [4, 8, 4]), [[4, 8, 4], [3, 8, 4]]);
});

test("cell placement never reconstructs physical edges from visual names", () => {
  const control = { input: { catalog: "timber-wall" } };
  const placement = { "timber-wall": { visual: "colony.wall.finished", alignment: "stroke", facing: { north: 2, east: 1, south: 0, west: 3 } } };
  const spec = placementVisualSpec(control, [[0, 0, 0]], placement, { start: [0, 0, 0], end: [0, 0, 0] });
  assert.deepEqual(spec, { visual: "colony.wall.finished", facing: 1, cells: [[0, 0, 0]] });
});

test("an older placement reply cannot overwrite the current gesture", async () => {
  const pending = [];
  const published = [];
  const advisory = createPlacementAdvisory(
    () => new Promise(resolve => pending.push(resolve)),
    value => published.push(value),
  );
  advisory.request("old-revision:a", { party: "party", candidates: [{ site: "a" }] }, 1);
  advisory.request("new-revision:b", { party: "party", candidates: [{ site: "b" }] }, 1);
  pending[1]({ observationRevision: 8, placementRevision: 8, decisions: [{ site: "b", status: "ready" }] });
  await Promise.resolve();
  pending[0]({ observationRevision: 7, placementRevision: 7, decisions: [{ site: "a", status: "rejected", reason: "stale" }] });
  await Promise.resolve();
  assert.equal(published.at(-1).key, "new-revision:b");
  assert.equal(published.at(-1).status, "ready");
});
