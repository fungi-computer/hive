import { voxelSchema } from "../../src/terrain.ts";
import { z } from "zod";
import { createRegionControllerModule } from "../../src/engine/controllers/mycelium.mts";
import type { openRegion } from "../../src/engine/region/index.ts";
import type { createGoblinRegionProgram } from "../../src/world-presets/goblin-region.ts";

type Program = ReturnType<typeof createGoblinRegionProgram>;
type GoblinRegion = ReturnType<
  typeof openRegion<
    ReturnType<Program["initial"]>,
    ReturnType<Program["parseCommand"]>
  >
>;
const identity = z.string().min(1).max(160);
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const delegation = z.strictObject({
  actor: identity,
  knownDigVoxels: z.array(voxelSchema).max(64),
});

/** A bounded player delegation, not an independent actor account. The trusted
 * host selects the actor and disclosed cells before registering this module.
 * Current Goblin receipts use the player's command-ID namespace. Reconstruct
 * this same delegation for retry; guest code cannot extend it or advance time.
 */
export function goblinController(
  region: GoblinRegion,
  selected: z.input<typeof delegation>,
) {
  // Parse copies input; subsequent caller mutations cannot expand this grant.
  const grant = delegation.parse(selected);
  const boundActor = (state: ReturnType<Program["initial"]>) => {
    const actor = state.clearing.actors[grant.actor];
    if (!actor || !state.clearing.parties.home?.members.includes(grant.actor))
      throw new Error("delegated-actor-unavailable");
    return actor;
  };
  return createRegionControllerModule({
    id: "goblin-personal-controller-v1",
    name: "goblin",
    principal: "goblin-player",
    command: z.discriminatedUnion("kind", [
      z.strictObject({ kind: z.literal("rest") }),
      z.strictObject({ kind: z.literal("dig"), voxel: voxelSchema }),
    ]),
    result: z.union([
      z.strictObject({ createdJobs: z.array(identity), tick: count }),
      z.strictObject({ reason: z.string().min(1).max(160) }),
    ]),
    observation: z.strictObject({
      revision: count,
      tick: count,
      paused: z.boolean(),
      actor: z.strictObject({
        id: identity,
        x: z.number(),
        z: z.number(),
        level: z.number().int(),
        nourishment: z.number().min(0).max(100),
        hydration: z.number().min(0).max(100),
        rest: z.number().min(0).max(100),
      }),
      knownDigVoxels: z.array(voxelSchema).max(64),
    }),
    observe() {
      const current = region.readCommitted();
      const actor = boundActor(current.state);
      return {
        revision: current.revision,
        tick: current.state.clearing.tick,
        paused: current.state.clearing.paused,
        actor: {
          id: actor.id,
          x: actor.x,
          z: actor.z,
          level: actor.level,
          nourishment: actor.needs.nourishment,
          hydration: actor.needs.hydration,
          rest: actor.needs.rest,
        },
        knownDigVoxels: grant.knownDigVoxels.map((at) => [...at]),
      };
    },
    dispatch(principal, input) {
      const command = input.command;
      if (
        command.kind === "dig" &&
        !grant.knownDigVoxels.some((at) => at.join() === command.voxel.join())
      )
        throw new Error("undisclosed-dig-cell");
      // Existing RegionProgram checks the actual current order, scope and terrain.
      // No controller-owned job, material change, clock or completion is created.
      return region.dispatch(principal, {
        ...input,
        command: {
          kind: "order",
          command:
            input.command.kind === "rest"
              ? { kind: "rest", party: "home", actors: [grant.actor] }
              : {
                  kind: "dig",
                  party: "home",
                  actors: [grant.actor],
                  voxel: input.command.voxel,
                },
        },
      });
    },
  });
}
