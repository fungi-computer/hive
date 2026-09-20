import { z } from "zod";
import { terrainSurfaceSchema } from "./terrain-surface";

export const TERRAIN_CHUNK_EDGE = 8;
export const MAX_TERRAIN_CHUNKS = 8;
export const MAX_TERRAIN_RUNS = 4096;
export const MAX_TERRAIN_CHUNK_REPLY_BYTES = 512 * 1024;

const i32 = z.number().int().min(-2147483648).max(2147483647);
const revision = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const cell = z.tuple([i32, i32, i32]);
const chunkKey = z.tuple([i32, i32, i32]);
const bounds = z
  .object({
    minX: i32,
    maxX: i32,
    minY: i32,
    maxY: i32,
    minZ: i32,
    maxZ: i32,
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
    protocolVersion: z.literal(3),
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

export const terrainChunkRequestSchema = z
  .object({
    requestId: revision,
    epoch: revision,
    terrainRevision: revision,
    chunks: z.array(chunkKey).min(1).max(MAX_TERRAIN_CHUNKS),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      new Set(value.chunks.map((key) => key.join(","))).size !==
      value.chunks.length
    )
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "duplicate terrain chunk key",
      });
  });

const run = z
  .object({
    minY: i32,
    maxY: i32,
    material: z.number().int().min(0).max(65535),
  })
  .strict()
  .refine((value) => value.minY < value.maxY, "terrain run must be nonempty");
const column = z
  .object({ x: i32, z: i32, runs: z.array(run).min(1).max(TERRAIN_CHUNK_EDGE) })
  .strict();
const chunk = z
  .object({
    key: chunkKey,
    min: cell,
    max: cell,
    columns: z.array(column).min(1).max(64),
    // Column tops accompany every vertical chunk, including lower cut chunks.
    // An absent column entry means there is no exterior solid surface.
    surfaces: z.array(terrainSurfaceSchema).max(64),
  })
  .strict()
  .superRefine((value, context) => {
    const columns = new Set(value.columns.map(column => `${column.x},${column.z}`));
    let previous: readonly [number, number] | undefined;
    for (const surface of value.surfaces) {
      const [x, , z] = surface.cell;
      if (!columns.has(`${x},${z}`) || x < value.min[0] || x >= value.max[0] || z < value.min[2] || z >= value.max[2])
        context.addIssue({ code: "custom", message: "terrain chunk surface lies outside its columns" });
      if (previous && (x < previous[0] || (x === previous[0] && z <= previous[1])))
        context.addIssue({ code: "custom", message: "terrain chunk surfaces must be ordered and unique" });
      previous = [x, z];
    }
  });
export const terrainChunkReplySchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("ready"),
      requestId: revision,
      epoch: revision,
      terrainRevision: revision,
      chunks: z.array(chunk).min(1).max(MAX_TERRAIN_CHUNKS),
    })
    .strict(),
  z
    .object({
      kind: z.literal("stale"),
      requestId: revision,
      epoch: revision,
      terrainRevision: revision,
    })
    .strict(),
  z
    .object({
      kind: z.literal("unavailable"),
      requestId: revision,
      reason: z.string().min(1).max(256),
    })
    .strict(),
]);
export const terrainChangeSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("changed-columns"),
      revision,
      columns: z.array(z.tuple([i32, i32])).max(4096),
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
export type TerrainChunkRequest = z.infer<typeof terrainChunkRequestSchema>;
export type TerrainChunkReply = z.infer<typeof terrainChunkReplySchema>;

export function parseTerrainChunkReply(
  value: unknown,
  request: TerrainChunkRequest,
): TerrainChunkReply {
  const reply = terrainChunkReplySchema.parse(value);
  if (reply.requestId !== request.requestId)
    throw new Error("terrain chunk request id mismatch");
  if (reply.kind !== "unavailable" && reply.epoch !== request.epoch)
    throw new Error("terrain chunk epoch mismatch");
  if (reply.kind === "ready") {
    if (reply.terrainRevision !== request.terrainRevision)
      throw new Error("terrain chunk revision mismatch");
    if (
      reply.chunks.length !== request.chunks.length ||
      reply.chunks.some((chunk, index) =>
        chunk.key.some((value, axis) => value !== request.chunks[index][axis]),
      )
    )
      throw new Error("terrain chunk reply coverage mismatch");
    let runs = 0;
    const columnSurfaces = new Map<string, string>();
    for (const chunk of reply.chunks) {
      const surfaces = new Map(chunk.surfaces.map(surface => [`${surface.cell[0]},${surface.cell[2]}`, surface]));
      for (const column of chunk.columns) {
        const key = `${column.x},${column.z}`, signature = JSON.stringify(surfaces.get(key) ?? null);
        if (columnSurfaces.has(key) && columnSurfaces.get(key) !== signature)
          throw new Error("terrain chunk surface metadata disagrees across vertical chunks");
        columnSurfaces.set(key, signature);
      }
      let previous: readonly [number, number] | undefined;
      for (const column of chunk.columns) {
        if (
          previous &&
          (column.x < previous[0] ||
            (column.x === previous[0] && column.z <= previous[1]))
        )
          throw new Error("terrain chunk columns are not ordered");
        previous = [column.x, column.z];
        let y = chunk.min[1];
        let previousMaterial: number | undefined;
        for (const entry of column.runs) {
          if (entry.minY !== y || entry.maxY > chunk.max[1])
            throw new Error("terrain chunk runs do not partition the column");
          if (entry.material === previousMaterial)
            throw new Error("adjacent terrain runs must be coalesced");
          previousMaterial = entry.material;
          y = entry.maxY;
          runs++;
        }
        if (y !== chunk.max[1])
          throw new Error("terrain chunk runs do not cover the column");
      }
    }
    if (runs > MAX_TERRAIN_RUNS)
      throw new Error("terrain chunk reply exceeds run budget");
  }
  return reply;
}
