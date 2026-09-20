import assert from "node:assert/strict";
import test from "node:test";
import { createMixedRenderFixture, MIXED_FIXTURE_ORIENTATIONS } from "./mixed-render-fixture.js";

const key = (record) => `${record.id}\u0000${record.part}`;
const finitePoint = (point) => [point.x, point.y, point.z].every(Number.isFinite);

test("mixed fixture exposes real mixed geometry for every camera and object orientation", () => {
  for (const cameraOrientation of MIXED_FIXTURE_ORIENTATIONS)
    for (const objectOrientation of MIXED_FIXTURE_ORIENTATIONS) {
      const orientation = `${cameraOrientation}/${objectOrientation}`;
      const fixture = createMixedRenderFixture(cameraOrientation, objectOrientation);
      assert(
        fixture.terrain.some((record) => record.cap),
        `${orientation}: cut cap`,
      );
      assert(
        fixture.terrain.some((record) => record.cell[1] === -2 && record.face === "top"),
        `${orientation}: pit bottom`,
      );
      assert(
        fixture.terrain.some((record) => record.face !== "top"),
        `${orientation}: exposed cliff`,
      );
      assert(
        fixture.grass.some((record) => record.mask === 15 && record.terrainBatch.texture.includes("full")),
        `${orientation}: connected full grass`,
      );
      assert(
        fixture.grass.some((record) => record.terrainBatch.texture.includes("short")),
        `${orientation}: short grass`,
      );
      assert.deepEqual(
        fixture.stairs.map((record) => record.part),
        ["surface", "rail.left", "rail.right"],
      );
      assert.equal(fixture.bed.footprint.length, 2, `${orientation}: full bed footprint`);
      assert.equal(fixture.guide.cells.length, 2, `${orientation}: guide uses full bed footprint`);
      assert.equal(fixture.guide.tiles.length, 49);
      assert(
        fixture.guide.tiles.every((tile) => fixture.input.includes(tile)),
        `${orientation}: guide joins draw input`,
      );
      assert.deepEqual(
        fixture.guide.tiles
          .filter((tile) => tile.isFootprint)
          .map((tile) => tile.cell)
          .sort(),
        fixture.guide.cells.map((cell) => [...cell]).sort(),
      );
      assert.deepEqual(
        fixture.actors.filter((record) => record.fixturePosition?.startsWith("stair-")).map((record) => record.fixturePosition),
        ["stair-entrance", "stair-middle", "stair-landing"],
      );
      assert(
        fixture.actors
          .filter((record) => record.fixturePosition?.startsWith("stair-"))
          .every((record) => record.support?.id === "fixture:stair"),
        `${orientation}: stair fixture actors retain support identity`,
      );
      assert.deepEqual(
        fixture.actors.filter((record) => record.fixturePosition?.startsWith("bed-")).map((record) => record.fixturePosition),
        ["bed-end-start", "bed-end-finish", "bed-side-left", "bed-side-right"],
      );
      assert(
        fixture.actors.every((record) => record.visual === "goblin.worker"),
        `${orientation}: actor art binding`,
      );
      assert.equal(fixture.water.length, 1);
      assert(
        fixture.input.every((record) => record.footprint.length > 0 && record.footprint.every(finitePoint)),
        `${orientation}: canonical footprints`,
      );
      assert(
        fixture.input.every((record) => Object.values(record.screenBounds).every(Number.isFinite)),
        `${orientation}: projected bounds`,
      );
      assert(
        fixture.input.every((record) => record.orderGeometry),
        `${orientation}: factual draw attachments`,
      );
    }
});

test("mixed fixture carries facts rather than a pre-labelled sorting answer", () => {
  for (const cameraOrientation of MIXED_FIXTURE_ORIENTATIONS)
    for (const objectOrientation of MIXED_FIXTURE_ORIENTATIONS) {
      const orientation = `${cameraOrientation}/${objectOrientation}`;
      const fixture = createMixedRenderFixture(cameraOrientation, objectOrientation);
      assert.deepEqual(fixture.input.map(key).sort(), fixture.reversedInput.map(key).sort());
      assert.notDeepEqual(fixture.input.map(key), fixture.reversedInput.map(key));
      for (const record of fixture.input) {
        assert.equal("front" in record, false, `${key(record)} invents front`);
        assert.equal("rear" in record, false, `${key(record)} invents rear`);
        assert.equal("depth" in record, false, `${key(record)} invents depth`);
        assert.equal("expectedOrder" in record, false, `${key(record)} pre-labels an answer`);
      }
    }
});

test("water geometry follows the same rotated canonical projection", () => {
  const positions = MIXED_FIXTURE_ORIENTATIONS.map((orientation) => {
    const record = createMixedRenderFixture(orientation).water[0];
    return [(record.screenBounds.left + record.screenBounds.right) / 2, (record.screenBounds.top + record.screenBounds.bottom) / 2];
  });
  assert(positions.every((point) => point.every(Number.isFinite)));
  assert.equal(
    new Set(positions.map((position) => position.map((value) => value.toFixed(6)).join(","))).size,
    1,
    "water centered in the real pit keeps its projected center through camera turns",
  );
});

import { compileSpatialDrawOrder } from "./spatial-draw-order.js";
test("spatial core orders every mixed record once, independent of input, for sixteen camera/object pairs", () => {
  const key = (record) => `${record.id}/${record.part}`;
  for (const camera of MIXED_FIXTURE_ORIENTATIONS)
    for (const object of MIXED_FIXTURE_ORIENTATIONS) {
      const fixture = createMixedRenderFixture(camera, object);
      const forward = compileSpatialDrawOrder(fixture.input, { projection: fixture.projection });
      const reversed = compileSpatialDrawOrder(fixture.reversedInput, { projection: fixture.projection });
      assert.deepEqual(forward.records.map(key), reversed.records.map(key), `${camera}/${object}`);
      assert.equal(new Set(forward.records).size, fixture.input.length);
      const support = fixture.stairs.find((record) => record.part === "surface");
      for (const actor of fixture.actors.filter((record) => record.support))
        assert(
          forward.records.indexOf(support) < forward.records.indexOf(actor),
          `${camera}/${object}: contact surface precedes supported person`,
        );
    }
});
