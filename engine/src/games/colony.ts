import { component, query, system } from "../sdk/authoring";
import {
  Destination,
  MaterialLot,
  Position,
  encodeDefinition,
} from "../sdk/common";
import { DeliveryTask, deliverySystem } from "../sdk/delivery";
import { entity } from "../sdk/authoring";
import type { GamePack } from "../contracts";

export const Worker = component<{ guest: boolean }>("colony.worker", {
  version: 1,
  fields: { guest: "boolean" },
});
export const Guest = component<{ hungry: boolean }>("colony.guest", {
  version: 1,
  fields: { hungry: "boolean" },
});
export const Hospitality = component<{ preferredKind: string }>(
  "colony.hospitality",
  { version: 1, fields: { preferredKind: "string" } },
);
export const colony = system({
  id: "colony.hospitality",
  version: 1,
  reads: [Worker, Guest, Hospitality],
  writes: [Hospitality],
  run(ctx) {
    for (const row of ctx.query(query(Worker, Hospitality)))
      if (
        row.get(Worker).guest &&
        row.get(Hospitality).preferredKind.length === 0
      )
        ctx.write(Hospitality, row.id, { preferredKind: "bread" });
  },
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
        phase: "to-source",
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
    Hospitality,
    DeliveryTask,
  ],
  systems: [colony, deliverySystem],
  definition: encodeDefinition(
    "colony",
    [
      Position,
      MaterialLot,
      Destination,
      Worker,
      Guest,
      Hospitality,
      DeliveryTask,
    ],
    colonyInitial,
  ),
};
