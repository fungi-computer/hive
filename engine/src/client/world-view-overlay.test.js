import test from "node:test";
import assert from "node:assert/strict";
import {
  createWorldView,
  designationOverlayVisible,
  toggleDesignationOverlay,
  visibleDesignationMarks,
} from "./world-view.js";

test("designation overlay groups default visible and toggle independently", () => {
  const view = createWorldView();
  const hiddenWork = toggleDesignationOverlay(view, "work-plans");
  assert.equal(designationOverlayVisible(hiddenWork, "work-plans"), false);
  assert.equal(designationOverlayVisible(hiddenWork, "storage-areas"), true);
  const hiddenStorage = toggleDesignationOverlay(hiddenWork, "storage-areas");
  assert.equal(designationOverlayVisible(hiddenStorage, "storage-areas"), false);
  assert.equal(designationOverlayVisible(hiddenStorage, "work-plans"), false);
});

test("overlay preferences remain presentation state and reject unknown groups", () => {
  const view = createWorldView();
  assert.throws(() => toggleDesignationOverlay(view, "unknown"), /unknown designation overlay/);
  assert.equal(view.designationOverlays["work-plans"], true);
  assert.equal(view.cutaway, false);
});

test("mark filtering keeps stockpile and work marks independently selectable", () => {
  const marks = [
    { kind: "stockpile", cell: [1, 0, 1] },
    { kind: "dig", cell: [2, 0, 1] },
  ];
  const view = toggleDesignationOverlay(createWorldView(), "storage-areas");
  assert.deepEqual(visibleDesignationMarks(marks, view), [marks[1]]);
  assert.deepEqual(marks, [
    { kind: "stockpile", cell: [1, 0, 1] },
    { kind: "dig", cell: [2, 0, 1] },
  ]);
});
