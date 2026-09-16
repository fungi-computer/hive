import { command, entity, query } from "../sdk/authoring";
import { clearStockpile, designateStockpile, updateStockpile } from "../sdk/stockpile";
import { StockpileCell } from "../sdk/stockpile";
import { Position } from "../sdk/common";
import { colonyEnvironment } from "./colony-environment";
import type { GameCommandContext } from "../contracts";
import { z } from "zod";

const cell = z.tuple([
  z.number().int().min(-1_000_000).max(1_000_000),
  z.number().int().min(-1_000_000).max(1_000_000),
  z.number().int().min(-1_000_000).max(1_000_000),
]);
const area = z.object({ start: cell, end: cell }).strict();
export const colonyStockpileInputSchema = z.object({
  area,
  filterProfile: z.enum(["wood", "food", "spoil"]),
  priority: z.number().int().min(1).max(100),
}).strict();
export const colonyStockpilePolicyInputSchema = z.object({ cell: z.string().min(1).max(128), filterProfile: z.enum(["wood", "food", "spoil"]).optional(), priority: z.number().int().min(1).max(100).optional() }).strict().refine(value => value.filterProfile !== undefined || value.priority !== undefined, { message: "Choose a stockpile profile or priority" });

function cellsFor(areaValue: z.infer<typeof area>): readonly { x: number; y: number; z: number }[] {
  const [startX, y, startZ] = areaValue.start;
  const [endX, endY, endZ] = areaValue.end;
  if (y !== endY) throw new Error("Stockpile area must stay on one level");
  const cells: { x: number; y: number; z: number }[] = [];
  for (let z = Math.min(startZ, endZ); z <= Math.max(startZ, endZ); z++)
    for (let x = Math.min(startX, endX); x <= Math.max(startX, endX); x++)
      cells.push({ x, y, z });
  if (cells.length > 256) throw new Error("Stockpile area exceeds 256 cells");
  return cells;
}
function zoneFor(areaValue: z.infer<typeof area>) {
  const x0 = Math.min(areaValue.start[0], areaValue.end[0]);
  const x1 = Math.max(areaValue.start[0], areaValue.end[0]);
  const z0 = Math.min(areaValue.start[2], areaValue.end[2]);
  const z1 = Math.max(areaValue.start[2], areaValue.end[2]);
  return entity(`colony.stockpile.${x0}.${areaValue.start[1]}.${z0}.${x1}.${z1}`);
}
function zoneForExistingArea(context: GameCommandContext, areaValue: z.infer<typeof area>) {
  const cells = cellsFor(areaValue);
  const row = context.query(query(StockpileCell, Position)).find(candidate => {
    const position = candidate.get(Position);
    const coordinate = { x: Math.round(position.x), y: Math.floor(position.y / colonyEnvironment.world.verticalMetres), z: Math.round(position.z) };
    return cells.some(cell => cell.x === coordinate.x && cell.y === coordinate.y && cell.z === coordinate.z);
  });
  return row ? entity(row.get(StockpileCell).zone) : zoneFor(areaValue);
}

/** Colony chooses the bounded profile; native stockpile admission owns floor/conflict atomicity. */
export const colonyStockpileCommand = command({
  title: "Designate stockpile", category: "Storage", description: "Designate a floor area for physical material storage.",
  localPresentation: { bindings: [{ id: "designate-stockpile", label: "Designate stockpile", target: "terrain-area", designation: ["rectangle"] as const, preset: { filterProfile: "wood", priority: 50 } }] },
  input: colonyStockpileInputSchema,
  reads: [],
  writes: [],
  run: (context, value) => {
    if (context.scope.kind !== "player") throw new Error("stockpile designation requires a player party");
    return {
      writes: [],
      actions: [designateStockpile(context.scope.party, zoneFor(value.area), cellsFor(value.area).map(cell => ({
        ...cell,
        priority: value.priority,
        filterProfile: value.filterProfile,
      })))],
    };
  },
});

export const colonyStockpileClearCommand = command({
  title: "Clear stockpile", category: "Storage", description: "Remove the painted stockpile policy while preserving physical goods.",
  localPresentation: { bindings: [{ id: "clear-stockpile", label: "Clear stockpile", target: "terrain-area", designation: ["rectangle"] as const }] },
  input: z.object({ area }).strict(),
  reads: [], writes: [],
  run: (context, value) => {
    if (context.scope.kind !== "player") throw new Error("stockpile clear requires a player party");
    return { writes: [], actions: [clearStockpile(context.scope.party, zoneForExistingArea(context, value.area), cellsFor(value.area))] };
  },
});

export const colonyStockpilePolicyCommand = command({
  title: "Update stockpile", category: "Storage", description: "Change a stockpile's material profile and priority.",
  localPresentation: { bindings: [
    { id: "stockpile-profile-wood", label: "Store building materials", selection: { field: "cell", cardinality: "one" }, preset: { filterProfile: "wood" } },
    { id: "stockpile-profile-food", label: "Store food and brewing inputs", selection: { field: "cell", cardinality: "one" }, preset: { filterProfile: "food" } },
    { id: "stockpile-profile-spoil", label: "Store spoil and raw materials", selection: { field: "cell", cardinality: "one" }, preset: { filterProfile: "spoil" } },
    { id: "stockpile-priority-low", label: "Low priority", selection: { field: "cell", cardinality: "one" }, preset: { priority: 25 } },
    { id: "stockpile-priority-normal", label: "Normal priority", selection: { field: "cell", cardinality: "one" }, preset: { priority: 50 } },
    { id: "stockpile-priority-preferred", label: "Preferred priority", selection: { field: "cell", cardinality: "one" }, preset: { priority: 75 } },
  ] },
  input: colonyStockpilePolicyInputSchema,
  subjects: context => context.query(query(StockpileCell)).map(row => row.id),
  reads: [StockpileCell], writes: [],
  run: (context, value) => {
    const cell = context.query(query(StockpileCell)).find(row => row.id === value.cell);
    if (!cell) throw new Error("Choose a stockpile cell");
    const current = cell.get(StockpileCell);
    if (context.scope.kind !== "player") throw new Error("stockpile update requires a player party");
    return { writes: [], actions: [updateStockpile(context.scope.party, entity(current.zone), value.filterProfile ?? current.filterProfile, value.priority ?? current.priority)] };
  },
});
