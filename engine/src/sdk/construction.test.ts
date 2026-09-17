import { strict as assert } from "node:assert";
import { test } from "node:test";
import { Buildable, compileBuildable, compileBuildableEnvironment, constructionCandidates, constructionPlanActions, constructionProposalInput } from "./construction";
import type { EnvironmentStructureDefinition } from "./environment";
import { entity } from "./authoring";
import { actor, actorInput } from "./behavior";
import { encodeDefinition, Visual } from "./common";

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

test("shared construction planning batches builds, replacements and existing sites", () => {
  const floor: EnvironmentStructureDefinition = {
    id: "odd-game.floor",
    shape: { kind: "floor" },
    materials: [{ kind: "bone", quantity: 1 }],
    workSeconds: 1,
    workReachBelowCells: 0,
  };
  const candidates = constructionCandidates(floor, "fixed", {
    catalog: floor.id,
    target: { area: { start: [0, 5, 0], end: [2, 5, 0] } },
  }, "odd-game.build");
  const actions = constructionPlanActions({
    party: entity("odd-game.party"), floorOperations: () => [
      { kind: "build" },
      { kind: "replace", floor: entity("old-floor") },
    ],
    definition: floor,
    candidates,
    existingSites: [candidates[2]!.site],
    replacementGenerations: new Map([[entity("old-floor"), 2]]),
    replacementId: (target, generation) => entity(`odd-game.replace.${target}.${generation}`),
  });
  assert.deepEqual(actions, [
    { kind: "replace-floor", orderId: "odd-game.replace.old-floor.3", existingFloorId: "old-floor", desiredCatalog: floor.id },
    { kind: "plan-constructions", party: "odd-game.party", plans: [candidates[0]] },
  ]);
  assert.deepEqual(constructionPlanActions({
    party: entity("odd-game.party"), definition: floor, candidates,
    existingSites: candidates.map(candidate => candidate.site),
    floorOperations: () => { throw new Error("duplicate sites must not query floors"); },
    replacementGenerations: new Map(),
    replacementId: () => entity("unused"),
  }), []);
});

test("a buildable actor compiles into one native structure and keeps its finished capabilities", () => {
  const actorDefinition = actor("odd-game.bone-bed")
    .with(Buildable, {
      shape: { kind: "fixture", footprint: [[0, 0], [0, 1], [1, 1]] },
      materials: [{ kind: "bone", quantity: 5 }],
      workSeconds: 7,
      workReachBelowCells: 0,
      placement: { alignment: "fixed", facing: { north: 0, east: 1, south: 0, west: 1 } },
      onRemove: { salvage: [{ kind: "bone", quantity: 4 }] },
    })
    .with(Visual, { sprite: "odd-game.bone-bed", label: "Bone bed" });
  const compiled = compileBuildable(actorDefinition);
  assert.deepEqual(compiled, {
    definition: {
      id: "odd-game.bone-bed",
      shape: { kind: "fixture", footprint: [[0, 0], [0, 1], [1, 1]] },
      materials: [{ kind: "bone", quantity: 5 }],
      workSeconds: 7,
      workReachBelowCells: 0,
      onRemove: { salvage: [{ kind: "bone", quantity: 4 }] },
    },
    placement: { alignment: "fixed", facing: { north: 0, east: 1, south: 0, west: 1 } },
    visual: { sprite: "odd-game.bone-bed", label: "Bone bed" },
  });

  const directTemplates = JSON.parse(new TextDecoder().decode(
    encodeDefinition("odd-game", [Visual], [], [], [], [actorDefinition]),
  ));
  assert.deepEqual(directTemplates.actors, [], "native construction is the actor's only creation owner");
});

test("buildable compilation rejects duplicate catalogs and unresolved spawn inputs", () => {
  const base = {
    world: { seed: "test", identity: "test", bounds: { minX: -2, maxX: 2, minY: -2, maxY: 4, minZ: -2, maxZ: 2 }, slots: { air: 0, soil: 1, stone: 2 }, seaLevel: 0, verticalMetres: 0.5 },
    structures: { maxSpanSteps: 2, catalog: [boneBed] },
    materials: [
      { slot: 0, solid: false, diggable: false, water: { kind: "open" as const } },
      { slot: 1, solid: true, diggable: true, water: { kind: "closed" as const } },
      { slot: 2, solid: true, diggable: true, water: { kind: "closed" as const } },
    ],
    water: { id: "water", cells: [[0, -1, 0]] as const, fallMPerS: 1, spreadMPerS: 1 },
  };
  const duplicate = actor(boneBed.id).with(Buildable, {
    ...boneBed,
    placement: { alignment: "fixed" },
  });
  assert.throws(() => compileBuildableEnvironment(base, [duplicate]), /duplicates structure/);

  const unresolved = actor("odd-game.named-bed")
    .with(Buildable, { ...boneBed, placement: { alignment: "fixed" } })
    .with(Visual, { sprite: actorInput.string("sprite"), label: "Bed" });
  assert.throws(() => compileBuildable(unresolved), /cannot use spawn inputs/);
});
