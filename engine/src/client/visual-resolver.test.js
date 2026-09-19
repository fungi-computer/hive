import assert from "node:assert/strict";
import test from "node:test";
import { resolveStaticVisual, resolveStaticVisualParts } from "./visual-resolver.js";
import { CANNON_VISUAL_BINDINGS, DEFAULT_VISUAL_BINDINGS } from "./visual-bindings.js";

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
  for (let facing = 0; facing < 4; facing += 1) {
    const cannon = resolveStaticVisual(art, CANNON_VISUAL_BINDINGS["formation.cannon"], facing);
    assert.equal(cannon.texture, art.props.cannon[facing]);
    assert.equal(cannon.anchor, art.propAnchor);
  }
  const cannonball = resolveStaticVisual(art, CANNON_VISUAL_BINDINGS["formation.cannonball"]);
  assert.equal(cannonball.texture.name, "cannonball");
});

test("stair binding resolves the four authored cardinal frames without a special path", () => {
  const stairs = [0, 1, 2, 3].map((facing) => texture(`stair-${facing}`));
  const stairArt = {
    ...art,
    buildings: { ...art.buildings, stair: { finished: stairs } },
  };
  for (let facing = 0; facing < 4; facing += 1) {
    const resolved = resolveStaticVisual(
      stairArt,
      DEFAULT_VISUAL_BINDINGS["colony.stair.finished"],
      facing,
    );
    assert.equal(resolved.texture, stairs[facing]);
    assert.deepEqual(resolved.path, ["buildings", "stair", "finished", facing]);
    assert.equal(resolved.anchor, stairArt.propAnchor);
  }
});

test("content view paths rotate edge axes and cardinal junction masks without renderer branches", () => {
  const edgeArt = { ...art, edgeWalls: { segment: { finished: [texture("x"), texture("z")] },
    junction: { finished: Object.fromEntries(Array.from({ length: 15 }, (_, index) => [index + 1, texture(`mask-${index + 1}`)])) } },
    edgeDoors: { segment: { finished: [texture("door-x"), texture("door-z")] } } };
  for (let turn = 0; turn < 4; turn++) {
    assert.equal(resolveStaticVisual(edgeArt, DEFAULT_VISUAL_BINDINGS["colony.wall.segment.finished.x"], 0, 0, turn).texture.name,
      turn % 2 ? "z" : "x");
    assert.equal(resolveStaticVisual(edgeArt, DEFAULT_VISUAL_BINDINGS["colony.door.segment.finished.z"], 0, 0, turn).texture.name,
      turn % 2 ? "door-x" : "door-z");
    assert.equal(resolveStaticVisual(edgeArt, DEFAULT_VISUAL_BINDINGS["colony.wall.junction.finished.1"], 0, 0, turn).texture.name,
      `mask-${[1, 8, 4, 2][turn]}`);
  }
  assert.throws(() => resolveStaticVisual(edgeArt, { kind: "static", path: ["edgeWalls"], viewPaths: [],
    facing: false, anchor: "propAnchor" }), /four non-facing paths/);
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

test("static resolver selects an animation frame without changing the visual identity", () => {
  const frames = [texture("zero"), texture("one")];
  const animatedArt = { propAnchor: art.propAnchor, station: { frames } };
  const binding = { kind: "static", path: ["station", "frames"], frames: true, facing: false, anchor: "propAnchor" };
  assert.equal(resolveStaticVisual(animatedArt, binding, 0, 0)?.texture, frames[0]);
  assert.equal(resolveStaticVisual(animatedArt, binding, 0, 3)?.texture, frames[1]);
});

test("ordinary single-part visuals retain the body path while authored owners expose siblings", () => {
  const binding = { kind: "static", path: ["buildings", "shelf", "finished", 0], facing: false, anchor: "propAnchor" };
  const ordinary = resolveStaticVisualParts(art, binding);
  assert.equal("parts" in ordinary, false);
  const multipart = {
    ...art,
    partsByOwner: new Map([[JSON.stringify(binding.path), [{ id: "surface", texture: texture("surface") }]]]),
  };
  assert.deepEqual(resolveStaticVisualParts(multipart, binding).parts.map(({ id }) => id), ["surface"]);
});
