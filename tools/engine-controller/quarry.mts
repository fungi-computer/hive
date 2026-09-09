import { z } from "zod";
import { createRegionControllerModule } from "../../src/engine/controllers/mycelium.mts";
import { openRegion } from "../../src/engine/region/index.ts";
import { createQuarryRegionProgram } from "../../src/world-presets/excavation-region.ts";

export type QuarryRegion = ReturnType<
  typeof openRegion<
    ReturnType<ReturnType<typeof createQuarryRegionProgram>["initial"]>,
    ReturnType<ReturnType<typeof createQuarryRegionProgram>["parseCommand"]>
  >
>;
const point = z.strictObject({
  x: z.number().int().min(-4).max(3),
  y: z.number().int().min(-4).max(-1),
  z: z.number().int().min(-4).max(3),
});

/** Server-owned registration for the existing quarry consumer. No guest input
 * selects principal, region, hidden voxel queries or host advancement powers.
 */
export function quarryController(region: QuarryRegion, principal: string) {
  return createRegionControllerModule({
    id: "quarry-controller-v1",
    name: "quarry",
    principal,
    command: z.strictObject({ kind: z.literal("excavate"), at: point }),
    result: z.union([
      z.strictObject({
        at: point,
        lot: z.string().min(1).max(160),
        material: z.literal("chalk"),
        quantity: z.literal(1),
      }),
      z.strictObject({ reason: z.string().min(1).max(160) }),
    ]),
    observation: z.strictObject({
      revision: z.number().int().nonnegative(),
      excavated: z.number().int().nonnegative(),
      visibleChalk: z.number().int().nonnegative(),
    }),
    observe(boundPrincipal) {
      if (boundPrincipal !== "quarry-builder")
        throw new Error("observation-forbidden");
      const current = region.readCommitted();
      // The original quarry conservation law establishes one public surface
      // chalk unit per excavation. No interior terrain or private snapshot leaks.
      return {
        revision: current.revision,
        excavated: current.state.excavated,
        visibleChalk: current.state.excavated,
      };
    },
    dispatch: region.dispatch,
  });
}
