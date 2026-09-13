import { component, entity, query } from "./authoring";
import { DeliveryTask } from "./delivery";
import { GroundStock } from "./ground-stock";
import { SealedContainer } from "./construction";
import { Container, FiniteResource, MaterialLot, Position } from "./common";
import type { EntityId, WriteContext } from "../contracts";

const MAX_CELLS = 256;
const MAX_QUANTITY = 0xffffffff;
const MAX_ID_LENGTH = 256;

/** Policy attached to one physical, positioned floor stockpile cell. */
export const StockpileCell = component<{
  zone: string;
  priority: number;
  filterProfile: string;
}>("hive.stockpile-cell", {
  version: 1,
  fields: { zone: "string", priority: "number", filterProfile: "string" },
});

function validText(value: string): boolean {
  return value.length > 0 && value.length <= 128 && /^[A-Za-z0-9._:-]+$/.test(value);
}
function validInt(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0 && value <= MAX_QUANTITY;
}
function compareId(a: EntityId, b: EntityId): number { return a < b ? -1 : a > b ? 1 : 0; }
export const designateStockpile = (zone: EntityId, cells: readonly { x: number; y: number; z: number; priority: number; filterProfile: string; capacity: number }[]) => ({
  kind: "designate-stockpile" as const, zone, cells: cells.map(cell => ({ ...cell, filterProfile: cell.filterProfile })),
});
export const updateStockpile = (zone: EntityId, filterProfile: string, priority: number) => ({
  kind: "update-stockpile" as const, zone, filterProfile, priority,
});

export type StockpileFilterProfile = {
  /** Content-owned category for each supported material kind. */
  readonly materialCategories: Readonly<Record<string, string>>;
  readonly allowedCategories: readonly string[];
  readonly allowedMaterials?: readonly string[];
  readonly deniedMaterials?: readonly string[];
};

export type StockpilePlanningOptions = {
  /** Content-owned profile IDs; the planner never branches on item names. */
  readonly filterProfiles: Readonly<Record<string, StockpileFilterProfile>>;
};

function taskId(cell: EntityId, lot: EntityId): EntityId {
  const id = `stockpile.delivery.${cell.length}:${cell}.${lot.length}:${lot}`;
  if (id.length > MAX_ID_LENGTH) throw new Error("stockpile delivery identity exceeds bound");
  return entity(id);
}

/** Create ordinary DeliveryTask claims for eligible ground lots. */
export function planStockpileDeliveries(context: WriteContext, options: StockpilePlanningOptions): readonly EntityId[] {
  const cells = context.query(query(StockpileCell));
  if (cells.length > MAX_CELLS) throw new Error("stockpile cell bound exceeded");
  const cellIds = new Set(cells.map(row => row.id));
  const containers = new Map(context.query(query(Container)).map(row => [row.id, row.get(Container)]));
  const positions = new Set(context.query(query(Position)).map(row => row.id));
  const sealed = new Set(context.query(query(SealedContainer)).map(row => row.id));
  const ground = new Set(context.query(query(GroundStock)).map(row => row.id));
  // Finite-resource sources are native loose stock containers after extraction.
  // This capability check keeps the planner independent of authored content IDs.
  const exhaustedFinite = new Set(context.query(query(FiniteResource))
    .filter(row => row.get(FiniteResource).quantity === 0)
    .map(row => row.id));
  const lots = context.query(query(MaterialLot));
  const tasks = context.query(query(DeliveryTask));
  const sourceCell = new Map(cells.map(cell => [cell.id, cell.get(StockpileCell)]));
  const lotById = new Map(lots.map(row => [row.id, row.get(MaterialLot)]));
  const quantities = new Map<EntityId, number>();
  for (const row of lots) {
    const lot = row.get(MaterialLot);
    if (!validInt(lot.quantity)) continue;
    const total = (quantities.get(lot.container) ?? 0) + lot.quantity;
    if (total <= MAX_QUANTITY) quantities.set(lot.container, total);
  }
  const claimedLots = new Set<EntityId>();
  const incomingByCell = new Map<EntityId, number>();
  for (const row of tasks) {
    const task = row.get(DeliveryTask);
    if (task.phase === "complete") continue;
    claimedLots.add(task.sourceLot);
    if (cellIds.has(task.destination) && validInt(task.quantity) && task.quantity > 0) {
      const incoming = (incomingByCell.get(task.destination) ?? 0) + task.quantity;
      if (incoming <= MAX_QUANTITY) incomingByCell.set(task.destination, incoming);
    }
  }
  const orderedCells = [...cells].sort((a, b) => {
    const left = a.get(StockpileCell), right = b.get(StockpileCell);
    return right.priority - left.priority || compareId(a.id, b.id);
  });
  const created: EntityId[] = [];
  const sourceLots = lots.map(row => ({ id: row.id, lot: row.get(MaterialLot) }))
    .filter(({ id, lot }) => (ground.has(lot.container) || sourceCell.has(lot.container) || exhaustedFinite.has(lot.container)) && !claimedLots.has(id) && lot.quantity > 0 && validInt(lot.quantity))
    .sort((a, b) => compareId(a.id, b.id));
  for (const row of orderedCells) {
    if (sealed.has(row.id) || !containers.has(row.id) || !positions.has(row.id)) continue;
    const policy = row.get(StockpileCell);
    const profile = options.filterProfiles[policy.filterProfile];
    const container = containers.get(row.id);
    if (!container || !profile || typeof profile !== "object" || !profile.materialCategories || typeof profile.materialCategories !== "object" || !Array.isArray(profile.allowedCategories) || profile.allowedCategories.length > 64 || (profile.allowedMaterials !== undefined && !Array.isArray(profile.allowedMaterials)) || (profile.deniedMaterials !== undefined && !Array.isArray(profile.deniedMaterials)) || !validText(policy.filterProfile) || !validInt(container.capacity) || container.capacity <= 0) continue;
    const categories = new Set(profile.allowedCategories.filter(validText));
    const allowedMaterials = new Set((profile.allowedMaterials ?? []).filter(validText));
    const deniedMaterials = new Set((profile.deniedMaterials ?? []).filter(validText));
    if (categories.size !== profile.allowedCategories.length || allowedMaterials.size !== (profile.allowedMaterials ?? []).length || deniedMaterials.size !== (profile.deniedMaterials ?? []).length) continue;
    if (!Object.entries(profile.materialCategories).every(([material, category]) => validText(material) && validText(category))) continue;
    const accepts = (material: string) => !deniedMaterials.has(material) &&
      (allowedMaterials.has(material) || (typeof profile.materialCategories?.[material] === "string" && categories.has(profile.materialCategories[material])));
    const used = quantities.get(row.id) ?? 0;
    let free = container.capacity - used - (incomingByCell.get(row.id) ?? 0);
    if (free <= 0) continue;
    for (const source of sourceLots) {
      if (free <= 0) break;
      if (!accepts(source.lot.kind) || sealed.has(source.lot.container) || source.lot.container === row.id || (quantities.get(source.lot.container) ?? 0) > MAX_QUANTITY) continue;
      const prior = sourceCell.get(source.lot.container);
      if (prior && policy.priority <= prior.priority) continue;
      const sourceContainer = source.lot.container;
      if (!containers.has(sourceContainer)) continue;
      const quantity = Math.min(source.lot.quantity, free);
      if (!validInt(quantity) || quantity <= 0) continue;
      const id = taskId(row.id, source.id);
      if (tasks.some(task => task.id === id)) continue;
      context.createAuthoredEntity({ id, components: { [DeliveryTask.id]: {
        actor: null, sourceLot: source.id, source: sourceContainer, destination: row.id,
        material: source.lot.kind, quantity, phase: "idle",
      }}});
      created.push(id);
      claimedLots.add(source.id);
      free -= quantity;
      incomingByCell.set(row.id, (incomingByCell.get(row.id) ?? 0) + quantity);
    }
  }
  return created;
}
