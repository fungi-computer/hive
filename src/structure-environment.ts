import { z } from "zod";
import { BUILDINGS, footprint } from "./construction.js";
import { SIZE } from "./world.js";
import {
  AUTHORED_CLEARING_TERRAIN,
  TERRAIN_VOXEL_METRIC,
  terrainCell,
} from "./terrain.ts";
import type { BuildingKind, Site, TerrainState } from "./model.ts";

const integer = z.number().int().min(-1_000_000).max(1_000_000);
const coordinate = z.tuple([integer, integer, integer]);
const boundsSchema = z
  .strictObject({ min: coordinate, max: coordinate })
  .superRefine((bounds, context) => {
    const spans = bounds.max.map((value, axis) => value - bounds.min[axis]);
    if (
      spans.some((span) => span <= 0) ||
      spans.reduce((volume, span) => volume * span, 1) > 1024
    )
      context.addIssue({
        code: "custom",
        message: "region must contain 1..1024 voxels",
      });
    if (
      bounds.min[0] < 0 ||
      bounds.min[2] < 0 ||
      bounds.max[0] > SIZE ||
      bounds.max[2] > SIZE
    )
      context.addIssue({
        code: "custom",
        message: "region exceeds authored clearing terrain",
      });
  });
const shapeSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("solid-column"),
    heightVoxels: z.literal(4),
  }),
  z.strictObject({
    kind: z.literal("y-face"),
    offsetVoxels: z.union([z.literal(0), z.literal(4)]),
  }),
  z.strictObject({ kind: z.literal("permeable") }),
]);
const siteSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  x: integer,
  z: integer,
  level: integer,
  direction: z.union([z.literal(0), z.literal(1)]),
  finishedAt: z.number().int().nonnegative().nullable(),
});
const terrainSchema = z.object({
  base: z.literal(AUTHORED_CLEARING_TERRAIN),
  revision: z.number().int().nonnegative(),
  edits: z.array(
    z.strictObject({
      x: z
        .number()
        .int()
        .min(0)
        .max(SIZE - 1),
      z: z
        .number()
        .int()
        .min(0)
        .max(SIZE - 1),
      level: z.literal(0),
    }),
  ),
});
// Compile-time coverage follows the actual game's building union; every kind
// must provide metadata, while runtime parsing refuses an invalid shape.
const definitions: Record<BuildingKind, { environment: unknown }> = BUILDINGS;
type GeometrySite = Omit<
  Pick<Site, "id" | "type" | "x" | "z" | "level" | "direction" | "finishedAt">,
  "level"
> & { level: number };
type Bounds = z.infer<typeof boundsSchema>;
const cellId = (x: number, y: number, z: number) => `cell:${x},${y},${z}`;
const faceId = (x: number, y: number, z: number) => `y:${x},${y},${z}`;
function inColumn(bounds: Bounds, x: number, z: number) {
  return (
    x >= bounds.min[0] &&
    x < bounds.max[0] &&
    z >= bounds.min[2] &&
    z < bounds.max[2]
  );
}
function terrainSolids(
  terrain: TerrainState,
  bounds: Bounds,
  solid: Set<string>,
) {
  for (let x = bounds.min[0]; x < bounds.max[0]; x++)
    for (let z = bounds.min[2]; z < bounds.max[2]; z++) {
      const surfaceY =
        terrainCell(terrain, x, z).height / TERRAIN_VOXEL_METRIC.verticalM;
      for (let y = bounds.min[1]; y < Math.min(bounds.max[1], surfaceY); y++)
        solid.add(cellId(x, y, z));
    }
}
function addStructure(
  site: z.infer<typeof siteSchema>,
  shape: z.infer<typeof shapeSchema>,
  bounds: Bounds,
  solid: Set<string>,
  closed: Set<string>,
) {
  const baseY = site.level * 4;
  for (const at of footprint(site)) {
    if (!inColumn(bounds, at.x, at.z)) continue;
    switch (shape.kind) {
      case "solid-column":
        for (
          let y = Math.max(bounds.min[1], baseY);
          y < Math.min(bounds.max[1], baseY + shape.heightVoxels);
          y++
        )
          solid.add(cellId(at.x, y, at.z));
        break;
      case "y-face": {
        const y = baseY + shape.offsetVoxels;
        if (y >= bounds.min[1] && y <= bounds.max[1])
          closed.add(faceId(at.x, y, at.z));
        break;
      }
      case "permeable":
        break;
      default: {
        const exhaustive: never = shape;
        throw new Error(`invalid environment shape: ${exhaustive}`);
      }
    }
  }
}

/** Game-owned physical geometry query. Bounds are half-open world voxel x/y/z;
 * y:x,y,z is the horizontal plane separating y-1 from y. Cut boundaries
 * have no ambient/closed default: the consumer must provide an explicit collar.
 * No navigation, rendering, saved cache or second mutable world participates.
 */
export function structureEnvironment(
  source: { terrain: TerrainState; sites: readonly GeometrySite[] },
  requested: z.input<typeof boundsSchema>,
) {
  const bounds = boundsSchema.parse(requested),
    terrain = terrainSchema.parse(source.terrain);
  const shapes = new Map(
    Object.entries(definitions).map(([kind, definition]) => [
      kind,
      shapeSchema.parse(definition.environment),
    ]),
  );
  const sites = z.array(siteSchema).max(4096).parse(source.sites);
  const solid = new Set<string>(),
    closed = new Set<string>();
  terrainSolids(terrain, bounds, solid);
  for (const site of sites) {
    const shape = shapes.get(site.type);
    if (!shape) throw new Error(`unknown structure environment: ${site.type}`);
    if (site.finishedAt !== null)
      addStructure(site, shape, bounds, solid, closed);
  }
  return Object.freeze({
    version: "goblin-structure-environment-v1" as const,
    bounds: Object.freeze({
      min: Object.freeze(bounds.min),
      max: Object.freeze(bounds.max),
    }),
    spacingM: Object.freeze([
      TERRAIN_VOXEL_METRIC.horizontalM,
      TERRAIN_VOXEL_METRIC.verticalM,
      TERRAIN_VOXEL_METRIC.horizontalM,
    ] as const),
    exterior: "unspecified" as const,
    solidCellIds: Object.freeze([...solid].sort()),
    closedFaceIds: Object.freeze([...closed].sort()),
    provenance: Object.freeze({
      terrainBase: terrain.base,
      terrainRevision: terrain.revision,
      terrainMeaning: "solid-below-authored-surface" as const,
      storeyVoxels: 4,
      footprintOwner: "construction.footprint" as const,
      completedSites: Object.freeze(
        sites
          .filter((site) => site.finishedAt !== null)
          .map((site) => Object.freeze({ ...site })),
      ),
      buildingShapes: Object.freeze(
        Object.fromEntries(
          [...shapes].map(([kind, shape]) => [kind, Object.freeze(shape)]),
        ),
      ),
      limits: Object.freeze({
        maxCells: 1024,
        maxSites: 4096,
        coordinateMagnitude: 1_000_000,
      }),
    }),
  });
}
