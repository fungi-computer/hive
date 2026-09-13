import { test } from "node:test";
import assert from "node:assert/strict";
import { buildControls, defaultBuildMode, nextOrientation, placementMode, selectedBuildControl } from "./build-placement.js";

const controls = [
  { id: "floor", command: "build", target: "world-surface", input: { catalog: "timber-floor" }, designation: ["point", "rectangle"] },
  ...["north", "east", "south", "west"].map((orientation) => ({ id: `stair-${orientation}`, command: "build", target: "world-surface", input: { catalog: "timber-stair", orientation }, designation: ["point"] })),
  { id: "dig", command: "dig", target: "terrain-area" },
];

test("build catalog groups published orientation variants once", () => {
  const groups = buildControls(controls);
  assert.deepEqual(groups.map(({ catalog }) => catalog), ["timber-floor", "timber-stair"]);
  assert.equal(groups[1].orientations.length, 4);
  assert.equal(selectedBuildControl(groups[1], "west").id, "stair-west");
});

test("rotation cycles only through published orientations and drag mode is derived", () => {
  const groups = buildControls(controls);
  assert.equal(nextOrientation(groups[1], "west"), "north");
  assert.equal(nextOrientation(groups[0], undefined), undefined);
  assert.equal(defaultBuildMode(groups[0].control), "rectangle");
  assert.equal(defaultBuildMode(groups[1].control), "point");
});

test("point-only builds stay point placement while rectangular builds select their declared drag", () => {
  const groups = buildControls(controls);
  assert.equal(defaultBuildMode(selectedBuildControl(groups[1], "north")), "point");
  assert.equal(defaultBuildMode(selectedBuildControl(groups[0])), "rectangle");
  assert.equal(placementMode(selectedBuildControl(groups[1], "north")), "point");
  assert.equal(placementMode({ command: "other", target: "world-surface" }), "point");
  assert.equal(placementMode(selectedBuildControl(groups[0]), { shiftKey: true }), "rectangle");
  assert.equal(placementMode(controls.find((control) => control.id === "dig"), { altKey: true }), "point");
});
