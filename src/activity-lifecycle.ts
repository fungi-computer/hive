import { finiteWorkOwner } from "./water-delivery.ts";
import { interruptTransfer } from "./materials.ts";
import { stopWalking } from "./movement.ts";
import type { Clearing, Actor, WaterDeliveryOperation } from "./model.ts";

export function finishActivity(state: Clearing, p: Actor): void {
  if (p.traversal && p.traversal.elapsed > 0)
    throw new Error("cannot finish activity during a paid edge");
  stopWalking(p);
  Object.assign(p, {
    mode: "idle",
    task: null,
    assignment: null,
    workDisposition: "continue",
    work: 0,
  });
  state.workDirty = true;
}
export function finishJob(s: Clearing, p: Actor, id: string) {
  s.jobs = s.jobs.filter((j) => j.id !== id);
  s.finishedJobs++;
  finishActivity(s, p);
}

export function interruptWork(state: Clearing, p: Actor): void {
  if (p.traversal && p.traversal.elapsed > 0) {
    p.workDisposition = "interrupt-at-footing";
    stopWalking(p);
    return;
  }
  const operation =
    p.task?.kind === "water-delivery"
      ? state.operations.find(
          (entry): entry is WaterDeliveryOperation =>
            entry.kind === "water-delivery" && entry.id === p.task?.target,
        )
      : undefined;
  const drop = { cell: { x: p.x, y: p.y, z: p.z }, legal: true };
  const r = operation
    ? finiteWorkOwner.interrupt(state.operations, state.materials, {
        kind: "park",
        actor: p.id,
        operation: operation.id,
        drop,
      })
    : p.task?.kind === "consume"
      ? finiteWorkOwner.interrupt(state.operations, state.materials, {
          kind: "release",
          operation: p.task.target,
          drop,
        })
      : interruptTransfer(state.materials, p.id, drop);
  if (!r.ok) throw new Error(r.reason);
  finishActivity(state, p);
}
