import { component } from "./authoring";
import type { ActionRequest, CardinalOrientation, ConstructionTarget, EntityId, PlacementCandidate, Vec3 } from "../contracts";

/** Native custody is observable; authored writes cannot lock or unlock goods. */
export const SealedContainer = component<Record<string, never>>("hive.sealed-container", {
  version: 1, fields: {},
});

export interface ConstructionSiteState {
  catalog: string;
  targetKind: "cell" | "edge";
  targetX: number; targetY: number; targetZ: number;
  targetDirection: CardinalOrientation | "x" | "z";
  seconds: number;
  phase: "planned" | "working" | "finished";
}

/** The site owns earned effort; active worker ownership lives in WorkAttempt. */
export const ConstructionSite = component<ConstructionSiteState>("hive.construction-site", {
  version: 2,
  fields: {
    catalog: "string", targetKind: "string", targetX: "number", targetY: "number", targetZ: "number", targetDirection: "string",
    seconds: "number", phase: "string",
  },
});

/** Decode the native flat component wire into its exhaustive physical target. */
export function constructionTarget(site: ConstructionSiteState): ConstructionTarget {
  const cell = { x: site.targetX, y: site.targetY, z: site.targetZ };
  if (site.targetKind === "edge" && (site.targetDirection === "x" || site.targetDirection === "z"))
    return { kind: "edge", edge: { cell, axis: site.targetDirection } };
  if (site.targetKind === "cell" && (site.targetDirection === "north" || site.targetDirection === "east"
    || site.targetDirection === "south" || site.targetDirection === "west"))
    return { kind: "cell", cell, orientation: site.targetDirection };
  throw new Error("Invalid native construction target");
}

export function constructionCell(site: ConstructionSiteState): Vec3 {
  const target = constructionTarget(site);
  return target.kind === "cell" ? target.cell : target.edge.cell;
}
export const FloorReplacement = component<{
  version: number; targetFloor: EntityId; expectedCatalog: string; desiredCatalog: string;
  supportX: number; supportY: number; supportZ: number;
  phase: "queued" | "working" | "completed" | "cancelled";
}>("hive.floor-replacement", { version: 1, fields: { version: "number", targetFloor: "entity", expectedCatalog: "string", desiredCatalog: "string", supportX: "number", supportY: "number", supportZ: "number", phase: "string" } });

export const replaceFloor = (orderId: EntityId, existingFloorId: EntityId, desiredCatalog: string): ActionRequest => ({
  kind: "replace-floor", orderId, existingFloorId, desiredCatalog,
});

export const planConstructions = (party: EntityId, plans: readonly PlacementCandidate[]): ActionRequest => ({
  kind: "plan-constructions", party, plans,
});

export const bindConstructionStage = (site: EntityId, contact: Vec3): ActionRequest => ({
  kind: "bind-construction-stage", site,
  contact: { x: contact.x, y: contact.y, z: contact.z, frame: null },
});

/** Request a desired aperture state; native contact and physical admission decide. */
export const setStructureOpen = (worker: EntityId, site: EntityId, open: boolean): ActionRequest => ({
  kind: "set-structure-open", worker, site, open,
});

export const deconstruct = (worker: EntityId, site: EntityId): ActionRequest => ({
  kind: "deconstruct", worker, site,
});
