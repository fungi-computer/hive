import { command, entity, query } from "../sdk/authoring";
import { ConstructionSite, FloorReplacement, planConstruction, replaceFloor } from "../sdk/construction";
import { placementOrientation, structureOriginCell } from "../sdk/placement";
import { colonyPlacement } from "./colony-placement";
import { colonyEnvironment } from "./colony-environment";
import { z } from "zod";

const cell = z.tuple([
  z.number().int().min(-1_000_000).max(1_000_000),
  z.number().int().min(-1_000_000).max(1_000_000),
  z.number().int().min(-1_000_000).max(1_000_000),
]);
const area = z.object({ start: cell, end: cell }).strict();
const edge = z.object({ cell, axis: z.enum(["x", "z"]) }).strict();
const target = z.union([
  z.object({ cell }).strict(),
  z.object({ area }).strict(),
  z.object({ edges: z.array(edge).min(1).max(256) }).strict(),
]);
const buildInput = z.object({
  catalog: z.string().min(1).max(128),
  orientation: z.enum(["north", "east", "south", "west"]).optional(),
  target,
}).strict();

/** Build copy is composed once beside the authoritative Goblin definition. */
export function colonyBuildBindingDetail(catalog: string, orientation?: string, environment = colonyEnvironment, placement = colonyPlacement): string {
  const definition = environment.structures.catalog.find(item => item.id === catalog);
  const policy = placement[catalog];
  if (!definition || !policy) throw new Error(`Unknown building presentation ${catalog}`);
  const cost = definition.materials.map(material => `${material.quantity} ${material.kind}`).join(" + ");
  const shape = definition.shape;
  const footprint = shape.kind === "fixture" && shape.footprint.length
    ? `${Math.max(...shape.footprint.map(([x]) => x)) - Math.min(...shape.footprint.map(([x]) => x)) + 1}×${Math.max(...shape.footprint.map(([, z]) => z)) - Math.min(...shape.footprint.map(([, z]) => z)) + 1}`
    : shape.kind === "stair" ? `${shape.run}×${shape.rise} stair` : shape.kind;
  const gesture = policy.alignment === "stroke"
    ? "drag line"
    : shape.kind === "floor" || shape.kind === "cover" ? "drag rectangle" : "click point";
  const facing = orientation ?? (policy.alignment === "stroke" ? "auto-facing" : "cardinal");
  return `${cost} · ${footprint} · ${gesture} · ${facing}`;
}

function areaCells(area: { start: [number, number, number]; end: [number, number, number] }): [number, number, number][] {
  const start = area.start, end = area.end;
  if (start[1] !== end[1])
    throw new Error("Choose a same-level build area");
  const width = Math.abs(end[0] - start[0]) + 1;
  const depth = Math.abs(end[2] - start[2]) + 1;
  if (width * depth > 256) throw new Error("Build area exceeds 256 cells");
  const cells: [number, number, number][] = [];
  for (let z = Math.min(start[2], end[2]); z <= Math.max(start[2], end[2]); z++)
    for (let x = Math.min(start[0], end[0]); x <= Math.max(start[0], end[0]); x++) cells.push([x, start[1], z]);
  return cells;
}

/** Player placement chooses content; native admission owns cost and geometry. */
export const colonyBuildCommand = command({
  title: "Build structure", category: "Construction", description: "Place a construction plan on a visible world surface.",
  localPresentation: { bindings: [
    ...["timber-floor", "timber-wall", "timber-door", "timber-roof", "timber-bed", "timber-shelf", "brew-station"].map(catalog => ({
      id: catalog, label: `Build ${catalog.replace("timber-", "")}`, target: (catalog === "timber-wall" || catalog === "timber-door" ? "world-edge" : "world-surface") as "world-edge" | "world-surface",
      designation: (catalog === "timber-wall" || catalog === "timber-door" ? ["edge-line"] : catalog === "timber-floor" || catalog === "timber-roof" ? ["point", "rectangle"] : ["point"]) as ("point" | "rectangle" | "edge-line")[],
      detail: colonyBuildBindingDetail(catalog, catalog === "timber-floor" || catalog === "timber-roof" || catalog === "timber-bed" || catalog === "timber-shelf" || catalog === "brew-station" ? "north" : undefined),
      preset: { catalog, ...(catalog === "timber-floor" || catalog === "timber-roof" || catalog === "timber-bed" || catalog === "timber-shelf" || catalog === "brew-station" ? { orientation: "north" } : {}) },
    })),
    ...["north", "east", "south", "west"].map(orientation => ({ id: `stair-${orientation}`, label: `Stair ${orientation}`, target: "world-surface" as const, designation: ["point"] as const, detail: colonyBuildBindingDetail("timber-stair", orientation), preset: { catalog: "timber-stair", orientation } })),
  ] },
  input: buildInput,
  reads: [ConstructionSite, FloorReplacement], writes: [],
  run(context, input) {
    if (context.scope.kind !== "player")
      throw new Error("building requires a player party");
    const definition = colonyEnvironment.structures.catalog.find(item => item.id === input.catalog);
    if (!definition) throw new Error("Unknown building");
    const sites = context.query(query(ConstructionSite));
    const replacements = context.query(query(FloorReplacement));
    if ("edges" in input.target) {
      if (definition.shape.kind !== "wall" && definition.shape.kind !== "aperture") throw new Error("Only boundary structures accept edge placement");
      const edges = [...new Map(input.target.edges.map(edge => [
        `${edge.cell[0]}:${edge.cell[1]}:${edge.cell[2]}:${edge.axis}`,
        edge,
      ])).values()].sort((left, right) =>
        left.cell[0] - right.cell[0]
        || left.cell[1] - right.cell[1]
        || left.cell[2] - right.cell[2]
        || left.axis.localeCompare(right.axis));
      if (sites.length + edges.length > 128) throw new Error("Construction site limit reached");
      const actions = edges.map(({ cell: [x, y, z], axis }) => {
        const targetY = y + 1;
        if (!Number.isSafeInteger(targetY)) throw new Error("Wall edge height exceeds bounds");
        const id = entity(`colony.build.${definition.id}.edge.${x}.${targetY}.${z}.${axis}`);
        return planConstruction(id, definition.id, { kind: "edge", edge: { cell: { x, y: targetY, z }, axis } }, context.scope.party);
      });
      return { writes: [], actions: actions.filter(action => !sites.some(site => site.id === action.site)) };
    }
    if (definition.shape.kind === "wall" || definition.shape.kind === "aperture") throw new Error("Boundary structures require edge placement");
    const area = "area" in input.target ? input.target.area : undefined;
    const cells = "area" in input.target
      ? areaCells(input.target.area)
      : [input.target.cell];
    if (sites.length + cells.length > 128) throw new Error("Construction site limit reached");
    const actions = [];
    for (const cell of cells) {
      const orientation = placementOrientation(colonyPlacement[input.catalog]?.alignment ?? "fixed", area, input.orientation);
      if (!["north", "east", "south", "west"].includes(orientation)) throw new Error("Choose a cardinal building orientation");
      const [x, y, z] = structureOriginCell(definition.shape, cell);
      if (definition.shape.kind === "floor") {
        const operation = context.floorOperations([{ cell, desiredCatalog: definition.id }])[0];
        if (operation.kind === "unchanged") continue;
        if (operation.kind === "conflict") throw new Error(`floor replacement conflicts with ${operation.floor}`);
        if (operation.kind === "invalid") throw new Error(operation.reason);
        if (operation.kind === "replace") {
          const generation = replacements.filter(candidate => candidate.get(FloorReplacement).targetFloor === operation.floor).length + 1;
          actions.push(replaceFloor(entity(`colony.replace.${operation.floor}.${generation}`), operation.floor, definition.id));
          continue;
        }
      }
      const id = entity(`colony.build.${definition.id}.${x}.${y}.${z}.${orientation}`);
      if (sites.some(site => site.id === id)) continue;
      actions.push(planConstruction(id, definition.id, { kind: "cell", cell: { x, y, z }, orientation }, context.scope.party));
    }
    return { writes: [], actions };
  },
});
