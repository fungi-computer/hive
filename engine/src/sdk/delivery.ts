import { component, query } from "./authoring";
import { GroundStock } from "./ground-stock";
import { ConstructionSite, SealedContainer } from "./construction";
import { WorkParticipation } from "./work-control";
import { OwnedByParty, PartyMember } from "./party";
import { createWorkSystem, type PreparedWorkProvider } from "./work-system";
import {
  MaterialLot,
  Body,
  Container,
  Destination,
  ExcavationWork,
  Position,
  Support,
  Surface,
  move,
  transfer,
  dropLot,
} from "./common";
import type { EntityId, Vec3, WorldPose, WriteContext, MoveDestination } from "../contracts";

type DeliveryLot = { readonly id: EntityId; readonly container: EntityId; readonly kind: string; readonly quantity: number };
function replacementLot(lots: readonly DeliveryLot[], source: EntityId, material: string, quantity: number, held: ReadonlySet<EntityId>): DeliveryLot | undefined {
  let selected: DeliveryLot | undefined;
  for (const lot of lots) {
    if (lot.container !== source || lot.kind !== material || lot.quantity < quantity || held.has(lot.id)) continue;
    if (!selected || lot.id < selected.id) selected = lot;
  }
  return selected;
}

export type DeliveryPhase =
  "idle" | "to-source" | "carrying" | "to-destination" | "putting-down" | "complete";
export const DeliveryControl = component<{
  enabled: boolean;
  quantity: number;
}>("hive.delivery-control", {
  version: 1,
  fields: { enabled: "boolean", quantity: "number" },
});
export const DeliveryTask = component<{
  actor: EntityId | null;
  /** Currently selected physical portion; source/material/quantity remain the obligation. */
  sourceLot: EntityId;
  source: EntityId;
  destination: EntityId;
  destinationContactX: number;
  destinationContactY: number;
  destinationContactZ: number;
  destinationContactFrame: EntityId | null;
  destinationContactSet: boolean;
  material: string;
  quantity: number;
  phase: DeliveryPhase;
}>("hive.delivery-task", {
  version: 1,
  fields: {
    actor: "nullable-entity",
    sourceLot: "entity",
    source: "entity",
    destination: "entity",
    destinationContactX: "number", destinationContactY: "number", destinationContactZ: "number", destinationContactFrame: "nullable-entity", destinationContactSet: "boolean",
    material: "string",
    quantity: "number",
    phase: "string",
  },
});
const distance = (a: Vec3, b: Vec3) =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const sameContact = (a: MoveDestination, b: MoveDestination) =>
  a.x === b.x && a.y === b.y && a.z === b.z && a.frame === b.frame;
type DeliveryCandidate = {
  readonly worker: EntityId;
  readonly task: EntityId;
  readonly actorPosition: Vec3;
  readonly sourcePosition: Vec3;
  readonly sourceTarget: MoveDestination;
  readonly destinationTarget: MoveDestination;
};

/** Provider for the shared work owner; delivery claims remain task.actor. */
export function deliveryProvider(ctx: WriteContext, suspendedActors: ReadonlySet<EntityId>): PreparedWorkProvider<DeliveryCandidate> {
    const tasks = ctx.query(query(DeliveryTask));
    const owners = new Map(ctx.query(query(OwnedByParty)).map(row => [row.id, row.get(OwnedByParty).party]));
    const memberships = new Map(ctx.query(query(PartyMember)).map(row => [row.id, row.get(PartyMember).party]));
    const groundStocks = new Set(ctx.query(query(GroundStock)).map(row => row.id));
    const materialFacts = ctx.workMaterialFacts();
    const sealed = new Set(materialFacts.containers.filter(row => row.sealed).map(row => row.id));
    const controls = ctx.query(query(DeliveryControl));
    const manual = new Set(ctx.query(query(WorkParticipation)).filter(row => !row.get(WorkParticipation).automatic).map(row => row.id));
    const excavations = ctx.query(query(ExcavationWork));
    const positions = ctx.query(query(Position));
    const moving = new Set(ctx.query(query(Destination)).map(row => row.id));
    const positionIds = new Set(positions.map((row) => row.id));
    const requestMove = (actor: EntityId, target: MoveDestination) => {
      ctx.action(move(actor, target));
    };
    const rejectedMove = (actor: EntityId, target: MoveDestination) =>
      ctx.outcomes.some(({ action, result }) =>
        !result.accepted &&
        action.kind === "move" &&
        action.entity === actor &&
        action.destination.x === target.x &&
        action.destination.y === target.y &&
        action.destination.z === target.z &&
        action.destination.frame === target.frame,
      );
    const lots = materialFacts.lots;
    const lotsById = new Map(lots.map(lot => [lot.id, lot]));
    const containers = new Map(materialFacts.containers.map(container => [container.id, container]));
    // A portable container is a real container carried by its holder, so its
    // interior source has no independent position. Resolve that source's
    // contact through the authoritative pail lot custody.
    const sourcePositionId = (source: EntityId): EntityId | null => {
      let current = source;
      const seen = new Set<EntityId>();
      for (let depth = 0; depth <= 16; depth++) {
        if (positionIds.has(current)) return current;
        if (seen.has(current)) return null;
        seen.add(current);
        const lot = lotsById.get(current);
        if (!lot || !containers.has(current)) return null;
        current = lot.container;
      }
      return null;
    };
    const bodies = new Map(ctx.query(query(Body)).map((row) => [row.id, row.get(Body)]));
    const quantityByContainer = new Map<EntityId, number>();
    const invalidLotContainers = new Set<EntityId>();
    for (const lot of lots) {
      if (!Number.isSafeInteger(lot.quantity) || lot.quantity < 0 || lot.quantity > 0xffffffff)
        invalidLotContainers.add(lot.container);
      const quantity = (quantityByContainer.get(lot.container) ?? 0) + lot.quantity;
      if (!Number.isSafeInteger(quantity)) invalidLotContainers.add(lot.container);
      quantityByContainer.set(lot.container, quantity);
    }
    const quantityIn = (container: EntityId) => {
      if (invalidLotContainers.has(container)) return null;
      return quantityByContainer.get(container) ?? 0;
    };
    const hasCapacity = (container: EntityId, additional: number) => {
      const capacity = containers.get(container)?.capacity;
      const quantity = quantityIn(container);
      return (
        typeof capacity === "number" &&
        Number.isSafeInteger(capacity) &&
        capacity >= 0 &&
        capacity <= 0xffffffff &&
        quantity !== null &&
        Number.isSafeInteger(quantity + additional) &&
        quantity + additional <= capacity
      );
    };
    const occupiedActors = new Set([
      ...excavations.map((row) => row.id),
      ...ctx.query(query(ConstructionSite)).flatMap((row) => {
        const site = row.get(ConstructionSite);
        return site.worker === null ? [] : [site.worker];
      }),
    ]);
    const relevantIds = [
      ...new Set([
        ...controls.map((row) => row.id),
        ...tasks.flatMap((row) => {
          const task = row.get(DeliveryTask);
          const source = sourcePositionId(task.source);
          return [task.actor, source, task.destination];
        }),
      ]),
    ].filter((id): id is EntityId => id !== null && positionIds.has(id));
    const poseRows: WorldPose[] = [];
    for (let offset = 0; offset < relevantIds.length; offset += 128)
      poseRows.push(...ctx.worldPoses(relevantIds.slice(offset, offset + 128)));
    const poses = new Map(poseRows.map((pose) => [pose.id, pose]));
    const sameFrame = (a: EntityId, b: EntityId) =>
      poses.get(a)?.support === poses.get(b)?.support;
    const idleTasks = tasks.filter((row) => {
      const task = row.get(DeliveryTask);
      const lot = lotsById.get(task.sourceLot);
      return (
        task.actor === null &&
        task.phase === "idle" &&
        lot?.container === task.source
      );
    });
    const heldLots = new Set(tasks.flatMap((row) => {
      const task = row.get(DeliveryTask);
      return task.actor !== null && task.phase !== "complete" ? [task.sourceLot] : [];
    }));
    const candidates = controls.flatMap((controlRow) => {
      if (manual.has(controlRow.id)) return [];
      const control = controlRow.get(DeliveryControl);
      if (!control.enabled || sealed.has(controlRow.id)) return [];
      if (
        !Number.isSafeInteger(control.quantity) ||
        control.quantity <= 0 ||
        control.quantity > 0xffffffff ||
        !bodies.has(controlRow.id) ||
        !Number.isFinite(bodies.get(controlRow.id)?.speed) ||
        (bodies.get(controlRow.id)?.speed ?? 0) <= 0
      )
        return [];
      const actorPosition = poses.get(controlRow.id);
      if (!actorPosition) return [];
      return idleTasks.flatMap((taskRow) => {
        const task = taskRow.get(DeliveryTask);
        const party = owners.get(taskRow.id) ?? owners.get(task.source) ?? owners.get(task.destination);
        if (party && memberships.get(controlRow.id) !== party) return [];
        if (
          sealed.has(task.source) || sealed.has(task.destination) ||
          task.source === task.destination ||
          task.source === controlRow.id ||
          task.destination === controlRow.id ||
          !containers.has(task.source) ||
          !containers.has(task.destination)
        )
          return [];
        const lot = lotsById.get(task.sourceLot);
        const quantity = Math.min(control.quantity, task.quantity);
        if (
          !Number.isSafeInteger(task.quantity) || task.quantity <= 0 || task.quantity > 0xffffffff ||
          !lot ||
          lot.container !== task.source ||
          lot.kind !== task.material ||
          !Number.isSafeInteger(lot.quantity) ||
          lot.quantity > 0xffffffff ||
          lot.quantity < quantity ||
          !hasCapacity(controlRow.id, quantity) ||
          !hasCapacity(task.destination, quantity)
        )
          return [];
        const sourceId = sourcePositionId(task.source);
        const sourcePosition = sourceId ? poses.get(sourceId) : undefined;
        const destinationPosition = poses.get(task.destination);
        if (
          !sourcePosition ||
          !destinationPosition ||
          !sourceId ||
          (sourceId !== task.source && bodies.has(sourceId) && sourceId !== controlRow.id) ||
          !sameFrame(controlRow.id, sourceId) ||
          !sameFrame(controlRow.id, task.destination)
        )
          return [];
        return [
          {
            worker: controlRow.id,
            task: taskRow.id,
            actorPosition: actorPosition.world,
            sourcePosition: sourcePosition.world,
            sourceTarget: { x: sourcePosition.local.x, y: sourcePosition.local.y, z: sourcePosition.local.z, frame: sourcePosition.support },
            destinationTarget: { x: destinationPosition.local.x, y: destinationPosition.local.y, z: destinationPosition.local.z, frame: destinationPosition.support },
          },
        ];
      });
    });
    const deliveryClaims = tasks.map(row => ({
      task: row.id,
      actor: row.get(DeliveryTask).actor,
    }));
    let assigned = new Set<EntityId>();
    const selectedContacts = new Map<EntityId, MoveDestination>();
    return {
      claims: deliveryClaims,
      occupiedActors: [...occupiedActors],
      candidates,
      lowerBound: (candidate) => distance(candidate.actorPosition, candidate.sourcePosition),
      estimate: (candidate) => {
        const [source] = ctx.routeCosts([{ actor: candidate.worker, target: candidate.sourceTarget }]);
        if (source.status !== "reachable") return null;
        const task = tasks.find(row => row.id === candidate.task)?.get(DeliveryTask);
        if (!task) return null;
        const contacts = ctx.transferContacts({ worker: candidate.worker, container: task.destination });
        if (contacts.kind !== "ready") return null;
        const destination = ctx.routeToAny({ actor: candidate.worker, targets: contacts.targets });
        if (destination.status !== "reachable") return null;
        const target = contacts.targets[destination.targetIndex];
        if (!target) return null;
        selectedContacts.set(candidate.task, target);
        return source.cost + destination.cost;
      },
      apply: (assignments) => {
        assigned = new Set(assignments.map((assignment) => assignment.task));
        for (const assignment of assignments) {
          const taskRow = idleTasks.find((row) => row.id === assignment.task);
          const control = controls
            .find((row) => row.id === assignment.worker)
            ?.get(DeliveryControl);
          if (!taskRow || !control) continue;
          const task = taskRow.get(DeliveryTask);
          const contact = selectedContacts.get(taskRow.id);
          ctx.write(DeliveryTask, taskRow.id, {
            ...task,
            actor: assignment.worker,
            quantity: Math.min(control.quantity, task.quantity),
            destinationContactX: contact?.x ?? 0,
            destinationContactY: contact?.y ?? 0,
            destinationContactZ: contact?.z ?? 0,
            destinationContactFrame: contact?.frame ?? null,
            destinationContactSet: contact !== undefined,
            phase: "to-source",
          });
        }
      },
      progress: () => {
    for (const task of tasks) {
      const state = task.get(DeliveryTask);
      const selectedLot = lotsById.get(state.sourceLot);
      if (state.actor === null && (state.phase === "idle" || state.phase === "to-source") && selectedLot?.container !== state.source) {
        const replacement = replacementLot(lots, state.source, state.material, state.quantity, heldLots);
        if (replacement) ctx.write(DeliveryTask, task.id, { ...state, sourceLot: replacement.id });
        continue;
      }
      if (state.actor === null || assigned.has(task.id)) continue;
      if (suspendedActors.has(state.actor)) continue;
      if (occupiedActors.has(state.actor)) continue;
      const control = controls
        .find((row) => row.id === state.actor)
        ?.get(DeliveryControl);
      const actor = positions.find((row) => row.id === state.actor);
      const sourceId = sourcePositionId(state.source);
      const source = sourceId && positions.find((row) => row.id === sourceId);
      const destination = positions.find((row) => row.id === state.destination);
      const actorPose = poses.get(state.actor);
      const sourcePose = sourceId ? poses.get(sourceId) : undefined;
      const destinationPose = poses.get(state.destination);
      if (
        !actor ||
        !source ||
        !destination ||
        !actorPose ||
        !sourcePose ||
        !destinationPose
      )
        continue;
      if (
        !sourceId ||
        (sourceId !== state.source && bodies.has(sourceId) && sourceId !== state.actor) ||
        !sameFrame(state.actor, sourceId) ||
        !sameFrame(state.actor, state.destination)
      )
        continue;
      const lotState = lotsById.get(state.sourceLot);
      if ((state.phase === "idle" || state.phase === "to-source") && lotState?.container !== state.source && lotState?.container !== state.actor) {
        const replacement = replacementLot(lots, state.source, state.material, state.quantity, heldLots);
        if (replacement) {
          ctx.write(DeliveryTask, task.id, { ...state, sourceLot: replacement.id, actor: null, phase: "idle" });
        } else if (state.actor !== null) {
          ctx.write(DeliveryTask, task.id, { ...state, actor: null, phase: "idle" });
        }
        continue;
      }
      if (state.destinationContactSet && (state.phase === "carrying" || state.phase === "to-destination")) {
        const contacts = ctx.transferContacts({ worker: state.actor, container: state.destination });
        const selected = { x: state.destinationContactX, y: state.destinationContactY, z: state.destinationContactZ, frame: state.destinationContactFrame };
        if (contacts.kind !== "ready" || !contacts.targets.some(target => sameContact(target, selected))) {
          if (lotState?.container === state.actor) {
            ctx.write(DeliveryTask, task.id, { ...state, phase: "putting-down" });
            ctx.action(dropLot(state.actor, state.sourceLot));
          } else {
            ctx.write(DeliveryTask, task.id, { ...state, actor: null, phase: "idle" });
          }
          continue;
        }
      }
      // A completed deposit must still retire its claim if the destination
      // became sealed in that same committed step. Otherwise keep custody and
      // wait without issuing futile movement or transfer requests.
      if (lotState?.container !== state.destination && (
        sealed.has(state.actor) || sealed.has(state.destination)
        || (lotState?.container === state.source && sealed.has(state.source))
      )) continue;
      const actorLotState = lotState?.container === state.actor ? lotState : undefined;
      const selectedDestination = state.destinationContactSet
        ? { x: state.destinationContactX, y: state.destinationContactY, z: state.destinationContactZ, frame: state.destinationContactFrame }
        : { x: destinationPose.local.x, y: destinationPose.local.y, z: destinationPose.local.z, frame: destinationPose.support };
      const moveTarget = state.phase === "to-source"
        ? { x: sourcePose.local.x, y: sourcePose.local.y, z: sourcePose.local.z, frame: sourcePose.support }
        : state.phase === "carrying" || state.phase === "to-destination"
          ? selectedDestination
          : null;
      if (moveTarget && rejectedMove(state.actor, moveTarget)) {
        if (actorLotState) {
          // A rejected destination move can happen after pickup. Keep the
          // physical lot in the actor's custody until native ground custody is
          // committed; the putting-down branch owns that observation.
          ctx.write(DeliveryTask, task.id, { ...state, phase: "putting-down" });
          ctx.action(dropLot(state.actor, actorLotState.id));
        } else {
          // No pickup was committed, so the worker claim is safe to release.
          ctx.write(DeliveryTask, task.id, { ...state, actor: null, phase: "idle" });
        }
        continue;
      }
      if (state.phase === "putting-down") {
        // Observe the native committed custody change before releasing the claim.
        if (lotState?.container === state.destination) {
          ctx.write(DeliveryTask, task.id, { ...state, actor: null, phase: "complete" });
        } else if (lotState && groundStocks.has(lotState.container) && lotState.container !== state.actor && lotState.container !== state.destination) {
          ctx.write(DeliveryTask, task.id, { ...state, source: lotState.container, actor: null, phase: "idle" });
        } else if (actorLotState) ctx.action(dropLot(state.actor, state.sourceLot));
        continue;
      }
      if (actorLotState && !hasCapacity(state.destination, state.quantity)) {
        ctx.write(DeliveryTask, task.id, { ...state, phase: "putting-down" });
        requestMove(state.actor, { ...actor.get(Position), frame: actorPose.support });
        ctx.action(dropLot(state.actor, state.sourceLot));
        continue;
      }
      if (state.phase === "to-source" && !actorLotState && !hasCapacity(state.destination, state.quantity)) {
        ctx.write(DeliveryTask, task.id, { ...state, actor: null, phase: "idle" });
        requestMove(state.actor, { ...actor.get(Position), frame: actorPose.support });
        continue;
      }

      if (!control?.enabled) {
        if (state.phase !== "idle" && state.phase !== "complete" && !moving.has(state.actor))
          requestMove(state.actor, {
              ...actor.get(Position),
              frame: actorPose.support,
            });
        continue;
      }
      if (moving.has(state.actor)) continue;
      if (state.phase === "idle") {
        ctx.write(DeliveryTask, task.id, {
          ...state,
          quantity: Math.min(control.quantity, state.quantity),
          phase: "to-source",
        });
        continue;
      }
      if (state.phase === "to-source") {
        if (actorLotState) {
          ctx.write(DeliveryTask, task.id, { ...state, phase: "carrying" });
          requestMove(state.actor, {
            x: state.destinationContactSet ? state.destinationContactX : destination.get(Position).x,
            y: state.destinationContactSet ? state.destinationContactY : destination.get(Position).y,
            z: state.destinationContactSet ? state.destinationContactZ : destination.get(Position).z,
            frame: state.destinationContactFrame ?? destinationPose.support,
          });
          continue;
        }
        if (distance(actorPose.world, sourcePose.world) <= 1) {
          if (lotState?.container === state.source)
            ctx.action(
              transfer(
                state.sourceLot,
                state.source,
                state.actor,
                state.quantity,
              ),
            );
        } else
          requestMove(state.actor, {
              ...source.get(Position),
              frame: sourcePose.support,
            });
      } else if (state.phase === "carrying" && actorLotState) {
        ctx.write(DeliveryTask, task.id, { ...state, phase: "to-destination" });
        requestMove(state.actor, {
            x: state.destinationContactSet ? state.destinationContactX : destination.get(Position).x,
            y: state.destinationContactSet ? state.destinationContactY : destination.get(Position).y,
            z: state.destinationContactSet ? state.destinationContactZ : destination.get(Position).z,
            frame: state.destinationContactSet ? state.destinationContactFrame : destinationPose.support,
          });
      } else if (
        state.phase === "to-destination" &&
        lotState?.container === state.destination
      ) {
        ctx.write(DeliveryTask, task.id, { ...state, actor: null, phase: "complete" });
      } else if (
        state.phase === "to-destination" &&
        actorLotState &&
        distance(actorPose.world, destinationPose.world) <= 1
      ) {
        if (actorLotState) {
          // Publish the visual hand-off frontier with the same committed
          // transfer request. The next step observes destination custody and
          // retires the task; presentation never needs a client timer.
          ctx.write(DeliveryTask, task.id, { ...state, phase: "putting-down" });
          ctx.action(
            transfer(
              actorLotState.id,
              state.actor,
              state.destination,
              state.quantity,
            ),
          );
        }
      } else if (state.phase === "to-destination" && actorLotState) {
        requestMove(state.actor, {
            ...destination.get(Position),
            frame: destinationPose.support,
          });
      } else if (
        state.phase === "complete" &&
        lotState?.container === state.destination
      ) {
        // Ownership was observed on the previous tick. Host commitment owns durability.
      }
    }
      },
    };
}

/** Existing delivery composition uses the shared owner with one provider. */
export const deliverySystem = createWorkSystem({
  id: "hive.delivery",
  version: 1,
  reads: [
    DeliveryTask,
    GroundStock,
    Position,
    Destination,
    Body,
    Container,
    SealedContainer,
    ConstructionSite,
    Support,
    Surface,
    MaterialLot,
    ExcavationWork,
    DeliveryControl,
    OwnedByParty,
    PartyMember,
  ],
  writes: [DeliveryTask],
  providers: [deliveryProvider],
});
