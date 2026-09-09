import { z } from "zod";
import { BUILDINGS, footprint } from "./construction.js";
import type { BuildingKind, Site } from "./model.ts";
export type StructureTerrainGeometry = {
  readonly identity: string;
  readonly revision: number;
  readonly spacingM: readonly [number, number, number];
  readonly frame: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly storeyVoxels: number;
  };
  readonly bounds: {
    readonly min: readonly [number, number, number];
    readonly max: readonly [number, number, number];
  };
  solidAt(x: number, y: number, z: number): boolean;
};
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
  terrain: StructureTerrainGeometry,
  bounds: Bounds,
  solid: Set<string>,
) {
  for (let x = bounds.min[0]; x < bounds.max[0]; x++)
    for (let y = bounds.min[1]; y < bounds.max[1]; y++)
      for (let z = bounds.min[2]; z < bounds.max[2]; z++)
        if (terrain.solidAt(x, y, z)) solid.add(cellId(x, y, z));
}
function addStructure(
  site: z.infer<typeof siteSchema>,
  shape: z.infer<typeof shapeSchema>,
  bounds: Bounds,
  frame: StructureTerrainGeometry["frame"],
  solid: Set<string>,
  closed: Set<string>,
) {
  const baseY = frame.y + site.level * frame.storeyVoxels;
  for (const local of footprint(site)) {
    const at = { x: local.x + frame.x, z: local.z + frame.z };
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
  source: { terrain: StructureTerrainGeometry; sites: readonly GeometrySite[] },
  requested: z.input<typeof boundsSchema>,
) {
  const bounds = boundsSchema.parse(requested),
    terrain = source.terrain;
  if (
    bounds.min.some((value, axis) => value < terrain.bounds.min[axis]) ||
    bounds.max.some((value, axis) => value > terrain.bounds.max[axis])
  )
    throw new Error("region exceeds registered terrain geometry");
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
      addStructure(site, shape, bounds, terrain.frame, solid, closed);
  }
  return Object.freeze({
    version: "goblin-structure-environment-v1" as const,
    bounds: Object.freeze({
      min: Object.freeze(bounds.min),
      max: Object.freeze(bounds.max),
    }),
    spacingM: Object.freeze([...terrain.spacingM]),
    exterior: "unspecified" as const,
    solidCellIds: Object.freeze([...solid].sort()),
    closedFaceIds: Object.freeze([...closed].sort()),
    provenance: Object.freeze({
      terrainIdentity: terrain.identity,
      terrainRevision: terrain.revision,
      terrainMeaning: "registered-point-solidity" as const,
      frame: Object.freeze({ ...terrain.frame }),
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
