import test from "node:test";
import assert from "node:assert/strict";
import { actionBarGroups, selectedActionBarControls, toggleActionCategory } from "./action-bar.js";

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

test("draft controls use the persistent action dock without changing selection", () => {
  const controls = [
    { id: "draft", placement: "action-bar", selection: "entities", subjects: ["party/1/person/0"] },
    { id: "undraft", placement: "action-bar", selection: "entities", subjects: ["party/1/person/0"] },
    { id: "deconstruct", selection: { field: "site", cardinality: "one" } },
  ];
  assert.deepEqual(selectedActionBarControls(controls, []), []);
  assert.deepEqual(selectedActionBarControls(controls, ["party/1/person/0"]).map(({ id }) => id), ["draft", "undraft"]);
});

test("unavailable action-dock controls remain visible with their server reason", () => {
  const controls = selectedActionBarControls([
    { id: "draft", placement: "action-bar", selection: "entities", subjects: ["worker"], availability: { status: "unavailable", reason: "already drafted" } },
    { id: "undraft", placement: "action-bar", selection: "entities", subjects: ["worker"] },
  ], ["worker"]);
  assert.deepEqual(controls.map(({ id }) => id), ["draft", "undraft"]);
  assert.equal(controls[0].availability.reason, "already drafted");
});

test("ordinary selection only changes the selected IDs supplied to the dock", () => {
  const controls = [
    { id: "draft", placement: "action-bar", selection: "entities", subjects: ["worker-a", "worker-b"] },
    { id: "undraft", placement: "action-bar", selection: "entities", subjects: ["worker-a", "worker-b"] },
  ];
  assert.deepEqual(selectedActionBarControls(controls, ["worker-a"]).map(({ id }) => id), ["draft", "undraft"]);
  assert.deepEqual(selectedActionBarControls(controls, ["worker-b"]).map(({ id }) => id), ["draft", "undraft"]);
});

test("action dock rejects selected objects outside the advertised subjects", () => {
  const controls = [
    { id: "draft", placement: "action-bar", selection: "entities", subjects: ["worker"] },
  ];
  assert.deepEqual(selectedActionBarControls(controls, ["tree"]), []);
  assert.deepEqual(selectedActionBarControls(controls, ["worker", "tree"]), []);
});
