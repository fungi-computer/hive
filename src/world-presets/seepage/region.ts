import { z } from "zod";
import type { Json, RegionProgram } from "../../engine/region/index.ts";
import { createWetClearing } from "./wet-clearing.mjs";

const integer = z.number().int().min(-1_000_000).max(1_000_000);
const commandSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("excavate"), at: z.tuple([integer, integer, integer]) }),
  z.strictObject({ kind: z.literal("advance"), seconds: z.number().positive().max(600) }),
]);
const stateSchema = z.strictObject({ environment: z.unknown().refine(value => value !== undefined) });
type State = { environment: Json };
type Command = z.infer<typeof commandSchema>;

/** The independent wet-world consumer supplies terrain and soil content. Region
 * owns command identity, revision, transaction, event and retry. An eventual
 * Goblin join must include its pawn/material changes in that same transaction.
 */
export function createWetRegionProgram(): RegionProgram<State, Command> {
  const recipe = createWetClearing({ connected: true }), adapter = recipe.adapter;
  function parseState(value: unknown): State {
    const state = stateSchema.parse(value);
    return { environment: recipe.parseClosedState(state.environment) };
  }
  return {
    id: "generated-wet-clearing-v7",
    initial: () => parseState({ environment: recipe.input }),
    parseState,
    parseCommand: value => commandSchema.parse(value),
    authorize: (principal, command) => command.kind === "advance"
      ? principal === "wet-world-host" : principal === "wet-world-player",
    execute(candidate, command) {
      const next = command.kind === "excavate"
        ? adapter.excavate(candidate.environment, { at: command.at })
        : adapter.advance(candidate.environment, command.seconds);
      // All potentially failing topology/remap/solve work was detached. Region
      // validates and durably commits this single replacement with its receipt.
      candidate.environment = next.state;
      const facts = adapter.read(next.state);
      const result = { worldRevision: next.state.world.revision, timeS: facts.timeS,
        removedVoxels: next.state.exports.length, waterKg: facts.balance.pitWaterKg,
        totalWaterKg: facts.balance.totalWaterKg };
      return { status: "applied", result, events: [{ kind: command.kind, ...result }] };
    },
  };
}
