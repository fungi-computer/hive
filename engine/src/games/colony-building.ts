import { command, entity, query } from "../sdk/authoring";
import { ConstructionSite, planConstruction } from "../sdk/construction";
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
const target = z.union([
  z.object({ cell }).strict(),
  z.object({ area }).strict(),
]);
const buildInput = z.object({
  catalog: z.string().min(1).max(128),
  orientation: z.enum(["north", "east", "south", "west"]).optional(),
  target,
}).strict();

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
  input: buildInput,
  reads: [ConstructionSite], writes: [],
  run(context, input) {
    const definition = colonyEnvironment.structures.catalog.find(item => item.id === input.catalog);
    if (!definition) throw new Error("Unknown building");
    const sites = context.query(query(ConstructionSite));
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
      const id = entity(`colony.build.${definition.id}.${x}.${y}.${z}.${orientation}`);
      if (sites.some(site => site.id === id)) continue;
      actions.push(planConstruction(id, definition.id, { x, y, z }, orientation));
    }
    return { writes: [], actions };
  },
});
