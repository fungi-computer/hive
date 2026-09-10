import { component } from "./authoring";
import type { ActionRequest, ComponentDefinition, EntityId, Vec2 } from "../contracts";

export const Position = component<{ position: Vec2; facing: number }>("hive.position", { version: 1, fields: { position: "json", facing: "number" } });
export const FoodLot = component<{ quantity: number; kind: string }>("hive.food", { version: 1, fields: { quantity: "number", kind: "string" } });
export const Carrying = component<{ lot: EntityId | null }>("hive.carrying", { version: 1, fields: { lot: "json" } });
export const Destination = component<{ destination: Vec2; facing: number }>("hive.destination", { version: 1, fields: { destination: "json", facing: "number" } });
export const Selected = component<{ active: boolean }>("hive.selected", { version: 1, fields: { active: "boolean" } });

export const move = (entity: EntityId, destination: Vec2, facing = 0): ActionRequest => ({ kind: "move", entity, destination, facing });
export const transfer = (lot: EntityId, from: EntityId, to: EntityId, quantity: number): ActionRequest => ({ kind: "transfer", lot, from, to, quantity });
export const consume = (entity: EntityId, lot: EntityId, quantity: number): ActionRequest => ({ kind: "consume", entity, lot, quantity });
export const groupOrder = (group: EntityId, destination: Vec2, facing: number): ActionRequest => ({ kind: "group-order", group, destination, facing });

export const encodeDefinition = (game: string, components: readonly ComponentDefinition<any>[]) => new TextEncoder().encode(JSON.stringify({ format: "hive-game", version: 1, game, components: components.map(c => ({ id: c.id, version: c.version, fields: c.fields })) }));
