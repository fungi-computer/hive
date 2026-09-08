import assert from "node:assert/strict";
import test from "node:test";
import { zoomAvailabilityForBounds } from "./control-state.js";

test("World Lab controls expose the bounded half-open zoom limits", () => {
  const atMinimum = zoomAvailabilityForBounds(
    { minX: -256, maxXExclusive: 256 },
    512,
    8192,
  );
  const middle = zoomAvailabilityForBounds(
    { minX: -1024, maxXExclusive: 1024 },
    512,
    8192,
  );
  const atMaximum = zoomAvailabilityForBounds(
    { minX: -4096, maxXExclusive: 4096 },
    512,
    8192,
  );

  assert.deepEqual(atMinimum, { span: 512, canIn: false, canOut: true });
  assert.deepEqual(middle, { span: 2048, canIn: true, canOut: true });
  assert.deepEqual(atMaximum, { span: 8192, canIn: true, canOut: false });
});
