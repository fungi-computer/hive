import { EmissionOrder, EmissionWork, idleEmissionWork, nextEmissionOrder } from "../sdk/emission-work";
import { ConstructionSite } from "../sdk/construction";
import { colonyBuildCommand } from "./colony-building";
import { ConstructionApproach } from "../sdk/construction-work";
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
} from "../sdk/common";
import { DeliveryControl, DeliveryTask } from "../sdk/delivery";
import { GroundStock } from "../sdk/ground-stock";
import { WorkParticipation } from "../sdk/work-control";
import { Cat, catInitial, colonyCatSystem } from "./colony-cat";
import { colonyEnvironment, colonyEnvironmentDefinition } from "./colony-environment";
import { ColonyDigOrder, ColonyTree, ColonyTreeOrder, ColonyTreePolicy, Worker, colonyWorkSystem, colonySupplySystem, colonyGroundStockSystem } from "./colony-work";
import { createColonyStockpileSystem } from "./colony-stockpile";
import { z } from "zod";
import type { EntityId, GamePack } from "../contracts";

export { Worker, ColonyDigOrder, ColonyTree, ColonyTreeOrder, ColonyTreePolicy, colonyWorkSystem, colonyGroundStockSystem } from "./colony-work";
const colonyStockpileProfiles = {
  wood: { materialCategories: { wood: "building" }, allowedCategories: ["building"] },
} as const;
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

const brewStationId = entity("colony.brew-station");
const catRecord = catInitial(catId, workerOne, { x: 1, y: 0, z: 1 });
const colonyInitial = [
  { ...catRecord, components: { ...catRecord.components, "hive.visual": { sprite: "colony.cat", label: "Mallow" } } },
  { id: brewStationId, components: {
    "hive.position": { x: 1, y: 0, z: -1, facing: 0 },
    "hive.container": { capacity: 4 },
    "hive.emitter": { catalog: "wood-hearth" },
    [EmissionWork.id]: idleEmissionWork,
    [EmissionOrder.id]: { revision: 0, enabled: false },
    "hive.visual": { sprite: "colony.brew-station", label: "Brew station" },
  } },
  ...workers.map((id, index) => ({
    id,
    components: {
      "hive.position": { x: 0, y: 0, z: index * 2, facing: 0 },
      "hive.body": { speed: 2 },
      "hive.container": { capacity: 3 },
      "hive.traversal": { clearanceCells: 1, maxStepCells: 1 },
      "hive.visual": workerVisuals[index],
      "colony.worker": { guest: false },
      "hive.work-participation": { automatic: true },
      "hive.delivery-control": { enabled: true, quantity: 1 },
    },
  })),
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

type CommandContext = Pick<import("../contracts").ReadContext, "query">;

const goInput = z.object({
  entities: z.array(z.string().min(1).max(128).transform(entity)).min(1).max(workers.length),
  destination: z.object({
    x: z.number().finite().min(-1_000_000).max(1_000_000), y: z.number().finite().min(-1_000_000).max(1_000_000), z: z.number().finite().min(-1_000_000).max(1_000_000),
    frame: z.string().transform(entity).nullable(),
  }).strict(),
}).strict();
const stationInput = z.object({ station: z.string().min(1).max(128).transform(entity) }).strict();
const workerSelectionInput = z.object({
  entities: z.array(z.string().min(1).max(128).transform(entity)).min(1).max(workers.length),
}).strict();
const deliveryInput = z.object({
  entities: z.array(z.string().min(1).max(128).transform(entity)).min(1).max(workers.length),
  quantity: z.union([z.literal(1), z.literal(2)]).optional(),
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
  if (enabled && !preserveCurrentQuantity && quantity !== 1 && quantity !== 2)
    throw new Error("delivery quantity must be one or two");
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
  EmissionOrder, EmissionWork,
  Position,
  Emitter,
  Body,
  Container,
  Traversal,
  MaterialLot,
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
  WorkParticipation,
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
  version: 4,
  components: colonyComponents,
  systems: [colonySupplySystem, colonyWorkSystem, colonyGroundStockSystem, createColonyStockpileSystem(colonyStockpileProfiles), colonyCatSystem],
  environmentDefinition: colonyEnvironmentDefinition,
  commands: {
    build: colonyBuildCommand,
    lightHearth: command({
      input: stationInput,
      reads: [Emitter, EmissionOrder, EmissionWork], writes: [EmissionOrder],
      run(context, input) {
        const { station } = input;
        const row = context.query(query(Emitter, EmissionOrder, EmissionWork)).find(row => row.id === station);
        if (!row) throw new Error("This station cannot be lit");
        const value = nextEmissionOrder(row.get(EmissionOrder), row.get(EmissionWork), true);
        return { actions: [], writes: value ? [{ component: EmissionOrder.id, entity: row.id, value }] : [] };
      },
    }),
    cancelIgnition: command({
      input: stationInput,
      reads: [EmissionOrder, EmissionWork], writes: [EmissionOrder],
      run(context, input) {
        const { station } = input;
        const row = context.query(query(EmissionOrder, EmissionWork)).find(row => row.id === station);
        if (!row) throw new Error("Station work unavailable");
        const value = nextEmissionOrder(row.get(EmissionOrder), row.get(EmissionWork), false);
        return { actions: [], writes: value ? [{ component: EmissionOrder.id, entity: row.id, value }] : [] };
      },
    }),
    deliver: command({
      input: deliveryInput,
      reads: [Worker, DeliveryTask, DeliveryControl],
      writes: [DeliveryControl],
      run: (context, input) => ({ actions: [], writes: deliveryWrites(context, input, true) }),
    }),
    pauseDelivery: command({
      input: deliveryInput,
      reads: [Worker, DeliveryTask, DeliveryControl],
      writes: [DeliveryControl],
      run: (context, input) => ({ actions: [], writes: deliveryWrites(context, input, false) }),
    }),
    resumeDelivery: command({
      input: deliveryInput,
      reads: [Worker, DeliveryTask, DeliveryControl],
      writes: [DeliveryControl],
      run: (context, input) => ({ actions: [], writes: deliveryWrites(context, input, true, true) }),
    }),
    go: command({
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
      input: workerSelectionInput,
      reads: [Worker, WorkParticipation],
      writes: [WorkParticipation],
      run: (context, input) => {
        const selected = selectedWorkers(context, input.entities);
        return { actions: [], writes: selected.map(worker => ({ component: WorkParticipation.id, entity: worker, value: { automatic: true } })) };
      },
    }),
    dig: command({
      input: digInput,
      reads: [ColonyDigOrder],
      writes: [],
      lifecycle: [ColonyDigOrder],
      run: (context, input) => ({ actions: [], writes: [], creates: digArea(context, input) }),
    }),
    designateTrees: command({
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
      input: treeSelectionInput,
      reads: [ColonyTree], writes: [ColonyTreePolicy],
      run(context, input) {
        const selected = new Set(input.entities);
        const rows = context.query(query(ColonyTree)).filter(row => selected.has(row.id));
        if (!rows.length) throw new Error("no matching tree");
        return { actions: [], writes: rows.map(row => ({ component: ColonyTreePolicy.id, entity: row.id, value: { designated: false } })) };
      },
    }),
    cancelDig: command({
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
      input: depositInput,
      reads: [Worker, Body, Container, DeliveryTask, ExcavationWork, MaterialLot],
      writes: [],
      run: (context, input) => ({ actions: depositActions(context, input), writes: [] }),
    }),
  },
  presentation: {
    activities: context => {
      const positions = new Map(context.query(query(Position)).map(row => [row.id, row.get(Position)]));
      return context.query(query(ColonyTreeOrder)).flatMap(row => {
        const order = row.get(ColonyTreeOrder), position = positions.get(order.tree);
        return order.phase === "working" && order.actor !== null && position ? [{ actor: order.actor, kind: "chop" as const, target: [position.x, position.z] as const }] : [];
      });
    },
    visuals: context => [
      ...context.query(query(ColonyTree, Position)).map(row => {
        const tree = row.get(ColonyTree), position = row.get(Position);
        const visual = tree.phase === "standing" ? "colony.tree" : tree.phase === "felled" ? "colony.tree.felled" : "colony.tree.stump";
        return { id: row.id, visual, label: `Tree · ${tree.phase}`, pose: { position: { x: position.x, y: position.y, z: position.z }, facing: position.facing } };
      }),
      ...(() => {
      return context.query(query(ConstructionSite)).map(row => {
      const site = row.get(ConstructionSite);
      const definition = colonyEnvironment.structures.catalog.find(item => item.id === site.catalog);
      if (!definition) throw new Error("Missing construction visual definition");
      const stage = site.phase === "finished" ? "finished" : site.seconds > 0 ? "frame" : "stakes";
      const facing = { south: 0, east: 1, north: 2, west: 3 }[site.orientation];
      const cutawayTop = site.y + (definition.shape.kind === "stair" ? definition.shape.rise : definition.shape.kind === "wall" ? definition.shape.height - 1 : 0);
      return { id: row.id, cutawayTop, visual: `colony.${definition.shape.kind}.${stage}`, label: `${site.catalog} · ${site.phase}`,
        pose: { position: { x: site.x, y: (site.y + (definition.shape.kind === "wall" ? -0.5 : 0.5)) * colonyEnvironment.world.verticalMetres, z: site.z }, facing } };
      });
      })(),
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
    ],
    terrainMarks: context => context.query(query(ColonyDigOrder)).map(row => {
      const order = row.get(ColonyDigOrder);
      return { id: row.id, cell: [order.cellX, order.cellY, order.cellZ] as const,
        status: order.phase === "blocked" ? "blocked" as const : order.actor ? "working" as const : "queued" as const };
    }),
    controls: [
      { id: "light-hearth", label: "Light fire", command: "lightHearth", input: { station: brewStationId }, subjects: [brewStationId] },
      { id: "cancel-ignition", label: "Cancel lighting", command: "cancelIgnition", input: { station: brewStationId }, subjects: [brewStationId] },
      { id: "resume-work", label: "Resume work", command: "resumeWork", selection: "entities", subjects: workers },
      ...(["timber-floor", "timber-wall"] as const).map(catalog => ({ id: catalog, label: catalog === "timber-floor" ? "Build floor" : "Build wall", command: "build", input: { catalog, ...(catalog === "timber-floor" ? { orientation: "north" } : {}) }, target: "world-surface" as const, designation: catalog === "timber-floor" ? ["point", "rectangle"] as const : ["point", "line", "rectangle"] as const })),
      ...(["north", "east", "south", "west"] as const).map(orientation => ({ id: `stair-${orientation}`, label: `Stair ${orientation}`, command: "build", input: { catalog: "timber-stair", orientation }, target: "world-surface" as const, designation: ["point"] as const })),
      { id: "dig", label: "Dig area", command: "dig", target: "terrain-area", designation: ["rectangle"] as const },
      { id: "cancel-dig", label: "Cancel dig area", command: "cancelDig", target: "terrain-area", designation: ["rectangle"] as const },
      { id: "deposit", label: "Deposit carried goods", command: "deposit", selection: "entities", subjects: workers },
      { id: "designate-trees", label: "Fell selected trees", command: "designateTrees", selection: "entities", subjects: trees.map(tree => tree.id) },
      { id: "cancel-trees", label: "Cancel tree work", command: "cancelTrees", selection: "entities", subjects: trees.map(tree => tree.id) },
    ],
    inspect: (context) => {
      const lots = context.query(query(MaterialLot)).map((row) => row.get(MaterialLot));
      const total = (container: EntityId) => lots.filter((lot) => lot.container === container).reduce((sum, lot) => sum + lot.quantity, 0);
      const taskRows = context.query(query(DeliveryTask));
      const ignition = context.query(query(EmissionWork)).find(row => row.id === brewStationId)?.get(EmissionWork);
      const station = context.query(query(Position)).find(row => row.id === brewStationId)?.get(Position);
      const stationAir = station ? context.atmosphereSamples([[
        Math.floor(station.x + 0.5),
        Math.floor(station.y / colonyEnvironment.world.verticalMetres + 0.5),
        Math.floor(station.z + 0.5),
      ]]).samples[0] : null;
      return [
        ...(() => {
          const trees = new Map(context.query(query(ColonyTree)).map(row => [row.id, row.get(ColonyTree)]));
          return context.query(query(ColonyTreeOrder)).flatMap(row => {
            const order = row.get(ColonyTreeOrder), tree = trees.get(order.tree);
            return tree ? [{ id: `tree-${order.tree}`, subjects: [order.tree], label: "Tree work", value: `${tree.phase} · ${order.stage} · ${order.phase}` }] : [];
          });
        })(),
        { id: "station-air-temperature", subjects: [brewStationId], label: "Station air", value: stationAir ? `${stationAir.temperatureC.toFixed(1)} °C` : "Not modeled" },
        { id: "station-air-smoke", subjects: [brewStationId], label: "Station smoke", value: stationAir ? `${(stationAir.smokeKgM3 * 1_000_000).toFixed(1)} mg/m³` : "Not modeled" },
        { id: "pantry-quantity", subjects: [pantryId], label: "Pantry", value: total(pantryId) },
        { id: "lumber-quantity", subjects: [colonyLumberId], label: "Starter lumber", value: total(colonyLumberId) },
        { id: "station-fuel", subjects: [brewStationId], label: "Station wood", value: total(brewStationId) },
        { id: "ignition", label: "Lighting order", subjects: [brewStationId], value: ignition?.reason || ({ idle: "Not requested", queued: "Waiting for fuel or a reachable free worker", approaching: "Worker coming", submitting: "Lighting", complete: "Completed", blocked: "Cannot light" }[ignition?.phase ?? "idle"]) },
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
