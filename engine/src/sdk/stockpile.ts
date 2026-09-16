import { component } from "./authoring";
import type { EntityId } from "../contracts";

/** Painted policy attached to one positioned floor cell; it owns no storage. */
export const StockpileCell = component<{
  zone: string;
  priority: number;
  filterProfile: string;
}>("hive.stockpile-cell", {
  version: 1,
  fields: { zone: "string", priority: "number", filterProfile: "string" },
});

/** Authored physical shelf/rack provider. Policy is resolved live by position. */
export const StorageProvider = component<Record<string, never>>("hive.storage-provider", {
  version: 1,
  fields: {},
});

export const designateStockpile = (party: EntityId, zone: EntityId, cells: readonly { x: number; y: number; z: number; priority: number; filterProfile: string }[]) => ({
  kind: "designate-stockpile" as const, party, zone, cells: cells.map(cell => ({ ...cell, filterProfile: cell.filterProfile })),
});
export const updateStockpile = (party: EntityId, zone: EntityId, filterProfile: string, priority: number) => ({
  kind: "update-stockpile" as const, party, zone, filterProfile, priority,
});
export const clearStockpile = (party: EntityId, zone: EntityId, cells: readonly { x: number; y: number; z: number }[]) => ({
  kind: "clear-stockpile" as const, party, zone, cells,
});
