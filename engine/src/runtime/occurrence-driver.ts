import { z } from "zod";
import type { CommandScope } from "../contracts";
import type { GameSession } from "./session";

/** Trusted pack code gets reads and scoped command admission, never physical time. */
export type OccurrenceCommandContext = Pick<GameSession, "command" | "terrainSurfaces">;
export type SessionOccurrenceDriver = {
  readonly id: string;
  readonly version: number;
  readonly stepSeconds: number;
  readonly scope: CommandScope;
  readonly beforeStep: (context: OccurrenceCommandContext, step: number) => readonly string[];
};
export type OccurrenceCommand = { readonly name: string; readonly input?: unknown };
export type OccurrenceDriverResult = {
  readonly driver: string;
  readonly version: number;
  readonly step: number;
  readonly commands: readonly OccurrenceCommand[];
  readonly notes: readonly string[];
  readonly actions: { readonly attempted: number; readonly accepted: number; readonly rejected: number };
};
const MAX_COMMANDS = 16;
const counter = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const resultSchema = z.object({
  driver: z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/), version: counter.min(1), step: counter.min(1),
  commands: z.array(z.object({name:z.string().min(1).max(128),input:z.unknown().optional()}).strict()).max(MAX_COMMANDS),
  notes: z.array(z.string().max(128)).max(MAX_COMMANDS),
  actions: z.object({attempted:counter,accepted:counter,rejected:counter}).strict(),
}).strict().refine(result => result.actions.attempted === result.actions.accepted + result.actions.rejected, "invalid scheduled action counts");
export function readOccurrenceDriverResult(value: unknown): OccurrenceDriverResult { return resultSchema.parse(value); }

const MAX_COMMAND_BYTES = 4096;

export function prepareOccurrenceDriver(driver: SessionOccurrenceDriver | undefined): SessionOccurrenceDriver | undefined {
  if (!driver) return undefined;
  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(driver.id) || !Number.isSafeInteger(driver.version) || driver.version < 1 ||
      !Number.isFinite(driver.stepSeconds) || driver.stepSeconds <= 0 || driver.stepSeconds > 1 ||
      driver.scope.kind !== "player" || !/^[A-Za-z0-9._:-]{1,128}$/.test(driver.scope.player) || typeof driver.beforeStep !== "function")
    throw new Error("invalid occurrence driver");
  return Object.freeze({ ...driver, scope: Object.freeze({ ...driver.scope }) });
}

/**
 * Only the Region's verified occurrence frontier supplies sequence. Commands and
 * the one physical step remain provisional until their shared capture/receipt
 * commits. A failure discards the whole candidate; duplicate occurrences never
 * enter this function. No private step counter or secondary simulation exists.
 */
export function advanceDrivenOccurrence(
  session: GameSession,
  driver: SessionOccurrenceDriver,
  sequence: number | undefined,
  delta: number,
): OccurrenceDriverResult {
  if (!Number.isSafeInteger(sequence) || sequence! < 0 || sequence === Number.MAX_SAFE_INTEGER)
    throw new Error("scheduled step requires a Region clock occurrence");
  if (delta !== driver.stepSeconds || session.isPaused) throw new Error("scheduled step has invalid clock state");
  const step = sequence! + 1;
  const commands: OccurrenceCommand[] = [];
  let bytes = 0;
  const context: OccurrenceCommandContext = Object.freeze({
    terrainSurfaces: columns => session.terrainSurfaces(columns),
    command(name, input) {
      const command = input === undefined ? { name } : { name, input: structuredClone(input) };
      bytes += new TextEncoder().encode(JSON.stringify(command)).byteLength;
      if (commands.length >= MAX_COMMANDS || bytes > MAX_COMMAND_BYTES) throw new Error("scheduled command budget exceeded");
      // Caller-supplied scope cannot override the host's registered player scope.
      session.command(name, input, driver.scope);
      commands.push(command);
    },
  });
  const notes = driver.beforeStep(context, step);
  if (!Array.isArray(notes) || notes.length > MAX_COMMANDS || notes.some(note => typeof note !== "string" || note.length > 128))
    throw new Error("invalid scheduled command notes");
  const outcomes = session.step(delta);
  const accepted = outcomes.filter(outcome => outcome.accepted).length;
  return { driver: driver.id, version: driver.version, step, commands, notes: [...notes],
    actions: { attempted: outcomes.length, accepted, rejected: outcomes.length - accepted } };
}
