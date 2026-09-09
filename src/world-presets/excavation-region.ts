import { z } from "zod";
import { createVoxelStore } from "../engine/world/index.js";
import { createMaterialOwner } from "../engine/materials/index.ts";
import type { RegionProgram, Json } from "../engine/region/index.ts";

const point = z
  .object({ x: z.number().int(), y: z.number().int(), z: z.number().int() })
  .strict();
const commandSchema = z
  .object({ kind: z.literal("excavate"), at: point })
  .strict();
const stateSchema = z
  .object({
    world: z.unknown().refine((value) => value !== undefined, "world required"),
    materials: z
      .unknown()
      .refine((value) => value !== undefined, "materials required"),
    excavated: z.number().int().min(0).max(32),
    tick: z.literal(0),
  })
  .strict();
type State = z.infer<typeof stateSchema>;
type Command = z.infer<typeof commandSchema>;

/** Independent original quarry content. The generic region/voxel/material owners
 * do not know these IDs, yield rules, tool rights or presentation coordinates.
 * This direct excavation is not the Goblin pawn job or its deep-world join.
 */
export function createQuarryRegionProgram(): RegionProgram<State, Command> {
  const content = { open: 9, chalk: 275, tungsten: 45_000 };
  const worldDefinition = {
    identity: { world: "durable-quarry", recipe: "quarry-v1" },
    bounds: { minX: -4, maxX: 4, minY: -8, maxY: 4, minZ: -4, maxZ: 4 },
    brickSide: 4,
    materialIds: Object.values(content),
    generator: {
      id: "quarry-bands-v1",
      column: (_x: number, _z: number) => (y: number) =>
        y >= 0 ? content.open : y < -4 ? content.tungsten : content.chalk,
    },
  };
  const materials = createMaterialOwner({ chalk: { carry: "portion" } });
  function worldFrom(checkpoint?: unknown) {
    return createVoxelStore(worldDefinition, {
      maxResidentBricks: 1,
      maxChangedCells: 32,
      ...(checkpoint === undefined ? {} : { checkpoint }),
    });
  }
  function parseState(value: unknown): State {
    const parsed = stateSchema.parse(value);
    const world = worldFrom(parsed.world);
    const materialState = materials.restore(parsed.materials, []);
    const checkpoint = world.save();
    if (
      checkpoint.changes.length !== parsed.excavated ||
      checkpoint.revision !== parsed.excavated
    )
      throw new Error("quarry-terrain-history");
    for (const change of checkpoint.changes) {
      if (change.material !== content.open || change.y >= 0 || change.y < -4)
        throw new Error("quarry-invalid-excavation");
    }
    if (
      materialState.lots.some(
        (lot) => lot.material !== "chalk" || lot.location.kind !== "ground",
      ) ||
      materialState.lots.reduce((sum, lot) => sum + lot.quantity, 0) !==
        parsed.excavated
    )
      throw new Error("quarry-material-conservation");
    return {
      ...parsed,
      world: checkpoint,
      materials: materials.snapshot(materialState, []),
    };
  }
  return {
    id: "quarry-region-v1",
    initial() {
      return {
        world: worldFrom().save(),
        materials: materials.snapshot(materials.createState(), []),
        excavated: 0,
        tick: 0,
      };
    },
    parseState,
    parseCommand: (value) => commandSchema.parse(value),
    authorize: (principal) => principal === "quarry-builder",
    execute(candidate, command) {
      const world = worldFrom(candidate.world);
      const stock = materials.restore(candidate.materials, []);
      const at = command.at;
      let material: number;
      try {
        material = world.readPoint(at);
      } catch {
        return { status: "rejected", result: { reason: "outside-quarry" } };
      }
      if (material !== content.chalk)
        return {
          status: "rejected",
          result: {
            reason:
              material === content.tungsten
                ? "tool-insufficient"
                : "already-open",
          },
        };
      const changed = world.edit({
        expectedRevision: world.describe().revision,
        cells: [
          { ...at, expectedMaterial: content.chalk, material: content.open },
        ],
      });
      if (!changed.ok)
        return { status: "rejected", result: { reason: "terrain-rejected" } };
      // The fixture's spoil pile is on the known surface. No unreachable cave item
      // or invented worker movement is claimed by this transaction consumer.
      const produced = materials.createGroundLot(stock, "chalk", 1, {
        x: at.x,
        z: at.z,
        level: 0,
      });
      if (!produced.ok)
        return { status: "rejected", result: { reason: produced.reason } };
      candidate.world = world.save();
      candidate.materials = materials.snapshot(stock, []);
      candidate.excavated++;
      const result: Json = {
        at: { ...at },
        lot: produced.value.id,
        material: "chalk",
        quantity: 1,
      };
      return {
        status: "applied",
        result,
        events: [{ kind: "excavated", ...result }],
      };
    },
  };
}
