import { component, query, system } from "./authoring";
import {
  MaterialLot,
  Position,
  Support,
  Surface,
  move,
  transfer,
} from "./common";
import type { EntityId, Vec3, WorldPose } from "../contracts";

export type DeliveryPhase =
  "idle" | "to-source" | "carrying" | "to-destination" | "complete";
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
/** Shared resumable delivery: only the kernel's reach/custody checks settle transfer. */
export const deliverySystem = system({
  id: "hive.delivery",
  version: 1,
  reads: [
    DeliveryTask,
    Position,
    Support,
    Surface,
    MaterialLot,
    DeliveryControl,
  ],
  writes: [DeliveryTask],
  run(ctx) {
    const tasks = ctx.query(query(DeliveryTask));
    const controls = ctx.query(query(DeliveryControl));
    const positions = ctx.query(query(Position));
    const lots = ctx.query(query(MaterialLot));
    const positionIds = new Set(positions.map((row) => row.id));
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
    const occupiedActors = new Set(
      tasks
        .map((row) => row.get(DeliveryTask))
        .filter((task) => task.actor !== null)
        .map((task) => task.actor as EntityId),
    );
    const idleTasks = tasks.filter((row) => {
      const task = row.get(DeliveryTask);
      const lot = lots
        .find((candidate) => candidate.id === task.sourceLot)
        ?.get(MaterialLot);
      return (
        task.actor === null &&
        task.phase === "idle" &&
        lot?.container === task.source
      );
    });
    const candidates = controls.flatMap((controlRow) => {
      const control = controlRow.get(DeliveryControl);
      if (!control.enabled || occupiedActors.has(controlRow.id)) return [];
      const actorPosition = poses.get(controlRow.id);
      if (!actorPosition) return [];
      return idleTasks.flatMap((taskRow) => {
        const task = taskRow.get(DeliveryTask);
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
            cost: distance(actorPosition.world, sourcePosition.world),
          },
        ];
      });
    });
    const assignments = candidates.length ? ctx.assign(candidates) : [];
    const assigned = new Set(assignments.map((assignment) => assignment.task));
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
        quantity: control.quantity,
        phase: "to-source",
      });
      occupiedActors.add(assignment.worker);
    }
    for (const task of tasks) {
      const state = task.get(DeliveryTask);
      if (state.actor === null || assigned.has(task.id)) continue;
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
      const lot = lots.find((row) => row.id === state.sourceLot);
      const lotState = lot?.get(MaterialLot);
      const actorLot = lots.find(
        (row) =>
          row.id === state.sourceLot &&
          row.get(MaterialLot).container === state.actor,
      );
      const actorLotState = actorLot?.get(MaterialLot);
      if (!control?.enabled) {
        if (state.phase !== "idle" && state.phase !== "complete")
          ctx.action(
            move(state.actor, {
              ...actor.get(Position),
              frame: actorPose.support,
            }),
          );
        continue;
      }
      if (state.phase === "idle") {
        ctx.write(DeliveryTask, task.id, {
          ...state,
          quantity: control.quantity,
          phase: "to-source",
        });
        continue;
      }
      if (state.phase === "to-source") {
        if (actorLotState) {
          ctx.write(DeliveryTask, task.id, { ...state, phase: "carrying" });
          ctx.action(
            move(state.actor, {
              ...destination.get(Position),
              frame: destinationPose.support,
            }),
          );
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
          ctx.action(
            move(state.actor, {
              ...source.get(Position),
              frame: sourcePose.support,
            }),
          );
      } else if (state.phase === "carrying" && actorLotState) {
        ctx.write(DeliveryTask, task.id, { ...state, phase: "to-destination" });
        ctx.action(
          move(state.actor, {
            ...destination.get(Position),
            frame: destinationPose.support,
          }),
        );
      } else if (
        state.phase === "to-destination" &&
        lotState?.container === state.destination
      ) {
        ctx.write(DeliveryTask, task.id, { ...state, phase: "complete" });
      } else if (
        state.phase === "to-destination" &&
        actorLotState &&
        distance(actorPose.world, destinationPose.world) <= 1
      ) {
        if (actorLotState && actorLot)
          ctx.action(
            transfer(
              actorLot.id,
              state.actor,
              state.destination,
              state.quantity,
            ),
          );
      } else if (state.phase === "to-destination" && actorLotState) {
        ctx.action(
          move(state.actor, {
            ...destination.get(Position),
            frame: destinationPose.support,
          }),
        );
      } else if (
        state.phase === "complete" &&
        lotState?.container === state.destination
      ) {
        // Ownership was observed on the previous tick. Host commitment owns durability.
      }
    }
  },
});
