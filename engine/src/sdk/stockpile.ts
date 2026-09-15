import { component } from "./authoring";
import type { EntityId } from "../contracts";

/** Policy attached to one physical, positioned floor stockpile cell. */
export const StockpileCell = component<{
  zone: string;
  priority: number;
  filterProfile: string;
}>("hive.stockpile-cell", {
  version: 1,
  fields: { zone: "string", priority: "number", filterProfile: "string" },
});

export const designateStockpile = (party: EntityId, zone: EntityId, cells: readonly { x: number; y: number; z: number; priority: number; filterProfile: string; capacity: number }[]) => ({
  kind: "designate-stockpile" as const, party, zone, cells: cells.map(cell => ({ ...cell, filterProfile: cell.filterProfile })),
});
export const updateStockpile = (party: EntityId, zone: EntityId, filterProfile: string, priority: number) => ({
  kind: "update-stockpile" as const, party, zone, filterProfile, priority,
});
