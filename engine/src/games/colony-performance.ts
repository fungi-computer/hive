import { colonyEnvironmentDefinition } from "./colony-environment";
import { colonyPack } from "./colony";
import type { GamePack } from "../contracts";

/**
 * Performance workloads are authored Colony records with a larger resident
 * population. The kernel, work systems, finite wood and original presentation
 * remain the owners; this builder only supplies deterministic content data.
 */
export function createColonyPerformancePack(
  size: 64 | 128 | 256,
  workerCount: 4 | 8 | 16 | 32 | 50,
): GamePack {
  const gameId = `colony-performance-${size}-${workerCount}`;
  const definition = JSON.parse(new TextDecoder().decode(colonyPack.definition)) as {
    format: string; version: number; game: string; components: unknown[];
    initial: Array<{ id: string; components: Record<string, unknown> }>;
  };
  const initial = definition.initial.map(record => ({ id: record.id, components: { ...record.components } }));
  const environment = JSON.parse(new TextDecoder().decode(colonyEnvironmentDefinition)) as {
    world: { bounds: Record<string, number>; identity: string; seed: string };
    initialPlacements?: Array<{ entity: string; column: [number, number] }>;
    presentationWindow?: { minX: number; maxX: number; minZ: number; maxZ: number };
  };
  const placements = [...(environment.initialPlacements ?? [])];
  const occupied = new Set(placements.map(placement => placement.column.join(",")));
  const reserveColumn = (seed: number): [number, number] => {
    for (let attempt = 0; attempt < 57 * 57; attempt++) {
      const flat = (seed * 97 + attempt * 101) % (57 * 57);
      const column: [number, number] = [(flat % 57) - 28, Math.floor(flat / 57) - 28];
      const key = column.join(",");
      if (!occupied.has(key)) { occupied.add(key); return column; }
    }
    throw new Error("Colony performance resident window has no free placement column");
  };
  const half = size / 2;
  const treeCount = 50;
  const existingTrees = initial.filter(record => record.components["colony.tree"]);
  for (const record of existingTrees) {
    const policy = record.components["colony.tree-policy"] as { designated: boolean } | undefined;
    if (policy) record.components["colony.tree-policy"] = { ...policy, designated: true };
  }
  const visualNames = ["colony.rowan", "colony.sedge"];
  for (let index = 2; index < workerCount; index++) {
    const id = `colony.worker.${index + 1}`;
    const [x, z] = reserveColumn(index);
    initial.push({ id, components: {
      "hive.position": { x, y: 0, z, facing: 0 },
      "hive.body": { speed: 2 }, "hive.container": { capacity: 3 },
      "hive.traversal": { clearanceCells: 1, maxStepCells: 1 },
      "hive.visual": { sprite: visualNames[index % visualNames.length], label: `Worker ${index + 1}` },
      "colony.worker": { guest: false }, "hive.work-participation": { automatic: true },
      "hive.delivery-control": { enabled: false, quantity: 1 },
    } });
    placements.push({ entity: id, column: [x, z] });
  }
  for (let index = existingTrees.length; index < treeCount; index++) {
    const id = `colony.tree.performance-${index + 1}`;
    const [x, z] = reserveColumn(workerCount + index);
    initial.push({ id, components: {
      "hive.position": { x, y: 0, z, facing: 0 }, "hive.container": { capacity: 6 },
      "colony.tree": { phase: "standing" }, "hive.finite-resource": { kind: "wood", quantity: 6 },
      "colony.tree-policy": { designated: true },
    } });
    initial.push({ id: `${id}.order`, components: {
      "colony.tree-order": { tree: id, actor: null, phase: "blocked", stage: "fell", seconds: 0,
        approachX: 0, approachY: 0, approachZ: 0, reason: "Not designated" },
    } });
    placements.push({ entity: id, column: [x, z] });
  }
  definition.initial = initial;
  definition.game = gameId;
  environment.world.bounds = { minX: -half, maxX: half, minY: -32, maxY: 40, minZ: -half, maxZ: half };
  environment.world.identity = `colony-performance-${size}`;
  environment.world.seed = `colony-performance-${size}`;
  environment.initialPlacements = placements;
  return {
    ...colonyPack,
    id: gameId,
    version: colonyPack.version,
    definition: new TextEncoder().encode(JSON.stringify(definition)),
    environmentDefinition: new TextEncoder().encode(JSON.stringify(environment)),
    presentationWindow: { minX: -32, maxX: 32, minZ: -32, maxZ: 32 },
    presentation: colonyPack.presentation && {
      ...colonyPack.presentation,
      inspect: context => (colonyPack.presentation?.inspect?.(context) ?? []).filter(fact =>
        !fact.id.startsWith("tree-") &&
        !fact.id.startsWith("worker-") &&
        !fact.id.startsWith("dig-progress-") &&
        !fact.id.startsWith("delivery-phase-")),
    },
  };
}
