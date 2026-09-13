import assert from "node:assert/strict";
import test from "node:test";
import { advanceColonyNeeds } from "./colony";

test("Colony needs decay deterministically from elapsed time", () => {
  assert.deepEqual(advanceColonyNeeds({ hunger: 100, thirst: 100, rest: 100 }, 10), {
    hunger: 99.9, thirst: 99.84, rest: 99.88,
  });
  assert.deepEqual(advanceColonyNeeds({ hunger: 100, thirst: 100, rest: 100 }, 10),
    advanceColonyNeeds({ hunger: 100, thirst: 100, rest: 100 }, 10));
});

test("Colony needs decay clamps at zero and rejects invalid elapsed time", () => {
  assert.deepEqual(advanceColonyNeeds({ hunger: 1, thirst: 1, rest: 1 }, 1000), {
    hunger: 0, thirst: 0, rest: 0,
  });
  assert.throws(() => advanceColonyNeeds({ hunger: 1, thirst: 1, rest: 1 }, -1), /non-negative/);
});
