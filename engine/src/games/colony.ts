import { component, query, system } from "../sdk/authoring";
import { Carrying, Destination, FoodLot, Position, Selected, encodeDefinition } from "../sdk/common";
import { DeliveryTask, deliverySystem } from "../sdk/delivery";
import { entity } from "../sdk/authoring";
import type { GamePack } from "../contracts";

export const Worker = component<{ guest: boolean }>("colony.worker", { version: 1, fields: { guest: "boolean" } });
export const Guest = component<{ hungry: boolean }>("colony.guest", { version: 1, fields: { hungry: "boolean" } });
export const Hospitality = component<{ preferredKind: string }>("colony.hospitality", { version: 1, fields: { preferredKind: "string" } });
export const colony = system({ id: "colony.hospitality", version: 1, reads: [Worker, Guest, Hospitality], writes: [Hospitality], run(ctx) {
  for (const row of ctx.query(query<{ guest: boolean; preferredKind: string }>(Worker, Hospitality))) if (row.value.guest && row.value.preferredKind.length === 0) ctx.write(Hospitality, row.id, { preferredKind: "bread" });
});
const workerId = entity("colony.worker.1"), guestId = entity("colony.guest.1"), pantryId = entity("colony.pantry"), lotId = entity("colony.food.1"), taskId = entity("colony.delivery.1");
const colonyInitial = [{ id: workerId, components: { "hive.position": { x: 0, y: 0, z: 0, facing: 0 }, "colony.worker": { guest: true } } }, { id: guestId, components: { "hive.position": { x: 3, y: 0, z: 1, facing: 0 }, "colony.guest": { hungry: true } } }, { id: pantryId, components: { "hive.position": { x: -2, y: 0, z: 0, facing: 0 } } }, { id: lotId, components: { "hive.material-lot": { quantity: 6, material: "bread", container: pantryId } } }, { id: taskId, components: { "hive.delivery-task": { actor: workerId, sourceLot: lotId, source: pantryId, destination: guestId, material: "bread", quantity: 1, phase: "to-source" } } }];
export const colonyPack: GamePack = { id: "colony", version: 1, components: [Position, FoodLot, Carrying, Destination, Selected, Worker, Guest, Hospitality, DeliveryTask], systems: [colony, deliverySystem], definition: encodeDefinition("colony", [Position, FoodLot, Carrying, Destination, Selected, Worker, Guest, Hospitality, DeliveryTask], colonyInitial) };
