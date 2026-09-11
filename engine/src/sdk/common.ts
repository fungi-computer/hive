import { component } from "./authoring";
import { isReservedComponent } from "../contracts";
import type {
  ActionRequest,
  ComponentDefinition,
  EntityId,
  MoveDestination,
} from "../contracts";

/** Native movement capability; game systems may query it but cannot write it. */
export const Body = component<{ speed: number }>("hive.body", {
  version: 1,
  fields: { speed: "number" },
});

/** Authored walking geometry; native routing owns its interpretation and state. */
export const Traversal = component<{
  clearanceCells: number;
  maxStepCells: number;
}>("hive.traversal", {
  version: 1,
  fields: { clearanceCells: "number", maxStepCells: "number" },
});

export const Position = component<{
  x: number;
  y: number;
  z: number;
  facing: number;
}>("hive.position", {
  version: 1,
  fields: { x: "number", y: "number", z: "number", facing: "number" },
});
export const Support = component<{ entity: EntityId }>("hive.support", {
  version: 1,
  fields: { entity: "entity" },
});
export const Surface = component<{
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  height: number;
}>("hive.surface", {
  version: 1,
  fields: {
    minX: "number",
    maxX: "number",
    minZ: "number",
    maxZ: "number",
    height: "number",
  },
});
export const MaterialLot = component<{
  quantity: number;
  kind: string;
  container: EntityId;
}>("hive.lot", {
  version: 1,
  fields: { quantity: "number", kind: "string", container: "entity" },
});
export const LotWater = component<{ waterKg: number }>("hive.lot-water", {
  version: 1,
  fields: { waterKg: "number" },
});
export const Destination = component<{
  x: number;
  y: number;
  z: number;
  facing: number;
  frame: EntityId | null;
}>("hive.destination", {
  version: 1,
  fields: {
    x: "number",
    y: "number",
    z: "number",
    facing: "number",
    frame: "nullable-entity",
  },
});
export const move = (
  entity: EntityId,
  destination: MoveDestination,
  facing = 0,
): ActionRequest => ({
  kind: "move",
  entity,
  destination: {
    x: destination.x,
    y: destination.y,
    z: destination.z,
    frame: destination.frame,
  },
  facing,
});
export const transfer = (
  lot: EntityId,
  from: EntityId,
  to: EntityId,
  quantity: number,
): ActionRequest => ({ kind: "transfer", lot, from, to, quantity });
export const consume = (
  entity: EntityId,
  lot: EntityId,
  quantity: number,
): ActionRequest => ({ kind: "consume", entity, lot, quantity });

export interface SceneEntity {
  readonly id: EntityId;
  readonly components: Readonly<Record<string, unknown>>;
}
export const encodeDefinition = (
  game: string,
  components: readonly ComponentDefinition<any>[],
  initial: readonly SceneEntity[] = [],
) =>
  new TextEncoder().encode(
    JSON.stringify({
      format: "hive-game",
      version: 1,
      game,
      components: components
        .filter((c) => !isReservedComponent(c.id))
        .map((c) => ({ id: c.id, version: c.version, fields: c.fields })),
      initial,
    }),
  );

/** Native progress is observable but cannot be written by authored systems. */
export const ExcavationWork = component<{
  x: number; y: number; z: number; expected: number; replacement: number; seconds: number;
}>("hive.excavation-work", {
  version: 1,
  fields: { x: "number", y: "number", z: "number", expected: "number", replacement: "number", seconds: "number" },
});
export const excavate = (
  entity: EntityId,
  cell: { readonly x: number; readonly y: number; readonly z: number },
  expected: number,
  replacement: number,
): ActionRequest => ({ kind: "excavate", entity, ...cell, expected, replacement });
export const cancelWork = (entity: EntityId): ActionRequest => ({ kind: "cancel-work", entity });
