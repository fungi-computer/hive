import { component, query, system } from "../sdk/authoring";
import { Carrying, Destination, FoodLot, Position, Selected, encodeDefinition, transfer } from "../sdk/common";
import type { GamePack } from "../contracts";

export const Worker = component<{ guest: boolean }>("colony.worker", { version: 1, fields: { guest: "boolean" } });
export const Guest = component<{ hungry: boolean }>("colony.guest", { version: 1, fields: { hungry: "boolean" } });
export const Hospitality = component<{ preferredKind: string }>("colony.hospitality", { version: 1, fields: { preferredKind: "string" } });
export const colony = system({ id: "colony.deliver", version: 1, reads: [Worker, Guest, FoodLot, Carrying, Position], writes: [Destination], run(ctx) {
  for (const worker of ctx.query(query<{ guest: boolean }>(Worker, Carrying, Position))) {
    if (!worker.value.guest) continue;
    const lot = ctx.query(query(FoodLot))[0];
    const guest = ctx.query(query(Guest))[0];
    if (lot && guest?.value.hungry && lot.value.quantity > 0) ctx.action(transfer(lot.id, worker.id, guest.id, 1));
  }
});
export const colonyPack: GamePack = { id: "colony", version: 1, components: [Position, FoodLot, Carrying, Destination, Selected, Worker, Guest, Hospitality], systems: [colony], definition: encodeDefinition("colony", [Position, FoodLot, Carrying, Destination, Selected, Worker, Guest, Hospitality]) };
