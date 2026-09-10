import { component, query, system } from "../sdk/authoring";
import { Carrying, Destination, FoodLot, Position, Selected, encodeDefinition, transfer } from "../sdk/common";
import { entity } from "../sdk/authoring";
import type { GamePack } from "../contracts";

export const Worker = component<{ guest: boolean }>("colony.worker", { version: 1, fields: { guest: "boolean" } });
export const Guest = component<{ hungry: boolean }>("colony.guest", { version: 1, fields: { hungry: "boolean" } });
export const Hospitality = component<{ preferredKind: string }>("colony.hospitality", { version: 1, fields: { preferredKind: "string" } });
export const colony = system({ id: "colony.deliver", version: 1, reads: [Worker, Guest, FoodLot, Carrying, Position], run(ctx) {
  for (const worker of ctx.query(query<{ guest: boolean; lot: import("../contracts").EntityId | null }>(Worker, Carrying, Position))) {
    if (!worker.value.guest) continue;
    const lot = ctx.query(query(FoodLot))[0];
    const guest = ctx.query(query(Guest))[0];
    if (lot && guest?.value.hungry && lot.value.quantity > 0 && worker.value.lot) ctx.action(transfer(lot.id, worker.value.lot, guest.id, 1));
  }
});
const workerId = entity("colony.worker.1"), guestId = entity("colony.guest.1"), pantryId = entity("colony.pantry"), lotId = entity("colony.food.1");
const colonyInitial = [{ id: workerId, components: { "hive.position": { x: 0, y: 0, z: 0, facing: 0 }, "hive.carrying": { lot: pantryId }, "colony.worker": { guest: true } } }, { id: guestId, components: { "hive.position": { x: 3, y: 0, z: 1, facing: 0 }, "colony.guest": { hungry: true } } }, { id: pantryId, components: { "hive.position": { x: -2, y: 0, z: 0, facing: 0 } } }, { id: lotId, components: { "hive.food": { quantity: 6, kind: "bread", container: pantryId } } }];
export const colonyPack: GamePack = { id: "colony", version: 1, components: [Position, FoodLot, Carrying, Destination, Selected, Worker, Guest, Hospitality], systems: [colony], definition: encodeDefinition("colony", [Position, FoodLot, Carrying, Destination, Selected, Worker, Guest, Hospitality], colonyInitial) };
