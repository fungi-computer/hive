import { component, query, system } from "./authoring";
import { Position, move, transfer } from "./common";
import type { EntityId, Vec3 } from "../contracts";

export type DeliveryPhase = "to-source" | "carrying" | "to-destination" | "complete";
export const DeliveryTask = component<{ actor: EntityId; sourceLot: EntityId; source: EntityId; destination: EntityId; material: string; quantity: number; phase: string }>("hive.delivery-task", { version: 1, fields: { actor: "entity", sourceLot: "entity", source: "entity", destination: "entity", material: "string", quantity: "number", phase: "string" } });
const distance = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
/** Shared resumable delivery: only the kernel's reach/custody checks settle transfer. */
export const deliverySystem = system({ id: "hive.delivery", version: 1, reads: [DeliveryTask, Position], writes: [DeliveryTask], run(ctx) {
  for (const task of ctx.query(query<{ actor: EntityId; sourceLot: EntityId; source: EntityId; destination: EntityId; material: string; quantity: number; phase: string }>(DeliveryTask))) {
    const positions = ctx.query(query<{ x: number; y: number; z: number; facing: number }>(Position));
    const actor = positions.find(row => row.id === task.value.actor);
    const source = positions.find(row => row.id === task.value.source);
    const destination = positions.find(row => row.id === task.value.destination);
    if (!actor || !source || !destination) continue;
    if (task.value.phase === "to-source") {
      if (distance(actor.value, source.value) <= 1) {
        ctx.action(transfer(task.value.sourceLot, task.value.source, task.value.actor, task.value.material, task.value.quantity));
        ctx.write(DeliveryTask, task.id, { ...task.value, phase: "carrying" });
      } else ctx.action(move(task.value.actor, source.value));
    } else if (task.value.phase === "carrying") {
      ctx.write(DeliveryTask, task.id, { ...task.value, phase: "to-destination" });
      ctx.action(move(task.value.actor, destination.value));
    } else if (task.value.phase === "to-destination" && distance(actor.value, destination.value) <= 1) {
      ctx.action(transfer(task.value.sourceLot, task.value.actor, task.value.destination, task.value.material, task.value.quantity));
      ctx.write(DeliveryTask, task.id, { ...task.value, phase: "complete" });
    }
  }
});
