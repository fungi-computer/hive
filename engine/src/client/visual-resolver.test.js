import assert from "node:assert/strict";
import test from "node:test";
import { resolveStaticVisual } from "./visual-resolver.js";

const texture = (name) => ({ name });
const art = {
  propAnchor: { x: 0.5, y: 0.8 },
  vehicleAnchor: { x: 0.5, y: 0.82 },
  buildings: { shelf: { finished: [texture("shelf")] } },
  vehicles: { ship: [0, 1, 2, 3].map((facing) => texture(`ship-${facing}`)) },
  props: { cannon: [0, 1, 2, 3].map((facing) => texture(`cannon-${facing}`)) },
  projectiles: { cannonball: texture("cannonball") },
};

test("static resolver handles fixed and facing paths through one checked helper", () => {
  const shelf = resolveStaticVisual(art, {
    kind: "static",
    path: ["buildings", "shelf", "finished", 0],
    facing: false,
    anchor: "propAnchor",
  });
  assert.equal(shelf.texture.name, "shelf");
  assert.deepEqual(shelf.path, ["buildings", "shelf", "finished", 0]);
  const ship = resolveStaticVisual(art, {
    kind: "static",
    path: ["vehicles", "ship"],
    facing: true,
    anchor: "vehicleAnchor",
  }, 2);
  assert.equal(ship.texture.name, "ship-2");
  assert.equal(ship.anchor.y, 0.82);
  const cannonball = resolveStaticVisual(art, {
    kind: "static",
    path: ["projectiles", "cannonball"],
    facing: false,
    anchor: "propAnchor",
  });
  assert.equal(cannonball.texture.name, "cannonball");
});

test("static resolver rejects malformed bindings and never walks inherited keys", () => {
  assert.throws(() => resolveStaticVisual(art, { kind: "container" }), /binding required/);
  assert.throws(() => resolveStaticVisual(art, {
    kind: "static", path: ["toString"], facing: false, anchor: "propAnchor",
  }), /static visual/);
  assert.equal(resolveStaticVisual(art, {
    kind: "static", path: ["missing"], facing: false, anchor: "propAnchor",
  }), undefined);
});
