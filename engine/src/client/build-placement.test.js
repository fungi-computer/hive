import { test } from "node:test";
import assert from "node:assert/strict";
import { buildControls, defaultBuildMode, nextOrientation, placementHint, placementMode, selectedBuildControl } from "./build-placement.js";

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

test("placement hint distinguishes a usable preview, waiting admission, and rejected stroke", () => {
  const floor = controls[0];
  assert.equal(placementHint(floor, { hover: [1, 0, 1] }), "Preview: 1 cell · click to place");
  assert.equal(placementHint(floor, { area: { value: "dragging" }, cells: 4 }), "Preview: 4 cells · release to place");
  assert.equal(placementHint({ ...floor, availability: { status: "unavailable", reason: "No support" } }), "Waiting: No support");
  assert.equal(placementHint(floor, { area: { value: "dragging", rejection: "Selection exceeds the visible world" } }), "Rejected: Selection exceeds the visible world");
  assert.equal(placementHint(floor, { area: { value: "dragging", rejection: null } }), "Preview: 0 cells · release to place");
});
