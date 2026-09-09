import type { ItemLot, Material } from "./model.ts";
import type {
  GeneratedTerrain,
  TerrainVoxel,
} from "./world-presets/goblin-terrain.ts";

type RemovalRecord = GeneratedTerrain["exports"][number];
type YieldMaterial = Extract<Material, "soil" | "stone">;
type YieldDefinition = {
  readonly kind: RemovalRecord["kind"];
  readonly material: YieldMaterial;
  readonly portionVolumeM3: 0.54;
  readonly quantity: 1;
};
/** One game bulk portion is a removed1×.54×1m voxel, not a kilogram.
 * Pore water remains entirely in the engine removal/field ledger. */
export const TERRAIN_YIELDS = Object.freeze({
  1: Object.freeze({
    kind: "porous",
    material: "soil",
    portionVolumeM3: 0.54,
    quantity: 1,
  } as const),
  2: Object.freeze({
    kind: "impermeable",
    material: "stone",
    portionVolumeM3: 0.54,
    quantity: 1,
  } as const),
} satisfies Record<RemovalRecord["materialId"], YieldDefinition>);
const sourceId = (at: readonly number[]) => `excavation:cell:${at.join()}`;

/** Interpret an already owner-validated removal record; this never authorizes a cut. */
export function removalYield(record: RemovalRecord) {
  const definition = TERRAIN_YIELDS[record.materialId];
  if (!definition || record.kind !== definition.kind)
    throw new Error("unsupported terrain yield material");
  if (
    record.id !== sourceId(record.at) ||
    record.quantity !== definition.quantity ||
    record.sourceVoxelM3 !== definition.portionVolumeM3
  )
    throw new Error("terrain yield source identity or bulk portion disagrees");
  return Object.freeze({
    sourceId: record.id,
    material: definition.material,
    quantity: record.quantity,
    portionVolumeM3: definition.portionVolumeM3,
  });
}
function sourceRecords(records: readonly RemovalRecord[]) {
  const byId = new Map<string, RemovalRecord>();
  for (const record of records) {
    removalYield(record);
    if (byId.has(record.id)) throw new Error("duplicate terrain yield source");
    byId.set(record.id, record);
  }
  return byId;
}
/** Compare canonical record fields by source identity, independent of array order,
 * object key order, or reconstructed object identity. No new provenance is inferred. */
function sameSource(a: RemovalRecord, b: RemovalRecord): boolean {
  return (
    a.id === b.id &&
    a.kind === b.kind &&
    a.materialId === b.materialId &&
    a.quantity === b.quantity &&
    a.sourceVoxelM3 === b.sourceVoxelM3 &&
    a.waterKg === b.waterKg &&
    a.at.every((value, axis) => value === b.at[axis]) &&
    (a.kind !== "porous" ||
      (b.kind === "porous" && a.nodeId === b.nodeId && a.soilId === b.soilId))
  );
}

/** Exactly the admitted target is new; every predecessor source survives unchanged. */
export function excavationYield(
  before: readonly RemovalRecord[],
  after: readonly RemovalRecord[],
  target: TerrainVoxel,
) {
  const previous = sourceRecords(before),
    next = sourceRecords(after),
    id = sourceId(target);
  if (previous.has(id))
    throw new Error("excavation yield source already exists");
  const added = next.get(id);
  if (!added) throw new Error("excavation yield lacks its exact target source");
  for (const [key, record] of previous) {
    const retained = next.get(key);
    if (!retained || !sameSource(record, retained))
      throw new Error("excavation changed predecessor source");
  }
  for (const key of next.keys())
    if (key !== id && !previous.has(key))
      throw new Error("excavation added an unrelated source");
  return removalYield(added);
}

/** Current soil/stone have no consuming recipe or sink: all yielded bulk portions
 * remain ordinary lots across ground, hand or container custody. */
export function terrainYieldBalance(
  records: readonly RemovalRecord[],
  lots: readonly ItemLot[],
) {
  const expected: Record<YieldMaterial, number> = { soil: 0, stone: 0 };
  const actual: Record<YieldMaterial, number> = { soil: 0, stone: 0 };
  for (const record of sourceRecords(records).values()) {
    const yield_ = removalYield(record);
    expected[yield_.material] += yield_.quantity;
  }
  for (const lot of lots)
    if (lot.material === "soil" || lot.material === "stone")
      actual[lot.material] += lot.quantity;
  for (const material of ["soil", "stone"] as const)
    if (
      !Number.isSafeInteger(expected[material]) ||
      !Number.isSafeInteger(actual[material])
    )
      throw new Error("terrain yield total exceeds exact integer capacity");
  return Object.freeze({
    expected: Object.freeze(expected),
    actual: Object.freeze(actual),
  });
}
export function terrainYieldProblem(
  records: readonly RemovalRecord[],
  lots: readonly ItemLot[],
): string | null {
  const { expected, actual } = terrainYieldBalance(records, lots);
  for (const material of ["soil", "stone"] as const)
    if (actual[material] !== expected[material])
      return `${material} conservation is ${actual[material]}, expected ${expected[material]}`;
  return null;
}
