import { colonyConstructionVisuals } from "./colony-construction-visuals";
import { colonyBrewStationProfiles } from "./colony-brewing-presentation";
import { ConstructionSite } from "../sdk/construction";
import { colonyBuildCommand } from "./colony-building";
import { ConstructionApproach } from "../sdk/construction-work";
import { DeconstructionApproach, DeconstructionOrder, queueDeconstruction } from "../sdk/deconstruction-work";
import { command, component, entity, query } from "../sdk/authoring";
import {
  Emitter,
  Body,
  Container,
  Destination,
  ExcavationWork,
  MaterialLot,
  Position,
  Traversal,
  cancelWork,
  move as moveAction,
  encodeDefinition,
  transfer,
  FiniteResource,
  ResourceSite,
} from "../sdk/common";
import { DeliveryControl, DeliveryTask } from "../sdk/delivery";
import { StagedProcess, requestProcess } from "../sdk/process-supply";
import { ProcessAttendanceWork } from "../sdk/process-attendance";
import { GroundStock } from "../sdk/ground-stock";
import { WorkParticipation } from "../sdk/work-control";
import { Cat, catInitial, colonyCatSystem } from "./colony-cat";
import { colonyEnvironment, colonyEnvironmentDefinition } from "./colony-environment";
import { ColonyDigOrder, ColonyTree, ColonyTreeOrder, ColonyTreePolicy, ColonyResourceOrder, colonyWorkSystem } from "./colony-work";
import { Worker } from "./colony-components";
import { WaterSupplyOrder, WaterSupplyWork, waterSupplyProvider } from "./colony-water-work";
import { colonyStockpileCommand, colonyStockpilePolicyCommand } from "./colony-stockpile-command";
import { StockpileCell } from "../sdk/stockpile";
import { z } from "zod";
import type { ConstructionReadinessStatus, EntityId, GamePack, ReadContext } from "../contracts";

export { Worker } from "./colony-components";
export { ColonyDigOrder, ColonyTree, ColonyTreeOrder, ColonyTreePolicy, colonyWorkSystem } from "./colony-work";
export { WaterSupplyOrder, WaterSupplyWork, waterSupplyProvider } from "./colony-water-work";
export const Guest = component<{ hungry: boolean }>("colony.guest", {
  version: 1,
  fields: { hungry: "boolean" },
});

const workerOne = entity("colony.worker.1");
const workerTwo = entity("colony.worker.2");
const workers = [workerOne, workerTwo] as const;
const workerVisuals = [
  { sprite: "colony.rowan", label: "Rowan" },
  { sprite: "colony.sedge", label: "Sedge" },
] as const;
const guestId = entity("colony.guest.1");
const pantryId = entity("colony.pantry");
const colonyLumberId = entity("colony.lumber");
const lotOne = entity("colony.food.1");
const lotTwo = entity("colony.food.2");
const taskOne = entity("colony.delivery.1");
const taskTwo = entity("colony.delivery.2");
const tasks = [taskOne, taskTwo] as const;
const catId = entity("colony.cat.1");
const trees = [
  { id: entity("colony.tree.oak"), x: 2, z: 2 },
  { id: entity("colony.tree.pine"), x: -5, z: 4 },
  { id: entity("colony.tree.willow"), x: 4, z: -5 },
] as const;
const TREE_CONTACT_TOLERANCE = 0.05;
export function treeWorkerAtApproach(
  actor: { readonly x: number; readonly y: number; readonly z: number },
  order: { readonly approachX: number; readonly approachY: number; readonly approachZ: number },
): boolean {
  return Math.hypot(actor.x - order.approachX, actor.y - order.approachY, actor.z - order.approachZ) <= TREE_CONTACT_TOLERANCE;
}
export function treeWorkProgress(order: { readonly seconds: number; readonly stage: "fell" | "chop" }): number {
  return Math.max(0, Math.min(1, order.seconds / (order.stage === "fell" ? 3 : 2)));
}
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
  ...workers.map((id, index) => ({
    id,
    components: {
      "hive.position": { x: 0, y: 0, z: index * 2, facing: 0 },
      "hive.body": { speed: 2 },
      "hive.container": { capacity: 4 },
      "hive.traversal": { clearanceCells: 1, maxStepCells: 1 },
      "hive.visual": workerVisuals[index],
      "colony.worker": { guest: false },
      "hive.work-participation": { automatic: true },
      "hive.delivery-control": { enabled: true, quantity: 3 },
    },
  })),
  ...workers.map((worker, index) => ({ id: entity(`colony.pail.${index + 1}`), components: {
    "hive.lot": { quantity: 1, kind: "pail", container: worker },
    "hive.container": { capacity: 7 },
    "hive.visual": { sprite: "pail", label: "Pail" },
  }})),
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
  {
    id: pantryId,
    components: {
      "hive.position": { x: -2, y: 0, z: 0, facing: 0 },
      "hive.container": { capacity: 20 },
      "hive.visual": { sprite: "crate", label: "Pantry" },
    },
  },
  {
    id: colonyLumberId,
    components: {
      "hive.position": { x: -3, y: 0, z: 1, facing: 0 },
      "hive.container": { capacity: 48 },
      "hive.visual": { sprite: "crate", label: "Starter lumber" },
    },
  },
  {
    id: entity("colony.lumber.initial"),
    components: {
      "hive.lot": { quantity: 48, kind: "wood", container: colonyLumberId },
    },
  },
  ...([lotOne, lotTwo] as const).map((id) => ({
    id,
    components: {
      "hive.lot": { quantity: 3, kind: "bread", container: pantryId },
    },
  })),
  { id: entity("colony.brew.malt"), components: { "hive.lot": { quantity: 4, kind: "malt", container: pantryId } } },
  { id: entity("colony.brew.mugwort"), components: { "hive.lot": { quantity: 1, kind: "mugwort", container: pantryId } } },
  { id: entity("colony.brew.barm"), components: { "hive.lot": { quantity: 1, kind: "barm", container: pantryId }, "hive.container": { capacity: 1 } } },
  { id: entity("colony.brew.keg"), components: { "hive.lot": { quantity: 1, kind: "keg", container: pantryId }, "hive.container": { capacity: 4 } } },
  ...([taskOne, taskTwo] as const).map((id, index) => ({
    id,
    components: {
      "hive.delivery-task": {
        actor: null,
        sourceLot: index === 0 ? lotOne : lotTwo,
        source: pantryId,
        destination: guestId,
        material: "bread",
        quantity: 2,
        phase: "idle",
      },
    },
  })),
  ...trees.flatMap(({ id, x, z }) => [{ id, components: {
    "hive.position": { x, y: 0, z, facing: 0 },
    "hive.container": { capacity: 6 },
    "colony.tree": { phase: "standing" },
    [FiniteResource.id]: { kind: "wood", quantity: 6 },
    "colony.tree-policy": { designated: false },
  } }, { id: entity(`${id}.order`), components: {
    "colony.tree-order": { tree: id, actor: null, phase: "blocked", stage: "fell", seconds: 0, approachX: 0, approachY: 0, approachZ: 0, reason: "Not designated" },
  } }]),
];

type CommandContext = Pick<ReadContext, "query">;

const goInput = z.object({
  entities: z.array(z.string().min(1).max(128).transform(entity)).min(1).max(workers.length),
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
  entities: z.array(z.string().min(1).max(128).transform(entity)).min(1).max(workers.length),
}).strict();
const deliveryInput = z.object({
  entities: z.array(z.string().min(1).max(128).transform(entity)).min(1).max(workers.length),
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
  entities: z.array(z.string().min(1).max(128).transform(entity)).min(1).max(workers.length).optional(),
  area: areaInput.optional(),
}).strict().refine(value => value.entities !== undefined || value.area !== undefined, "cancel dig requires workers or an area");
const depositInput = z.object({ entities: z.array(z.string().min(1).max(128).transform(entity)).length(1) }).strict();

function selectedWorkers(context: CommandContext, raw: readonly EntityId[]): readonly EntityId[] {
  const selected = [...new Set(raw)];
  if (
    selected.length !== raw.length ||
    selected.some((id) => !workers.includes(id))
  )
    throw new Error("selection must contain distinct colony workers");
  const rows = context.query(query(Worker));
  for (const id of selected) {
    const worker = rows.find((row) => row.id === id)?.get(Worker);
    if (!worker || worker.guest) throw new Error("guests cannot deliver");
  }
  return selected;
}

function activeTaskFor(context: CommandContext, actor: EntityId) {
  return context
    .query(query(DeliveryTask))
    .map((row) => row.get(DeliveryTask))
    .find((task) => task.actor === actor);
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
    if (active?.phase === "complete") throw new Error("completed delivery cannot be restarted");
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
  if (!workers.includes(worker)) throw new Error("selection must contain a colony worker");
  const workerState = context.query(query(Worker)).find((row) => row.id === worker)?.get(Worker);
  if (!workerState || workerState.guest) throw new Error("guests cannot act");
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
      .filter((task) => task.phase !== "complete")
      .map((task) => task.sourceLot),
  );
  const carried = lots.filter((lot) => lot.container === worker);
  if (carried.some((lot) => reservedLots.has(lot.id)))
    throw new Error("worker cargo is reserved by delivery");
  if (!carried.length) throw new Error("worker has no carried goods");
  if (carried.some((lot) => !Number.isSafeInteger(lot.quantity) || lot.quantity <= 0 || lot.quantity > 0xffffffff))
    throw new Error("worker cargo is invalid");
  const pantry = context.query(query(Container)).find((row) => row.id === pantryId)?.get(Container);
  if (!pantry) throw new Error("pantry is unavailable");
  const pantryQuantity = lots
    .filter((lot) => lot.container === pantryId)
    .reduce((sum, lot) => sum + lot.quantity, 0);
  const carriedQuantity = carried.reduce((sum, lot) => sum + lot.quantity, 0);
  if (!Number.isSafeInteger(pantryQuantity) || !Number.isSafeInteger(carriedQuantity) ||
      carriedQuantity > pantry.capacity - pantryQuantity)
    throw new Error("pantry lacks capacity");
  return carried
    .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
    .map((lot) => transfer(lot.id, worker, pantryId, lot.quantity));
}

const colonyComponents = [
  Position,
  Emitter,
  Body,
  Container,
  Traversal,
  MaterialLot,
  StagedProcess,
  ProcessAttendanceWork,
  ExcavationWork,
  Destination,
  Worker,
  Guest,
  DeliveryTask,
  DeliveryControl,
  ColonyDigOrder,
  ColonyTree, ColonyTreeOrder,
  ColonyTreePolicy,
  FiniteResource,
  Cat,
  ConstructionApproach,
  DeconstructionApproach, DeconstructionOrder,
  WorkParticipation,
  StockpileCell,
  WaterSupplyOrder, WaterSupplyWork,
] as const;

function digArea(context: CommandContext, input: z.infer<typeof digInput>) {
  const area = input.area;
  const [startX, y, startZ] = area.start, [endX, endY, endZ] = area.end;
  if (y !== endY) throw new Error("dig area must stay on one level");
  const minX = Math.min(startX, endX), maxX = Math.max(startX, endX), minZ = Math.min(startZ, endZ), maxZ = Math.max(startZ, endZ);
  const count = (maxX - minX + 1) * (maxZ - minZ + 1);
  if (!Number.isSafeInteger(count) || count < 1 || count > 256) throw new Error("dig area exceeds 256 cells");
  const existing = new Set(context.query(query(ColonyDigOrder)).map((row) => row.id));
  const creates = [];
  for (let x = minX; x <= maxX; x++) for (let z = minZ; z <= maxZ; z++) {
    const id = `colony.dig.${x}.${y}.${z}` as EntityId;
    if (existing.has(id)) continue;
    creates.push({ id, components: { [ColonyDigOrder.id]: {
      cellX: x, cellY: y, cellZ: z, expected: -1,
      actor: null, phase: "queued", reason: "", approachX: 0, approachY: 0, approachZ: 0,
    }}});
  }
  if (existing.size + creates.length > 256) throw new Error("Finish or cancel existing dig orders before adding more than 256");
  return creates;
}

export const colonyPack: GamePack = {
  id: "colony",
  version: 6,
  components: colonyComponents,
  systems: [colonyWorkSystem, colonyCatSystem],
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
      reads: [ConstructionSite, DeconstructionOrder], writes: [], lifecycle: [DeconstructionOrder],
      run(context, input) {
        const site = context.query(query(ConstructionSite)).find((row) => row.id === input.site);
        if (!site) throw new Error("Unknown construction site");
        if (site.get(ConstructionSite).phase !== "finished") throw new Error("Construction site is not finished");
        if (context.query(query(DeconstructionOrder)).some((row) => row.get(DeconstructionOrder).site === input.site)) return { creates: [], actions: [], writes: [] };
        return { creates: [queueDeconstruction(entity(input.site))], actions: [], writes: [] };
      },
    }),
    designateStockpile: colonyStockpileCommand,
    updateStockpile: colonyStockpilePolicyCommand,
    requestWater: command({
      title: "Fetch water", category: "Colony", description: "Request one portion of water from the clearing.",
      input: emptyInput, reads: [WaterSupplyOrder], writes: [], lifecycle: [WaterSupplyOrder, WaterSupplyWork],
      run(context) {
        const orders = context.query(query(WaterSupplyOrder));
        if (orders.length >= 256) throw new Error("water demand capacity exhausted");
        const revision = orders.reduce((max, row) => Math.max(max, row.get(WaterSupplyOrder).revision), 0) + 1;
        const id = entity(`colony.water-demand.${revision}`);
        return { actions: [], writes: [], creates: [{ id, components: {
          [WaterSupplyOrder.id]: { revision, process: null },
          [WaterSupplyWork.id]: { request: revision, attempt: 0, phase: "queued", actor: null, vessel: null, x: 0, y: 0, z: 0, approachX: 0, approachY: 0, approachZ: 0, reason: "" },
        } }] };
      },
    }),
    sowMugwort: command({
      title: "Sow mugwort", category: "Colony", description: "Designate a reachable soil cell for tended mugwort.",
      input: z.object({ target: z.object({ cell: z.tuple([z.number().int(), z.number().int(), z.number().int()]) }).strict() }).strict(),
      reads: [ColonyResourceOrder], writes: [], lifecycle: [ColonyResourceOrder],
      run: (_context, input) => { const [x, y, z] = input.target.cell; const id = entity(`colony.resource.mugwort.${x}.${y}.${z}`); return { actions: [], writes: [], creates: [{ id, components: { [ColonyResourceOrder.id]: { definition: "mugwort", cellX: x, cellY: y, cellZ: z, site: id, actor: null, vessel: null, phase: "sow", workSeconds: 0, reason: "", approachX: 0, approachY: 0, approachZ: 0, attempt: 0, operation: "" } } }] }; },
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
      reads: [Worker, Container, DeliveryTask, DeliveryControl],
      writes: [DeliveryControl],
      run: (context, input) => ({ actions: [], writes: deliveryWrites(context, input, true) }),
    }),
    pauseDelivery: command({
      title: "Pause delivery", category: "Colony", description: "Pause delivery work for selected workers.",
      input: deliveryInput,
      reads: [Worker, DeliveryTask, DeliveryControl],
      writes: [DeliveryControl],
      run: (context, input) => ({ actions: [], writes: deliveryWrites(context, input, false) }),
    }),
    resumeDelivery: command({
      title: "Resume delivery", category: "Colony", description: "Resume delivery work for selected workers.",
      input: deliveryInput,
      reads: [Worker, DeliveryTask, DeliveryControl],
      writes: [DeliveryControl],
      run: (context, input) => ({ actions: [], writes: deliveryWrites(context, input, true, true) }),
    }),
    go: command({
      title: "Move workers", category: "Colony", description: "Move selected workers to a destination under manual control.",
      input: goInput,
      reads: [Worker, Position, WorkParticipation, ExcavationWork, ConstructionSite],
      writes: [WorkParticipation],
      run: (context, input) => {
        const parsed = input;
        const selected = selectedWorkers(context, parsed.entities);
        const positions = new Map(context.query(query(Position)).map(row => [row.id, row.get(Position)]));
        const excavating = new Set(context.query(query(ExcavationWork)).map(row => row.id));
        const building = new Set(context.query(query(ConstructionSite)).flatMap(row => {
          const worker = row.get(ConstructionSite).worker;
          return worker === null ? [] : [worker];
        }));
        return {
          actions: selected.flatMap(worker => (excavating.has(worker) || building.has(worker)) ? [cancelWork(worker)] : [])
            .concat(selected.map(worker => {
              const position = positions.get(worker);
              if (!position) throw new Error("selected worker position is unavailable");
              return moveAction(worker, parsed.destination, position.facing);
            })),
          writes: selected.map(worker => ({ component: WorkParticipation.id, entity: worker, value: { automatic: false } })),
        };
      },
    }),
    resumeWork: command({
      title: "Resume automatic work", category: "Colony", description: "Return selected workers to automatic work assignment.",
      localPresentation: { bindings: [{ id: "resume-work", label: "Resume work", selection: "entities" }] },
      subjects: () => workers,
      input: workerSelectionInput,
      reads: [Worker, WorkParticipation],
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
      reads: [ColonyDigOrder],
      writes: [],
      lifecycle: [ColonyDigOrder],
      run: (context, input) => ({ actions: [], writes: [], creates: digArea(context, input) }),
    }),
    designateTrees: command({
      title: "Fell selected trees", category: "Colony", description: "Designate standing trees for felling and chopping.",
      localPresentation: { bindings: [{ id: "designate-trees", label: "Fell selected trees", selection: "entities" }] },
      subjects: context => context.query(query(ColonyTree)).filter(row => row.get(ColonyTree).phase === "standing").map(row => row.id),
      input: treeSelectionInput,
      reads: [ColonyTree], writes: [ColonyTreePolicy],
      run(context, input) {
        const selected = new Set(input.entities);
        const trees = new Map(context.query(query(ColonyTree)).map(row => [row.id, row.get(ColonyTree)]));
        const writes = context.query(query(ColonyTree)).filter(row => selected.has(row.id) && trees.get(row.id)?.phase === "standing").map(row => ({ component: ColonyTreePolicy.id, entity: row.id, value: { designated: true } }));
        if (!writes.length) throw new Error("no standing trees selected");
        return { actions: [], writes };
      },
    }),
    cancelTrees: command({
      title: "Cancel tree work", category: "Colony", description: "Remove the felling designation from selected trees.",
      localPresentation: { bindings: [{ id: "cancel-trees", label: "Cancel tree work", selection: "entities" }] },
      subjects: context => context.query(query(ColonyTree, ColonyTreePolicy))
        .filter(row => row.get(ColonyTreePolicy).designated && row.get(ColonyTree).phase !== "chopped")
        .map(row => row.id),
      input: treeSelectionInput,
      reads: [ColonyTree, ColonyTreePolicy], writes: [ColonyTreePolicy],
      run(context, input) {
        const selected = new Set(input.entities);
        const rows = context.query(query(ColonyTree)).filter(row => selected.has(row.id));
        if (!rows.length) throw new Error("no matching tree");
        return { actions: [], writes: rows.map(row => ({ component: ColonyTreePolicy.id, entity: row.id, value: { designated: false } })) };
      },
    }),
    cancelDig: command({
      title: "Cancel excavation", category: "Excavation", description: "Cancel queued excavation orders in an area or for workers.",
      localPresentation: { bindings: [{ id: "cancel-dig", label: "Cancel dig area", target: "terrain-area", designation: ["rectangle"] as const }] },
      input: cancelDigInput,
      reads: [ColonyDigOrder, ExcavationWork],
      writes: [],
      lifecycle: [ColonyDigOrder],
      run: (context, input) => {
        const selected = input.entities ? new Set(input.entities) : null;
        let area: { minX: number; maxX: number; minZ: number; maxZ: number; y: number } | null = null;
        if (input.area) {
          const [startX, y, startZ] = input.area.start;
          const [endX, endY, endZ] = input.area.end;
          if (y !== endY) throw new Error("cancel dig area must stay on one level");
          area = { minX: Math.min(startX, endX), maxX: Math.max(startX, endX), minZ: Math.min(startZ, endZ), maxZ: Math.max(startZ, endZ), y };
        }
        if (selected === null && area === null) throw new Error("cancel dig requires workers or an area");
        const orders = context.query(query(ColonyDigOrder));
        const work = new Set(context.query(query(ExcavationWork)).map((row) => row.id));
        const removes = orders.filter((row) => {
          const state = row.get(ColonyDigOrder);
          const byWorker = selected !== null && state.actor !== null && selected.has(state.actor);
          const byArea = area !== null && state.cellY === area.y && state.cellX >= area.minX && state.cellX <= area.maxX && state.cellZ >= area.minZ && state.cellZ <= area.maxZ;
          return byWorker || byArea;
        }).map((row) => row.id);
        if (!removes.length) throw new Error("no matching excavation order");
        const actions = orders.filter((row) => removes.includes(row.id) && row.get(ColonyDigOrder).actor && work.has(row.get(ColonyDigOrder).actor as EntityId)).map((row) => cancelWork(row.get(ColonyDigOrder).actor as EntityId));
        return { actions, writes: [], removes };
      },
    }),
    deposit: command({
      title: "Deposit carried goods", category: "Colony", description: "Deposit carried materials into their assigned destination.",
      localPresentation: { bindings: [{ id: "deposit", label: "Deposit carried goods", selection: "entities" }] },
      subjects: () => workers,
      input: depositInput,
      reads: [Worker, Body, Container, DeliveryTask, ExcavationWork, MaterialLot],
      writes: [],
      run: (context, input) => ({ actions: depositActions(context, input), writes: [] }),
    }),
  },
  presentation: {
    activities: context => {
      const positions = new Map(context.query(query(Position)).map(row => [row.id, row.get(Position)]));
      const trees = context.query(query(ColonyTreeOrder)).flatMap(row => {
        const order = row.get(ColonyTreeOrder), position = positions.get(order.tree);
        const actorPosition = order.actor === null ? undefined : positions.get(order.actor);
        return order.phase === "working" && order.actor !== null && position && actorPosition && treeWorkerAtApproach(actorPosition, order)
          ? [{ actor: order.actor, kind: "chop" as const, target: [position.x, position.z] as const, progress: treeWorkProgress(order) }]
          : [];
      });
      const excavation = context.query(query(ExcavationWork)).flatMap(row => {
        const work = row.get(ExcavationWork);
        const definition = colonyEnvironment.materials.find(slot => slot.slot === work.expected)?.excavation;
        return definition ? [{ actor: row.id, kind: "dig" as const, target: [work.x, work.z] as const, progress: Math.max(0, Math.min(1, work.seconds / definition.workSeconds)) }] : [];
      });
      const construction = context.query(query(ConstructionSite)).flatMap(row => {
        const site = row.get(ConstructionSite);
        if (site.phase !== "working" || site.worker === null) return [];
        const definition = colonyEnvironment.structures.catalog.find(item => item.id === site.catalog);
        return definition ? [{ actor: site.worker, kind: "build" as const, target: [site.x, site.z] as const, progress: Math.max(0, Math.min(1, site.seconds / definition.workSeconds)) }] : [];
      });
      return [...trees, ...excavation, ...construction];
    },
    visuals: context => {
      const stationProfiles = colonyBrewStationProfiles(context);
      return [
      ...context.query(query(ColonyTree, Position)).map(row => {
        const tree = row.get(ColonyTree), position = row.get(Position);
        const visual = tree.phase === "standing" ? "colony.tree" : tree.phase === "felled" ? "colony.tree.felled" : "colony.tree.stump";
        return { id: row.id, visual, label: `Tree · ${tree.phase}`, pose: { position: { x: position.x, y: position.y, z: position.z }, facing: position.facing } };
      }),
      ...colonyConstructionVisuals(context).map(visual => {
        const profile = stationProfiles.get(visual.id);
        return profile ? { ...visual, visual: `colony.brew-station.profile.${profile}` } : visual;
      }),
      ...(() => {
        const lotsByContainer = new Map<string, { kind: string; quantity: number }>();
        for (const row of context.query(query(MaterialLot))) {
          const lot = row.get(MaterialLot);
          if (lot.quantity > 0 && (lot.kind === "soil-spoil" || lot.kind === "stone-spoil"))
            lotsByContainer.set(lot.container, lot);
        }
        return context.query(query(GroundStock, Position)).flatMap(row => {
          const position = row.get(Position);
          const lot = lotsByContainer.get(row.id);
          if (!lot) return [];
          const visual = lot.kind === "soil-spoil" ? "soil" : "stone";
          return [{ id: row.id, visual, label: `${lot.kind} · ${lot.quantity}`,
            pose: { position: { x: position.x, y: position.y, z: position.z }, facing: position.facing } }];
        });
      })(),
      ];
    },
    terrainMarks: context => [
      ...context.query(query(ColonyDigOrder)).map(row => {
      const order = row.get(ColonyDigOrder);
      return { id: row.id, cell: [order.cellX, order.cellY, order.cellZ] as const,
        status: order.phase === "blocked" ? "blocked" as const : order.actor ? "working" as const : "queued" as const };
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
      const taskRows = context.query(query(DeliveryTask));
      const stationFacts = finishedBrewStations(context).slice(0, 8).map((site) => {
        const hearth = entity(`${site.id}:hearth`);
        const stationAir = context.atmosphereSamples([[
          Math.floor(site.get(ConstructionSite).x + 0.5),
          site.get(ConstructionSite).y + 1,
          Math.floor(site.get(ConstructionSite).z + 0.5),
        ]]).samples[0];
        const process = context.query(query(StagedProcess)).find(row => row.get(StagedProcess).station === site.id)?.get(StagedProcess);
        const phase = process?.phase === "complete" ? "Complete" : process ? `Stage ${process.stageIndex + 1}` : "No process";
        return { id: `station-${site.id}`, subjects: [site.id], label: "Brew station", value: `${stationAir ? `${stationAir.temperatureC.toFixed(1)} °C, ${(stationAir.smokeKgM3 * 1_000_000).toFixed(1)} mg/m³` : "air not modeled"} · ${total(hearth)} wood · ${phase}` };
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
          return context.query(query(ColonyTreeOrder)).flatMap(row => {
            const order = row.get(ColonyTreeOrder), tree = trees.get(order.tree);
            return tree ? [{ id: `tree-${order.tree}`, subjects: [order.tree], label: "Tree work", value: `${tree.phase} · ${order.stage} · ${order.phase}` }] : [];
          });
        })(),
        { id: "pantry-quantity", subjects: [pantryId], label: "Pantry", value: total(pantryId) },
        { id: "lumber-quantity", subjects: [colonyLumberId], label: "Starter lumber", value: total(colonyLumberId) },
        ...stationFacts,
        { id: "worker-carried", subjects: workers, label: "Workers carry", value: workers.reduce((sum, worker) => sum + total(worker), 0) },
        ...workers.map((worker, index) => ({
          id: `worker-${index + 1}-control`, subjects: [worker],
          label: workerVisuals[index].label,
          value: context.query(query(WorkParticipation)).find(row => row.id === worker)?.get(WorkParticipation).automatic === false ? "manual" : "automatic",
        })),
        { id: "guest-quantity", subjects: [guestId], label: "Guest meal", value: total(guestId) },
        ...workers.map((worker, index) => ({
          id: `dig-progress-${index + 1}`, subjects: [worker],
          label: `Worker ${index + 1} digging`,
          value: context.query(query(ExcavationWork)).find((row) => row.id === worker)?.get(ExcavationWork).seconds ?? 0,
        })),
        { id: "spoil-carried", subjects: workers, label: "Spoil carried", value: workers.reduce((sum, worker) => sum + lots.filter((lot) => lot.container === worker && (lot.kind === "soil-spoil" || lot.kind === "stone-spoil")).reduce((total, lot) => total + lot.quantity, 0), 0) },
        { id: "spoil-ground", label: "Loose spoil", value: (() => {
          const stockContainers = new Set(context.query(query(GroundStock)).map(row => row.id));
          return context.query(query(MaterialLot)).reduce((sum, row) => {
            const lot = row.get(MaterialLot);
            return sum + (stockContainers.has(lot.container) && (lot.kind === "soil-spoil" || lot.kind === "stone-spoil") ? lot.quantity : 0);
          }, 0);
        })() },
        { id: "dig-orders", label: "Dig orders", value: context.query(query(ColonyDigOrder)).length },
        { id: "dig-blocked", label: "Dig blocked", value: context.query(query(ColonyDigOrder)).find((row) => row.get(ColonyDigOrder).phase === "blocked")?.get(ColonyDigOrder).reason ?? "none" },
        ...tasks.map((id, index) => ({ id: `delivery-phase-${index + 1}`, subjects: [guestId], label: `Delivery ${index + 1}`, value: taskRows.find((row) => row.id === id)?.get(DeliveryTask).phase ?? "missing" })),
      ];
    },
  },
  definition: encodeDefinition("colony", colonyComponents, colonyInitial),
};
