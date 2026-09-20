import { z } from "zod";
import { terrainSurfaceSchema } from "./terrain-surface";

/** World-space presentation queries. These never carry a camera or mutation. */
export const TERRAIN_REGION_EDGE = 8;
export const MAX_TERRAIN_REGIONS = 256;
export const MAX_TERRAIN_REGION_FACES = 32768;
export const MAX_TERRAIN_REGION_BYTES = 512 * 1024;
export const TERRAIN_FACE_NAMES = ["top", "bottom", "east", "west", "south", "north"] as const;
const integer = z.number().int().min(-2147483648).max(2147483647);
const revision = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const key = z.tuple([integer, integer]);
const cell = z.tuple([integer, integer, integer]);
const identity = { requestId: revision, epoch: revision, terrainRevision: revision, level: integer };

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
  .object({ slot: z.number().int().min(0).max(65535), solid: z.boolean(), art: z.string().min(1).max(64).optional() })
  .strict();

export const terrainBaselineSchema = z
  .object({
    protocolVersion: z.literal(4),
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

export const terrainRegionRequestSchema = z.object({
  ...identity,
  // Ordered by the client: useful visible regions first, padding last.
  regions: z.array(key).min(1).max(MAX_TERRAIN_REGIONS),
}).strict().superRefine((value, context) => {
  if (new Set(value.regions.map(region => region.join(","))).size !== value.regions.length)
    context.addIssue({ code: "custom", message: "duplicate terrain region key" });
});

export const terrainRegionPatchSchema = z.object({
  key,
  bounds: z.object({ minX: integer, maxX: integer, minZ: integer, maxZ: integer }).strict(),
  // All exposed orientations, independent of camera. Cap is true only for an
  // artificial top face at the requested cut. Empty faces is a complete region.
  faces: z.array(z.object({ cell, face: z.enum(TERRAIN_FACE_NAMES),
    material: z.number().int().min(0).max(65535), cap: z.boolean() }).strict()).max(MAX_TERRAIN_REGION_FACES),
  // Authoritative exterior support facts for the core plus one-column halo.
  // Facts above the cut may supply generatedTop but cannot create cover there.
  surfaces: z.array(terrainSurfaceSchema).max(100),
}).strict().superRefine((patch, context) => {
  const b = patch.bounds, [rx, rz] = patch.key;
  if (b.minX >= b.maxX || b.minZ >= b.maxZ || b.minX < rx * TERRAIN_REGION_EDGE ||
      b.maxX > (rx + 1) * TERRAIN_REGION_EDGE || b.minZ < rz * TERRAIN_REGION_EDGE || b.maxZ > (rz + 1) * TERRAIN_REGION_EDGE)
    context.addIssue({ code: "custom", message: "invalid terrain region bounds" });
  const faces = new Set<string>();
  for (const face of patch.faces) {
    const [x, , z] = face.cell, id = `${face.cell.join(",")}:${face.face}`;
    if (x < b.minX || x >= b.maxX || z < b.minZ || z >= b.maxZ || faces.has(id) || (face.cap && face.face !== "top"))
      context.addIssue({ code: "custom", message: "invalid or duplicate terrain region face" });
    faces.add(id);
  }
  const columns = new Set<string>();
  for (const surface of patch.surfaces) {
    const [x, , z] = surface.cell, id = `${x},${z}`;
    if (x < b.minX - 1 || x > b.maxX || z < b.minZ - 1 || z > b.maxZ || columns.has(id))
      context.addIssue({ code: "custom", message: "invalid terrain region support halo" });
    columns.add(id);
  }
});

export const terrainRegionEventSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("patch"), ...identity, patch: terrainRegionPatchSchema }).strict(),
  z.object({ kind: z.literal("complete"), ...identity }).strict(),
  z.object({ kind: z.literal("stale"), ...identity }).strict(),
  z.object({ kind: z.literal("unavailable"), ...identity, reason: z.string().min(1).max(256) }).strict(),
]);
export type TerrainRegionRequest = z.infer<typeof terrainRegionRequestSchema>;
export type TerrainRegionPatch = z.infer<typeof terrainRegionPatchSchema>;
export type TerrainRegionEvent = z.infer<typeof terrainRegionEventSchema>;
export type TerrainRegionRead = Extract<TerrainRegionEvent, { kind: "patch" | "stale" | "unavailable" }>;

/** Relational validation belongs to the transport boundary, not the renderer. */
export function parseTerrainRegionEvent(value: unknown, request: TerrainRegionRequest): TerrainRegionEvent {
  const event = terrainRegionEventSchema.parse(value);
  if (event.requestId !== request.requestId || event.level !== request.level)
    throw new Error("terrain region request identity mismatch");
  if (event.kind !== "stale" && (event.epoch !== request.epoch || event.terrainRevision !== request.terrainRevision))
    throw new Error("terrain region world revision mismatch");
  if (event.kind === "patch") {
    if (!request.regions.some(region => region[0] === event.patch.key[0] && region[1] === event.patch.key[1]))
      throw new Error("unrequested terrain region");
    if (event.patch.faces.some(face => face.cell[1] > request.level || (face.cap && face.cell[1] !== request.level)))
      throw new Error("terrain region face exceeds cut level");
  }
  return event;
}
