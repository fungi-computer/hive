import { z } from "zod";
import {
  optimizerBuildIdentity,
  type Optimizer,
} from "../engine/colony/loader.ts";
import { createClearing, advanceTicks } from "../clearing.ts";
import { admitCommand } from "../orders.ts";
import { commandSchema } from "../command-schema.ts";
import {
  parseSerializedClearing,
  parseLiveClearing,
  serializeClearing,
  type SerializedClearing,
} from "../clearing-state.ts";
import type {
  RegionProgram,
  RegionTransition,
} from "../engine/region/index.ts";
const stateSchema = z
  .object({ clearing: z.unknown().transform(parseSerializedClearing) })
  .strict();
const inputSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("order"), command: commandSchema }).strict(),
  z.object({ kind: z.literal("set-paused"), paused: z.boolean() }).strict(),
  z
    .object({
      kind: z.literal("advance"),
      ticks: z.number().int().min(1).max(120),
    })
    .strict(),
]);
type State = { clearing: SerializedClearing };
type Input = z.infer<typeof inputSchema>;
/** Goblin rules/content over the unchanged transactional region owner. */
export function createGoblinRegionProgram(
  colony: Optimizer,
): RegionProgram<State, Input> {
  const programId = `goblin-wet19-v1:${optimizerBuildIdentity(colony)}`;
  const computeCost = colony.compute_cost.bind(colony);
  const optimize = colony.optimize.bind(colony);
  const optimizer = Object.freeze({ compute_cost: computeCost, optimize });
  return {
    id: programId,
    initial() {
      const clearing = createClearing();
      clearing.paused = true;
      return { clearing: serializeClearing(clearing) };
    },
    parseState: (value) => stateSchema.parse(value),
    parseCommand: (value) => inputSchema.parse(value),
    authorize(principal, input) {
      return input.kind === "advance"
        ? principal === "goblin-host"
        : principal === "goblin-player" &&
            (input.kind === "set-paused" || input.command.party === "home");
    },
    execute(candidate, input): RegionTransition {
      const clearing = parseLiveClearing(candidate.clearing);
      if (input.kind === "order") {
        const result = admitCommand(clearing, input.command);
        if (result.status === "rejected")
          return { status: "rejected", result: { reason: result.reason } };
        candidate.clearing = serializeClearing(clearing);
        return {
          status: "applied",
          result: { createdJobs: result.createdJobs, tick: clearing.tick },
          events: [{ kind: "order-admitted", createdJobs: result.createdJobs }],
        };
      }
      if (input.kind === "set-paused") {
        const changed = clearing.paused !== input.paused;
        clearing.paused = input.paused;
        candidate.clearing = serializeClearing(clearing);
        return {
          status: "applied",
          result: { paused: clearing.paused },
          events: changed
            ? [{ kind: "pause-changed", paused: clearing.paused }]
            : [],
        };
      }
      const before = clearing.tick;
      advanceTicks(clearing, optimizer, input.ticks);
      candidate.clearing = serializeClearing(clearing);
      return {
        status: "applied",
        result: { tick: clearing.tick, advanced: clearing.tick - before },
        events:
          clearing.tick !== before
            ? [{ kind: "world-advanced", from: before, to: clearing.tick }]
            : [],
      };
    },
  };
}
