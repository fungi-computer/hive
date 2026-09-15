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

/** Native finite-emission capability; catalog admission remains native-owned. */
export const Emitter = component<{ catalog: string }>("hive.emitter", {
  version: 1,
  fields: { catalog: "string" },
});
export const beginEmission = (worker: EntityId, station: EntityId): ActionRequest => ({
  kind: "begin-emission",
  worker,
  station,
});
export const exchangeFieldWater = (operation: string, worker: EntityId, vessel: EntityId, cell: { x: number; y: number; z: number }, portions = 1): ActionRequest => ({
  kind: "exchange-field-water", operation, worker, vessel, ...cell, direction: "withdraw", portions,
});

/** Native carrying capacity; authored systems may query but cannot write it. */
export const Container = component<{ capacity: number }>("hive.container", {
  version: 1,
  fields: { capacity: "number" },
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
/** Native vessel eligibility; physical capability is authored as content and
 * consumed by the native field-water planner. */
export const VesselCapability = component<{ acceptsWater: boolean }>("hive.vessel-capability", {
  version: 1,
  fields: { acceptsWater: "boolean" },
});
export const LotWater = component<{ waterKg: number }>("hive.lot-water", {
  version: 1,
  fields: { waterKg: "number" },
});
/** Native reservation for one exact material portion. Physical custody remains
 * in MaterialLot; this record exposes the durable planner obligation. */
export const SupplyAllocation = component<{
  requirementOwner: EntityId;
  requirementRole: string;
  requirementGeneration: number;
  party: EntityId;
  material: string;
  portion: EntityId;
  destination: EntityId;
  quantity: number;
  state: "reserved" | "delivered" | "cancelled";
}>("hive.supply-allocation", {
  version: 1,
  fields: {
    requirementOwner: "entity",
    requirementRole: "string",
    requirementGeneration: "number",
    party: "entity",
    material: "string",
    portion: "entity",
    destination: "entity",
    quantity: "number",
    state: "string",
  },
});
export const FiniteResource = component<{ kind: string; quantity: number }>("hive.finite-resource", {
  version: 1,
  fields: { kind: "string", quantity: "number" },
});
/** Native durable effort for a generic job task; authored code may query it
 * for progress presentation but cannot write it. */
export const JobTaskWork = component<{ seconds: number }>("hive.job-task-work", {
  version: 1,
  fields: { seconds: "number" },
});
export const ResourceSite = component<{ definition: string; stage: number; nextDue: number }>("hive.resource-site", {
  version: 1,
  fields: { definition: "string", stage: "number", nextDue: "number" },
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
export const dropLot = (entity: EntityId, lot: EntityId): ActionRequest => ({ kind: "drop-lot", entity, lot });
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
export const extractResource = (operation: string, worker: EntityId, source: EntityId): ActionRequest => ({
  kind: "extract-resource", operation, worker, source,
});
export const establishResourceSite = (operation: string, worker: EntityId, site: EntityId, definition: string, cell: { x: number; y: number; z: number }): ActionRequest => ({ kind: "establish-resource-site", operation, worker, site, definition, ...cell });
export const tendResourceSite = (operation: string, worker: EntityId, site: EntityId, vessel: EntityId): ActionRequest => ({ kind: "tend-resource-site", operation, worker, site, vessel });

export interface SceneEntity {
  readonly id: EntityId;
  readonly components: Readonly<Record<string, unknown>>;
}
export const encodeDefinition = (
  game: string,
  components: readonly ComponentDefinition<any>[],
  initial: readonly SceneEntity[] = [],
  materialCatalog: readonly { kind: string; unitVolume: number }[],
  stockpileProfiles: readonly {
    id: string;
    materialCategories?: Readonly<Record<string, string>>;
    allowedCategories?: readonly string[];
    allowedMaterials?: readonly string[];
    deniedMaterials?: readonly string[];
  }[] = [],
) =>
  new TextEncoder().encode(
    JSON.stringify({
      format: "hive-game",
      version: 2,
      game,
      components: components
        .filter((c) => !isReservedComponent(c.id))
        .map((c) => ({ id: c.id, version: c.version, fields: c.fields })),
      initial,
      materialCatalog,
      stockpileProfiles: stockpileProfiles.map(profile => ({
        id: profile.id,
        materialCategories: profile.materialCategories ?? {},
        allowedCategories: profile.allowedCategories ?? [],
        allowedMaterials: profile.allowedMaterials ?? [],
        deniedMaterials: profile.deniedMaterials ?? [],
      })),
    }),
  );

/** Native progress is observable but cannot be written by authored systems. */
export const ExcavationWork = component<{
  x: number; y: number; z: number; expected: number; replacement: number; seconds: number;
}>("hive.excavation-work", {
  version: 1,
  fields: { x: "number", y: "number", z: "number", expected: "number", replacement: "number", seconds: "number" },
});
export const ExcavationOrder = component<{
  cellX: number; cellY: number; cellZ: number; expected: number;
  status: "queued" | "blocked" | "cancelling"; reason: string;
}>("hive.excavation-order", {
  version: 1,
  fields: { cellX: "number", cellY: "number", cellZ: "number", expected: "number", status: "string", reason: "string" },
});
export const cancelWork = (entity: EntityId): ActionRequest => ({ kind: "cancel-work", entity });
