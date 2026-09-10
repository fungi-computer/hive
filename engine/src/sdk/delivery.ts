import { component, query, system } from "./authoring";
import { Position, move, transfer } from "./common";
import type { EntityId, Vec3 } from "../contracts";

export type DeliveryPhase = "to-source" | "carrying" | "to-destination" | "complete";
export const DeliveryTask = component<{ actor: EntityId; sourceLot: EntityId; source: EntityId; destination: EntityId; material: string; quantity: number; phase: string }>("hive.delivery-task", { version: 1, fields: { actor: "entity", sourceLot: "entity", source: "entity", destination: "entity", material: "string", quantity: "number", phase: "string" } });
const distance = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
/** Shared resumable delivery: only the kernel's reach/custody checks settle transfer. */
export const deliverySystem = system({ id: "hive.delivery", version: 1, reads: [DeliveryTask, Position], writes: [DeliveryTask], run(ctx) {
  for (const task of ctx.query(query<{ actor: EntityId; sourceLot: EntityId; source: EntityId; destination: EntityId; material: string; quantity: number; phase: string }>(DeliveryTask))) {
    const state = task.get(DeliveryTask);
    const positions = ctx.query(query(Position));
    const actor = positions.find(row => row.id === state.actor);
    const source = positions.find(row => row.id === state.source);
    const destination = positions.find(row => row.id === state.destination);
    if (!actor || !source || !destination) continue;
    if (state.phase === "to-source") {
      if (distance(actor.get(Position), source.get(Position)) <= 1) {
        ctx.action(transfer(state.sourceLot, state.source, state.actor, state.quantity));
        ctx.write(DeliveryTask, task.id, { ...state, phase: "carrying" });
      } else ctx.action(move(state.actor, source.get(Position)));
    } else if (state.phase === "carrying") {
      ctx.write(DeliveryTask, task.id, { ...state, phase: "to-destination" });
      ctx.action(move(state.actor, destination.get(Position)));
    } else if (state.phase === "to-destination" && distance(actor.get(Position), destination.get(Position)) <= 1) {
      ctx.action(transfer(state.sourceLot, state.actor, state.destination, state.quantity));
      ctx.write(DeliveryTask, task.id, { ...state, phase: "complete" });
    }
  }
});
