import { z } from "zod";
import type { RegionProgram, Json, RegionRecordReader, RegionTransition } from "../../../src/engine/region/index.ts";
import type { GamePack, KernelPort, ActionRequest } from "../contracts";
import { GameSession, type SessionSnapshot } from "./session";
import { checkedAction } from "./actions";
import { checkedStoredSession, storeSession, hydrateSession, changedSessionRecords, type StoredSession } from "./session-record-store";

const commandSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("action"), action: z.unknown() }).strict(),
  z
    .object({
      kind: z.literal("command"),
      name: z.string().min(1).max(128),
      input: z.unknown().optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("step"),
      delta: z.number().finite().min(0).max(1),
    })
    .strict(),
  z.object({ kind: z.literal("pause") }).strict(),
  z.object({ kind: z.literal("resume") }).strict(),
]);
type RegionCommand =
  | Exclude<z.infer<typeof commandSchema>, { kind: "action" }>
  | { kind: "action"; action: ActionRequest };
export interface SessionRegionState {
  session: StoredSession;
}

export type SessionResidentOptions = {
  readonly pack: GamePack;
  readonly createKernel: () => KernelPort;
  readonly implementationHash: string;
  readonly ownerPrincipal: string;
  readonly hostPrincipal: string;
  readonly seed: number;
};

export interface SessionResident {
  readonly begin: (revision: number, state: SessionRegionState, records: RegionRecordReader) => void;
  readonly execute: (candidate: SessionRegionState, command: RegionCommand, records: RegionRecordReader, baseRevision: number) => RegionTransition;
  readonly accept: (revision: number) => void;
  readonly discard: () => void;
  readonly dispose: () => void;
  readonly observe: <T>(revision: number, state: SessionRegionState, records: RegionRecordReader, use: (session: GameSession) => T) => T;
}

function applyCommand(session: GameSession, command: RegionCommand): unknown {
  switch (command.kind) {
    case "action": session.request(command.action); return [];
    case "command": session.command(command.name, command.input); return [];
    case "step": return session.step(command.delta);
    case "pause": session.pause(); return [];
    case "resume": session.resume(); return [];
  }
}

/** Exclusive native/session lifetime for one host's serialized Region owner. */
function createSessionResident(options: SessionResidentOptions): SessionResident {
  let accepted: { revision: number; session: GameSession; port: KernelPort; capture: SessionSnapshot } | undefined;
  let attempt: { provisionalRevision: number; session: GameSession; port: KernelPort; capture: SessionSnapshot } | undefined;
  const make = (snapshot: SessionSnapshot) => {
    const port = options.createKernel();
    try {
      const session = new GameSession({ port, pack: options.pack, seed: options.seed });
      session.restore(snapshot);
      return { session, port };
    } catch (error) { port.dispose(); throw error; }
  };
  const disposeEntry = (entry: { session: GameSession; port: KernelPort } | undefined) => {
    if (!entry) return;
    entry.port.dispose();
  };
  const discardAttempt = () => { disposeEntry(attempt); attempt = undefined; };
  const invalidate = () => { discardAttempt(); disposeEntry(accepted); accepted = undefined; };
  return {
    begin(revision, state, records) {
      if (!Number.isSafeInteger(revision) || revision < 0) throw new Error("invalid resident revision");
      discardAttempt();
      if (accepted?.revision === revision) {
        attempt = { provisionalRevision: revision, ...accepted };
        accepted = undefined;
        return;
      }
      disposeEntry(accepted); accepted = undefined;
      const hydrated = hydrateSession(state.session, records);
      const made = make(hydrated);
      attempt = { provisionalRevision: revision, ...made, capture: hydrated };
    },
    execute(candidate, command, records, baseRevision) {
      if (!attempt || attempt.provisionalRevision !== baseRevision) throw new Error("resident-attempt-missing");
      try {
        const before = attempt.capture;
        const results = applyCommand(attempt.session, command);
        const after = attempt.session.save();
        candidate.session = storeSession(after).session;
        attempt.capture = after;
        attempt.provisionalRevision++;
        return {
          status: "applied",
          result: JSON.parse(JSON.stringify({ tick: candidate.session.tick, paused: attempt.session.isPaused, results })) as Json,
          events: [],
          records: changedSessionRecords(before.kernel, after.kernel),
        };
      } catch (error) {
        invalidate();
        throw error;
      }
    },
    accept(revision) {
      if (!attempt || !Number.isSafeInteger(revision) || revision < 0 || revision !== attempt.provisionalRevision) {
        invalidate();
        throw new Error("resident-revision-mismatch");
      }
      accepted = { revision, session: attempt.session, port: attempt.port, capture: attempt.capture };
      attempt = undefined;
    },
    discard() {
      invalidate();
    },
    dispose() {
      invalidate();
    },
    observe(revision, state, records, use) {
      if (attempt) throw new Error("resident-attempt-active");
      if (accepted?.revision !== revision) {
        disposeEntry(accepted); accepted = undefined;
        const hydrated = hydrateSession(state.session, records);
        const made = make(hydrated);
        accepted = { revision, ...made, capture: hydrated };
      }
      try {
        return use(accepted.session);
      } catch (error) {
        invalidate();
        throw error;
      }
    },
  };
}

/** Native objects are disposable candidates. openRegion alone commits their JSON state. */
type SessionRegionProgramOptions = SessionResidentOptions & {
  resident: SessionResident;
};

function createSessionRegionProgram(options: SessionRegionProgramOptions): RegionProgram<SessionRegionState, RegionCommand> {
  const {
    implementationHash,
    ownerPrincipal,
    hostPrincipal,
    seed,
    createKernel,
  } = options;
  const pack = options.pack;
  if (!/^[a-f0-9]{64}$/.test(implementationHash))
    throw new Error("expected immutable implementation SHA256");
  if (!ownerPrincipal || !hostPrincipal || ownerPrincipal === hostPrincipal)
    throw new Error("player and clock authority must be distinct");
  function withSession<T>(
    snapshot: SessionSnapshot | undefined,
    use: (session: GameSession) => T,
  ): T {
    const port = createKernel();
    try {
      const session = new GameSession({
        port,
        pack: pack,
        seed: seed,
      });
      if (snapshot) session.restore(snapshot);
      else session.start();
      return use(session);
    } finally {
      port.dispose();
    }
  }
  return {
    id: `session-v2:${pack.id}:${implementationHash}`,
    initial: () => {
      const saved = storeSession(withSession(undefined, session => session.save()));
      return { state: { session: saved.session }, records: saved.records };
    },
    parseState(value) {
      const state = z.object({ session: z.unknown() }).strict().parse(value);
      const session = checkedStoredSession(state.session);
      if (session.game !== pack.id || session.gameVersion !== pack.version)
        throw new Error("stored session game mismatch");
      return { session };
    },
    parseCommand(value) {
      const command = commandSchema.parse(value);
      return command.kind === "action"
        ? { ...command, action: checkedAction(command.action) }
        : command;
    },
    authorize(principal, command) {
      return (
        principal === (command.kind === "step" ? hostPrincipal : ownerPrincipal)
      );
    },
    execute(candidate, command, records, baseRevision) {
      return options.resident.execute(candidate, command, records, baseRevision);
    },
  };
}

export function createSessionRegionRuntime(options: SessionResidentOptions) {
  const pack: GamePack = Object.freeze({
    ...options.pack,
    definition: options.pack.definition.slice(),
    environmentDefinition: options.pack.environmentDefinition?.slice(),
    presentation: options.pack.presentation ? Object.freeze({
      ...options.pack.presentation,
      controls: Object.freeze(options.pack.presentation.controls.map(control => Object.freeze({
        ...control, input: structuredClone(control.input),
      }))),
    }) : undefined,
    components: Object.freeze([...options.pack.components]),
    systems: Object.freeze(options.pack.systems.map(system => Object.freeze({ ...system, reads: Object.freeze([...system.reads]), writes: Object.freeze([...system.writes]) }))),
    commands: Object.freeze(Object.fromEntries(Object.entries(options.pack.commands ?? {}).map(([name, command]) => [name, Object.freeze({ ...command, reads: Object.freeze([...(command.reads ?? [])]), writes: Object.freeze([...command.writes]) })]))),
    initialActions: options.pack.initialActions ? structuredClone(options.pack.initialActions) : undefined,
  });
  const frozenOptions = Object.freeze({ ...options, pack });
  const resident = createSessionResident(frozenOptions);
  const program = createSessionRegionProgram({ ...frozenOptions, resident });
  return Object.freeze({ resident, program });
}
