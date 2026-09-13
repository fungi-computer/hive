import test from "node:test";
import assert from "node:assert/strict";
import { actionBarGroups, toggleActionCategory } from "./action-bar.js";

test("action bar separates build commands from work commands", () => {
  const groups = actionBarGroups([
    { id: "build:wall" }, { id: "dig" }, { id: "sow-mugwort" }, { id: "stockpile", category: "Storage" }, { id: "build:floor" },
  ], new Set(["build:wall", "build:floor"]));
  assert.deepEqual(groups.builds.map(({ id }) => id), ["build:wall", "build:floor"]);
  assert.deepEqual(groups.work.map(({ id }) => id), ["dig", "sow-mugwort"]);
  assert.deepEqual(groups.zones.map(({ id }) => id), ["stockpile"]);
});

test("category toggling is deterministic", () => {
  assert.equal(toggleActionCategory(null, "build"), "build");
  assert.equal(toggleActionCategory("build", "orders"), "orders");
  assert.equal(toggleActionCategory("orders", "orders"), null);
});
