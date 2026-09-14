import test from "node:test";
import assert from "node:assert/strict";
import { edgeWallGhostSpec, edgeWallJunctionSubjects } from "./edge-wall-presentation.js";

const bindings = {
  "wall-x-stakes": { edgeWall: { kind: "segment", stage: "stakes", axis: "x" } },
  "wall-z-finished": { edgeWall: { kind: "segment", stage: "finished", axis: "z" } },
};
const wall = (id, visual, cell, axis) => ({ id, visual, placement: { kind: "edge", edge: { cell, axis } } });

test("visible physical edges derive one exact junction per occupied vertex", () => {
  const subjects = [
    wall("x", "wall-x-stakes", [0, 14, 0], "x"),
    wall("z", "wall-z-finished", [0, 14, 0], "z"),
  ];
  const junctions = edgeWallJunctionSubjects(subjects, bindings, 2);
  assert.equal(junctions.length, 3);
  assert.deepEqual(junctions.find(item => item.visual.endsWith(".12")), {
    id: "presentation.wall-junction:1:14:1",
    name: "Wall junction", x: 0.5, y: 27, z: 0.5, facing: 0,
    visual: "colony.wall.junction.finished.12", pickable: false, screen: { x: 0, y: 0 },
  });
  assert.deepEqual(junctions, edgeWallJunctionSubjects([...subjects].reverse(), bindings, 2));
});

test("edge stroke ghost composes segments with affected existing junctions", () => {
  const observed = [wall("z", "wall-z-finished", [0, 14, 0], "z")];
  const spec = edgeWallGhostSpec([{ cell: [0, 13, 0], axis: "x" }], observed, bindings, 2);
  assert.deepEqual(spec.items.map(item => item.visual), [
    "colony.wall.segment.finished.x",
    "colony.wall.junction.finished.2",
    "colony.wall.junction.finished.12",
  ]);
  assert.deepEqual(spec.items[0].point, [0.5, 27, 0]);
});

test("edge presentation rejects visual geometry that disagrees with the physical edge", () => {
  assert.throws(() => edgeWallJunctionSubjects([wall("bad", "wall-x-stakes", [0, 14, 0], "z")], bindings, 2), /disagrees/);
});
