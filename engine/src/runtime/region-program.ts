import { z } from "zod";
import type { RegionProgram, Json } from "../../../src/engine/region/index.ts";
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

/** Native objects are disposable candidates. openRegion alone commits their JSON state. */
export function createSessionRegionProgram(options: {
  pack: GamePack;
  createKernel(): KernelPort;
  implementationHash: string;
  ownerPrincipal: string;
  hostPrincipal: string;
  seed: number;
}): RegionProgram<SessionRegionState, RegionCommand> {
  const {
    implementationHash,
    ownerPrincipal,
    hostPrincipal,
    seed,
    createKernel,
  } = options;
  const pack: GamePack = Object.freeze({
    ...options.pack,
    definition: options.pack.definition.slice(),
    environmentDefinition: options.pack.environmentDefinition?.slice(),
    components: Object.freeze([...options.pack.components]),
    systems: Object.freeze(
      options.pack.systems.map((system) =>
        Object.freeze({
          ...system,
          reads: Object.freeze([...system.reads]),
          writes: Object.freeze([...system.writes]),
        }),
      ),
    ),
    commands: Object.freeze(
      Object.fromEntries(
        Object.entries(options.pack.commands ?? {}).map(([name, command]) => [
          name,
          Object.freeze({
            ...command,
            reads: Object.freeze([...(command.reads ?? [])]),
            writes: Object.freeze([...command.writes]),
          }),
        ]),
      ),
    ),
    initialActions: options.pack.initialActions
      ? structuredClone(options.pack.initialActions)
      : undefined,
  });
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
    execute(candidate, command, records) {
      const before = hydrateSession(candidate.session, records);
      return withSession(before, (session) => {
        let results: unknown = [];
        switch (command.kind) {
          case "action":
            session.request(command.action);
            break;
          case "command":
            session.command(command.name, command.input);
            break;
          case "step":
            results = session.step(command.delta);
            break;
          case "pause":
            session.pause();
            break;
          case "resume":
            session.resume();
            break;
        }
        const after = session.save();
        candidate.session = storeSession(after).session;
        return {
          status: "applied",
          result: JSON.parse(
            JSON.stringify({
              tick: candidate.session.tick,
              paused: session.isPaused,
              results,
            }),
          ) as Json,
          events: [],
          records: changedSessionRecords(before.kernel, after.kernel),
        };
      });
    },
  };
}
