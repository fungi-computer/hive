import { command, component, entity, query } from "../sdk/authoring";
import {
  Body,
  Container,
  Destination,
  ExcavationWork,
  MaterialLot,
  Position,
  Traversal,
  cancelWork,
  encodeDefinition,
  transfer,
} from "../sdk/common";
import { DeliveryControl, DeliveryTask } from "../sdk/delivery";
import { colonyEnvironment, colonyEnvironmentDefinition } from "./colony-environment";
import { ColonyDigOrder, Worker, colonyWorkSystem } from "./colony-work";
import type { EntityId, GamePack } from "../contracts";

export { Worker, ColonyDigOrder, colonyWorkSystem } from "./colony-work";
export const Guest = component<{ hungry: boolean }>("colony.guest", {
  version: 1,
  fields: { hungry: "boolean" },
});

const workerOne = entity("colony.worker.1");
const workerTwo = entity("colony.worker.2");
const workers = [workerOne, workerTwo] as const;
const guestId = entity("colony.guest.1");
const pantryId = entity("colony.pantry");
const lotOne = entity("colony.food.1");
const lotTwo = entity("colony.food.2");
const taskOne = entity("colony.delivery.1");
const taskTwo = entity("colony.delivery.2");
const tasks = [taskOne, taskTwo] as const;

const colonyInitial = [
  ...workers.map((id, index) => ({
    id,
    components: {
      "hive.position": { x: 0, y: 0, z: index * 2, facing: 0 },
      "hive.body": { speed: 2 },
      "hive.container": { capacity: 3 },
      "hive.traversal": { clearanceCells: 1, maxStepCells: 1 },
      "hive.visual": { sprite: "goblin.worker", label: `Worker ${index + 1}` },
      "colony.worker": { guest: false },
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
        quantity: 1,
        phase: "idle",
      },
    },
  })),
];

type DeliveryInput = { readonly quantity?: unknown; readonly entities?: unknown };
type CommandContext = Pick<import("../contracts").ReadContext, "query">;

function inputOf(input: unknown): DeliveryInput {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("delivery command requires selected workers");
  return input as DeliveryInput;
}

function selectedWorkers(context: CommandContext, input: unknown): readonly EntityId[] {
  const raw = inputOf(input).entities;
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > workers.length)
    throw new Error("select at least one worker");
  const selected = [...new Set(raw)];
  if (
    selected.length !== raw.length ||
    selected.some((id) => typeof id !== "string" || !(workers as readonly EntityId[]).includes(id as EntityId))
  )
    throw new Error("selection must contain distinct colony workers");
  const rows = context.query(query(Worker));
  for (const id of selected) {
    const worker = rows.find((row) => row.id === id)?.get(Worker);
    if (!worker || worker.guest) throw new Error("guests cannot deliver");
  }
  return selected as EntityId[];
}

function activeTaskFor(context: CommandContext, actor: EntityId) {
  return context
    .query(query(DeliveryTask))
    .map((row) => row.get(DeliveryTask))
    .find((task) => task.actor === actor);
}

function deliveryWrites(
  context: CommandContext,
  input: unknown,
  enabled: boolean,
  preserveCurrentQuantity = false,
) {
  const parsed = inputOf(input);
  const selected = selectedWorkers(context, input);
  const quantity = parsed.quantity;
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

function selectedDigWorker(context: CommandContext, input: unknown): EntityId {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("command requires one selected worker");
  const entities = (input as { entities?: unknown }).entities;
  if (!Array.isArray(entities) || entities.length !== 1 || typeof entities[0] !== "string") throw new Error("command requires one selected worker");
  const worker = entities[0] as EntityId;
  if (!(workers as readonly EntityId[]).includes(worker)) throw new Error("selection must contain a colony worker");
  const workerState = context.query(query(Worker)).find((row) => row.id === worker)?.get(Worker);
  if (!workerState || workerState.guest) throw new Error("guests cannot act");
  return worker;
}

function depositActions(context: CommandContext, input: unknown) {
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
] as const;

function areaPoint(value: unknown): [number, number, number] {
  if (Array.isArray(value) && value.length === 3 && value.every((v) => typeof v === "number" && Number.isSafeInteger(v) && Math.abs(v) <= 1_000_000)) return [value[0] as number, value[1] as number, value[2] as number];
  throw new Error("dig area point is invalid");
}
function digArea(context: CommandContext, input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("dig command requires an area");
  const area = (input as { area?: { start?: unknown; end?: unknown } }).area;
  if (!area) throw new Error("dig command requires an area");
  const [startX, y, startZ] = areaPoint(area.start), [endX, endY, endZ] = areaPoint(area.end);
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
  return creates;
}

export const colonyPack: GamePack = {
  id: "colony",
  version: 3,
  components: colonyComponents,
  systems: [colonyWorkSystem],
  environmentDefinition: colonyEnvironmentDefinition,
  commands: {
    deliver: command({
      reads: [Worker, DeliveryTask, DeliveryControl],
      writes: [DeliveryControl],
      run: (context, input) => ({ actions: [], writes: deliveryWrites(context, input, true) }),
    }),
    pauseDelivery: command({
      reads: [Worker, DeliveryTask, DeliveryControl],
      writes: [DeliveryControl],
      run: (context, input) => ({ actions: [], writes: deliveryWrites(context, input, false) }),
    }),
    resumeDelivery: command({
      reads: [Worker, DeliveryTask, DeliveryControl],
      writes: [DeliveryControl],
      run: (context, input) => ({ actions: [], writes: deliveryWrites(context, input, true, true) }),
    }),
    dig: command({
      reads: [ColonyDigOrder],
      writes: [],
      lifecycle: [ColonyDigOrder],
      run: (context, input) => ({ actions: [], writes: [], creates: digArea(context, input) }),
    }),
    cancelDig: command({
      reads: [ColonyDigOrder, ExcavationWork],
      writes: [],
      lifecycle: [ColonyDigOrder],
      run: (context, input) => {
        const record = input && typeof input === "object" && !Array.isArray(input)
          ? input as { entities?: unknown; area?: { start?: unknown; end?: unknown } }
          : {};
        const selected = Array.isArray(record.entities) ? new Set(record.entities) : null;
        let area: { minX: number; maxX: number; minZ: number; maxZ: number; y: number } | null = null;
        if (record.area) {
          const [startX, y, startZ] = areaPoint(record.area.start);
          const [endX, endY, endZ] = areaPoint(record.area.end);
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
      reads: [Worker, Body, Container, DeliveryTask, ExcavationWork, MaterialLot],
      writes: [],
      run: (context, input) => ({ actions: depositActions(context, input), writes: [] }),
    }),
  },
  presentation: {
    controls: [
      { id: "deliver", label: "Deliver 1", command: "deliver", input: { quantity: 1 }, selection: "entities" },
      { id: "deliver-two", label: "Deliver 2", command: "deliver", input: { quantity: 2 }, selection: "entities" },
      { id: "pause", label: "Pause delivery", command: "pauseDelivery", selection: "entities" },
      { id: "resume", label: "Resume delivery", command: "resumeDelivery", selection: "entities" },
      { id: "dig", label: "Dig area", command: "dig", target: "terrain-area" },
      { id: "cancel-dig", label: "Cancel digging", command: "cancelDig", selection: "entities" },
      { id: "deposit", label: "Deposit carried goods", command: "deposit", selection: "entities" },
    ],
    inspect: (context) => {
      const lots = context.query(query(MaterialLot)).map((row) => row.get(MaterialLot));
      const total = (container: EntityId) => lots.filter((lot) => lot.container === container).reduce((sum, lot) => sum + lot.quantity, 0);
      const taskRows = context.query(query(DeliveryTask));
      return [
        { id: "pantry-quantity", label: "Pantry", value: total(pantryId) },
        { id: "worker-carried", label: "Workers carry", value: workers.reduce((sum, worker) => sum + total(worker), 0) },
        { id: "guest-quantity", label: "Guest meal", value: total(guestId) },
        ...workers.map((worker, index) => ({
          id: `dig-progress-${index + 1}`,
          label: `Worker ${index + 1} digging`,
          value: context.query(query(ExcavationWork)).find((row) => row.id === worker)?.get(ExcavationWork).seconds ?? 0,
        })),
        { id: "spoil-carried", label: "Spoil carried", value: workers.reduce((sum, worker) => sum + lots.filter((lot) => lot.container === worker && (lot.kind === "soil-spoil" || lot.kind === "stone-spoil")).reduce((total, lot) => total + lot.quantity, 0), 0) },
        { id: "dig-orders", label: "Dig orders", value: context.query(query(ColonyDigOrder)).length },
        { id: "dig-blocked", label: "Dig blocked", value: context.query(query(ColonyDigOrder)).find((row) => row.get(ColonyDigOrder).phase === "blocked")?.get(ColonyDigOrder).reason ?? "none" },
        ...tasks.map((id, index) => ({ id: `delivery-phase-${index + 1}`, label: `Delivery ${index + 1}`, value: taskRows.find((row) => row.id === id)?.get(DeliveryTask).phase ?? "missing" })),
      ];
    },
  },
  definition: encodeDefinition("colony", colonyComponents, colonyInitial),
};
