import { z } from "zod";
import { component, entity } from "./authoring";
import type { ActionRequest, CardinalOrientation, ConstructionTarget, EntityId, FloorOperation, PlacementCandidate, Vec3 } from "../contracts";
import type { EnvironmentStructureDefinition } from "./environment";
import { placementOrientation, structureOriginCell, type PlacementAlignment, type PlacementArea } from "./placement";

const placementCellSchema = z.tuple([
  z.number().int().min(-1_000_000).max(1_000_000),
  z.number().int().min(-1_000_000).max(1_000_000),
  z.number().int().min(-1_000_000).max(1_000_000),
]);
const placementAreaSchema = z.object({ start: placementCellSchema, end: placementCellSchema }).strict();
const placementEdgeSchema = z.object({ cell: placementCellSchema, axis: z.enum(["x", "z"]) }).strict();

/** Friendly gesture input. Physical admission remains native and transactional. */
export const constructionProposalInput = z.object({
  catalog: z.string().min(1).max(128),
  orientation: z.enum(["north", "east", "south", "west"]).optional(),
  target: z.union([
    z.object({ cell: placementCellSchema }).strict(),
    z.object({ area: placementAreaSchema }).strict(),
    z.object({ edges: z.array(placementEdgeSchema).min(1).max(256) }).strict(),
  ]),
}).strict();

export type ConstructionProposalInput = z.infer<typeof constructionProposalInput>;

function areaCells(area: PlacementArea): readonly (readonly [number, number, number])[] {
  if (area.start[1] !== area.end[1]) throw new Error("Choose a same-level build area");
  const width = Math.abs(area.end[0] - area.start[0]) + 1;
  const depth = Math.abs(area.end[2] - area.start[2]) + 1;
  if (width * depth > 256) throw new Error("Build area exceeds 256 cells");
  const cells: [number, number, number][] = [];
  for (let z = Math.min(area.start[2], area.end[2]); z <= Math.max(area.start[2], area.end[2]); z++)
    for (let x = Math.min(area.start[0], area.end[0]); x <= Math.max(area.start[0], area.end[0]); x++)
      cells.push([x, area.start[1], z]);
  return cells;
}

function constructionSite(namespace: string, definition: EnvironmentStructureDefinition, target: ConstructionTarget): EntityId {
  if (!namespace || !/^[A-Za-z0-9._:-]+$/.test(namespace)) throw new Error("Invalid construction namespace");
  if (target.kind === "edge") {
    const { x, y, z } = target.edge.cell;
    return entity(`${namespace}.${definition.id}.edge.${x}.${y}.${z}.${target.edge.axis}`);
  }
  const { x, y, z } = target.cell;
  return entity(`${namespace}.${definition.id}.${x}.${y}.${z}.${target.orientation}`);
}

/**
 * Compile a creator gesture into canonical physical proposals. The definition
 * owns shape; this layer owns normalization; native placement owns permission.
 */
export function constructionCandidates(
  definition: EnvironmentStructureDefinition,
  alignment: PlacementAlignment,
  raw: ConstructionProposalInput,
  namespace: string,
): readonly PlacementCandidate[] {
  const input = constructionProposalInput.parse(raw);
  if (input.catalog !== definition.id) throw new Error("Construction proposal does not match its definition");
  if ("edges" in input.target) {
    if (definition.shape.kind !== "wall" && definition.shape.kind !== "aperture")
      throw new Error("Only boundary structures accept edge placement");
    const edges = [...new Map(input.target.edges.map(value => [
      `${value.cell[0]}:${value.cell[1]}:${value.cell[2]}:${value.axis}`,
      value,
    ])).values()].sort((left, right) =>
      left.cell[0] - right.cell[0]
      || left.cell[1] - right.cell[1]
      || left.cell[2] - right.cell[2]
      || left.axis.localeCompare(right.axis));
    return edges.map(({ cell: [x, y, z], axis }) => {
      const targetY = y + 1;
      if (!Number.isSafeInteger(targetY)) throw new Error("Wall edge height exceeds bounds");
      const target: ConstructionTarget = { kind: "edge", edge: { cell: { x, y: targetY, z }, axis } };
      return { site: constructionSite(namespace, definition, target), catalog: definition.id, target };
    });
  }
  if (definition.shape.kind === "wall" || definition.shape.kind === "aperture")
    throw new Error("Boundary structures require edge placement");
  const area = "area" in input.target ? input.target.area : undefined;
  const cells = area ? areaCells(area) : [input.target.cell];
  return cells.map(support => {
    const orientation = placementOrientation(alignment, area, input.orientation);
    const [x, y, z] = structureOriginCell(definition.shape, support);
    const target: ConstructionTarget = { kind: "cell", cell: { x, y, z }, orientation };
    return { site: constructionSite(namespace, definition, target), catalog: definition.id, target };
  });
}

export interface ConstructionPlanOptions {
  readonly party: EntityId;
  readonly definition: EnvironmentStructureDefinition;
  readonly candidates: readonly PlacementCandidate[];
  readonly existingSites: readonly EntityId[];
  readonly floorOperations: (requests: readonly {
    readonly cell: readonly [number, number, number];
    readonly desiredCatalog: string;
  }[]) => readonly FloorOperation[];
  readonly replacementGenerations: ReadonlyMap<EntityId, number>;
  readonly replacementId: (floor: EntityId, generation: number) => EntityId;
}

/**
 * Turn checked proposals into ordinary engine actions. This resolves existing
 * floors and duplicate sites; native action admission still rechecks all laws.
 */
export function constructionPlanActions(options: ConstructionPlanOptions): readonly ActionRequest[] {
  const existing = new Set(options.existingSites);
  const candidates = options.candidates.filter(candidate => {
    if (candidate.catalog !== options.definition.id)
      throw new Error("Construction candidate does not match its definition");
    return !existing.has(candidate.site);
  });
  if (options.definition.shape.kind !== "floor")
    return candidates.length ? [planConstructions(options.party, candidates)] : [];

  const floorCandidates = candidates.map(candidate => {
    if (candidate.target.kind !== "cell") throw new Error("Floor construction requires cell placement");
    const { x, y, z } = candidate.target.cell;
    return { candidate, request: { cell: [x, y, z] as const, desiredCatalog: options.definition.id } };
  });
  if (floorCandidates.length === 0) return [];
  const operations = options.floorOperations(floorCandidates.map(({ request }) => request));
  if (operations.length !== floorCandidates.length) throw new Error("Floor operation result count mismatch");

  const actions: ActionRequest[] = [];
  const plans: PlacementCandidate[] = [];
  for (let index = 0; index < floorCandidates.length; index++) {
    const { candidate } = floorCandidates[index]!;
    const operation = operations[index]!;
    switch (operation.kind) {
      case "build": case "waiting-for-support": plans.push(candidate); break;
      case "unchanged": break;
      case "conflict": throw new Error(`floor replacement conflicts with ${operation.floor}`);
      case "invalid": throw new Error(operation.reason);
      case "replace": {
        const generation = (options.replacementGenerations.get(operation.floor) ?? 0) + 1;
        actions.push(replaceFloor(options.replacementId(operation.floor, generation), operation.floor, options.definition.id));
        break;
      }
    }
  }
  if (plans.length) actions.push(planConstructions(options.party, plans));
  return actions;
}

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
