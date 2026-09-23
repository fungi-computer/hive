import { colonyEnvironmentDefinition } from "./colony-environment";
import { colonyPack, treeJob, treePlan } from "./colony";
import { colonyFrameworkProofGameId, colonyFrameworkProofV2GameId, colonyFrameworkProofV2Schedule, colonyPerformanceGameId } from "./colony-performance-config";
import type { ColonyPerformanceSize, ColonyPerformanceWorkerCount } from "./colony-performance-config";
import type { GamePack } from "../contracts";

/**
 * Performance workloads are authored Colony records with a larger resident
 * population. The kernel, work systems, finite wood and original presentation
 * remain the owners; this builder only supplies deterministic content data.
 */
export function createColonyPerformancePack(
  size: ColonyPerformanceSize,
  workerCount: ColonyPerformanceWorkerCount,
): GamePack {
  const gameId = colonyPerformanceGameId(size, workerCount);
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
  initial.push({ id: "party:1", components: { "hive.party": {}, "hive.owned-by": { player: "player:1" } } });
  const existingTrees = initial.filter(record => record.components["colony.tree"]);
  const jobActions = existingTrees.map(record => {
    const id = record.id as import("../contracts").EntityId;
    record.components["colony.tree-policy"] = { designated: true, party: "party:1", job: null };
    record.components["hive.owned-by-party"] = { party: "party:1" };
    return { kind: "create-job" as const, id: treeJob(id), pool: "party:1" as import("../contracts").EntityId, plan: treePlan(id) };
  });
  const visualNames = ["colony.rowan", "colony.sedge"];
  for (let index = 0; index < workerCount; index++) {
    const id = index < 2 ? `party:1.person.${index}` : `colony.worker.${index + 1}`;
    const [x, z] = reserveColumn(index);
    initial.push({ id, components: {
      "hive.position": { x, y: 0, z, facing: 0 },
      "hive.body": { speed: 2 }, "hive.container": { capacity: 3 },
      "hive.traversal": { clearanceCells: 1, maxStepCells: 1 },
      "hive.visual": { sprite: visualNames[index % visualNames.length], label: `Worker ${index + 1}` },
      "hive.party-member": { party: "party:1" },
      "hive.owned-by-party": { party: "party:1" },
      "colony.worker": { guest: false }, "hive.work-participation": { automatic: true },
    } });
    placements.push({ entity: id, column: [x, z] });
  }
  for (let index = existingTrees.length; index < treeCount; index++) {
    const id = `colony.tree.performance-${index + 1}`;
    const [x, z] = reserveColumn(workerCount + index);
    initial.push({ id, components: {
      "hive.position": { x, y: 0, z, facing: 0 }, "hive.container": { capacity: 6 },
      "colony.tree": { kind: "wood" }, "hive.finite-resource": { kind: "wood", quantity: 6 },
      "hive.owned-by-party": { party: "party:1" },
      "colony.tree-policy": { designated: true, party: "party:1", job: null },
    } });
    const tree = id as import("../contracts").EntityId;
    jobActions.push({ kind: "create-job" as const, id: treeJob(tree), pool: "party:1" as import("../contracts").EntityId, plan: treePlan(tree) });
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
    localScope: { kind: "player", player: "player:1" },
    version: colonyPack.version,
    definition: new TextEncoder().encode(JSON.stringify(definition)),
    environmentDefinition: new TextEncoder().encode(JSON.stringify(environment)),
    bootstrapActions: undefined,
    initialActions: jobActions,
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

/** One fixed, distributed native/DO workload. Keep its ID versioned when editing placement or jobs. */
export function createColonyFrameworkProofPack(): GamePack {
  const base = createColonyPerformancePack(256, 100);
  const definition = JSON.parse(new TextDecoder().decode(base.definition)) as {
    game: string;
    initial: Array<{ id: string; components: Record<string, unknown> }>;
  };
  const environment = JSON.parse(new TextDecoder().decode(base.environmentDefinition)) as {
    world: { identity: string; seed: string };
    initialPlacements: Array<{ entity: string; column: [number, number] }>;
  };
  const workers = definition.initial.filter(record => record.components["colony.worker"]);
  const trees = definition.initial.filter(record => record.components["colony.tree"]);
  if (workers.length !== 100 || trees.length !== 50) throw new Error("framework proof base workload changed");
  const occupied = new Set<string>();
  const placements = new Map(environment.initialPlacements.map(row => [row.entity, row]));
  for (const row of environment.initialPlacements) {
    if (!workers.some(worker => worker.id === row.entity) && !trees.some(tree => tree.id === row.entity))
      occupied.add(row.column.join(","));
  }
  const place = (record: { id: string; components: Record<string, unknown> }, column: [number, number]) => {
    const key = column.join(",");
    if (occupied.has(key)) throw new Error(`framework proof placement collision at ${key}`);
    occupied.add(key);
    record.components["hive.position"] = { x: column[0], y: 0, z: column[1], facing: 0 };
    const placement = placements.get(record.id);
    if (placement) placement.column = column;
    else placements.set(record.id, { entity: record.id, column });
  };
  const workerCenters = [[-88, -88], [-88, 88], [88, -88], [88, 88]] as const;
  for (const [index, worker] of workers.entries()) {
    const center = workerCenters[Math.floor(index / 25)];
    const local = index % 25;
    place(worker, [center[0] + (local % 5 - 2) * 3, center[1] + (Math.floor(local / 5) - 2) * 3]);
  }
  const treeCenters = [[0, -88], [-88, 0], [88, 0], [0, 88]] as const;
  const jobActions = [...(base.initialActions ?? [])];
  for (let index = 0; index < 128; index++) {
    const tree = index < trees.length ? trees[index] : {
      id: `colony.tree.framework-${index + 1}`,
      components: {
        "hive.container": { capacity: 6 },
        "colony.tree": { kind: "wood" },
        "hive.finite-resource": { kind: "wood", quantity: 6 },
        "hive.owned-by-party": { party: "party:1" },
        "colony.tree-policy": { designated: true, party: "party:1", job: null },
      } as Record<string, unknown>,
    };
    const center = treeCenters[Math.floor(index / 32)];
    const local = index % 32;
    place(tree, [center[0] + (local % 8 - 4) * 3, center[1] + (Math.floor(local / 8) - 2) * 3]);
    if (index >= trees.length) {
      definition.initial.push(tree);
      const id = tree.id as import("../contracts").EntityId;
      jobActions.push({ kind: "create-job", id: treeJob(id), pool: "party:1" as import("../contracts").EntityId, plan: treePlan(id) });
    }
  }
  definition.game = colonyFrameworkProofGameId;
  environment.world.identity = colonyFrameworkProofGameId;
  environment.world.seed = colonyFrameworkProofGameId;
  environment.initialPlacements = [...placements.values()];
  return {
    ...base,
    id: colonyFrameworkProofGameId,
    definition: new TextEncoder().encode(JSON.stringify(definition)),
    environmentDefinition: new TextEncoder().encode(JSON.stringify(environment)),
    initialActions: jobActions,
  };
}

/**
 * Bounded gate-0 diagnostic, not a capacity qualification. Three finite cohorts
 * are authored up front; the driver designates the later trees through Colony's
 * ordinary command. Nothing regrows or receives free replacement material.
 * Generated terrain supplies the obstacles. Four material-paid hearths exercise
 * smoke/heat, not ordinary-air pressure (which the engine does not simulate).
 */
export function createColonyFrameworkProofV2Pack(): GamePack {
  const base = createColonyPerformancePack(256, 100);
  const definition = JSON.parse(new TextDecoder().decode(base.definition)) as {
    game: string; initial: Array<{ id: string; components: Record<string, unknown> }>;
  };
  const environment = JSON.parse(new TextDecoder().decode(base.environmentDefinition)) as {
    world: { identity: string; seed: string };
    atmosphere: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } };
    initialPlacements: Array<{ entity: string; column: [number, number] }>;
  };
  const removed = new Set(definition.initial.filter(row => row.components["colony.tree"]).map(row => row.id));
  definition.initial = definition.initial.filter(row => !removed.has(row.id));
  environment.initialPlacements = environment.initialPlacements.filter(row => !removed.has(row.entity));
  const workers = definition.initial.filter(row => row.components["colony.worker"]);
  if (workers.length !== 100) throw new Error("framework v2 base population changed");
  const centers = [[-88, -88], [-88, 88], [88, -88], [88, 88]] as const;
  const place = (record: { id: string; components: Record<string, unknown> }, column: [number, number]) => {
    record.components["hive.position"] = { x: column[0], y: 0, z: column[1], facing: 0 };
    const placement = environment.initialPlacements.find(row => row.entity === record.id);
    if (placement) placement.column = column;
    else environment.initialPlacements.push({ entity: record.id, column });
  };
  const add = (id: string, components: Record<string, unknown>, column?: [number, number]) => {
    const record = { id, components };
    definition.initial.push(record);
    if (column) place(record, column);
    return record;
  };
  const owned = { "hive.owned-by-party": { party: "party:1" } };
  for (const [index, worker] of workers.entries()) {
    const [x, z] = centers[Math.floor(index / 25)];
    const local = index % 25;
    place(worker, [x + (local % 5 - 2) * 3, z + (Math.floor(local / 5) - 2) * 3]);
  }
  const initialActions: import("../contracts").ActionRequest[] = [];
  for (let cohort = 0; cohort < colonyFrameworkProofV2Schedule.cohortReleaseSteps.length; cohort++) {
    for (let index = 0; index < colonyFrameworkProofV2Schedule.treesPerCohort; index++) {
      const [x, z] = centers[Math.floor(index / 32)];
      const local = index % 32;
      const id = `colony.tree.framework-v2.${cohort}.${index}` as import("../contracts").EntityId;
      add(id, {
        ...owned, "hive.container": { capacity: 6 }, "colony.tree": { kind: "wood" },
        "hive.finite-resource": { kind: "wood", quantity: 6 },
        "colony.tree-policy": { designated: cohort === 0, party: "party:1", job: null },
      }, [x + (local % 8 - 4) * 3, z + 12 + Math.floor(local / 8) * 3 + cohort * 8]);
      if (cohort === 0) initialActions.push({ kind: "create-job", id: treeJob(id), pool: "party:1" as import("../contracts").EntityId, plan: treePlan(id) });
    }
  }
  const bootstrapActions: import("../contracts").ActionRequest[] = [];
  for (const [quadrant, [x, z]] of centers.entries()) {
    // One finite 768-unit destination per quadrant, using native stockpile and
    // provider capabilities. Longer cross-quadrant deliveries remain possible.
    add(`framework-v2.store.${quadrant}`, {
      ...owned, "hive.container": { capacity: 768 }, "hive.storage-provider": {},
    }, [x + 18, z]);
    const worker = workers[quadrant * 25];
    const column = environment.initialPlacements.find(row => row.entity === worker.id)!.column;
    const station = `framework-v2.hearth.${quadrant}`;
    add(station, { ...owned, "hive.container": { capacity: 1 }, "hive.emitter": { catalog: "wood-hearth" } }, [column[0] - 1, column[1]]);
    add(`${station}.fuel`, { ...owned, "hive.lot": { kind: "wood", quantity: 1, container: station } });
    add(`${worker.id}.framework-pail`, {
      ...owned, "hive.lot": { kind: "pail", quantity: 1, container: worker.id },
      "hive.container": { capacity: 7 }, "hive.vessel-capability": { acceptsWater: true },
    });
    bootstrapActions.push({ kind: "begin-emission", worker: worker.id as import("../contracts").EntityId, station: station as import("../contracts").EntityId });
  }
  definition.game = colonyFrameworkProofV2GameId;
  environment.world.identity = colonyFrameworkProofV2GameId;
  environment.world.seed = colonyFrameworkProofV2GameId;
  environment.atmosphere.min = { x: -128, y: -32, z: -128 };
  environment.atmosphere.max = { x: 128, y: 40, z: 128 };
  return {
    ...base, id: colonyFrameworkProofV2GameId,
    definition: new TextEncoder().encode(JSON.stringify(definition)),
    environmentDefinition: new TextEncoder().encode(JSON.stringify(environment)),
    bootstrapActions, initialActions,
  };
}
