import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_DESIGNATION_OVERLAY_VISIBILITY,
  designationOverlayVisible,
  filterDesignationMarks,
  toggleDesignationOverlay,
} from "./designation-overlays.ts";

test("designation overlay preferences default to visible and toggle independently", () => {
  assert.equal(
    designationOverlayVisible(DEFAULT_DESIGNATION_OVERLAY_VISIBILITY, "work-plans"),
    true,
  );
  const hiddenWork = toggleDesignationOverlay(
    DEFAULT_DESIGNATION_OVERLAY_VISIBILITY,
    "work-plans",
  );
  assert.deepEqual(hiddenWork, { "work-plans": false, "storage-areas": true });
  assert.equal(
    designationOverlayVisible(hiddenWork, "storage-areas"),
    true,
  );
  const hiddenStorage = toggleDesignationOverlay(hiddenWork, "storage-areas");
  assert.deepEqual(hiddenStorage, { "work-plans": false, "storage-areas": false });
});

test("filtering hides presentation marks by group and preserves source records", () => {
  const marks = [
    { kind: "work-plans", id: "dig-1" },
    { kind: "storage-areas", id: "stockpile-1" },
  ];
  const filtered = filterDesignationMarks(marks, {
    "work-plans": false,
    "storage-areas": true,
  });
  assert.deepEqual(filtered, [{ kind: "storage-areas", id: "stockpile-1" }]);
  assert.equal(marks.length, 2);
});
