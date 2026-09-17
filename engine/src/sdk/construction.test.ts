import { strict as assert } from "node:assert";
import { test } from "node:test";
import { constructionCandidates, constructionProposalInput } from "./construction";
import type { EnvironmentStructureDefinition } from "./environment";

const boneBed: EnvironmentStructureDefinition = {
  id: "odd-game.bone-bed",
  shape: { kind: "fixture", footprint: [[0, 0], [0, 1], [1, 1]] },
  materials: [{ kind: "bone", quantity: 5 }],
  workSeconds: 7,
  workReachBelowCells: 0,
};

test("a game-authored fixture uses the shared proposal compiler without game branches", () => {
  const proposal = constructionProposalInput.parse({
    catalog: boneBed.id,
    orientation: "east",
    target: { cell: [4, 12, -3] },
  });
  assert.deepEqual(constructionCandidates(boneBed, "fixed", proposal, "odd-game.build"), [{
    site: "odd-game.build.odd-game.bone-bed.4.13.-3.east",
    catalog: "odd-game.bone-bed",
    target: { kind: "cell", cell: { x: 4, y: 13, z: -3 }, orientation: "east" },
  }]);
});

test("the shared proposal compiler expands deterministic same-level areas", () => {
  const floor: EnvironmentStructureDefinition = {
    id: "odd-game.floor",
    shape: { kind: "floor" },
    materials: [{ kind: "bone", quantity: 1 }],
    workSeconds: 1,
    workReachBelowCells: 0,
  };
  const result = constructionCandidates(floor, "fixed", {
    catalog: floor.id,
    target: { area: { start: [1, 5, 2], end: [0, 5, 3] } },
  }, "odd-game.build");
  assert.deepEqual(result.map(candidate => candidate.target), [
    { kind: "cell", cell: { x: 0, y: 5, z: 2 }, orientation: "north" },
    { kind: "cell", cell: { x: 1, y: 5, z: 2 }, orientation: "north" },
    { kind: "cell", cell: { x: 0, y: 5, z: 3 }, orientation: "north" },
    { kind: "cell", cell: { x: 1, y: 5, z: 3 }, orientation: "north" },
  ]);
});
