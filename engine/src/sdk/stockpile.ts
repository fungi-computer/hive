import { component, entity, query } from "./authoring";
import { DeliveryTask } from "./delivery";
import { GroundStock } from "./ground-stock";
import { SealedContainer } from "./construction";
import { Container, FiniteResource, MaterialLot, Position } from "./common";
import { OwnedByParty } from "./party";
import type { EntityId, QueryRow, WriteContext } from "../contracts";

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
function addChecked(map: Map<string, number>, key: string, quantity: number): void {
  const total = (map.get(key) ?? 0) + quantity;
  if (!Number.isSafeInteger(total) || total > MAX_QUANTITY) throw new Error("stockpile source reservation overflow");
  map.set(key, total);
}
function compareId(a: EntityId, b: EntityId): number { return a < b ? -1 : a > b ? 1 : 0; }
export const designateStockpile = (party: EntityId, zone: EntityId, cells: readonly { x: number; y: number; z: number; priority: number; filterProfile: string; capacity: number }[]) => ({
  kind: "designate-stockpile" as const, party, zone, cells: cells.map(cell => ({ ...cell, filterProfile: cell.filterProfile })),
});
export const updateStockpile = (party: EntityId, zone: EntityId, filterProfile: string, priority: number) => ({
  kind: "update-stockpile" as const, party, zone, filterProfile, priority,
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
  /** Maximum quantity assigned to one ordinary carrier obligation. */
  readonly batchQuantity?: number;
};

function taskId(cell: EntityId, lot: EntityId, leg = 0): EntityId {
  const suffix = leg === 0 ? "" : `.${leg}`;
  const id = `stockpile.delivery.${cell.length}:${cell}.${lot.length}:${lot}${suffix}`;
  if (id.length > MAX_ID_LENGTH) throw new Error("stockpile delivery identity exceeds bound");
  return entity(id);
}

type StockpileIndexes = {
  cells: readonly QueryRow[];
  containers: Map<EntityId, { capacity: number }>;
  positions: Set<EntityId>;
  sealed: Set<EntityId>;
  owners: Map<EntityId, EntityId>;
  sourceCell: Map<EntityId, { zone: string; priority: number; filterProfile: string }>;
  quantities: Map<EntityId, number>;
  reservedByLot: Map<EntityId, number>;
  reservedBySourceMaterial: Map<string, number>;
  sourceMaterialTotals: Map<string, number>;
  nextLegByLot: Map<string, number>;
  incomingByCell: Map<EntityId, number>;
  plannedIds: Set<EntityId>;
  sourceLots: { id: EntityId; lot: { quantity: number; kind: string; container: EntityId } }[];
};

function indexStockpilePlanningState(context: WriteContext): StockpileIndexes {
  const cells = context.query(query(StockpileCell));
  if (cells.length > MAX_CELLS) throw new Error("stockpile cell bound exceeded");
  const cellIds = new Set(cells.map(row => row.id));
  const containers = new Map(context.query(query(Container)).map(row => [row.id, row.get(Container)]));
  const positions = new Set(context.query(query(Position)).map(row => row.id));
  const sealed = new Set(context.query(query(SealedContainer)).map(row => row.id));
  const ground = new Set(context.query(query(GroundStock)).map(row => row.id));
  const exhaustedFinite = new Set(context.query(query(FiniteResource))
    .filter(row => row.get(FiniteResource).quantity === 0)
    .map(row => row.id));
  const lots = context.query(query(MaterialLot));
  const tasks = context.query(query(DeliveryTask));
  const owners = new Map(context.query(query(OwnedByParty)).map(row => [row.id, row.get(OwnedByParty).party]));
  const sourceCell = new Map(cells.map(cell => [cell.id, cell.get(StockpileCell)]));
  const quantities = new Map<EntityId, number>();
  for (const row of lots) {
    const lot = row.get(MaterialLot);
    if (!validInt(lot.quantity)) continue;
    const total = (quantities.get(lot.container) ?? 0) + lot.quantity;
    if (total <= MAX_QUANTITY) quantities.set(lot.container, total);
  }
  const reservedByLot = new Map<EntityId, number>();
  const reservedBySourceMaterial = new Map<string, number>();
  const sourceMaterialTotals = new Map<string, number>();
  for (const row of lots) {
    const lot = row.get(MaterialLot);
    if (!validInt(lot.quantity) || lot.quantity <= 0) continue;
    addChecked(sourceMaterialTotals, `${lot.container}\0${lot.kind}`, lot.quantity);
  }
  const incomingByCell = new Map<EntityId, number>();
  for (const row of tasks) {
    const task = row.get(DeliveryTask);
    if (task.custody === "delivered") continue;
    if (validInt(task.quantity) && task.quantity > 0) {
      reservedByLot.set(task.sourceLot, (reservedByLot.get(task.sourceLot) ?? 0) + task.quantity);
      const key = `${task.source}\0${task.material}`;
      reservedBySourceMaterial.set(key, (reservedBySourceMaterial.get(key) ?? 0) + task.quantity);
    }
    if (cellIds.has(task.destination) && validInt(task.quantity) && task.quantity > 0) {
      const incoming = (incomingByCell.get(task.destination) ?? 0) + task.quantity;
      if (incoming <= MAX_QUANTITY) incomingByCell.set(task.destination, incoming);
    }
  }
  const sourceLots = lots.map(row => ({ id: row.id, lot: row.get(MaterialLot) }))
    .filter(({ id, lot }) => (ground.has(lot.container) || sourceCell.has(lot.container) || exhaustedFinite.has(lot.container)) && lot.quantity > 0 && validInt(lot.quantity))
    .sort((a, b) => compareId(a.id, b.id));
  return {
    cells, containers, positions, sealed, owners, sourceCell,
    quantities, reservedByLot, reservedBySourceMaterial, sourceMaterialTotals,
    nextLegByLot: new Map(), incomingByCell, plannedIds: new Set(tasks.map(task => task.id)), sourceLots,
  };
}

type StockpilePolicy = {
  party: EntityId;
  accepts: (material: string) => boolean;
  free: number;
};

function validateStockpilePolicy(
  row: QueryRow,
  indexes: StockpileIndexes,
  options: StockpilePlanningOptions,
): StockpilePolicy | undefined {
  const policy = row.get(StockpileCell);
  const party = indexes.owners.get(row.id);
  if (!party) throw new Error("stockpile cell has no party owner");
  const profile = options.filterProfiles[policy.filterProfile];
  const container = indexes.containers.get(row.id);
  if (!container || !profile || typeof profile !== "object" || !profile.materialCategories || typeof profile.materialCategories !== "object" || !Array.isArray(profile.allowedCategories) || profile.allowedCategories.length > 64 || (profile.allowedMaterials !== undefined && !Array.isArray(profile.allowedMaterials)) || (profile.deniedMaterials !== undefined && !Array.isArray(profile.deniedMaterials)) || !validText(policy.filterProfile) || !validInt(container.capacity) || container.capacity <= 0) return undefined;
  const categories = new Set(profile.allowedCategories.filter(validText));
  const allowedMaterials = new Set((profile.allowedMaterials ?? []).filter(validText));
  const deniedMaterials = new Set((profile.deniedMaterials ?? []).filter(validText));
  if (categories.size !== profile.allowedCategories.length || allowedMaterials.size !== (profile.allowedMaterials ?? []).length || deniedMaterials.size !== (profile.deniedMaterials ?? []).length) return undefined;
  if (!Object.entries(profile.materialCategories).every(([material, category]) => validText(material) && validText(category))) return undefined;
  const accepts = (material: string) => !deniedMaterials.has(material) &&
    (allowedMaterials.has(material) || (typeof profile.materialCategories?.[material] === "string" && categories.has(profile.materialCategories[material])));
  const free = container.capacity - (indexes.quantities.get(row.id) ?? 0) - (indexes.incomingByCell.get(row.id) ?? 0);
  return { party, accepts, free };
}

function reserveStockpileDelivery(
  context: WriteContext,
  indexes: StockpileIndexes,
  cell: EntityId,
  source: { id: EntityId; lot: { quantity: number; kind: string; container: EntityId } },
  party: EntityId,
  quantity: number,
  leg: number,
): { id: EntityId; nextLeg: number } {
  const sourceKey = `${source.lot.container}\0${source.lot.kind}`;
  let id = taskId(cell, source.id, leg);
  while (indexes.plannedIds.has(id)) { leg++; id = taskId(cell, source.id, leg); }
  context.createAuthoredEntity({ id, components: { [DeliveryTask.id]: {
    version: 2, party, sourceLot: source.id, source: source.lot.container, destination: cell,
    material: source.lot.kind, quantity, custody: "available", ground: null,
  }}}, { kind: "party", party });
  indexes.plannedIds.add(id);
  indexes.reservedByLot.set(source.id, (indexes.reservedByLot.get(source.id) ?? 0) + quantity);
  indexes.reservedBySourceMaterial.set(sourceKey, (indexes.reservedBySourceMaterial.get(sourceKey) ?? 0) + quantity);
  indexes.incomingByCell.set(cell, (indexes.incomingByCell.get(cell) ?? 0) + quantity);
  return { id, nextLeg: leg + 1 };
}

/** Create ordinary DeliveryTask claims for eligible ground lots. */
export function planStockpileDeliveries(context: WriteContext, options: StockpilePlanningOptions): readonly EntityId[] {
  const batchQuantity = options.batchQuantity ?? MAX_QUANTITY;
  if (!validInt(batchQuantity) || batchQuantity === 0) throw new Error("invalid stockpile delivery batch quantity");
  const indexes = indexStockpilePlanningState(context);
  const orderedCells = [...indexes.cells].sort((a, b) => {
    const left = a.get(StockpileCell), right = b.get(StockpileCell);
    return right.priority - left.priority || compareId(a.id, b.id);
  });
  const created: EntityId[] = [];
  for (const row of orderedCells) {
    if (indexes.sealed.has(row.id) || !indexes.containers.has(row.id) || !indexes.positions.has(row.id)) continue;
    const policy = validateStockpilePolicy(row, indexes, options);
    if (!policy || policy.free <= 0) continue;
    let free = policy.free;
    for (const source of indexes.sourceLots) {
      if (free <= 0) break;
      if (!policy.accepts(source.lot.kind) || indexes.sealed.has(source.lot.container) || source.lot.container === row.id || (indexes.quantities.get(source.lot.container) ?? 0) > MAX_QUANTITY) continue;
      const prior = indexes.sourceCell.get(source.lot.container);
      if (prior && row.get(StockpileCell).priority <= prior.priority) continue;
      const sourceContainer = source.lot.container;
      if (!indexes.containers.has(sourceContainer)) continue;
      const sourceParty = indexes.owners.get(source.id) ?? indexes.owners.get(sourceContainer);
      if (sourceParty && sourceParty !== policy.party) continue;
      let available = source.lot.quantity - (indexes.reservedByLot.get(source.id) ?? 0);
      const sourceKey = `${source.lot.container}\0${source.lot.kind}`;
      available = Math.min(available, (indexes.sourceMaterialTotals.get(sourceKey) ?? 0) - (indexes.reservedBySourceMaterial.get(sourceKey) ?? 0));
      if (available <= 0) continue;
      const legKey = `${row.id}\0${source.id}`;
      let leg = indexes.nextLegByLot.get(legKey) ?? 0;
      while (available > 0 && free > 0) {
        const quantity = Math.min(available, free, batchQuantity);
        if (!validInt(quantity) || quantity <= 0) break;
        const reservation = reserveStockpileDelivery(context, indexes, row.id, source, policy.party, quantity, leg);
        created.push(reservation.id);
        available -= quantity;
        free -= quantity;
        leg = reservation.nextLeg;
      }
      indexes.nextLegByLot.set(legKey, leg);
    }
  }
  return created;
}
