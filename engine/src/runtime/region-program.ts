import { z } from "zod";
import type { RegionProgram, Json, RegionRecordReader, RegionTransition, RegionExecutionContext } from "../../../src/engine/region/index.ts";
import type { GamePack, KernelPort, ActionRequest, CommandScope } from "../contracts";
import { GameSession, type SessionSnapshot } from "./session";
import { checkedAction } from "./actions";
import { checkedStoredSession, storeSession, hydrateSession, type StoredSession } from "./session-record-store";

const commandSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("join-party"), credentialBindingId: z.string().min(1).max(160) }).strict(),
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

function hostScope(options: Pick<SessionResidentOptions, "hostPrincipal" | "scopeForPrincipal">): CommandScope {
  const scope = options.scopeForPrincipal(options.hostPrincipal);
  if (scope?.kind !== "host") throw new Error("region-host-principal-unbound");
  return scope;
}
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
  /** Explicit pause/resume permission; does not grant physical host authority. */
  readonly clockControllerPrincipals?: readonly string[];
  /** Authenticated host resolver; returning null rejects an unbound principal. */
  readonly scopeForPrincipal: (principal: string) => CommandScope | null;
};

export type SessionCandidateCost = {
  readonly advanceWallMs: number;
  readonly captureWallMs: number;
  readonly recordPuts: number;
  readonly recordRemoves: number;
  readonly changedRecordBytes: number;
};

export interface SessionResident {
  readonly findSafeSpawn: (revision: number, state: SessionRegionState, records: RegionRecordReader, offsets?: readonly (readonly [number, number])[]) => { readonly x: number; readonly y: number; readonly z: number } | null;
  readonly begin: (revision: number, state: SessionRegionState, records: RegionRecordReader) => void;
  readonly execute: (candidate: SessionRegionState, command: RegionCommand, records: RegionRecordReader, baseRevision: number, context: RegionExecutionContext) => RegionTransition;
  readonly accept: (revision: number) => void;
  /** Diagnostics leave the owner only after a committed candidate is accepted. */
  readonly takeCandidateCost: () => SessionCandidateCost | undefined;
  readonly discard: () => void;
  readonly dispose: () => void;
  readonly observe: <T>(revision: number, state: SessionRegionState, records: RegionRecordReader, use: (session: GameSession) => T) => T;
}

function applyCommand(session: GameSession, command: RegionCommand, context: RegionExecutionContext, scope: CommandScope): unknown {
  switch (command.kind) {
    case "action":
      session.request(command.action);
      // Party establishment is a host-only composite: settle its prepared
      // native group in this same Region candidate and receipt.
      return command.action.kind === "instantiate-actors" ? session.step(0) : [];
    case "command": session.command(command.name, command.input, scope); return [];
    case "join-party": {
      if (scope.kind !== "host") throw new Error("party join requires host scope");
      const capability = session.pack.partyJoin;
      if (!capability) throw new Error("party join is unavailable for this pack");
      const identity = session.partyJoinIdentity(command.credentialBindingId);
      if (identity.status === "existing") return { player: identity.player, party: identity.party, people: identity.people };
      const spawn = session.findSafeSpawn(capability.footprint);
      if (!spawn) throw new Error("spawn-unavailable");
      const prepared = capability.prepare(spawn);
      session.request({ kind: "instantiate-actors", bindingId: command.credentialBindingId, expectedSequence: identity.sequence, plan: prepared });
      const result = session.step(0)[0];
      if (!result?.accepted || result.entityId !== identity.party) throw new Error(result?.reason ?? "party join rejected");
      const committed = session.partyJoinIdentity(command.credentialBindingId);
      if (committed.status !== "existing") throw new Error("party join binding was not committed");
      return { player: committed.player, party: committed.party, people: committed.people };
    }
    case "step":
      // The clock receipt proves an occurrence was committed. Native action
      // results from internal jobs can be numerous and already belong to the
      // candidate's physical state/outcome owner; echoing them into the clock
      // receipt can exceed its bounded durable result budget.
      session.step(command.delta);
      return null;
    case "pause": session.pause(); return [];
    case "resume": session.resume(); return [];
  }
}

/** Exclusive native/session lifetime for one host's serialized Region owner. */
function createSessionResident(options: SessionResidentOptions): SessionResident {
  let accepted: { revision: number; session: GameSession; port: KernelPort } | undefined;
  let attempt: { provisionalRevision: number; session: GameSession; port: KernelPort } | undefined;
  let candidateCost: SessionCandidateCost | undefined;
  const make = (snapshot: SessionSnapshot) => {
    const port = options.createKernel();
    try {
      // Hydration is a host operation.  The principal for a later command is
      // resolved again in execute; never retain an authenticated player here.
      const session = new GameSession({
        port,
        pack: options.pack,
        seed: options.seed,
        scope: hostScope(options),
      });
      session.restore(snapshot);
      return { session, port };
    } catch (error) {
      try { port.dispose(); } catch { /* preserve the failed construction or restore */ }
      throw error;
    }
  };
  const disposeEntry = (entry: { session: GameSession; port: KernelPort } | undefined) => {
    if (!entry) return;
    entry.port.dispose();
  };
  const discardAttempt = () => {
    candidateCost = undefined;
    const doomed = attempt;
    attempt = undefined;
    disposeEntry(doomed);
  };
  const detachEntries = () => {
    candidateCost = undefined;
    // Detach every entry before calling user/native cleanup. A trapped native
    // destructor must not leave a poisoned resident available for reuse.
    const doomed = [attempt, accepted];
    attempt = undefined;
    accepted = undefined;
    return doomed;
  };
  const cleanupEntries = (entries: ReturnType<typeof detachEntries>) => {
    let cleanupFailed = false;
    let cleanupErrorSet = false;
    let cleanupError: unknown;
    for (const entry of entries) {
      try { disposeEntry(entry); }
      catch (error) {
        cleanupFailed = true;
        if (!cleanupErrorSet) {
          cleanupErrorSet = true;
          cleanupError = error;
        }
      }
    }
    return { cleanupFailed, cleanupError };
  };
  const invalidate = () => {
    const { cleanupFailed, cleanupError } = cleanupEntries(detachEntries());
    if (cleanupFailed) throw cleanupError;
  };
  const invalidateAfterFailure = () => {
    // The application error is already in flight, including when it is the
    // JavaScript value undefined. Cleanup failures must never replace it.
    cleanupEntries(detachEntries());
  };
  return {
    begin(revision, state, records) {
      if (!Number.isSafeInteger(revision) || revision < 0) throw new Error("invalid resident revision");
      discardAttempt();
      if (accepted?.revision === revision) {
        attempt = { provisionalRevision: revision, ...accepted };
        accepted = undefined;
        return;
      }
      const prior = accepted;
      accepted = undefined;
      disposeEntry(prior);
      const hydrated = hydrateSession(state.session, records);
      const made = make(hydrated);
      attempt = { provisionalRevision: revision, ...made };
    },
    execute(candidate, command, records, baseRevision, context) {
      if (!attempt || attempt.provisionalRevision !== baseRevision) throw new Error("resident-attempt-missing");
      try {
        const scope = options.scopeForPrincipal(context.principal);
        if (!scope) throw new Error("region-principal-unbound");
        const session = attempt.session;
        const { results, after, advanceWallMs, captureWallMs } = session.runDisposableCandidate(() => {
          const advanceStarted = performance.now();
          const results = applyCommand(session, command, context, scope);
          const advanceWallMs = performance.now() - advanceStarted;
          const captureStarted = performance.now();
          const after = session.captureForCommit();
          return { results, after, advanceWallMs, captureWallMs: performance.now() - captureStarted };
        });
        candidateCost = {
          advanceWallMs,
          captureWallMs,
          recordPuts: after.changes.puts.length,
          recordRemoves: after.changes.removes.length,
          changedRecordBytes: after.changes.puts.reduce((sum, record) =>
            sum + new TextEncoder().encode(record.key).byteLength + record.bytes.byteLength + 16, 0),
        };
        candidate.session = storeSession(after.snapshot).session;
        attempt.provisionalRevision++;
        return {
          status: "applied",
          result: JSON.parse(JSON.stringify({ tick: candidate.session.tick, paused: attempt.session.isPaused, results })) as Json,
          events: [],
          records: after.changes,
        };
      } catch (error) {
        invalidateAfterFailure();
        throw error;
      }
    },
    accept(revision) {
      if (!attempt || !Number.isSafeInteger(revision) || revision < 0 || revision !== attempt.provisionalRevision) {
        const error = new Error("resident-revision-mismatch");
        invalidateAfterFailure();
        throw error;
      }
      accepted = { revision, session: attempt.session, port: attempt.port };
      attempt = undefined;
    },
    takeCandidateCost() {
      if (attempt) throw new Error("resident-attempt-active");
      const cost = candidateCost;
      candidateCost = undefined;
      return cost;
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
        const prior = accepted;
        accepted = undefined;
        disposeEntry(prior);
        const hydrated = hydrateSession(state.session, records);
        const made = make(hydrated);
        accepted = { revision, ...made };
      }
      try {
        return use(accepted.session);
      } catch (error) {
        invalidateAfterFailure();
        throw error;
      }
    },
    findSafeSpawn(revision, state, records, offsets) {
      return this.observe(revision, state, records, session => session.findSafeSpawn(offsets));
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
    let primaryFailure = false;
    try {
      const session = new GameSession({
        port,
        pack: pack,
        seed: seed,
        scope: hostScope(options),
      });
      if (snapshot) session.restore(snapshot);
      else session.start();
      return use(session);
    } catch (error) {
      primaryFailure = true;
      throw error;
    } finally {
      try { port.dispose(); }
      catch (error) { if (!primaryFailure) throw error; }
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
      const scope = options.scopeForPrincipal(principal);
      if (!scope) return false;
      if (command.kind === "pause" || command.kind === "resume")
        return scope.kind === "host" || options.clockControllerPrincipals?.includes(principal) === true;
      if (command.kind === "step" || command.kind === "action" || command.kind === "join-party")
        return scope.kind === "host";
      return scope.kind === "host" || scope.kind === "player";
    },
    execute(candidate, command, records, baseRevision, context) {
      return options.resident.execute(candidate, command, records, baseRevision, context);
    },
  };
}

export function createSessionRegionRuntime(options: SessionResidentOptions) {
  const pack: GamePack = Object.freeze({
    ...options.pack,
    definition: options.pack.definition.slice(),
    environmentDefinition: options.pack.environmentDefinition?.slice(),
    presentation: options.pack.presentation ? Object.freeze({ ...options.pack.presentation }) : undefined,
    components: Object.freeze([...options.pack.components]),
    systems: Object.freeze(options.pack.systems.map(system => Object.freeze({ ...system, reads: Object.freeze([...system.reads]), writes: Object.freeze([...system.writes]) }))),
    commands: Object.freeze(Object.fromEntries(Object.entries(options.pack.commands ?? {}).map(([name, command]) => [name, Object.freeze({ ...command, lifecycle: Object.freeze([...(command.lifecycle ?? [])]), reads: Object.freeze([...(command.reads ?? [])]), writes: Object.freeze([...command.writes]) })]))),
    bootstrapActions: options.pack.bootstrapActions ? structuredClone(options.pack.bootstrapActions) : undefined,
    initialActions: options.pack.initialActions ? structuredClone(options.pack.initialActions) : undefined,
    partyJoin: options.pack.partyJoin ? Object.freeze({ footprint: Object.freeze(options.pack.partyJoin.footprint.map(cell => Object.freeze([...cell] as [number, number]))), prepare: options.pack.partyJoin.prepare }) : undefined,
  });
  const frozenOptions = Object.freeze({ ...options, pack,
    clockControllerPrincipals: Object.freeze([...(options.clockControllerPrincipals ?? [])]),
  });
  const resident = createSessionResident(frozenOptions);
  const program = createSessionRegionProgram({ ...frozenOptions, resident });
  return Object.freeze({ resident, program });
}
