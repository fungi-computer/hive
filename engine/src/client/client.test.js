import test from "node:test";
import assert from "node:assert/strict";
import { isTypingTarget, selectionFromSubjects } from "./controls.js";
import {
  DEFAULT_VISUAL_BINDINGS,
  PIRATE_VISUAL_BINDINGS,
  visualBindingsFor,
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
  assert.equal(visualBindingsFor("pirate")["pirate.ship"].key, "ship");
});
