import test from "node:test";
import assert from "node:assert/strict";
import { isTypingTarget, selectionFromSubjects } from "./controls.js";
import {
  DEFAULT_VISUAL_BINDINGS,
  PIRATE_VISUAL_BINDINGS,
} from "./visual-bindings.js";
import { createVisibleHitArea, createVisibleSilhouette } from "../../../src/visual-hit-geometry.js";

test("shared selection chooses subjects inside a screen box", () => {
  const subjects = [
    { id: "a", screen: { x: 10, y: 20 } },
    { id: "b", screen: { x: 80, y: 20 } },
  ];
  assert.deepEqual(
    selectionFromSubjects(subjects, { left: 0, right: 40, top: 0, bottom: 40 }),
    ["a"],
  );
});

test("point selection chooses the nearest visible foot and shift toggles it", () => {
  const subjects = [
    { id: "crew-1", screen: { x: 10, y: 20 }, renderRank: 1 },
    { id: "crew-2", screen: { x: 12, y: 20 }, renderRank: 2 },
    { id: "deck-obstacle", screen: { x: 14, y: 20 }, renderRank: 3, pickable: false },
  ];
  const click = { left: 10.5, right: 10.5, top: 20, bottom: 20 };
  assert.deepEqual(selectionFromSubjects(subjects, click), ["crew-2"]);
  assert.deepEqual(selectionFromSubjects(subjects, click, true, ["crew-2"]), []);
  assert.deepEqual(selectionFromSubjects(subjects, click, true, ["crew-1"]), ["crew-1", "crew-2"]);
});

test("rectangular selection still returns every subject in the box", () => {
  const subjects = [
    { id: "crew-1", screen: { x: 10, y: 20 } },
    { id: "crew-2", screen: { x: 12, y: 20 } },
  ];
  assert.deepEqual(
    selectionFromSubjects(subjects, { left: 0, right: 20, top: 0, bottom: 40 }),
    ["crew-1", "crew-2"],
  );
});

test("point selection uses registered visible pixels, zoom, and topmost overlap", () => {
  const silhouette = createVisibleSilhouette(new Uint8ClampedArray([
    0, 0, 0, 0, 255, 255, 255, 255,
    0, 0, 0, 0, 0, 0, 0, 0,
  ]), 2, 2);
  const hitArea = createVisibleHitArea(silhouette, { x: 0, y: 0 });
  const subjects = [
    { id: "rear", screen: { x: 10, y: 20 }, renderRank: 1, hitZoom: 2, hitArea },
    { id: "front", screen: { x: 10, y: 20 }, renderRank: 2, hitZoom: 2, hitArea },
  ];
  assert.deepEqual(selectionFromSubjects(subjects, { left: 12, right: 12, top: 20, bottom: 20 }), ["front"]);
  assert.deepEqual(selectionFromSubjects(subjects, { left: 10, right: 10, top: 21, bottom: 21 }), []);
});

test("typing guard recognizes editable controls", () => {
  assert.equal(
    isTypingTarget({
      closest: (selector) => (selector.includes("input") ? {} : null),
    }),
    true,
  );
  assert.equal(isTypingTarget(null), false);
});

test("content visual bindings keep pirate art out of the renderer defaults", () => {
  assert.equal(DEFAULT_VISUAL_BINDINGS["pirate.ship"], undefined);
  assert.deepEqual(PIRATE_VISUAL_BINDINGS["pirate.deck-obstacle"], {
    kind: "static",
    path: ["buildings", "shelf", "finished", 0],
    facing: false,
    anchor: "propAnchor",
  });
  assert.deepEqual(PIRATE_VISUAL_BINDINGS["pirate.ship"].path, ["vehicles", "ship"]);
});
