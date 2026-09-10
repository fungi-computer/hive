import { command, component, entity } from "../sdk/authoring";
import {
  Destination,
  MaterialLot,
  Position,
  encodeDefinition,
} from "../sdk/common";
import { DeliveryControl, DeliveryTask, deliverySystem } from "../sdk/delivery";
import type { GamePack } from "../contracts";

export const Worker = component<{ guest: boolean }>("colony.worker", {
  version: 1,
  fields: { guest: "boolean" },
});
export const Guest = component<{ hungry: boolean }>("colony.guest", {
  version: 1,
  fields: { hungry: "boolean" },
});
const workerId = entity("colony.worker.1"),
  guestId = entity("colony.guest.1"),
  pantryId = entity("colony.pantry"),
  lotId = entity("colony.food.1"),
  taskId = entity("colony.delivery.1");
const colonyInitial = [
  {
    id: workerId,
    components: {
      "hive.position": { x: 0, y: 0, z: 0, facing: 0 },
      "hive.body": { speed: 2 },
      "hive.container": { capacity: 2 },
      "hive.visual": { sprite: "goblin.worker", label: "Worker" },
      "colony.worker": { guest: true },
      "hive.delivery-control": { enabled: false, quantity: 1 },
    },
  },
  {
    id: guestId,
    components: {
      "hive.position": { x: 3, y: 0, z: 1, facing: 0 },
      "hive.body": { speed: 1 },
      "hive.container": { capacity: 2 },
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
    id: lotId,
    components: {
      "hive.lot": { quantity: 6, kind: "bread", container: pantryId },
    },
  },
  {
    id: taskId,
    components: {
      "hive.delivery-task": {
        actor: workerId,
        sourceLot: lotId,
        source: pantryId,
        destination: guestId,
        material: "bread",
        quantity: 1,
        phase: "idle",
      },
    },
  },
];
export const colonyPack: GamePack = {
  id: "colony",
  version: 1,
  components: [
    Position,
    MaterialLot,
    Destination,
    Worker,
    Guest,
    DeliveryTask,
    DeliveryControl,
  ],
  systems: [deliverySystem],
  commands: {
    deliver: command({ writes: [DeliveryControl], run: (_context, input) => {
      const quantity = (input as { quantity?: unknown } | null)?.quantity;
      if (quantity !== 1 && quantity !== 2) throw new Error("delivery quantity must be one or two");
      return { actions: [], writes: [{ component: DeliveryControl.id, entity: workerId, value: { enabled: true, quantity } }] };
    }}),
    pauseDelivery: command({ reads: [DeliveryControl], writes: [DeliveryControl], run: (context) => { const current = context.query(query(DeliveryControl)).find((row) => row.id === workerId)?.get(DeliveryControl); return { actions: [], writes: [{ component: DeliveryControl.id, entity: workerId, value: { enabled: false, quantity: current?.quantity ?? 1 } }] }; } }),
    resumeDelivery: command({ reads: [DeliveryControl], writes: [DeliveryControl], run: (context) => { const current = context.query(query(DeliveryControl)).find((row) => row.id === workerId)?.get(DeliveryControl); return { actions: [], writes: [{ component: DeliveryControl.id, entity: workerId, value: { enabled: true, quantity: current?.quantity ?? 1 } }] }; } }),
  },
  presentation: {
    controls: [{ id: "deliver", label: "Deliver 1", command: "deliver", input: { quantity: 1 } }, { id: "deliver-two", label: "Deliver 2", command: "deliver", input: { quantity: 2 } }, { id: "pause", label: "Pause delivery", command: "pauseDelivery" }, { id: "resume", label: "Resume delivery", command: "resumeDelivery" }],
    inspect: (context) => { const lots = context.query(query(MaterialLot)).map((row) => row.get(MaterialLot)); const task = context.query(query(DeliveryTask)).find((row) => row.id === taskId)?.get(DeliveryTask); const total = (container: typeof pantryId) => lots.filter((lot) => lot.container === container).reduce((sum, lot) => sum + lot.quantity, 0); return [{ id: "pantry-quantity", label: "Pantry", value: total(pantryId) }, { id: "worker-carried", label: "Worker carries", value: total(workerId) }, { id: "guest-quantity", label: "Guest meal", value: total(guestId) }, { id: "delivery-phase", label: "Delivery", value: task?.phase ?? "missing" }]; },
  },
  definition: encodeDefinition(
    "colony",
    [
      Position,
      MaterialLot,
      Destination,
      Worker,
      Guest,
      DeliveryTask,
      DeliveryControl,
    ],
    colonyInitial,
  ),
};
