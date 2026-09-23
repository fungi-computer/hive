import type { GamePack } from "../contracts";
import { treeJob, treePlan } from "./colony";
import { createColonyFrameworkProofV3Pack } from "./colony-framework-proof-v3";
import {
  colonyFrameworkProofV4GameId,
  colonyFrameworkProofV4Schedule,
} from "./colony-performance-config";

/**
 * A ten-minute qualification candidate. V3 remains the pinned comparison
 * fixture; V4 adds three finite cohorts to its distributed workers, water and
 * material-paid atmosphere workload. Generated terrain supplies obstacles.
 */
export function createColonyFrameworkProofV4Pack(): GamePack {
  const base = createColonyFrameworkProofV3Pack();
  const definition = JSON.parse(new TextDecoder().decode(base.definition)) as {
    game: string;
    initial: Array<{ id: string; components: Record<string, unknown> }>;
  };
  const environment = JSON.parse(
    new TextDecoder().decode(base.environmentDefinition),
  ) as {
    world: { identity: string; seed: string };
    initialPlacements: Array<{ entity: string; column: [number, number] }>;
  };
  const oldTrees = new Set(
    definition.initial.filter((row) => row.components["colony.tree"]).map((row) => row.id),
  );
  definition.initial = definition.initial.filter((row) => !oldTrees.has(row.id));
  environment.initialPlacements = environment.initialPlacements.filter(
    (row) => !oldTrees.has(row.entity),
  );
  const centers = [
    [0, -88],
    [-88, 0],
    [88, 0],
    [0, 88],
  ] as const;
  const occupied = new Set(environment.initialPlacements.map(({ column }) => column.join(",")));
  const addPlacement = (id: string, column: [number, number]) => {
    const key = column.join(",");
    if (occupied.has(key)) throw new Error(`framework v4 placement collision at ${key}`);
    occupied.add(key);
    environment.initialPlacements.push({ entity: id, column });
  };

  // Repartition the same finite source budget into six 64-chain cohorts. The
  // first two are available at time zero (128 independent chains); four more
  // become available at two-minute intervals. No source regrows or is replaced.
  const initialActions: import("../contracts").ActionRequest[] = [];
  for (let cohort = 0; cohort < colonyFrameworkProofV4Schedule.cohortCount; cohort++) {
    for (let index = 0; index < colonyFrameworkProofV4Schedule.treesPerCohort; index++) {
      const [centerX, centerZ] = centers[Math.floor(index / 16)];
      const local = index % 16;
      const id = `colony.tree.framework-v2.${cohort}.${index}`;
      const column: [number, number] = [
        centerX - 18 + (cohort % 3) * 12 + (local % 4) * 3,
        centerZ - 9 + Math.floor(local / 4) * 3 + Math.floor(cohort / 3) * 12,
      ];
      definition.initial.push({
        id,
        components: {
          "hive.position": { x: column[0], y: 0, z: column[1], facing: 0 },
          "hive.container": { capacity: 6 },
          "colony.tree": { kind: "wood" },
          "hive.finite-resource": { kind: "wood", quantity: 6 },
          "hive.owned-by-party": { party: "party:1" },
          "colony.tree-policy": {
            designated: cohort < 2,
            party: "party:1",
            job: null,
          },
        },
      });
      addPlacement(id, column);
      if (cohort < 2)
        initialActions.push({
          kind: "create-job",
          id: treeJob(id as import("../contracts").EntityId),
          pool: "party:1" as import("../contracts").EntityId,
          plan: treePlan(id as import("../contracts").EntityId),
        });
    }
  }

  definition.game = colonyFrameworkProofV4GameId;
  return {
    ...base,
    id: colonyFrameworkProofV4GameId,
    initialActions,
    definition: new TextEncoder().encode(JSON.stringify(definition)),
    environmentDefinition: new TextEncoder().encode(JSON.stringify(environment)),
  };
}
