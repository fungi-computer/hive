import { component, entity, query } from "./authoring";
import { DeliveryTask } from "./delivery";
import { GroundStock } from "./ground-stock";
import { SealedContainer } from "./construction";
import { Container, MaterialLot, Position } from "./common";
import type { EntityId, EntityRecord, WriteContext } from "../contracts";

const MAX_CELLS = 256;
const MAX_ID_LENGTH = 128;
const MAX_QUANTITY = 0xffffffff;

/** Policy attached to one physical, positioned floor stockpile cell. */
export const StockpileCell = component<{
  zone: string;
  priority: number;
  filterProfile: string;
  capacity: number;
}>("hive.stockpile-cell", {
  version: 1,
  fields: { zone: "string", priority: "number", filterProfile: "string", capacity: "number" },
});

export type StockpileCellSpec = {
  readonly zone: EntityId;
  readonly cell: readonly [number, number, number];
  readonly priority: number;
  readonly filterProfile: string;
  readonly capacity: number;
};

function validText(value: string): boolean {
  return value.length > 0 && value.length <= 128 && /^[A-Za-z0-9._:-]+$/.test(value);
}
function validInt(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0 && value <= MAX_QUANTITY;
}
function compareId(a: EntityId, b: EntityId): number { return a < b ? -1 : a > b ? 1 : 0; }
function compareCell(a: readonly [number, number, number], b: readonly [number, number, number]): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}
function cellKey(cell: readonly [number, number, number]): string { return `${cell[0]},${cell[1]},${cell[2]}`; }

export function stockpileCellId(zone: EntityId, cell: readonly [number, number, number]): EntityId {
  const id = `stockpile.${zone.length}:${zone}.${cell[0]}.${cell[1]}.${cell[2]}`;
  if (id.length > MAX_ID_LENGTH) throw new Error("stockpile cell identity exceeds bound");
  return entity(id);
}

/** Build the bounded authored records for a designated set of floor cells. */
export function stockpileCellRecords(specs: readonly StockpileCellSpec[]): readonly EntityRecord[] {
  if (!Array.isArray(specs) || specs.length === 0 || specs.length > MAX_CELLS)
    throw new Error("stockpile cell bound exceeded");
  const seen = new Set<string>();
  const records = [...specs].sort((a, b) => compareId(a.zone, b.zone) || compareCell(a.cell, b.cell));
  return records.map((spec) => {
    if (!Array.isArray(spec.cell) || spec.cell.length !== 3 || !spec.cell.every(Number.isSafeInteger))
      throw new Error("invalid stockpile cell");
    entity(spec.zone);
    if (!validText(spec.zone) || !validText(spec.filterProfile) || !validInt(spec.priority) || !validInt(spec.capacity) || spec.capacity <= 0)
      throw new Error("invalid stockpile policy");
    const key = `${spec.zone}\0${cellKey(spec.cell)}`;
    if (seen.has(key)) throw new Error("duplicate stockpile cell");
    seen.add(key);
    const id = stockpileCellId(spec.zone, spec.cell);
    return {
      id,
      components: {
        [StockpileCell.id]: { zone: spec.zone, priority: spec.priority, filterProfile: spec.filterProfile, capacity: spec.capacity },
        [Container.id]: { capacity: spec.capacity },
        [Position.id]: { x: spec.cell[0], y: spec.cell[1], z: spec.cell[2], facing: 0 },
      },
    };
  });
}

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
  const claimedCells = new Set<EntityId>();
  for (const row of tasks) {
    const task = row.get(DeliveryTask);
    if (task.phase === "complete") continue;
    claimedLots.add(task.sourceLot);
    if (cellIds.has(task.destination)) claimedCells.add(task.destination);
  }
  const orderedCells = [...cells].sort((a, b) => {
    const left = a.get(StockpileCell), right = b.get(StockpileCell);
    return right.priority - left.priority || compareId(a.id, b.id);
  });
  const created: EntityId[] = [];
  const sourceLots = lots.map(row => ({ id: row.id, lot: row.get(MaterialLot) }))
    .filter(({ id, lot }) => (ground.has(lot.container) || sourceCell.has(lot.container)) && !claimedLots.has(id) && lot.quantity > 0 && validInt(lot.quantity))
    .sort((a, b) => compareId(a.id, b.id));
  for (const row of orderedCells) {
    if (claimedCells.has(row.id) || sealed.has(row.id) || !containers.has(row.id) || !positions.has(row.id)) continue;
    const policy = row.get(StockpileCell);
    const profile = options.filterProfiles[policy.filterProfile];
    if (!profile || typeof profile !== "object" || !profile.materialCategories || typeof profile.materialCategories !== "object" || !Array.isArray(profile.allowedCategories) || profile.allowedCategories.length > 64 || (profile.allowedMaterials !== undefined && !Array.isArray(profile.allowedMaterials)) || (profile.deniedMaterials !== undefined && !Array.isArray(profile.deniedMaterials)) || !validText(policy.filterProfile) || !validInt(policy.capacity) || policy.capacity <= 0) continue;
    const categories = new Set(profile.allowedCategories.filter(validText));
    const allowedMaterials = new Set((profile.allowedMaterials ?? []).filter(validText));
    const deniedMaterials = new Set((profile.deniedMaterials ?? []).filter(validText));
    if (categories.size !== profile.allowedCategories.length || allowedMaterials.size !== (profile.allowedMaterials ?? []).length || deniedMaterials.size !== (profile.deniedMaterials ?? []).length) continue;
    if (!Object.entries(profile.materialCategories).every(([material, category]) => validText(material) && validText(category))) continue;
    const accepts = (material: string) => !deniedMaterials.has(material) &&
      (allowedMaterials.has(material) || (typeof profile.materialCategories?.[material] === "string" && categories.has(profile.materialCategories[material])));
    const used = quantities.get(row.id) ?? 0;
    const free = policy.capacity - used;
    if (free <= 0) continue;
    const source = sourceLots.find(({ lot }) => {
      if (!accepts(lot.kind) || sealed.has(lot.container) || lot.container === row.id || (quantities.get(lot.container) ?? 0) > MAX_QUANTITY) return false;
      const prior = sourceCell.get(lot.container);
      // Re-hauling is only useful toward a strictly better priority cell.
      return !prior || policy.priority > prior.priority;
    });
    if (!source) continue;
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
    claimedCells.add(row.id);
  }
  return created;
}
