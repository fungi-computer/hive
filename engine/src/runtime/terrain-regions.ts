import { z } from "zod";
import { terrainSurfaceSchema } from "./terrain-surface";
import {
  MAX_TERRAIN_REGION_COLUMNS,
  MAX_TERRAIN_REGION_RUNS,
  validateTerrainMaterialPatch,
} from "./terrain-region-materials.js";
export { TERRAIN_REGION_EDGE } from "./terrain-region-materials.js";

/** World-space presentation queries. These never carry a camera or mutation. */
export const MAX_TERRAIN_REGIONS = 256;
export const MAX_TERRAIN_REGION_BYTES = 512 * 1024;
export const TERRAIN_FACE_NAMES = [
  "top",
  "bottom",
  "east",
  "west",
  "south",
  "north",
] as const;
const integer = z.number().int().min(-2147483648).max(2147483647);
const revision = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const key = z.tuple([integer, integer, z.number().int().min(0).max(33554431)]);
const identity = {
  requestId: revision,
  epoch: revision,
  terrainRevision: revision,
};

const bounds = z
  .object({
    minX: integer,
    maxX: integer,
    minY: integer,
    maxY: integer,
    minZ: integer,
    maxZ: integer,
  })
  .strict()
  .refine(
    (value) =>
      value.minX < value.maxX &&
      value.minY < value.maxY &&
      value.minZ < value.maxZ,
    "terrain bounds must be nonempty",
  );
const material = z
  .object({
    slot: z.number().int().min(0).max(65535),
    solid: z.boolean(),
    art: z.string().min(1).max(64).optional(),
  })
  .strict();

export const terrainBaselineSchema = z
  .object({
    protocolVersion: z.literal(5),
    bounds,
    verticalMetres: z.number().finite().positive(),
    variantSeed: z.number().int().min(0).max(0xffffffff).optional(),
    materials: z.array(material).min(1).max(256),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      new Set(value.materials.map((entry) => entry.slot)).size !==
      value.materials.length
    )
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "duplicate terrain material slot",
      });
  });

export const terrainChangeSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("changed-columns"),
      revision,
      columns: z.array(z.tuple([integer, integer])).max(4096),
    })
    .strict(),
  z
    .object({
      kind: z.literal("full-reset"),
      revision,
      reason: z.enum(["history", "restored", "stale"]),
    })
    .strict(),
]);

export type TerrainBaseline = z.infer<typeof terrainBaselineSchema>;

export const terrainRegionRequestSchema = z
  .object({
    ...identity,
    // Ordered by the client: useful visible regions first, padding last.
    regions: z.array(key).min(1).max(MAX_TERRAIN_REGIONS),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      new Set(value.regions.map((region) => region.join(","))).size !==
      value.regions.length
    )
      context.addIssue({
        code: "custom",
        message: "duplicate terrain region key",
      });
  });

/** Faces are a local presentation result, never transported as terrain facts. */
export type TerrainFace = {
  cell: [number, number, number];
  face: (typeof TERRAIN_FACE_NAMES)[number];
  material: number;
  cap: boolean;
};
export type TerrainRegionKey = z.infer<typeof key>;
export const terrainRegionPatchSchema = z
  .object({
    key,
    bounds,
    coverage: bounds,
    columns: z
      .array(
        z
          .object({
            x: integer,
            z: integer,
            runs: z
              .array(z.tuple([integer, z.number().int().min(0).max(65535)]))
              .min(1)
              .max(MAX_TERRAIN_REGION_RUNS),
          })
          .strict(),
      )
      .min(1)
      .max(MAX_TERRAIN_REGION_COLUMNS),
    // Exterior support is authoritative independently of the requested slab/cut.
    surfaces: z.array(terrainSurfaceSchema).max(MAX_TERRAIN_REGION_COLUMNS),
  })
  .strict()
  .superRefine((patch, context) => {
    try {
      validateTerrainMaterialPatch(patch);
    } catch (error) {
      context.addIssue({
        code: "custom",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

export const terrainRegionEventSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("patch"),
      ...identity,
      patch: terrainRegionPatchSchema,
    })
    .strict(),
  z.object({ kind: z.literal("complete"), ...identity }).strict(),
  z.object({ kind: z.literal("stale"), ...identity }).strict(),
  z
    .object({
      kind: z.literal("unavailable"),
      ...identity,
      reason: z.string().min(1).max(256),
    })
    .strict(),
]);
export type TerrainRegionRequest = z.infer<typeof terrainRegionRequestSchema>;
export type TerrainRegionPatch = z.infer<typeof terrainRegionPatchSchema>;
export type TerrainRegionEvent = z.infer<typeof terrainRegionEventSchema>;
export type TerrainRegionRead = Extract<
  TerrainRegionEvent,
  { kind: "patch" | "stale" | "unavailable" }
>;

/** Relational validation belongs to the transport boundary, not the renderer. */
export function parseTerrainRegionEvent(
  value: unknown,
  request: TerrainRegionRequest,
): TerrainRegionEvent {
  const event = terrainRegionEventSchema.parse(value);
  if (event.requestId !== request.requestId)
    throw new Error("terrain region request identity mismatch");
  if (
    event.kind !== "stale" &&
    (event.epoch !== request.epoch ||
      event.terrainRevision !== request.terrainRevision)
  )
    throw new Error("terrain region world revision mismatch");
  if (event.kind === "patch") {
    if (
      !request.regions.some(
        (region) =>
          region[0] === event.patch.key[0] &&
          region[1] === event.patch.key[1] &&
          region[2] === event.patch.key[2],
      )
    )
      throw new Error("unrequested terrain region");
  }
  return event;
}
