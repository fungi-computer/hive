import assert from "node:assert/strict";
import test from "node:test";
import { BUILDINGS } from "./construction.js";
import { building } from "./art/home.js";

test("every construction key resolves through the shared building-art caller", () => {
  for (const type of Object.keys(BUILDINGS))
    for (const stage of ["stakes", "frame", "finished"])
      for (const direction of [0, 1]) {
        const art = building(type, stage, direction);
        assert.ok(art.isScene, `${type}/${stage}/${direction} returns a scene`);
        if (type !== "brew-station") continue;
        const datum = art.getObjectByName("station-datum");
        assert.ok(datum, "station owns one positive-footprint datum");
        assert.deepEqual(datum.position.toArray(), [0.5, 0, 0.5]);
        assert.equal(datum.rotation.y, (direction * Math.PI) / 2);
        assert.ok(art.getObjectByName("brew-station"));
      }

  assert.throws(
    () => building("unknown-building", "finished", 0),
    /Unknown building art: unknown-building/,
  );
});
