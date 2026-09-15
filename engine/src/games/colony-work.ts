import { DeconstructionOrder } from "../sdk/deconstruction-work";
import { Worker } from "./colony-components";
import { component, query } from "../sdk/authoring";
import {
  createWorkSystem,
  type PreparedWorkProvider,
} from "../sdk/work-system";
import {
  deliveryProvider,
  DeliveryControl,
  DeliveryTask,
} from "../sdk/delivery";
import { GroundStock } from "../sdk/ground-stock";
import {
  Body,
  Container,
  Destination,
  ExcavationWork,
  MaterialLot,
  Position,
  Support,
  Surface,
} from "../sdk/common";
import { ConstructionSite, SealedContainer } from "../sdk/construction";
import { PartyMember } from "../sdk/party";
import { WorkParticipation } from "../sdk/work-control";
import type { EntityId, WriteContext } from "../contracts";
import { acknowledgeWorkAttempt, interruptWorkAttempt } from "../sdk/work-attempt";

/** Own the worker-as-task route used by Draft/Go. Automatic work providers must
 * see that actor as occupied until the route completes or Undraft interrupts it,
 * and the route's terminal receipt must be acknowledged exactly once. */
function manualRouteProvider(ctx: WriteContext, suspendedActors: ReadonlySet<EntityId>): PreparedWorkProvider {
  const attempts = ctx.query(query(Worker)).flatMap(row => {
    const attempt = ctx.workAttemptForWorker?.(row.id);
    return attempt?.key.task === row.id ? [attempt] : [];
  });
  return {
    claims: attempts.map(attempt => ({ task: attempt.key.task, actor: attempt.worker })),
    candidates: [],
    occupiedActors: attempts.map(attempt => attempt.worker),
    lowerBound: () => 0,
    estimate: () => null,
    apply: () => {},
    progress: () => {
      for (const attempt of attempts) {
        if (attempt.phase.kind === "outcome")
          acknowledgeWorkAttempt(ctx, attempt.key, attempt.phase.operation.sequence);
        else if (attempt.phase.kind === "executing" && !suspendedActors.has(attempt.worker))
          interruptWorkAttempt(ctx, attempt.key, attempt.phase.operation.sequence, "cancelled");
      }
    },
  };
}

/** Content identity for a finite resource. Presentation derives lifecycle from
 * the native resource and material facts, so this marker never becomes a
 * second mutable lifecycle owner. */
export const ColonyTree = component<{ kind: string }>("colony.tree", {
  version: 1,
  fields: { kind: "string" },
});
/** Player intent binding for one durable job occurrence. It carries no
 * physical lifecycle or progress state. */
export const ColonyTreePolicy = component<{ designated: boolean; party: EntityId | null; job: EntityId | null }>(
  "colony.tree-policy",
  { version: 3, fields: { designated: "boolean", party: "nullable-entity", job: "nullable-entity" } },
);

export function colonyGroundStockPhase(ctx: WriteContext) {
  const stockContainers = new Set(
    ctx.query(query(GroundStock)).map((row) => row.id),
  );
  for (const row of ctx.query(query(DeliveryTask))) {
    const task = row.get(DeliveryTask);
    if ((task.custody === "delivered" || task.custody === "dropped") && stockContainers.has(task.source))
      ctx.removeAuthoredEntity(row.id);
  }
}

export const colonyWorkSystem = createWorkSystem({
  id: "colony.work",
  version: 1,
  reads: [
    GroundStock,
    Worker,
    DeconstructionOrder,
    Position,
    Support,
    Surface,
    Destination,
    Body,
    Container,
    SealedContainer,
    ConstructionSite,
    MaterialLot,
    DeliveryTask,
    DeliveryControl,
    PartyMember,
    WorkParticipation,
    ExcavationWork,
  ],
  writes: [
    MaterialLot,
    DeliveryTask,
    DeconstructionOrder,
  ],
  phases: [
    colonyGroundStockPhase,
  ],
  providers: [
    manualRouteProvider,
    deliveryProvider,
  ],
});

/** Sites request stock through the same finite deliveries as every other task. */
