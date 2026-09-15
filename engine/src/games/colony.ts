import { colonyConstructionVisuals } from "./colony-construction-visuals";
import { colonyBrewStationProfiles } from "./colony-brewing-presentation";
import { ConstructionSite, constructionCell } from "../sdk/construction";
import { colonyBuildCommand } from "./colony-building";
import { DeconstructionOrder } from "../sdk/deconstruction-work";
import { command, component, entity, query } from "../sdk/authoring";
import {
  Emitter,
  Body,
  Container,
  Destination,
  ExcavationWork,
  ExcavationOrder,
  MaterialLot,
  Position,
  Traversal,
  encodeDefinition,
  transfer,
  FiniteResource,
  JobTaskWork,
  ResourceSite,
} from "../sdk/common";
import { DeliveryControl, DeliveryTask } from "../sdk/delivery";
import { StagedProcess, requestProcess } from "../sdk/process-supply";
import { GroundStock } from "../sdk/ground-stock";
import { WorkParticipation } from "../sdk/work-control";
import { OwnedByParty, Party, PartyMember, PartyReceipt } from "../sdk/party";
import { Cat, catInitial, colonyCatSystem } from "./colony-cat";
import { colonyEnvironment, colonyEnvironmentDefinition } from "./colony-environment";
import { ColonyTree, ColonyTreePolicy, ColonyResourceOrder, colonyWorkSystem } from "./colony-work";
import { Worker } from "./colony-components";
import { colonyPartyFootprint, createColonyPartyPlan } from "./colony-party";
import { encodeEnvironmentDefinition } from "../sdk/environment";
import { beginRouteWorkAttempt, retargetRouteWorkAttempt, workAttemptsFor } from "../sdk/work-attempt";
import { WaterSupplyOrder, WaterSupplyWork, waterSupplyProvider } from "./colony-water-work";
import { colonyStockpileCommand, colonyStockpilePolicyCommand } from "./colony-stockpile-command";
import { StockpileCell } from "../sdk/stockpile";
import { z } from "zod";
import type { ActionRequest, ConstructionReadinessStatus, EntityId, GamePack, JobPlan, MoveDestination, ReadContext, GameCommandContext } from "../contracts";

export const colonyMaterialCatalog = [
  ...["water", "ale", "wood", "wood-felled", "bread", "malt", "mugwort", "barm", "keg", "pail", "spent-grain", "soil-spoil", "stone-spoil"].map(kind => ({ kind, unitVolume: 1 })),
] as const;

/** Content policy compiled into the native stockpile admission table. */
export const colonyStockpileProfiles = [
  { id: "wood", materialCategories: { wood: "building" }, allowedCategories: ["building"] },
  { id: "food", materialCategories: { bread: "food", malt: "brewing", mugwort: "brewing" }, allowedCategories: ["food", "brewing"] },
  { id: "spoil", materialCategories: { "soil-spoil": "raw", "stone-spoil": "raw" }, allowedCategories: ["raw"] },
  { id: "materials", materialCategories: {}, allowedCategories: [], allowedMaterials: ["wood", "stone-spoil", "soil-spoil", "bread", "malt", "mugwort", "barm", "keg", "ale", "spent-grain"] },
] as const;

export { Worker } from "./colony-components";
export { ExcavationOrder } from "../sdk/common";
export { ColonyTree, ColonyTreePolicy, colonyWorkSystem } from "./colony-work";
export { WaterSupplyOrder, WaterSupplyWork, waterSupplyProvider } from "./colony-water-work";
export const Guest = component<{ hungry: boolean }>("colony.guest", {
  version: 1,
  fields: { hungry: "boolean" },
});

const localPartyPlan = createColonyPartyPlan("local", entity("colony.local-party"), { x: 0, y: 0, z: 0 });
const workerOne = localPartyPlan.people[0];
const MAX_PARTY_SELECTION = 32;
const guestId = entity("colony.guest.1");
const pantryId = entity("colony.local-party.starter-store");
const colonyLumberId = pantryId;
const catId = entity("colony.cat.1");
const trees = [
  { id: entity("colony.tree.oak"), x: 2, z: 2 },
  { id: entity("colony.tree.pine"), x: -5, z: 4 },
  { id: entity("colony.tree.willow"), x: 4, z: -5 },
] as const;
export const treeJob = (tree: EntityId): EntityId => entity(`${tree}:job`);
export const treePlan = (tree: EntityId): JobPlan => ({
  definition: "colony.tree-processing",
  definitionVersion: 1,
  steps: [
    {
      key: "fell",
      after: null,
      operation: {
        kind: "finiteToItem",
        source: { kind: "exact", value: tree },
        inputKind: "wood",
        inputQuantity: 6,
        outputKind: "wood-felled",
        outputQuantity: 6,
        workSeconds: 3,
        resultSlot: "felled",
      },
      continuation: "any-eligible",
    },
    {
      key: "chop",
      after: "fell",
      operation: {
        kind: "itemToItems",
        source: { kind: "result", value: { step: "fell", slot: "felled" } },
        inputKind: "wood-felled",
        inputQuantity: 6,
        outputKind: "wood",
        outputQuantity: 6,
        workSeconds: 2,
        resultSlot: "logs",
      },
      continuation: "any-eligible",
    },
  ],
});
export function constructionStatusLabel(
  phase: "planned" | "working" | "finished",
  readiness: ConstructionReadinessStatus,
): string {
  if (phase === "finished") return "Finished";
  if (phase === "working") return "Building";
  if (readiness === "waitingForSupport") return "Waiting for structural support";
  if (readiness === "unknown") return "Construction state unavailable";
  return "Waiting for materials or a free worker";
}

const catRecord = catInitial(catId, workerOne, { x: 1, y: 0, z: 1 });
const colonyInitial = [
  { ...catRecord, components: { ...catRecord.components, "hive.visual": { sprite: "colony.cat", label: "Mallow" } } },
  ...localPartyPlan.records,
  {
    id: guestId,
    components: {
      "hive.position": { x: 3, y: 0, z: 1, facing: 0 },
      "hive.body": { speed: 1 },
      "hive.container": { capacity: 4 },
      "hive.traversal": { clearanceCells: 1, maxStepCells: 1 },
      "hive.visual": { sprite: "goblin.guest", label: "Guest" },
      "colony.guest": { hungry: true },
    },
  },
  ...trees.flatMap(({ id, x, z }) => [{ id, components: {
    "hive.position": { x, y: 0, z, facing: 0 },
    "hive.container": { capacity: 6 },
    "colony.tree": { kind: "wood" },
    [FiniteResource.id]: { kind: "wood", quantity: 6 },
    "colony.tree-policy": { designated: false, party: null, job: null },
  } }]),
];

type CommandContext = Pick<GameCommandContext, "query" | "scope" | "workAttempts" | "workAttemptForWorker">;

const goInput = z.object({
  entities: z.array(z.string().min(1).max(128).transform(entity)).min(1).max(MAX_PARTY_SELECTION),
  destination: z.object({
    x: z.number().finite().min(-1_000_000).max(1_000_000), y: z.number().finite().min(-1_000_000).max(1_000_000), z: z.number().finite().min(-1_000_000).max(1_000_000),
    frame: z.string().transform(entity).nullable(),
  }).strict(),
}).strict();
const stationInput = z.object({ station: z.string().min(1).max(128).transform(entity) }).strict();

function finishedBrewStations(context: Pick<ReadContext, "query">) {
  return context.query(query(ConstructionSite)).filter(row => {
    const site = row.get(ConstructionSite);
    return site.catalog === "brew-station" && site.phase === "finished";
  });
}
function availableBrewStations(context: Pick<ReadContext, "query">) {
  const active = new Set(context.query(query(StagedProcess)).filter(row => row.get(StagedProcess).phase !== "complete").map(row => row.get(StagedProcess).station));
  return finishedBrewStations(context).filter(row => !active.has(row.id));
}

const workerSelectionInput = z.object({
  entities: z.array(z.string().min(1).max(128).transform(entity)).min(1).max(MAX_PARTY_SELECTION),
}).strict();
const deliveryInput = z.object({
  entities: z.array(z.string().min(1).max(128).transform(entity)).min(1).max(MAX_PARTY_SELECTION),
  quantity: z.number().int().positive().max(0xffffffff).optional(),
}).strict();
const pointInput = z.tuple([
  z.number().int().min(-1_000_000).max(1_000_000),
  z.number().int().min(-1_000_000).max(1_000_000),
  z.number().int().min(-1_000_000).max(1_000_000),
]);
const areaInput = z.object({ start: pointInput, end: pointInput }).strict();
const emptyInput = z.object({}).strict();
const digInput = z.object({ area: areaInput }).strict();
const treeSelectionInput = z.object({ entities: z.array(z.string().min(1).max(128).transform(entity)).min(1).max(32) }).strict();
const cancelDigInput = z.object({
  entities: z.array(z.string().min(1).max(128).transform(entity)).min(1).max(MAX_PARTY_SELECTION).optional(),
  area: areaInput.optional(),
}).strict().refine(value => value.entities !== undefined || value.area !== undefined, "cancel dig requires workers or an area");
const depositInput = z.object({ entities: z.array(z.string().min(1).max(128).transform(entity)).length(1) }).strict();

const mugwortTargetInput = z.object({
  cell: pointInput,
  material: z.number().int().min(0).max(65535),
}).strict();

function selectedWorkers(context: CommandContext, raw: readonly EntityId[]): readonly EntityId[] {
  const selected = [...new Set(raw)];
  if (selected.length !== raw.length)
    throw new Error("selection must contain distinct colony workers");
  const rows = context.query(query(Worker, PartyMember));
  for (const id of selected) {
    const row = rows.find((candidate) => candidate.id === id);
    const worker = row?.get(Worker);
    const member = row?.get(PartyMember);
    if (!worker || worker.guest || !member) throw new Error("selection must contain admitted colony workers");
    if (context.scope.kind === "player" && member.party !== context.scope.party) throw new Error("selection contains a worker outside the command party");
  }
  return selected;
}

function attemptForWorker(context: CommandContext, worker: EntityId) {
  return context.workAttemptForWorker?.(worker) ?? null;
}

function admittedParty(context: CommandContext, worker: EntityId): EntityId {
  const membership = context.query(query(PartyMember)).find(row => row.id === worker)?.get(PartyMember);
  if (context.scope.kind === "player") {
    if (!membership || membership.party !== context.scope.party) throw new Error("worker is outside the command party");
    return context.scope.party;
  }
  if (!membership) throw new Error("worker has no admitted party");
  return membership.party;
}

function exactRouteReplacement(context: CommandContext, worker: EntityId, party: EntityId, destination: MoveDestination): readonly ActionRequest[] {
  const current = attemptForWorker(context, worker);
  // An interrupted automatic attempt retains its terminal receipt for its task
  // owner, but no longer owns the worker. Manual movement may begin immediately;
  // the original provider will acknowledge its own outcome independently.
  if (!current || (current.key.task !== worker && current.phase.kind === "outcome")) {
    const actions: ActionRequest[] = [];
    beginRouteWorkAttempt({ action: request => actions.push(request) }, worker, worker, party, destination);
    return actions;
  }
  if (current.worker !== worker || current.party !== party || current.key.task !== worker) throw new Error("worker has an incompatible active work attempt");
  if (current.phase.kind !== "executing") throw new Error("worker route is waiting for work-attempt reconciliation");
  const actions: ActionRequest[] = [];
  retargetRouteWorkAttempt({ action: request => actions.push(request) }, current.key, current.phase.operation.sequence, destination);
  return actions;
}

function activeTaskFor(context: CommandContext, actor: EntityId) {
  const tasks = context.query(query(DeliveryTask));
  const attempts = workAttemptsFor(context, tasks.map(row => row.id));
  const taskIds = new Set(attempts.filter(attempt => attempt.worker === actor).map(attempt => attempt.key.task));
  return tasks.find(row => taskIds.has(row.id))?.get(DeliveryTask);
}

function deliveryWrites(
  context: CommandContext,
  input: z.infer<typeof deliveryInput>,
  enabled: boolean,
  preserveCurrentQuantity = false,
) {
  const selected = selectedWorkers(context, input.entities);
  const quantity = input.quantity;
  if (enabled && !preserveCurrentQuantity && quantity !== undefined) {
    for (const worker of selected) {
      const capacity = context.query(query(Container)).find((row) => row.id === worker)?.get(Container).capacity;
      if (typeof capacity !== "number" || !Number.isSafeInteger(capacity) || quantity > capacity) throw new Error("delivery quantity exceeds worker capacity");
    }
  }
  return selected.map((worker) => {
    const active = activeTaskFor(context, worker);
    const current = context.query(query(DeliveryControl)).find((row) => row.id === worker)?.get(DeliveryControl);
    if (
      enabled &&
      active &&
      current &&
      quantity !== undefined &&
      current.quantity !== quantity
    )
      throw new Error("cannot change quantity during active delivery");
    const nextQuantity = preserveCurrentQuantity
      ? current?.quantity ?? 1
      : quantity ?? 1;
    return {
      component: DeliveryControl.id,
      entity: worker,
      value: { enabled, quantity: enabled ? nextQuantity : current?.quantity ?? 1 },
    };
  });
}

function selectedDigWorker(context: CommandContext, input: z.infer<typeof depositInput>): EntityId {
  const worker = input.entities[0];
  const row = context.query(query(Worker, PartyMember)).find((candidate) => candidate.id === worker);
  const workerState = row?.get(Worker);
  const member = row?.get(PartyMember);
  if (!workerState || workerState.guest || !member || (context.scope.kind === "player" && member.party !== context.scope.party)) throw new Error("selection must contain an admitted colony worker");
  return worker;
}

function depositActions(context: CommandContext, input: z.infer<typeof depositInput>) {
  const worker = selectedDigWorker(context, input);
  const lots = context.query(query(MaterialLot)).map((row) => ({
    id: row.id,
    ...row.get(MaterialLot),
  }));
  const reservedLots = new Set(
    context
      .query(query(DeliveryTask))
      .map((row) => row.get(DeliveryTask))
      .filter((task) => task.custody !== "delivered")
      .map((task) => task.sourceLot),
  );
  const carried = lots.filter((lot) => lot.container === worker);
  if (carried.some((lot) => reservedLots.has(lot.id)))
    throw new Error("worker cargo is reserved by delivery");
  if (!carried.length) throw new Error("worker has no carried goods");
  if (carried.some((lot) => !Number.isSafeInteger(lot.quantity) || lot.quantity <= 0 || lot.quantity > 0xffffffff))
    throw new Error("worker cargo is invalid");
  const party = context.query(query(PartyMember)).find((row) => row.id === worker)?.get(PartyMember).party;
  const pantryRow = context.query(query(Container, OwnedByParty)).find((row) => row.get(OwnedByParty).party === party);
  const pantry = pantryRow?.get(Container);
  if (!pantry) throw new Error("pantry is unavailable");
  const destination = pantryRow!.id;
  const pantryQuantity = lots
    .filter((lot) => lot.container === destination)
    .reduce((sum, lot) => sum + lot.quantity, 0);
  const carriedQuantity = carried.reduce((sum, lot) => sum + lot.quantity, 0);
  if (!Number.isSafeInteger(pantryQuantity) || !Number.isSafeInteger(carriedQuantity) ||
      carriedQuantity > pantry.capacity - pantryQuantity)
    throw new Error("pantry lacks capacity");
  return carried
    .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
    .map((lot) => transfer(lot.id, worker, destination, lot.quantity));
}

const colonyComponents = [
  Party,
  PartyMember,
  OwnedByParty,
  PartyReceipt,
  Position,
  Emitter,
  Body,
  Container,
  Traversal,
  MaterialLot,
  StagedProcess,
  ExcavationWork,
  Destination,
  Worker,
  Guest,
  DeliveryTask,
  DeliveryControl,
  ExcavationOrder,
  ColonyResourceOrder,
  ColonyTree,
  ColonyTreePolicy,
  FiniteResource,
  ResourceSite,
  Cat,
  DeconstructionOrder,
  WorkParticipation,
  StockpileCell,
  WaterSupplyOrder, WaterSupplyWork,
] as const;

function digArea(input: z.infer<typeof digInput>, party: EntityId): ActionRequest {
  const area = input.area;
  const [startX, y, startZ] = area.start, [endX, endY, endZ] = area.end;
  if (y !== endY) throw new Error("dig area must stay on one level");
  const count = (Math.abs(endX - startX) + 1) * (Math.abs(endZ - startZ) + 1);
  if (!Number.isSafeInteger(count) || count < 1 || count > 256) throw new Error("dig area exceeds 256 cells");
  return { kind: "plan-excavation", party, prefix: "colony.dig", start: area.start, end: area.end };
}
export const colonyPack: GamePack = {
  id: "colony",
  version: 7,
  localScope: { kind: "player", player: "local", party: entity("colony.local-party") },
  components: colonyComponents,
  systems: [colonyWorkSystem, colonyCatSystem],
  partyJoin: Object.freeze({
    footprint: colonyPartyFootprint,
    prepare: (player, party, spawn) => {
      const plan = createColonyPartyPlan(player, party, spawn);
      return Object.freeze({ records: plan.records, people: plan.people });
    },
  }),
  environmentDefinition: colonyEnvironmentDefinition,
  commands: {
    build: colonyBuildCommand,
    deconstruct: command({
      title: "Deconstruct",
      localPresentation: { bindings: [{ id: "deconstruct", label: "Deconstruct", selection: { field: "site", cardinality: "one" }, designation: ["entities"] as const }] },
      category: "Construction",
      description: "Queue teardown of a finished construction site and recover its salvage.",
      availability: context => context.query(query(ConstructionSite)).some(row => row.get(ConstructionSite).phase === "finished")
        ? { status: "available" } : { status: "unavailable", reason: "No finished construction is available to deconstruct." },
      subjects: context => context.query(query(ConstructionSite)).filter(row => row.get(ConstructionSite).phase === "finished").map(row => row.id),
      input: z.object({ site: z.string().min(1).max(128) }).strict(),
      reads: [ConstructionSite, DeconstructionOrder, OwnedByParty], writes: [], lifecycle: [DeconstructionOrder],
      run(context, input) {
        const site = context.query(query(ConstructionSite)).find((row) => row.id === input.site);
        if (!site) throw new Error("Unknown construction site");
        if (site.get(ConstructionSite).phase !== "finished") throw new Error("Construction site is not finished");
        if (context.query(query(DeconstructionOrder)).some((row) => row.get(DeconstructionOrder).site === input.site)) return { creates: [], actions: [], writes: [] };
        const party = context.query(query(OwnedByParty)).find((row) => row.id === input.site)?.get(OwnedByParty).party;
        if (!party) throw new Error("Construction site has no party owner");
        return { creates: [], actions: [{ kind: "plan-deconstruction", site: entity(input.site), party }], writes: [] };
      },
    }),
    designateStockpile: colonyStockpileCommand,
    updateStockpile: colonyStockpilePolicyCommand,
    requestWater: command({
      title: "Fetch water", category: "Colony", description: "Request one portion of water from the clearing.",
      input: emptyInput, reads: [WaterSupplyOrder, OwnedByParty], writes: [], lifecycle: [WaterSupplyOrder, WaterSupplyWork, OwnedByParty],
      run(context) {
        const orders = context.query(query(WaterSupplyOrder));
        if (orders.length >= 256) throw new Error("water demand capacity exhausted");
        const revision = orders.reduce((max, row) => Math.max(max, row.get(WaterSupplyOrder).revision), 0) + 1;
        const id = entity(`colony.water-demand.${revision}`);
        return {
          actions: [],
          writes: [],
          creates: [
            {
              id,
              components: {
                [WaterSupplyOrder.id]: {
                  revision,
                  consumer: null,
                  party:
                    context.scope.kind === "player"
                      ? context.scope.party
                      : null,
                },
                [WaterSupplyWork.id]: {
                  request: revision,
                  phase: "queued",
                  x: 0,
                  y: 0,
                  z: 0,
                  reason: "",
                },
              },
            },
          ],
        };
      },
    }),
    sowMugwort: command({
      title: "Sow mugwort", category: "Colony", description: "Designate a reachable soil cell for tended mugwort.",
      localPresentation: { bindings: [{ id: "sow-mugwort", label: "Sow mugwort", target: "terrain-cell", designation: ["point"] as const }] },
      input: z.object({ target: mugwortTargetInput }).strict(),
      reads: [ColonyResourceOrder, ResourceSite, ConstructionSite], writes: [], lifecycle: [ColonyResourceOrder],
      run: (context, input) => {
        const [x, y, z] = input.target.cell;
        const { minX, maxX, minY, maxY, minZ, maxZ } = colonyEnvironment.world.bounds;
        if (x < minX || x >= maxX || y < minY || y >= maxY || z < minZ || z >= maxZ)
          throw new Error("mugwort target is outside the colony world");
        const surface = context.terrainSurfaces([[x, z]])[0];
        if (!surface || surface.cell[1] !== y)
          throw new Error("mugwort requires a generated ground surface");
        const actualMaterial = context.terrainMaterials([input.target.cell])[0];
        if (input.target.material !== actualMaterial)
          throw new Error("mugwort target terrain changed");
        if (actualMaterial !== colonyEnvironment.world.slots.soil)
          throw new Error("mugwort requires soil");
        const id = entity(`colony.resource.mugwort.${x}.${y}.${z}`);
        const occupiedOrder = context.query(query(ColonyResourceOrder)).some(row => {
          const order = row.get(ColonyResourceOrder);
          return order.cellX === x && order.cellY === y && order.cellZ === z && order.status !== "complete";
        });
        const occupiedResource = context.query(query(ResourceSite)).some(row => row.id === id);
        const occupiedStructure = context.query(query(ConstructionSite)).some(row => {
          const site = row.get(ConstructionSite);
          const at = constructionCell(site);
          return at.x === x && at.y === y && at.z === z;
        });
        if (occupiedOrder || occupiedResource || occupiedStructure)
          throw new Error("mugwort cell already has an active designation");
      return { actions: [], writes: [], creates: [{ id, components: { [ColonyResourceOrder.id]: { definition: "mugwort", cellX: x, cellY: y, cellZ: z, site: id, stage: "sow", status: "queued", workSeconds: 0, reason: "" } } }] };
      },
    }),
    requestBrew: command({
      title: "Brew herbal ale", category: "Colony", description: "Request one herbal ale process at a finished brew station.",
      localPresentation: { bindings: [{ id: "brew-process", label: "Brew herbal ale", selection: { field: "station", cardinality: "one" } }] },
      availability: context => availableBrewStations(context).length > 0
        ? { status: "available" }
        : { status: "unavailable", reason: "Build a free brew station before requesting ale." },
      subjects: context => availableBrewStations(context).map(row => row.id),
      input: stationInput,
      reads: [ConstructionSite, StagedProcess], writes: [],
      run(context, input) {
        if (!availableBrewStations(context).some(row => row.id === input.station)) throw new Error("This brew station already has an active brew process");
        return { actions: [requestProcess("herbal-ale-v1", input.station)], writes: [] };
      },
    }),
    deliver: command({
      title: "Deliver goods", category: "Colony", description: "Enable delivery work for selected workers.",
      input: deliveryInput,
      reads: [Worker, PartyMember, Container, DeliveryTask, DeliveryControl],
      writes: [DeliveryControl],
      run: (context, input) => ({ actions: [], writes: deliveryWrites(context, input, true) }),
    }),
    pauseDelivery: command({
      title: "Pause delivery", category: "Colony", description: "Pause delivery work for selected workers.",
      input: deliveryInput,
      reads: [Worker, PartyMember, DeliveryTask, DeliveryControl],
      writes: [DeliveryControl],
      run: (context, input) => ({ actions: [], writes: deliveryWrites(context, input, false) }),
    }),
    resumeDelivery: command({
      title: "Resume delivery", category: "Colony", description: "Resume delivery work for selected workers.",
      input: deliveryInput,
      reads: [Worker, PartyMember, DeliveryTask, DeliveryControl],
      writes: [DeliveryControl],
      run: (context, input) => ({ actions: [], writes: deliveryWrites(context, input, true, true) }),
    }),
    go: command({
      title: "Move workers", category: "Colony", description: "Move selected workers to a destination under manual control.",
      input: goInput,
      reads: [Worker, PartyMember, WorkParticipation, ExcavationWork, ConstructionSite, DeliveryTask],
      writes: [WorkParticipation],
      run: (context, input) => {
        const parsed = input;
        const selected = selectedWorkers(context, parsed.entities);
        const participation = new Map(context.query(query(WorkParticipation)).map(row => [row.id, row.get(WorkParticipation)]));
        if (selected.some(worker => participation.get(worker)?.automatic !== false))
          throw new Error("go requires drafted workers");
        return {
          actions: selected.flatMap(worker => exactRouteReplacement(context, worker, admittedParty(context, worker), parsed.destination)),
          writes: [],
        };
      },
    }),
    draft: command({
      title: "Draft workers", category: "Colony", description: "Draft selected workers for manual control.",
      localPresentation: { bindings: [{ id: "draft", label: "Draft", selection: "entities", placement: "action-bar" }] },
      input: workerSelectionInput,
      reads: [Worker, PartyMember, WorkParticipation, ExcavationWork, ConstructionSite, DeliveryTask],
      writes: [WorkParticipation],
      run: (context, input) => {
        const selected = selectedWorkers(context, input.entities);
        const actions: ActionRequest[] = selected.flatMap((worker): ActionRequest[] => {
          const attempt = attemptForWorker(context, worker);
          if (!attempt || attempt.worker !== worker || attempt.party !== admittedParty(context, worker)) return [];
          if (attempt.phase.kind === "executing") return [{ kind: "interrupt-work-attempt" as const, task: attempt.key.task, generation: attempt.key.generation, sequence: attempt.phase.operation.sequence, cause: "drafted" as const }];
          if (attempt.phase.kind === "outcome") return [{ kind: "acknowledge-work-attempt" as const, task: attempt.key.task, generation: attempt.key.generation, sequence: attempt.phase.operation.sequence }];
          return [];
        });
        return { actions, writes: selected.map(worker => ({ component: WorkParticipation.id, entity: worker, value: { automatic: false } })) };
      },
    }),
    undraft: command({
      title: "Undraft workers", category: "Colony", description: "Return selected workers to automatic work.",
      localPresentation: { bindings: [{ id: "undraft", label: "Undraft", selection: "entities", placement: "action-bar" }] },
      input: workerSelectionInput,
      reads: [Worker, PartyMember, WorkParticipation],
      writes: [WorkParticipation],
      run: (context, input) => {
        const selected = selectedWorkers(context, input.entities);
        const actions: ActionRequest[] = selected.flatMap((worker): ActionRequest[] => {
          const attempt = attemptForWorker(context, worker);
          if (!attempt || attempt.key.task !== worker || attempt.party !== admittedParty(context, worker)) return [];
          if (attempt.phase.kind === "executing") return [{ kind: "interrupt-work-attempt" as const, task: attempt.key.task, generation: attempt.key.generation, sequence: attempt.phase.operation.sequence, cause: "cancelled" as const }];
          if (attempt.phase.kind === "outcome") return [{ kind: "acknowledge-work-attempt" as const, task: attempt.key.task, generation: attempt.key.generation, sequence: attempt.phase.operation.sequence }];
          throw new Error("worker route is waiting for work-attempt reconciliation");
        });
        return { actions, writes: selected.map(worker => ({ component: WorkParticipation.id, entity: worker, value: { automatic: true } })) };
      },
    }),
    resumeWork: command({
      title: "Resume automatic work", category: "Colony", description: "Return selected workers to automatic work assignment.",
      localPresentation: { bindings: [{ id: "resume-work", label: "Resume work", selection: "entities" }] },
      subjects: context => context.query(query(Worker, PartyMember)).map(row => row.id),
      input: workerSelectionInput,
      reads: [Worker, PartyMember, WorkParticipation],
      writes: [WorkParticipation],
      run: (context, input) => {
        const selected = selectedWorkers(context, input.entities);
        return { actions: [], writes: selected.map(worker => ({ component: WorkParticipation.id, entity: worker, value: { automatic: true } })) };
      },
    }),
    dig: command({
      title: "Dig area", category: "Excavation", description: "Queue excavation for a same-level area.",
      localPresentation: { bindings: [{ id: "dig", label: "Dig area", target: "terrain-area", designation: ["rectangle"] as const }] },
      input: digInput,
      reads: [],
      writes: [],
      lifecycle: [],
      run: (context, input) => {
        if (context.scope.kind !== "player") throw new Error("dig designation requires a player party");
        return { actions: [digArea(input, context.scope.party)], writes: [] };
      },
    }),
    designateTrees: command({
      title: "Fell selected trees", category: "Colony", description: "Designate standing trees for felling and chopping.",
      localPresentation: { bindings: [{ id: "designate-trees", label: "Fell selected trees", selection: "entities" }] },
      subjects: context => context.query(query(ColonyTree, FiniteResource, ColonyTreePolicy)).filter(row => {
        const policy = row.get(ColonyTreePolicy);
        return !policy.designated && (row.get(FiniteResource).quantity > 0 || policy.job !== null);
      }).map(row => row.id),
      input: treeSelectionInput,
      reads: [ColonyTree, FiniteResource, ColonyTreePolicy], writes: [ColonyTreePolicy],
      run(context, input) {
        const selected = new Set(input.entities);
        const selectedRows = context.query(query(ColonyTree, FiniteResource, ColonyTreePolicy)).filter(row => {
          const policy = row.get(ColonyTreePolicy);
          return selected.has(row.id) && !policy.designated && (row.get(FiniteResource).quantity > 0 || policy.job !== null);
        });
        if (context.scope.kind !== "player") throw new Error("tree designation requires a player party");
        if (!selectedRows.length) throw new Error("no available tree designations selected");
        const party = context.scope.party;
        const actions: ActionRequest[] = [];
        const writes = selectedRows.map(row => {
          const policy = row.get(ColonyTreePolicy);
          if (policy.party && policy.party !== party) throw new Error("tree belongs to another party");
          const job = policy.job ?? treeJob(row.id);
          actions.push(policy.job
            ? { kind: "resume-job", id: job, plan: treePlan(row.id) }
            : { kind: "create-job", id: job, plan: treePlan(row.id) });
          return { component: ColonyTreePolicy.id, entity: row.id, value: { designated: true, party, job } };
        });
        return { actions, writes };
      },
    }),
    cancelTrees: command({
      title: "Cancel tree work", category: "Colony", description: "Remove the felling designation from selected trees.",
      localPresentation: { bindings: [{ id: "cancel-trees", label: "Cancel tree work", selection: "entities" }] },
      subjects: context => context.query(query(ColonyTree, ColonyTreePolicy)).filter(row => row.get(ColonyTreePolicy).designated && row.get(ColonyTreePolicy).job !== null).map(row => row.id),
      input: treeSelectionInput,
      reads: [ColonyTree, ColonyTreePolicy], writes: [ColonyTreePolicy],
      run(context, input) {
        if (context.scope.kind !== "player") throw new Error("tree cancellation requires a player party");
        const selected = new Set(input.entities);
        const rows = context.query(query(ColonyTree, ColonyTreePolicy)).filter(row => selected.has(row.id) && row.get(ColonyTreePolicy).designated && row.get(ColonyTreePolicy).job !== null);
        if (!rows.length) throw new Error("no active tree designations selected");
        const writes = rows.map(row => {
          const policy = row.get(ColonyTreePolicy);
          if (policy.party && policy.party !== context.scope.party) throw new Error("tree belongs to another party");
          return { component: ColonyTreePolicy.id, entity: row.id, value: { ...policy, designated: false } };
        });
        return { actions: rows.flatMap(row => row.get(ColonyTreePolicy).job ? [{ kind: "cancel-job" as const, id: row.get(ColonyTreePolicy).job! }] : []), writes };
      },
    }),
    cancelDig: command({
      title: "Cancel excavation", category: "Excavation", description: "Cancel queued excavation orders in an area or for workers.",
      localPresentation: { bindings: [{ id: "cancel-dig", label: "Cancel dig area", target: "terrain-area", designation: ["rectangle"] as const }] },
      input: cancelDigInput,
      reads: [],
      writes: [],
      lifecycle: [],
      run: (context, input) => {
        if (context.scope.kind !== "player") throw new Error("excavation cancellation requires a player party");
        if (!input.entities && !input.area) throw new Error("cancel dig requires workers or an area");
        return { actions: [{ kind: "cancel-excavation", party: context.scope.party, area: input.area ?? null, workers: input.entities ?? [] }], writes: [] };
      },
    }),
    deposit: command({
      title: "Deposit carried goods", category: "Colony", description: "Deposit carried materials into their assigned destination.",
      localPresentation: { bindings: [{ id: "deposit", label: "Deposit carried goods", selection: "entities" }] },
      subjects: context => context.query(query(Worker, PartyMember)).map(row => row.id),
      input: depositInput,
      reads: [Worker, Body, Container, DeliveryTask, ExcavationWork, MaterialLot],
      writes: [],
      run: (context, input) => ({ actions: depositActions(context, input), writes: [] }),
    }),
  },
  presentation: {
    activities: context => {
      const positions = new Map(context.query(query(Position)).map(row => [row.id, row.get(Position)]));
      const treePolicies = context.query(query(ColonyTree, ColonyTreePolicy)).map(row => [row.id, row.get(ColonyTreePolicy)] as const);
      const taskIds = treePolicies.flatMap(([, policy]) => policy.job ? [entity(`${policy.job}:task:fell`), entity(`${policy.job}:task:chop`)] : []);
      const treeAttempts = new Map(workAttemptsFor(context, taskIds).map(attempt => [attempt.key.task, attempt]));
      const progress = new Map(context.query(query(JobTaskWork)).map(row => [row.id, row.get(JobTaskWork).seconds]));
      const trees = treePolicies.flatMap(([tree, policy]) => {
        const position = positions.get(tree);
        if (!policy.designated || !position || !policy.job) return [];
        const fell = entity(`${policy.job}:task:fell`), chop = entity(`${policy.job}:task:chop`);
        const task = treeAttempts.has(fell) ? fell : chop;
        const attempt = treeAttempts.get(task);
        if (!attempt || attempt.phase.kind !== "executing" || attempt.phase.activity.kind !== "job-transform") return [];
        const required = task === fell ? 3 : 2;
        return [{ actor: attempt.worker, kind: "chop" as const, target: [position.x, position.z] as const, progress: Math.max(0, Math.min(1, (progress.get(task) ?? 0) / required)) }];
      });
      const excavationRows = context.query(query(ExcavationWork));
      const excavationAttempts = new Map(workAttemptsFor(context, excavationRows.map(row => row.id)).map(attempt => [attempt.key.task, attempt]));
      const excavation = excavationRows.flatMap(row => {
        const work = row.get(ExcavationWork);
        const definition = colonyEnvironment.materials.find(slot => slot.slot === work.expected)?.excavation;
        const attempt = excavationAttempts.get(row.id);
        return definition && attempt
          ? [{ actor: attempt.worker, kind: "dig" as const, target: [work.x, work.z] as const, progress: Math.max(0, Math.min(1, work.seconds / definition.workSeconds)) }]
          : [];
      });
      const constructionSites = context.query(query(ConstructionSite));
      const constructionAttempts = new Map(workAttemptsFor(context, constructionSites.map(row => row.id)).map(attempt => [attempt.key.task, attempt]));
      const construction = constructionSites.flatMap(row => {
        const site = row.get(ConstructionSite);
        const attempt = constructionAttempts.get(row.id);
        if (site.phase !== "working" || attempt?.phase.kind !== "executing" || attempt.phase.activity.kind !== "construction") return [];
        const definition = colonyEnvironment.structures.catalog.find(item => item.id === site.catalog);
        const at = constructionCell(site);
        return definition ? [{ actor: attempt.worker, kind: "build" as const, target: [at.x, at.z] as const, progress: Math.max(0, Math.min(1, site.seconds / definition.workSeconds)) }] : [];
      });
      return [...trees, ...excavation, ...construction];
    },
    visuals: context => {
      const stationProfiles = colonyBrewStationProfiles(context);
      return [
      ...context.query(query(ColonyTree, Position, FiniteResource)).map(row => {
        const tree = row.get(ColonyTree), resource = row.get(FiniteResource), position = row.get(Position);
        const standing = resource.quantity > 0;
        const visual = standing ? "colony.tree" : "colony.tree.stump";
        return { id: row.id, visual, label: `${tree.kind} · ${standing ? "standing" : "stump"}`, pickable: true, pose: { position: { x: position.x, y: position.y, z: position.z }, facing: position.facing } };
      }),
      ...context.query(query(ResourceSite, Position)).map(row => {
        const site = row.get(ResourceSite), position = row.get(Position);
        const definition = colonyEnvironment.resourceSites?.find(candidate => candidate.id === site.definition);
        const stage = definition && site.stage >= definition.stages.length ? "ready" : site.stage === 0 ? "planted" : "growing";
        return { id: row.id, visual: `colony.${site.definition}.${stage}`, label: `${site.definition} · ${stage}`, pickable: true,
          pose: { position: { x: position.x, y: position.y, z: position.z }, facing: position.facing } };
      }),
      ...colonyConstructionVisuals(context).map(visual => {
        const profile = stationProfiles.get(visual.id);
        return profile ? { ...visual, visual: `colony.brew-station.profile.${profile}` } : visual;
      }),
      ...(() => {
        const lotsByContainer = new Map<string, { kind: string; quantity: number }>();
        for (const row of context.query(query(MaterialLot))) {
          const lot = row.get(MaterialLot);
          if (lot.quantity > 0 && (lot.kind === "soil-spoil" || lot.kind === "stone-spoil" || lot.kind === "wood-felled"))
            lotsByContainer.set(lot.container, lot);
        }
        return context.query(query(GroundStock, Position)).flatMap(row => {
          const position = row.get(Position);
          const lot = lotsByContainer.get(row.id);
          if (!lot) return [];
          const visual = lot.kind === "soil-spoil" ? "soil" : lot.kind === "stone-spoil" ? "stone" : "colony.tree.felled";
          return [{ id: row.id, visual, label: `${lot.kind} · ${lot.quantity}`, pickable: true,
            pose: { position: { x: position.x, y: position.y, z: position.z }, facing: position.facing } }];
        });
      })(),
      ];
    },
    terrainMarks: context => [
      ...context.query(query(ExcavationOrder)).map(row => {
      const order = row.get(ExcavationOrder);
      const attempt = context.workAttempts?.([row.id])[0];
      return { id: row.id, cell: [order.cellX, order.cellY, order.cellZ] as const,
        status: order.status === "blocked" ? "blocked" as const : attempt ? "working" as const : "queued" as const };
      }),
      ...context.query(query(StockpileCell, Position)).map(row => ({
        id: `stockpile-mark-${row.id}`, cell: [Math.round(row.get(Position).x), Math.floor(row.get(Position).y / colonyEnvironment.world.verticalMetres), Math.round(row.get(Position).z)] as const,
        status: "queued" as const, kind: "stockpile" as const, subjects: [row.id],
      })),
    ],
    inspect: (context) => {
      const lots = context.query(query(MaterialLot)).map((row) => row.get(MaterialLot));
      const constructionSites = context.query(query(ConstructionSite));
      const unfinishedConstruction = constructionSites
        .filter((row) => row.get(ConstructionSite).phase !== "finished")
        .map((row) => row.id);
      const constructionReadiness = new Map(
        unfinishedConstruction.length === 0
          ? []
          : context.constructionReadiness(unfinishedConstruction).map((row) => [row.site, row.status] as const),
      );
      const constructionSubjects = new Map<string, EntityId[]>();
      for (const row of constructionSites) {
        const site = row.get(ConstructionSite);
        const label = constructionStatusLabel(site.phase, constructionReadiness.get(row.id) ?? "unknown");
        const subjects = constructionSubjects.get(label) ?? [];
        subjects.push(row.id);
        constructionSubjects.set(label, subjects);
      }
      const lotTotals = new Map<EntityId, number>();
      for (const lot of lots) lotTotals.set(lot.container, (lotTotals.get(lot.container) ?? 0) + lot.quantity);
      const total = (container: EntityId) => lotTotals.get(container) ?? 0;
      const pails = new Map(lots.filter((lot) => lot.kind === "pail").map((lot) => [lot.container, lot]));
      const taskRows = context.query(query(DeliveryTask));
      const partyWorkers = context
        .query(query(Worker, PartyMember))
        .map((row) => row.id)
        .sort();
      const partyStores = new Map<EntityId, EntityId[]>();
      for (const row of context.query(query(Container, OwnedByParty))) {
        const party = row.get(OwnedByParty).party;
        const stores = partyStores.get(party) ?? [];
        stores.push(row.id);
        partyStores.set(party, stores);
      }
      const stationFacts = finishedBrewStations(context)
        .slice(0, 8)
        .flatMap((site) => {
          const hearth = entity(`${site.id}:hearth`);
          const at = constructionCell(site.get(ConstructionSite));
          const stationAir = context.atmosphereSamples([
            [
              Math.floor(at.x + 0.5),
              at.y + 1,
              Math.floor(at.z + 0.5),
            ],
          ]).samples[0];
          const process = context
            .query(query(StagedProcess))
            .find((row) => row.get(StagedProcess).station === site.id)
            ?.get(StagedProcess);
          const phase =
            process?.phase === "complete"
              ? "Complete"
              : process
                ? `Stage ${process.stageIndex + 1} · ${process.phase}`
                : "No active process";
          const processDetail = process
            ? `${phase} · ${process.progressSeconds.toFixed(1)}s${process.phase === "blocked" && process.blockedReason ? ` · ${process.blockedReason}` : ""}`
            : phase;
          const containerTotal = (slot: string, kind: string) =>
            lots.reduce(
              (sum, lot) =>
                sum +
                (lot.container === `${site.id}:${slot}` && lot.kind === kind
                  ? lot.quantity
                  : 0),
              0,
            );
          const air = stationAir
            ? `${stationAir.temperatureC.toFixed(1)} °C · ${(stationAir.smokeKgM3 * 1_000_000).toFixed(1)} mg/m³ smoke`
            : "air not modeled";
          return [
            {
              id: `station-${site.id}`,
              subjects: [site.id],
              label: "Brew station",
              value: "Finished · click actions below",
            },
            {
              id: `station-${site.id}-kettle`,
              subjects: [site.id],
              label: "Kettle",
              value: `${containerTotal("kettle", "water")}/2 water · ${containerTotal("kettle", "malt")} malt · ${containerTotal("kettle", "mugwort")} mugwort`,
            },
            {
              id: `station-${site.id}-requirements`,
              subjects: [site.id],
              label: "Requirements",
              value: `${total(hearth)} fuel · ${containerTotal("barm", "barm")} barm · ${containerTotal("keg", "keg")} keg`,
            },
            {
              id: `station-${site.id}-air`,
              subjects: [site.id],
              label: "Air / heat",
              value: air,
            },
            {
              id: `station-${site.id}-process`,
              subjects: [site.id],
              label: "Process",
              value: processDetail,
            },
            {
              id: `station-${site.id}-output`,
              subjects: [site.id],
              label: "Output",
              value: `${containerTotal("tray", "spent-grain")} spent grain in tray`,
            },
          ];
        });
      return [
        ...[...constructionSubjects.entries()]
          .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
          .map(([status, subjects], index) => ({
          id: `construction-status-${index + 1}`,
          subjects,
          label: "Construction",
          value: status,
          })),
        ...(() => {
          const grouped = new Map<string, { profile: string; priority: number; contents: number; capacity: number; cells: string[] }>();
          for (const row of context.query(query(StockpileCell, Container, Position))) {
            const cell = row.get(StockpileCell), container = row.get(Container);
            const current = grouped.get(cell.zone) ?? { profile: cell.filterProfile, priority: cell.priority, contents: 0, capacity: 0, cells: [] };
            current.contents += total(row.id);
            current.capacity += container.capacity;
            current.cells.push(row.id);
            grouped.set(cell.zone, current);
          }
          return [...grouped.entries()].sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0).slice(0, 32).map(([zone, value], index) => ({
            id: `stockpile-zone-${index}`, label: "Stockpile", value: `${value.profile} · priority ${value.priority} · ${value.contents}/${value.capacity}`, subjects: value.cells,
          }));
        })(),
        ...(() => {
          const trees = new Map(context.query(query(ColonyTree)).map(row => [row.id, row.get(ColonyTree)]));
          return context.query(query(ColonyTree, ColonyTreePolicy)).flatMap(row => {
            const policy = row.get(ColonyTreePolicy);
            return policy.designated ? [{ id: `tree-${row.id}`, subjects: [row.id], label: "Tree work", value: "designated" }] : [];
          });
        })(),
        ...[...partyStores.entries()]
          .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
          .map(([party, stores]) => ({
            id: `party-store-${party}`,
            label: "Party store",
            value: stores.reduce((sum, store) => sum + total(store), 0),
          })),
        ...stationFacts,
        { id: "worker-carried", label: "Workers carry", value: partyWorkers.reduce((sum, worker) => sum + total(worker), 0) },
        ...partyWorkers.map((worker, index) => ({
          id: `worker-${worker}-control`, subjects: [worker],
          label: "Party worker",
          value: context.query(query(WorkParticipation)).find(row => row.id === worker)?.get(WorkParticipation).automatic === false ? "manual" : "automatic",
        })),
        ...partyWorkers.map((worker) => ({
          id: `worker-${worker}-pail`, subjects: [worker], label: "Pail",
          value: pails.has(worker) ? "Carried · in this worker's custody" : "None",
        })),
        { id: "guest-quantity", subjects: [guestId], label: "Guest meal", value: total(guestId) },
        ...partyWorkers.map((worker) => ({
          id: `dig-progress-${worker}`, subjects: [worker],
          label: "Worker digging",
          value: context.query(query(ExcavationWork)).find((row) => row.id === worker)?.get(ExcavationWork).seconds ?? 0,
        })),
        { id: "spoil-carried", label: "Spoil carried", value: partyWorkers.reduce((sum, worker) => sum + lots.filter((lot) => lot.container === worker && (lot.kind === "soil-spoil" || lot.kind === "stone-spoil")).reduce((total, lot) => total + lot.quantity, 0), 0) },
        { id: "spoil-ground", label: "Loose spoil", value: (() => {
          const stockContainers = new Set(context.query(query(GroundStock)).map(row => row.id));
          return context.query(query(MaterialLot)).reduce((sum, row) => {
            const lot = row.get(MaterialLot);
            return sum + (stockContainers.has(lot.container) && (lot.kind === "soil-spoil" || lot.kind === "stone-spoil") ? lot.quantity : 0);
          }, 0);
        })() },
        { id: "dig-orders", label: "Dig orders", value: context.query(query(ExcavationOrder)).length },
        { id: "dig-blocked", label: "Dig blocked", value: context.query(query(ExcavationOrder)).find((row) => row.get(ExcavationOrder).status === "blocked")?.get(ExcavationOrder).reason ?? "none" },
        ...[...taskRows].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0).map((row, index) => ({ id: `delivery-phase-${index + 1}`, subjects: [row.id], label: `Delivery ${index + 1}`, value: row.get(DeliveryTask).custody })),
      ];
    },
  },
  definition: encodeDefinition("colony", colonyComponents, colonyInitial, colonyMaterialCatalog, colonyStockpileProfiles),
};

const neutralColonyInitial = [
  { id: guestId, components: { "hive.position": { x: 3, y: 0, z: 1, facing: 0 }, "hive.body": { speed: 1 }, "hive.container": { capacity: 4 }, "hive.traversal": { clearanceCells: 1, maxStepCells: 1 }, "hive.visual": { sprite: "goblin.guest", label: "Guest" }, "colony.guest": { hungry: true } } },
  ...trees.map(({ id, x, z }) => ({ id, components: { "hive.position": { x, y: 0, z, facing: 0 }, "hive.container": { capacity: 6 }, "colony.tree": { kind: "wood" }, [FiniteResource.id]: { kind: "wood", quantity: 6 }, "colony.tree-policy": { designated: false, party: null, job: null } } })),
];
const neutralColonyEnvironmentDefinition = encodeEnvironmentDefinition({
  ...colonyEnvironment,
  initialPlacements: [
    { entity: guestId, column: [3, 1] },
    ...trees.map(({ id, x, z }) => ({ entity: id, column: [x, z] as [number, number] })),
  ],
});

/** Host pack: the same Colony behavior over neutral shared world content. */
export const colonyServerPack: GamePack = {
  ...colonyPack,
  localScope: undefined,
  definition: encodeDefinition("colony", colonyComponents, neutralColonyInitial, colonyMaterialCatalog, colonyStockpileProfiles),
  environmentDefinition: neutralColonyEnvironmentDefinition,
};
