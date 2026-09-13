import { command, entity } from "../sdk/authoring";
import { designateStockpile } from "../sdk/stockpile";
import { z } from "zod";

const cell = z.tuple([
  z.number().int().min(-1_000_000).max(1_000_000),
  z.number().int().min(-1_000_000).max(1_000_000),
  z.number().int().min(-1_000_000).max(1_000_000),
]);
const area = z.object({ start: cell, end: cell }).strict();
export const colonyStockpileInputSchema = z.object({
  area,
  filterProfile: z.enum(["wood", "food"]),
  priority: z.number().int().min(1).max(100),
}).strict();

const STOCKPILE_CAPACITY = 6;

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

/** Colony chooses the bounded profile; native stockpile admission owns floor/conflict atomicity. */
export const colonyStockpileCommand = command({
  input: colonyStockpileInputSchema,
  reads: [],
  writes: [],
  run: (_context, value) => ({
    writes: [],
    actions: [designateStockpile(zoneFor(value.area), cellsFor(value.area).map(cell => ({
      ...cell,
      priority: value.priority,
      filterProfile: value.filterProfile,
      capacity: STOCKPILE_CAPACITY,
    })))],
  }),
});
