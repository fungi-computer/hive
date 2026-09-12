import assert from "node:assert/strict";
import test from "node:test";
import { projectContextualPresentation } from "./contextual-presentation.js";

const facts = [
  { id: "world", label: "Season", value: "spring" },
  { id: "worker.fact", label: "Work", value: "hauling", subjects: ["worker"] },
  { id: "other.fact", label: "Work", value: "resting", subjects: ["other"] },
];
const controls = [
  { id: "world.action", label: "Pause", command: "pause" },
  { id: "worker.action", label: "Inspect worker", command: "inspect", subjects: ["worker"] },
  { id: "other.action", label: "Inspect other", command: "inspect", subjects: ["other"] },
];

test("keeps global presentation and matching scoped context", () => {
  const result = projectContextualPresentation({ facts, controls, selectedIds: ["worker"], latestFacts: [{ id: "worker", label: "Moss" }] });
  assert.deepEqual(result.world.facts.map(({ id }) => id), ["world"]);
  assert.deepEqual(result.world.controls.map(({ id }) => id), ["world.action"]);
  assert.deepEqual(result.selection.facts.map(({ id }) => id), ["worker.fact"]);
  assert.deepEqual(result.selection.controls.map(({ id }) => id), ["worker.action"]);
  assert.equal(result.selection.label, "Moss");
});

test("matches any selected subject and removes stale scoped context", () => {
  const multi = projectContextualPresentation({
    facts, controls, selectedIds: ["worker", "other"], latestFacts: [
      { id: "worker", label: "Moss" }, { id: "other", label: "Pip" },
    ],
  });
  assert.equal(multi.world.facts.length, 1);
  assert.deepEqual(multi.selection.controls.map(({ id }) => id), ["worker.action", "other.action"]);
  assert.equal(multi.selection.label, "Moss, Pip");

  const removed = projectContextualPresentation({ facts, controls, selectedIds: ["worker"], latestFacts: [] });
  assert.deepEqual(removed.world.facts.map(({ id }) => id), ["world"]);
  assert.deepEqual(removed.world.controls.map(({ id }) => id), ["world.action"]);
  assert.equal(removed.selection.label, "Selected");
});
