import { command, entity, query } from "../sdk/authoring";
import { ConstructionSite, planConstruction } from "../sdk/construction";
import { placementOrientation } from "../sdk/placement";
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
      const [x, supportY, z] = cell;
      const y = supportY + (definition.shape.kind === "wall" ? 1 : 0);
      const id = entity(`colony.build.${definition.id}.${x}.${y}.${z}.${orientation}`);
      if (sites.some(site => site.id === id)) continue;
      const supports: [number, number, number][] = [];
      for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) for (const dy of [0, -1, 1]) supports.push([x + dx, supportY + dy, z + dz]);
      const facts = context.physicalContacts(supports.flatMap(([cx, cy, cz]) => [[cx, cy, cz], [cx, cy + 1, cz]] as [number, number, number][]));
      const index = supports.findIndex((_, i) => {
        const foot = facts[i * 2], head = facts[i * 2 + 1];
        return !foot.outside && (foot.solid || foot.sealedTop) && !head.outside && !head.solid && !head.sealedTop;
      });
      if (index < 0) throw new Error("No clear working surface beside this building");
      const [cx, cy, cz] = supports[index];
      actions.push(planConstruction(id, definition.id, { x, y, z }, orientation,
        { x: cx, y: (cy + 0.5) * colonyEnvironment.world.verticalMetres, z: cz }));
    }
    return { writes: [], actions };
  },
});
