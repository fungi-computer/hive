import { component, query } from "./authoring";
import { GroundStock } from "./ground-stock";
import { ConstructionSite, SealedContainer } from "./construction";
import { WorkParticipation } from "./work-control";
import { PartyMember } from "./party";
import { createWorkSystem, type PreparedWorkProvider } from "./work-system";
import { MaterialLot, Body, Container, Position, Destination, ExcavationWork } from "./common";
import { beginRouteWorkAttempt, continueRouteWorkAttempt, continueMaterialTransferAttempt, continueMaterialDropAttempt, acknowledgeWorkAttempt, workAttempt } from "./work-attempt";
import type { EntityId, MoveDestination, Vec3, WorldPose, WriteContext } from "../contracts";

/** A delivery is an obligation. Labor is represented only by WorkAttempt. */
export type DeliveryCustody = "available" | "held" | "delivered" | "dropped";
export const isDeliveryCustody = (value: string): value is DeliveryCustody => value === "available" || value === "held" || value === "delivered" || value === "dropped";
export const DeliveryControl = component<{ enabled: boolean; quantity: number }>("hive.delivery-control", {
  version: 1, fields: { enabled: "boolean", quantity: "number" },
});
export const DeliveryTask = component<{
  version: number; party: EntityId; sourceLot: EntityId; source: EntityId; destination: EntityId;
  material: string; quantity: number; custody: DeliveryCustody;
}>("hive.delivery-task", {
  version: 2,
  fields: { version: "number", party: "entity", sourceLot: "entity", source: "entity", destination: "entity", material: "string", quantity: "number", custody: "string" },
});

type Lot = { readonly id: EntityId; readonly container: EntityId; readonly kind: string; readonly quantity: number };
type Candidate = { readonly worker: EntityId; readonly task: EntityId; readonly actorPosition: Vec3; readonly sourceTarget: MoveDestination };
const distance = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const target = (pose: WorldPose): MoveDestination => ({ x: pose.local.x, y: pose.local.y, z: pose.local.z, frame: pose.support });

/**
 * Shared delivery owner. It does not inspect ActionOutcome and has no actor or
 * phase fields. Native attempts own route, transfer, and drop identity; the
 * MaterialLot container is the only physical custody fact.
 */
export function deliveryProvider(ctx: WriteContext, suspendedActors: ReadonlySet<EntityId>): PreparedWorkProvider<Candidate> {
  const taskRows = ctx.query(query(DeliveryTask));
  const tasks = taskRows.map(row => ({ id: row.id, state: row.get(DeliveryTask) }));
  const facts = ctx.workMaterialFacts();
  const lots = new Map(facts.lots.map(lot => [lot.id, lot]));
  const containers = new Map(facts.containers.map(container => [container.id, container]));
  const sealed = new Set(facts.containers.filter(container => container.sealed).map(container => container.id));
  const members = new Map(ctx.query(query(PartyMember)).map(row => [row.id, row.get(PartyMember).party]));
  const controls = new Map(ctx.query(query(DeliveryControl)).map(row => [row.id, row.get(DeliveryControl)]));
  const bodies = new Map(ctx.query(query(Body)).map(row => [row.id, row.get(Body)]));
  const positions = new Map(ctx.query(query(Position)).map(row => [row.id, row.get(Position)]));
  const moving = new Set(ctx.query(query(Destination)).map(row => row.id));
  const occupied = new Set(ctx.query(query(ExcavationWork)).map(row => row.id));
  const poseIds = [...new Set([...positions.keys(), ...tasks.flatMap(({ state }) => [state.source, state.destination])])];
  const poses = new Map(ctx.worldPoses(poseIds).map(pose => [pose.id, pose]));
  const positionForContainer = (container: EntityId): WorldPose | undefined => {
    let current = container; const seen = new Set<EntityId>();
    for (let depth = 0; depth < 16 && !seen.has(current); depth++) {
      seen.add(current); const pose = poses.get(current); if (pose) return pose;
      const carrier = lots.get(current); if (!carrier) return undefined; current = carrier.container;
    }
    return undefined;
  };
  const quantityByContainer = new Map<EntityId, number>();
  for (const lot of lots.values()) quantityByContainer.set(lot.container, (quantityByContainer.get(lot.container) ?? 0) + lot.quantity);
  const hasCapacity = (id: EntityId, quantity: number) => {
    const capacity = containers.get(id)?.capacity; const used = quantityByContainer.get(id) ?? 0;
    return Number.isSafeInteger(capacity) && capacity! >= 0 && Number.isSafeInteger(used) && used + quantity <= capacity!;
  };
  const claims = tasks.map(({ id }) => ({ task: id, actor: workAttempt(ctx, id)?.worker ?? null }));
  const candidates: Candidate[] = [];
  for (const { id, state } of tasks) {
    if (!isDeliveryCustody(state.custody)) throw new Error("invalid delivery custody");
    if (state.custody === "delivered" || workAttempt(ctx, id)) continue;
    const lot = lots.get(state.sourceLot); if (!lot || lot.kind !== state.material || lot.quantity < state.quantity) continue;
    const source = positionForContainer(lot.container); const destination = poses.get(state.destination); if (!source || !destination) continue;
    if (sealed.has(lot.container) || sealed.has(state.destination) || !hasCapacity(state.destination, state.quantity)) continue;
    for (const [worker, control] of controls) {
      if (!control.enabled || suspendedActors.has(worker) || occupied.has(worker) || moving.has(worker) || members.get(worker) !== state.party || !bodies.has(worker)) continue;
      if (lot.container !== worker && !hasCapacity(worker, state.quantity)) continue;
      const pose = poses.get(worker); if (!pose || pose.support !== source.support || pose.support !== destination.support) continue;
      candidates.push({ worker, task: id, actorPosition: pose.world, sourceTarget: lot.container === worker ? target(destination) : target(source) });
    }
  }
  const selected = new Map<EntityId, MoveDestination>();
  return {
    claims, occupiedActors: [...occupied], candidates,
    lowerBound: () => 0,
    estimate: candidate => {
      const task = tasks.find(item => item.id === candidate.task); if (!task) return null;
      const source = ctx.routeCosts([{ actor: candidate.worker, target: candidate.sourceTarget }])[0]; if (!source || source.status !== "reachable") return null;
      const contacts = ctx.transferContacts({ worker: candidate.worker, container: task.state.destination }); if (contacts.kind !== "ready") return null;
      const destination = ctx.routeToAny({ actor: candidate.worker, targets: contacts.targets }); if (destination.status !== "reachable") return null;
      const contact = contacts.targets[destination.targetIndex]; if (!contact) return null; selected.set(candidate.task, contact); return source.cost + destination.cost;
    },
    apply: assignments => {
      for (const assignment of assignments) {
        const task = tasks.find(item => item.id === assignment.task); if (!task || workAttempt(ctx, task.id)) continue;
        const lot = lots.get(task.state.sourceLot); if (!lot) continue;
        const source = positionForContainer(lot.container); if (!source) continue;
        beginRouteWorkAttempt(ctx, task.id, assignment.worker, task.state.party, lot.container === assignment.worker ? selected.get(task.id) ?? target(poses.get(task.state.destination)!) : target(source));
      }
    },
    progress: () => {
      for (const { id, state } of tasks) {
        const lot = lots.get(state.sourceLot);
        if (!lot) continue;
        if (state.custody === "dropped" && lot.container !== state.destination) {
          ctx.write(DeliveryTask, id, { ...state, custody: "available" });
          continue;
        }
        const attempt = workAttempt(ctx, id); if (!attempt || attempt.phase.kind !== "outcome") continue;
        const sequence = attempt.phase.operation.sequence;
        if (attempt.phase.result.kind === "blocked" || attempt.phase.result.kind === "interrupted") {
          if (lot.container === attempt.worker && state.custody !== "held") ctx.write(DeliveryTask, id, { ...state, custody: "held" });
          acknowledgeWorkAttempt(ctx, attempt.key, sequence); continue;
        }
        const activity = attempt.phase.activity;
        if (activity.kind === "route") {
          if (lot.container === attempt.worker) continueMaterialTransferAttempt(ctx, attempt.key, sequence, lot.id, attempt.worker, state.destination, state.quantity);
          else continueMaterialTransferAttempt(ctx, attempt.key, sequence, lot.id, lot.container, attempt.worker, state.quantity);
        } else if (activity.kind === "material-transfer") {
          if (lot.container === state.destination) { ctx.write(DeliveryTask, id, { ...state, custody: "delivered" }); acknowledgeWorkAttempt(ctx, attempt.key, sequence); }
          else if (lot.container === attempt.worker) {
            const contacts = ctx.transferContacts({ worker: attempt.worker, container: state.destination });
            if (contacts.kind === "ready" && contacts.targets[0]) continueRouteWorkAttempt(ctx, attempt.key, sequence, contacts.targets[0]);
            else continueMaterialDropAttempt(ctx, attempt.key, sequence, lot.id);
          }
        } else if (activity.kind === "material-drop") {
          ctx.write(DeliveryTask, id, { ...state, custody: "dropped" }); acknowledgeWorkAttempt(ctx, attempt.key, sequence);
        }
        if (state.custody === "dropped" && lot.container !== state.destination)
          ctx.write(DeliveryTask, id, { ...state, custody: "available" });
      }
    },
  };
}

export const deliverySystem = createWorkSystem({
  id: "hive.delivery", version: 2,
  reads: [DeliveryTask, GroundStock, Position, Destination, Body, Container, SealedContainer, ConstructionSite, MaterialLot, DeliveryControl, OwnedByParty, PartyMember, WorkParticipation, ExcavationWork],
  writes: [DeliveryTask], providers: [deliveryProvider],
});
