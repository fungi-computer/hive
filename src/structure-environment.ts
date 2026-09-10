import { z } from "zod";
import {
  compilePhysicalGeometry,
  type Bounds,
  type PhysicalPrimitive,
} from "./engine/world/physical-geometry.ts";
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
type GeometrySite = Omit<
  Pick<Site, "id" | "type" | "x" | "z" | "level" | "direction" | "finishedAt">,
  "level"
> & { level: number };
function structurePrimitives(
  site: z.infer<typeof siteSchema>,
  shape: z.infer<typeof shapeSchema>,
  frame: StructureTerrainGeometry["frame"],
): PhysicalPrimitive[] {
  const baseY = frame.y + site.level * frame.storeyVoxels;
  return footprint(site).flatMap(
    (local: { x: number; z: number }): PhysicalPrimitive[] => {
      const x = local.x + frame.x,
        z = local.z + frame.z;
      switch (shape.kind) {
        case "solid-column":
          return [
            {
              kind: "solid",
              min: [x, baseY, z],
              max: [x + 1, baseY + shape.heightVoxels, z + 1],
            },
          ];
        case "y-face":
          return [
            {
              kind: "face",
              axis: "y",
              at: baseY + shape.offsetVoxels,
              min: [x, z],
              max: [x + 1, z + 1],
            },
          ];
        case "permeable":
          return [];
      }
    },
  );
}

/** Game-owned physical geometry query. Bounds are half-open world voxel x/y/z;
 * y:x,y,z is the horizontal plane separating y-1 from y. Cut boundaries
 * have no ambient/closed default: the consumer must provide an explicit collar.
 * No navigation, rendering, saved cache or second mutable world participates.
 */
export function createStructureGeometry(
  source: { terrain: StructureTerrainGeometry; sites: readonly GeometrySite[] },
  requested: Bounds,
) {
  const terrain = source.terrain;
  const definitions: Record<BuildingKind, { environment: unknown }> = BUILDINGS;
  const shapes = new Map(
    Object.entries(definitions).map(([kind, definition]) => [
      kind,
      shapeSchema.parse(definition.environment),
    ]),
  );
  const sites = z.array(siteSchema).max(4096).parse(source.sites);
  const primitives: PhysicalPrimitive[] = [];
  for (const site of sites) {
    const shape = shapes.get(site.type);
    if (!shape) throw new Error(`unknown structure environment: ${site.type}`);
    if (site.finishedAt !== null)
      primitives.push(...structurePrimitives(site, shape, terrain.frame));
  }
  const physical = compilePhysicalGeometry(terrain, requested, primitives);
  const metadata = Object.freeze({
    version: "goblin-structure-environment-v2" as const,
    spacingM: Object.freeze([...terrain.spacingM]),
    exterior: "unspecified" as const,
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
  return Object.freeze({
    ...physical,
    region(requested: Bounds) {
      return Object.freeze({ ...metadata, ...physical.region(requested) });
    },
  });
}

/** Bulk descriptor and live exterior queries share the same compiled owner. */
export function structureEnvironment(
  source: { terrain: StructureTerrainGeometry; sites: readonly GeometrySite[] },
  requested: Bounds,
) {
  return createStructureGeometry(source, requested).region(requested);
}
