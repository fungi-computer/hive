import { command, component, entity, query } from "../sdk/authoring";
import { Body, Container, Destination, MaterialLot, Position, encodeDefinition } from "../sdk/common";
import { DeliveryControl, DeliveryTask, deliverySystem } from "../sdk/delivery";
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
      "hive.container": { capacity: 2 },
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

const colonyComponents = [
  Position,
  Body,
  Container,
  MaterialLot,
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
  },
  presentation: {
    controls: [
      { id: "deliver", label: "Deliver 1", command: "deliver", input: { quantity: 1 }, selection: "entities" },
      { id: "deliver-two", label: "Deliver 2", command: "deliver", input: { quantity: 2 }, selection: "entities" },
      { id: "pause", label: "Pause delivery", command: "pauseDelivery", selection: "entities" },
      { id: "resume", label: "Resume delivery", command: "resumeDelivery", selection: "entities" },
    ],
    inspect: (context) => {
      const lots = context.query(query(MaterialLot)).map((row) => row.get(MaterialLot));
      const total = (container: EntityId) => lots.filter((lot) => lot.container === container).reduce((sum, lot) => sum + lot.quantity, 0);
      const taskRows = context.query(query(DeliveryTask));
      return [
        { id: "pantry-quantity", label: "Pantry", value: total(pantryId) },
        { id: "worker-carried", label: "Workers carry", value: workers.reduce((sum, worker) => sum + total(worker), 0) },
        { id: "guest-quantity", label: "Guest meal", value: total(guestId) },
        ...tasks.map((id, index) => ({ id: `delivery-phase-${index + 1}`, label: `Delivery ${index + 1}`, value: taskRows.find((row) => row.id === id)?.get(DeliveryTask).phase ?? "missing" })),
      ];
    },
  },
  definition: encodeDefinition("colony", colonyComponents, colonyInitial),
};
