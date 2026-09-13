import { strict as assert } from "node:assert";
import test from "node:test";
import { omitControlsById, projectContextualPresentation } from "./contextual-presentation.js";

test("catalog-owned controls are omitted from generic sidebar projection", () => {
  const controls = [{ id: "timber-wall" }, { id: "dig" }];
  assert.deepEqual(omitControlsById(controls, ["timber-wall"]), [{ id: "dig" }]);
});

test("contextual controls join authoritative command targets by canonical ID", () => {
  const result = projectContextualPresentation({
    facts: [
      { id: "finished", label: "Tree", subjects: ["finished"] },
      { id: "unfinished", label: "Tree", subjects: ["unfinished"] },
    ],
    controls: [
      { commandId: "colony:deconstruct", label: "Deconstruct" },
      { commandId: "colony:designateTrees", label: "Fell selected trees" },
    ],
    targets: [{ commandId: "colony:deconstruct", subjects: ["finished"] }],
    selectedIds: ["finished", "unfinished"],
    currentIds: ["finished", "unfinished"],
  });
  assert.deepEqual(result.selection.controls, [{ commandId: "colony:deconstruct", label: "Deconstruct", subjects: ["finished"] }]);
  assert.equal(result.world.controls.length, 1);
  assert.equal(result.world.controls[0].commandId, "colony:designateTrees");
});

test("localized fact labels never choose a contextual command target", () => {
  const result = projectContextualPresentation({
    facts: [{ id: "unfinished", label: "Finished construction", subjects: ["unfinished"] }],
    controls: [{ commandId: "colony:deconstruct", label: "Deconstruct" }],
    targets: [],
    selectedIds: ["unfinished"],
    currentIds: ["unfinished"],
  });
  assert.deepEqual(result.selection.controls, []);
});

test("single entity controls require one selected projected subject", () => {
  const control = { commandId: "colony:deconstruct", label: "Deconstruct", selection: { field: "site", cardinality: "one" } };
  const one = projectContextualPresentation({
    facts: [], controls: [control], targets: [{ commandId: control.commandId, subjects: ["site-1", "site-2"] }],
    selectedIds: ["site-1"], currentIds: ["site-1", "site-2"],
  });
  assert.equal(one.selection.controls.length, 1);
  const many = projectContextualPresentation({
    facts: [], controls: [control], targets: [{ commandId: control.commandId, subjects: ["site-1", "site-2"] }],
    selectedIds: ["site-1", "site-2"], currentIds: ["site-1", "site-2"],
  });
  assert.deepEqual(many.selection.controls, []);
});

test("an unavailable selection command stays scoped and explains why", () => {
  const result = projectContextualPresentation({
    facts: [{ id: "unfinished", label: "Construction", subjects: ["unfinished"] }],
    controls: [{ commandId: "colony:deconstruct", label: "Deconstruct", selection: "entities", availability: { status: "unavailable", reason: "Construction is unfinished" } }],
    targets: [], selectedIds: ["unfinished"], currentIds: ["unfinished"],
  });
  assert.deepEqual(result.world.controls, []);
  assert.equal(result.selection.controls[0].availability.reason, "Construction is unfinished");
});

test("an unavailable single entity command stays scoped when its target is absent", () => {
  const result = projectContextualPresentation({
    facts: [{ id: "unfinished", label: "Construction", subjects: ["unfinished"] }],
    controls: [{ commandId: "colony:deconstruct", label: "Deconstruct", selection: { field: "site", cardinality: "one" }, availability: { status: "unavailable", reason: "Construction is unfinished" } }],
    targets: [], selectedIds: ["unfinished"], currentIds: ["unfinished"],
  });
  assert.deepEqual(result.world.controls, []);
  assert.equal(result.selection.controls[0].availability.reason, "Construction is unfinished");
  assert.deepEqual(result.selection.controls[0].subjects, []);
});
