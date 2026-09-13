import { component } from "./authoring";
import type { ActionRequest, CardinalOrientation, EntityId, Vec3 } from "../contracts";

/** Native custody is observable; authored writes cannot lock or unlock goods. */
export const SealedContainer = component<Record<string, never>>("hive.sealed-container", {
  version: 1, fields: {},
});

/** The site owns earned effort even when its worker changes. */
export const ConstructionSite = component<{
  catalog: string; x: number; y: number; z: number;
  orientation: CardinalOrientation;
  worker: EntityId | null; seconds: number;
  phase: "planned" | "working" | "finished";
}>("hive.construction-site", {
  version: 1,
  fields: {
    catalog: "string", x: "number", y: "number", z: "number", orientation: "string",
    worker: "nullable-entity", seconds: "number", phase: "string",
  },
});

/** Select authored content; the native catalog owns cost, effort and geometry. */
export const planConstruction = (
  site: EntityId,
  catalog: string,
  cell: Vec3,
  orientation: CardinalOrientation,
): ActionRequest => ({
  kind: "plan-construction", site, catalog,
  x: cell.x, y: cell.y, z: cell.z, orientation,
});

export const bindConstructionStage = (site: EntityId, contact: Vec3): ActionRequest => ({
  kind: "bind-construction-stage", site,
  contact: { x: contact.x, y: contact.y, z: contact.z, frame: null },
});

export const attendConstruction = (worker: EntityId, site: EntityId, contact: Vec3): ActionRequest => ({
  kind: "attend-construction", worker, site,
  contact: { x: contact.x, y: contact.y, z: contact.z, frame: null },
});

/** Request a desired aperture state; native contact and physical admission decide. */
export const setStructureOpen = (worker: EntityId, site: EntityId, open: boolean): ActionRequest => ({
  kind: "set-structure-open", worker, site, open,
});

export const deconstruct = (worker: EntityId, site: EntityId): ActionRequest => ({
  kind: "deconstruct", worker, site,
});
