import { component, query, system } from "./authoring";
import { FoodLot, Position, move, transfer } from "./common";
import type { EntityId, Vec3 } from "../contracts";

export type DeliveryPhase = "to-source" | "carrying" | "to-destination" | "complete";
export const DeliveryTask = component<{ actor: EntityId; sourceLot: EntityId; source: EntityId; destination: EntityId; material: string; quantity: number; phase: string }>("hive.delivery-task", { version: 1, fields: { actor: "entity", sourceLot: "entity", source: "entity", destination: "entity", material: "string", quantity: "number", phase: "string" } });
const distance = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
/** Shared resumable delivery: only the kernel's reach/custody checks settle transfer. */
export const deliverySystem = system({ id: "hive.delivery", version: 1, reads: [DeliveryTask, Position, FoodLot], writes: [DeliveryTask], run(ctx) {
  for (const task of ctx.query(query<{ actor: EntityId; sourceLot: EntityId; source: EntityId; destination: EntityId; material: string; quantity: number; phase: string }>(DeliveryTask))) {
    const state = task.get(DeliveryTask);
    const positions = ctx.query(query(Position));
    const actor = positions.find(row => row.id === state.actor);
    const source = positions.find(row => row.id === state.source);
    const destination = positions.find(row => row.id === state.destination);
    if (!actor || !source || !destination) continue;
    const lot = ctx.query(query(FoodLot)).find(row => row.id === state.sourceLot);
    const lotState = lot?.get(FoodLot);
    if (state.phase === "to-source") {
      if (lotState?.container === state.actor) {
        ctx.write(DeliveryTask, task.id, { ...state, phase: "carrying" });
        ctx.action(move(state.actor, destination.get(Position)));
        continue;
      }
      if (distance(actor.get(Position), source.get(Position)) <= 1) {
        if (lotState?.container === state.source) ctx.action(transfer(state.sourceLot, state.source, state.actor, state.quantity));
      } else ctx.action(move(state.actor, source.get(Position)));
    } else if (state.phase === "carrying" && lotState?.container === state.actor) {
      ctx.write(DeliveryTask, task.id, { ...state, phase: "to-destination" });
      ctx.action(move(state.actor, destination.get(Position)));
    } else if (state.phase === "to-destination" && lotState?.container === state.destination) {
      ctx.write(DeliveryTask, task.id, { ...state, phase: "complete" });
    } else if (state.phase === "to-destination" && lotState?.container === state.actor && distance(actor.get(Position), destination.get(Position)) <= 1) {
      if (lotState.container === state.actor) ctx.action(transfer(state.sourceLot, state.actor, state.destination, state.quantity));
    } else if (state.phase === "to-destination" && lotState?.container === state.actor) {
      ctx.action(move(state.actor, destination.get(Position)));
    } else if (state.phase === "complete" && lotState?.container === state.destination) {
      // Ownership was observed on the previous tick. Host commitment owns durability.
    }
  }
});
