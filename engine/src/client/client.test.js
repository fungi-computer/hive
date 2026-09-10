import test from "node:test";
import assert from "node:assert/strict";
import { isTypingTarget, selectionFromSubjects } from "./controls.js";
import {
  DEFAULT_VISUAL_BINDINGS,
  PIRATE_VISUAL_BINDINGS,
} from "./visual-bindings.js";

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
    { id: "deck-obstacle", screen: { x: 14, y: 20 }, renderRank: 3 },
  ];
  const click = { left: 10.5, right: 10.5, top: 20, bottom: 20 };
  assert.deepEqual(selectionFromSubjects(subjects, click), ["crew-1"]);
  assert.deepEqual(selectionFromSubjects(subjects, click, true, ["crew-1"]), []);
  assert.deepEqual(selectionFromSubjects(subjects, click, true, ["crew-2"]), ["crew-2", "crew-1"]);
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
    kind: "container",
    key: "shelf",
  });
  assert.equal(PIRATE_VISUAL_BINDINGS["pirate.ship"].key, "ship");
});
