import { component } from "./authoring";
import type { ActionRequest, ComponentDefinition, EntityId, Vec3 } from "../contracts";

export const Position = component<{ x: number; y: number; z: number; facing: number }>("hive.position", { version: 1, fields: { x: "number", y: "number", z: "number", facing: "number" } });
export const FoodLot = component<{ quantity: number; kind: string; container: EntityId }>("hive.lot", { version: 1, fields: { quantity: "number", kind: "string", container: "entity" } });
export const Carrying = component<{ lot: EntityId | null }>("hive.carrying", { version: 1, fields: { lot: "nullable-entity" } });
export const Destination = component<{ x: number; y: number; z: number; facing: number }>("hive.destination", { version: 1, fields: { x: "number", y: "number", z: "number", facing: "number" } });
export const Selected = component<{ active: boolean }>("hive.selected", { version: 1, fields: { active: "boolean" } });

export const move = (entity: EntityId, destination: Vec3, facing = 0): ActionRequest => ({ kind: "move", entity, destination, facing });
export const transfer = (lot: EntityId, from: EntityId, to: EntityId, quantity: number): ActionRequest => ({ kind: "transfer", lot, from, to, quantity });
export const consume = (entity: EntityId, lot: EntityId, quantity: number): ActionRequest => ({ kind: "consume", entity, lot, quantity });
export const groupOrder = (group: EntityId, destination: Vec3, facing: number): ActionRequest => ({ kind: "group-order", group, destination, facing });

export interface SceneEntity { readonly id: EntityId; readonly components: Readonly<Record<string, unknown>> }
export const encodeDefinition = (game: string, components: readonly ComponentDefinition<any>[], initial: readonly SceneEntity[] = []) => new TextEncoder().encode(JSON.stringify({ format: "hive-game", version: 1, game, components: components.map(c => ({ id: c.id, version: c.version, fields: c.fields })), initial }));
