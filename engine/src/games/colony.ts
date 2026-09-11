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
  excavate,
} from "../sdk/common";
import { DeliveryControl, DeliveryTask, deliverySystem } from "../sdk/delivery";
import { colonyEnvironment, colonyEnvironmentDefinition } from "./colony-environment";
import type { EntityId, GamePack } from "../contracts";

export const Worker = component<{ guest: boolean }>("colony.worker", {
  version: 1,
  fields: { guest: "boolean" },
});
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
      "hive.delivery-control": { enabled: false, quantity: 1 },
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
type DigInput = {
  readonly entities?: unknown;
  readonly target?: unknown;
};
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

function selectedDigWorker(
  context: CommandContext,
  input: unknown,
  options: { readonly allowActiveExcavation?: boolean; readonly allowActiveDelivery?: boolean } = {},
): EntityId {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("dig command requires one selected worker");
  const entities = (input as DigInput).entities;
  if (!Array.isArray(entities) || entities.length !== 1 || typeof entities[0] !== "string")
    throw new Error("dig command requires one selected worker");
  const worker = entities[0] as EntityId;
  if (!(workers as readonly EntityId[]).includes(worker))
    throw new Error("dig selection must contain a colony worker");
  const workerState = context.query(query(Worker)).find((row) => row.id === worker)?.get(Worker);
  if (!workerState || workerState.guest) throw new Error("guests cannot dig");
  const body = context.query(query(Body)).find((row) => row.id === worker)?.get(Body);
  const container = context.query(query(Container)).find((row) => row.id === worker)?.get(Container);
  if (!body || !Number.isFinite(body.speed) || body.speed <= 0 || !container)
    throw new Error("selected worker cannot dig");
  const activeDelivery = context.query(query(DeliveryTask)).some((row) => {
    const task = row.get(DeliveryTask);
    return task.actor === worker && task.phase !== "complete";
  });
  if (activeDelivery && !options.allowActiveDelivery) throw new Error("worker is carrying out a delivery");
  if (!options.allowActiveExcavation && context.query(query(ExcavationWork)).some((row) => row.id === worker))
    throw new Error("worker already has excavation work");
  return worker;
}

function excavationInput(context: CommandContext, input: unknown) {
  const worker = selectedDigWorker(context, input);
  const target = (input as DigInput).target;
  if (!target || typeof target !== "object" || Array.isArray(target))
    throw new Error("dig command requires a terrain target");
  const record = target as { readonly cell?: unknown; readonly material?: unknown };
  const cell = record.cell;
  if (
    !Array.isArray(cell) ||
    cell.length !== 3 ||
    !cell.every((value) => typeof value === "number" && Number.isSafeInteger(value) && Math.abs(value) <= 1_000_000)
  )
    throw new Error("dig target cell is invalid");
  if (typeof record.material !== "number" || !Number.isInteger(record.material) || record.material < 0 || record.material > 65535)
    throw new Error("dig target material is invalid");
  const material = colonyEnvironment.materials.find(({ slot }) => slot === record.material);
  if (!material?.excavation || !material.solid || material.slot === colonyEnvironment.world.slots.air)
    throw new Error("dig target material is not excavatable");
  const output = material.excavation.unitsPerCell;
  const container = context.query(query(Container)).find((row) => row.id === worker)?.get(Container);
  const carried = context
    .query(query(MaterialLot))
    .filter((row) => row.get(MaterialLot).container === worker)
    .reduce((sum, row) => sum + row.get(MaterialLot).quantity, 0);
  if (
    !container ||
    !Number.isSafeInteger(carried) ||
    carried < 0 ||
    !Number.isSafeInteger(output) ||
    output <= 0 ||
    !Number.isSafeInteger(carried + output) ||
    carried + output > container.capacity
  )
    throw new Error("worker lacks capacity for excavation output");
  return { worker, cell: { x: cell[0], y: cell[1], z: cell[2] }, expected: material.slot };
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
] as const;

export const colonyPack: GamePack = {
  id: "colony",
  version: 2,
  components: colonyComponents,
  systems: [deliverySystem],
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
      reads: [Worker, Body, Container, DeliveryTask, ExcavationWork, MaterialLot],
      writes: [],
      run: (context, input) => {
        const { worker, cell, expected } = excavationInput(context, input);
        return { actions: [excavate(worker, cell, expected, colonyEnvironment.world.slots.air)], writes: [] };
      },
    }),
    cancelDig: command({
      reads: [Worker, Body, Container, DeliveryTask, ExcavationWork, MaterialLot],
      writes: [],
      run: (context, input) => {
        const worker = selectedDigWorker(context, input, {
          allowActiveExcavation: true,
          allowActiveDelivery: true,
        });
        if (!context.query(query(ExcavationWork)).some((row) => row.id === worker))
          throw new Error("worker has no excavation work");
        return { actions: [cancelWork(worker)], writes: [] };
      },
    }),
  },
  presentation: {
    controls: [
      { id: "deliver", label: "Deliver 1", command: "deliver", input: { quantity: 1 }, selection: "entities" },
      { id: "deliver-two", label: "Deliver 2", command: "deliver", input: { quantity: 2 }, selection: "entities" },
      { id: "pause", label: "Pause delivery", command: "pauseDelivery", selection: "entities" },
      { id: "resume", label: "Resume delivery", command: "resumeDelivery", selection: "entities" },
      { id: "dig", label: "Dig selected cell", command: "dig", selection: "entities", target: "terrain-cell" },
      { id: "cancel-dig", label: "Cancel digging", command: "cancelDig", selection: "entities" },
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
        ...tasks.map((id, index) => ({ id: `delivery-phase-${index + 1}`, label: `Delivery ${index + 1}`, value: taskRows.find((row) => row.id === id)?.get(DeliveryTask).phase ?? "missing" })),
      ];
    },
  },
  definition: encodeDefinition("colony", colonyComponents, colonyInitial),
};
