import { z } from "zod";
import {
  assertWorldArray,
  assertWorldRecord,
} from "./engine/world/data-contract.mjs";
import { compensatedSum } from "./engine/environment/arithmetic.mjs";
import {
  terrainExcavatedVoxels,
  type GeneratedTerrain,
  type TerrainVoxel,
} from "./world-presets/goblin-terrain.ts";
import {
  GOBLIN_ENVIRONMENT_BOUNDS,
  GOBLIN_LOAM,
  GOBLIN_MAP_SIDE,
  GOBLIN_SPACING_M,
} from "./world-presets/goblin-environment/content.ts";

const volumeM3 = GOBLIN_SPACING_M.reduce<number>((a, b) => a * b, 1);
const maxRemovals =
  GOBLIN_MAP_SIDE ** 2 *
  (GOBLIN_ENVIRONMENT_BOUNDS.max[1] - GOBLIN_ENVIRONMENT_BOUNDS.min[1]);
const atSchema = z
  .tuple([
    z.number().int().safe(),
    z.number().int().safe(),
    z.number().int().safe(),
  ])
  .readonly();
const base = {
  id: z.string().min(1).max(160),
  at: atSchema,
  quantity: z.literal(1),
  sourceVoxelM3: z.literal(volumeM3),
};
const removalSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    ...base,
    kind: z.literal("porous"),
    materialId: z.literal(1),
    nodeId: z.string().min(1).max(160),
    soilId: z.literal(GOBLIN_LOAM.id),
    waterKg: z
      .number()
      .finite()
      .nonnegative()
      .max(volumeM3 * GOBLIN_LOAM.porosity * 1000),
  }),
  z.strictObject({
    ...base,
    kind: z.literal("impermeable"),
    materialId: z.literal(2),
    waterKg: z.literal(0),
  }),
]);
export type TerrainRemoval = Readonly<z.infer<typeof removalSchema>>;
type PoreRemoval = Readonly<{
  id: string;
  at: readonly [number, number, number];
  soilId: string;
  massKg: number;
}>;
const sourceId = (at: readonly number[]) => `excavation:cell:${at.join()}`;
const waterId = (at: readonly number[]) => `cell:${at.join()}`;
const admitted = new WeakMap<readonly TerrainRemoval[], GeneratedTerrain>();
const empty: readonly TerrainRemoval[] = Object.freeze([]);

/** The game owns spoil obligations; terrain owns only its actual material edits.
 * This bijection prevents a natural cave or duplicated source from creating goods. */
export function parseTerrainRemovals(
  input: unknown,
  terrain: GeneratedTerrain,
): readonly TerrainRemoval[] {
  if (admitted.get(input as readonly TerrainRemoval[]) === terrain)
    return input as readonly TerrainRemoval[];
  assertWorldArray(input, maxRemovals, "terrain removals");
  const raw = input as unknown[];
  const changed = new Map(
    terrainExcavatedVoxels(terrain).map((edit) => [sourceId(edit.at), edit]),
  );
  if (raw.length !== changed.size)
    throw new Error("terrain removals disagree with actual excavation");
  const records = raw.map((value) => {
    assertWorldRecord(
      value,
      [
        "id",
        "at",
        "quantity",
        "sourceVoxelM3",
        "kind",
        "materialId",
        "waterKg",
      ],
      "terrain removal",
      ["nodeId", "soilId"],
    );
    assertWorldArray(
      (value as TerrainRemoval).at,
      3,
      "terrain removal coordinate",
    );
    const record = removalSchema.parse(value);
    const actual = changed.get(record.id);
    if (
      record.id !== sourceId(record.at) ||
      !actual ||
      actual.materialId !== record.materialId ||
      !actual.at.every((n, axis) => n === record.at[axis]) ||
      (record.kind === "porous" && record.nodeId !== waterId(record.at))
    )
      throw new Error(
        "terrain removal lacks its exact original material source",
      );
    changed.delete(record.id);
    return Object.freeze(record);
  });
  const result = Object.freeze(records);
  admitted.set(result, terrain);
  return result;
}

export function initialTerrainRemovals(terrain: GeneratedTerrain) {
  return parseTerrainRemovals(empty, terrain);
}

/** Pair the exact newly removed voxel with the water owner's physical receipt.
 * A construction edit cannot smuggle an unrelated porous export through here. */
export function prepareTerrainRemoval(
  input: readonly TerrainRemoval[],
  before: GeneratedTerrain,
  after: GeneratedTerrain,
  target: TerrainVoxel,
  removedPoreWater: readonly PoreRemoval[],
) {
  const records = parseTerrainRemovals(input, before);
  const id = sourceId(target);
  if (records.some((record) => record.id === id))
    throw new Error("terrain removal source already settled");
  const actual = terrainExcavatedVoxels(after).find(
    (edit) => sourceId(edit.at) === id,
  );
  if (!actual) throw new Error("terrain removal lacks its changed target");
  const shared = { id, at: [...target], quantity: 1, sourceVoxelM3: volumeM3 };
  let record: unknown;
  if (actual.materialId === 1) {
    const pore = removedPoreWater[0];
    if (
      removedPoreWater.length !== 1 ||
      !pore ||
      pore.id !== waterId(target) ||
      !pore.at.every((n, axis) => n === target[axis]) ||
      pore.soilId !== GOBLIN_LOAM.id
    )
      throw new Error(
        "porous excavation needs its exact water removal receipt",
      );
    record = {
      ...shared,
      kind: "porous",
      materialId: 1,
      nodeId: pore.id,
      soilId: pore.soilId,
      waterKg: pore.massKg,
    };
  } else {
    if (removedPoreWater.length)
      throw new Error("stone excavation cannot export unrelated pore water");
    record = { ...shared, kind: "impermeable", materialId: 2, waterKg: 0 };
  }
  return parseTerrainRemovals([...records, record], after);
}

export function removedWaterKg(records: readonly TerrainRemoval[]) {
  return compensatedSum(records.map((record) => record.waterKg));
}
