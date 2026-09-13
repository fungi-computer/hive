import { component, query } from "./authoring";
import { GroundStock } from "./ground-stock";
import { ConstructionSite, SealedContainer } from "./construction";
import { createWorkSystem, type PreparedWorkProvider } from "./work-system";
import {
  MaterialLot,
  Body,
  Container,
  ExcavationWork,
  Position,
  Support,
  Surface,
  move,
  transfer,
  dropLot,
} from "./common";
import type { EntityId, Vec3, WorldPose, WriteContext, MoveDestination } from "../contracts";

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
  sourceLot: EntityId;
  source: EntityId;
  destination: EntityId;
  material: string;
  quantity: number;
  phase: string;
}>("hive.delivery-task", {
  version: 1,
  fields: {
    actor: "nullable-entity",
    sourceLot: "entity",
    source: "entity",
    destination: "entity",
    material: "string",
    quantity: "number",
    phase: "string",
  },
});
const distance = (a: Vec3, b: Vec3) =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
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
    const groundStocks = new Set(ctx.query(query(GroundStock)).map(row => row.id));
    const materialFacts = ctx.workMaterialFacts();
    const sealed = new Set(materialFacts.containers.filter(row => row.sealed).map(row => row.id));
    const controls = ctx.query(query(DeliveryControl));
    const excavations = ctx.query(query(ExcavationWork));
    const positions = ctx.query(query(Position));
    const requestMove = (actor: EntityId, target: MoveDestination) => {
      ctx.action(move(actor, target));
    };
    const lots = materialFacts.lots;
    const lotsById = new Map(lots.map(lot => [lot.id, lot]));
    const bodies = new Map(ctx.query(query(Body)).map((row) => [row.id, row.get(Body)]));
    const containers = new Map(materialFacts.containers.map(container => [container.id, container]));
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
    const positionIds = new Set(positions.map((row) => row.id));
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
          return [task.actor, task.source, task.destination];
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
    const candidates = controls.flatMap((controlRow) => {
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
        const sourcePosition = poses.get(task.source);
        const destinationPosition = poses.get(task.destination);
        if (
          !sourcePosition ||
          !destinationPosition ||
          !sameFrame(controlRow.id, task.source) ||
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
    return {
      claims: deliveryClaims,
      occupiedActors: [...occupiedActors],
      candidates,
      estimate: (candidate) => {
        const [source, destination] = ctx.routeCosts([
          { actor: candidate.worker, target: candidate.sourceTarget },
          { actor: candidate.worker, target: candidate.destinationTarget },
        ]);
        return source.status === "reachable" && destination.status === "reachable" ? source.cost : null;
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
          ctx.write(DeliveryTask, taskRow.id, {
            ...task,
            actor: assignment.worker,
            quantity: Math.min(control.quantity, task.quantity),
            phase: "to-source",
          });
        }
      },
      progress: () => {
    for (const task of tasks) {
      const state = task.get(DeliveryTask);
      if (state.actor === null || assigned.has(task.id)) continue;
      if (suspendedActors.has(state.actor)) continue;
      if (occupiedActors.has(state.actor)) continue;
      const control = controls
        .find((row) => row.id === state.actor)
        ?.get(DeliveryControl);
      const actor = positions.find((row) => row.id === state.actor);
      const source = positions.find((row) => row.id === state.source);
      const destination = positions.find((row) => row.id === state.destination);
      const actorPose = poses.get(state.actor);
      const sourcePose = poses.get(state.source);
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
        !sameFrame(state.actor, state.source) ||
        !sameFrame(state.actor, state.destination)
      )
        continue;
      const lotState = lotsById.get(state.sourceLot);
      // A completed deposit must still retire its claim if the destination
      // became sealed in that same committed step. Otherwise keep custody and
      // wait without issuing futile movement or transfer requests.
      if (lotState?.container !== state.destination && (
        sealed.has(state.actor) || sealed.has(state.destination)
        || (lotState?.container === state.source && sealed.has(state.source))
      )) continue;
      const actorLotState = lotState?.container === state.actor ? lotState : undefined;
      if (state.phase === "putting-down") {
        // Observe the native committed custody change before releasing the claim.
        if (lotState && groundStocks.has(lotState.container) && lotState.container !== state.actor && lotState.container !== state.destination) {
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
        if (state.phase !== "idle" && state.phase !== "complete")
          requestMove(state.actor, {
              ...actor.get(Position),
              frame: actorPose.support,
            });
        continue;
      }
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
              ...destination.get(Position),
              frame: destinationPose.support,
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
            ...destination.get(Position),
            frame: destinationPose.support,
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
        if (actorLotState)
          ctx.action(
            transfer(
              actorLotState.id,
              state.actor,
              state.destination,
              state.quantity,
            ),
          );
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
    Body,
    Container,
    SealedContainer,
    ConstructionSite,
    Support,
    Surface,
    MaterialLot,
    ExcavationWork,
    DeliveryControl,
  ],
  writes: [DeliveryTask],
  providers: [deliveryProvider],
});
