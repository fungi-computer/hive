import { test } from "node:test";
import assert from "node:assert/strict";
import { buildControls, defaultBuildMode, nextOrientation, placementHint, placementMode, selectedBuildControl, structureSurfaceFromSprite } from "./build-placement.js";

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

const frame = (cells) => ({ verticalMetres: 0.54, structureSurfaces: cells.map(cell => ({ cell })) });
const subject = (placement, x = 4, y = 13.5 * 0.54, z = 4) => ({ id: "site", x, y, z, placement });
const node = { id: "site", target: "site", role: "structure" };
const project = (x, y, z) => ({ x, y: z });

test("ordered structure hit resolves bed, rotated brewer, and stair canonical support cells", () => {
  assert.deepEqual(structureSurfaceFromSprite(node, subject({ kind: "footprint", footprint: [[0, 0], [0, 1]], orientation: "north" }), { x: 4, y: 4 }, frame([[4, 13, 4], [4, 13, 5]]), project).cell, [4, 13, 4]);
  assert.deepEqual(structureSurfaceFromSprite(node, subject({ kind: "footprint", footprint: [[0, 0], [1, 0], [0, 1], [1, 1]], orientation: "east" }), { x: 4, y: 4 }, frame([[4, 13, 4], [4, 13, 5], [3, 13, 4], [3, 13, 5]]), project).cell, [4, 13, 4]);
  assert.deepEqual(structureSurfaceFromSprite(node, subject({ kind: "stair", entrance: [0, 0, 0], landing: [0, 2.16, -2], orientation: "south" }), { x: 4, y: 4 }, frame([[4, 15, 5], [4, 17, 6]]), project).cell, [4, 15, 5]);
});

test("structure surface resolution is null without a match and stable on ties", () => {
  const bed = subject({ kind: "footprint", footprint: [[0, 0], [0, 1]], orientation: "north" });
  assert.equal(structureSurfaceFromSprite(node, bed, { x: 4, y: 4 }, frame([[9, 13, 9]]), project), null);
  const tied = structureSurfaceFromSprite(node, subject({ kind: "footprint", footprint: [[0, 0], [1, 0]], orientation: "north" }), { x: 4.5, y: 4 }, frame([[4, 13, 4], [5, 13, 4]]), project);
  assert.deepEqual(tied.cell, [4, 13, 4]);
});

test("stair resolution follows actual step faces for every orientation", () => {
  const faces = {
    north: [[4, 15, 3], [4, 17, 2]], east: [[5, 15, 4], [6, 17, 4]],
    south: [[4, 15, 5], [4, 17, 6]], west: [[3, 15, 4], [2, 17, 4]],
  };
  for (const orientation of Object.keys(faces)) {
    const result = structureSurfaceFromSprite(node, subject({ kind: "stair", entrance: [0, 0, 0], landing: [0, 2.16, -2], orientation }), { x: 4, y: 4 }, frame(faces[orientation]), project);
    assert.deepEqual(result.cell, faces[orientation][0]);
    assert.notDeepEqual(result.cell, [4, 13, 4]);
  }
});
