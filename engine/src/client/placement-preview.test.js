import { test } from "node:test";
import assert from "node:assert/strict";
import { clearPlacementGhosts, createPlacementAdvisory, disposePlacementGhosts, placementCells, placementVisualSpec, syncPlacementGhosts } from "./placement-preview.js";

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


test("ghost strokes reject oversized selections but expose programming errors", () => {
  assert.deepEqual(placementCells({ area: { mode: "rectangle", start: [0, 0, 0], current: [1000000, 0, 1000000] } }), []);
  assert.deepEqual(placementCells({ area: { mode: "line", start: [0, 0, 0], current: [2, 0, 2] } }), [[0, 0, 0], [1, 0, 0], [2, 0, 0]]);
  assert.throws(() => placementCells({ area: { mode: "typo", start: [0, 0, 0], current: [2, 0, 2] } }), /mode is invalid/);
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
