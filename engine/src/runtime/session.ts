import { checkedAction } from "./actions";
import type {
  ActionRequest,
  ActionResult,
  ActionOutcome,
  GameCommandResult,
  GamePack,
  KernelPort,
  QuerySpec,
  QueryRow,
  RandomSource,
  SimulationClock,
  WriteContext,
  WriteIntent,
} from "../contracts";

class DeterministicRandom implements RandomSource {
  private value: number;
  constructor(seed: number) {
    this.value = seed >>> 0;
  }
  next(): number {
    this.value = (Math.imul(1664525, this.value) + 1013904223) | 0;
    return (this.value >>> 0) / 0x1_0000_0000;
  }
  state(): number {
    return this.value >>> 0;
  }
  restore(value: number): void {
    if (!Number.isInteger(value) || value < 0 || value > 0xffffffff)
      throw new Error("invalid random state");
    this.value = value >>> 0;
  }
}

export interface SessionOptions {
  readonly seed?: number;
  readonly port: KernelPort;
  readonly pack: GamePack;
}
export interface SessionSnapshot {
  readonly format: "hive-session";
  readonly version: 4;
  readonly game: string;
  readonly gameVersion: number;
  readonly paused: boolean;
  readonly kernel: ReturnType<KernelPort["snapshot"]>;
  readonly now: number;
  readonly tick: number;
  readonly random: number;
  readonly outcomes: readonly ActionOutcome[];
  readonly pendingActions: readonly ActionRequest[];
  readonly pendingWrites: readonly WriteIntent[];
  readonly systems: readonly { id: string; version: number }[];
}
export class GameSession {
  readonly pack: GamePack;
  private readonly port: KernelPort;
  private readonly random: DeterministicRandom;
  private readonly seed: number;
  private paused = false;
  private now = 0;
  private tick = 0;
  private outcomes: ActionOutcome[] = [];
  private pendingActions: ActionRequest[] = [];
  private pendingWrites: WriteIntent[] = [];
  private readonly reserved = new Set(["hive.position", "hive.body", "hive.container", "hive.lot", "hive.destination", "hive.obstacle", "hive.visual"]);
  constructor(options: SessionOptions) {
    this.pack = options.pack;
    this.port = options.port;
    this.seed = (options.seed ?? 1) >>> 0;
    this.random = new DeterministicRandom(this.seed);
    for (const definition of Object.values(this.pack.commands ?? {})) {
      const commandWrites = new Set(definition.writes.map((component) => component.id));
      if (this.pack.systems.some((system) => system.writes.some((component) => commandWrites.has(component.id)))) throw new Error("command and system write ownership overlaps");
    }
  }
  start(): void {
    this.port.load(this.pack.definition);
    if (this.pack.initialActions)
      this.pendingActions.push(...this.pack.initialActions);
  }
  pause(): void {
    this.paused = true;
  }
  resume(): void {
    this.paused = false;
  }
  get isPaused(): boolean {
    return this.paused;
  }
  reset(): void {
    this.random.restore(this.seed);
    this.paused = false;
    this.now = 0;
    this.tick = 0;
    this.outcomes = [];
    this.pendingActions = [];
    this.pendingWrites = [];
    this.start();
  }
  query<T extends object>(spec: QuerySpec<T>): readonly QueryRow<T>[] {
    return this.port.query(spec);
  }
  request(action: ActionRequest): void {
    if (this.pendingActions.length >= 128)
      throw new Error("pending action limit reached");
    this.pendingActions.push(checkedAction(action));
  }
  command(name: string, input: unknown): void {
    const handler = this.pack.commands?.[name];
    if (!handler || !Object.hasOwn(this.pack.commands ?? {}, name))
      throw new Error("unknown game command");
    const reads = new Set((handler.reads ?? []).map((component) => component.id));
    const result: GameCommandResult = handler.run({ query: (spec) => {
      for (const component of spec.components) if (!reads.has(component.id)) throw new Error(`command ${name} cannot read ${component.id}`);
      return this.queryOverlay(spec);
    } }, structuredClone(input));
    if (!result || !Array.isArray(result.actions) || !Array.isArray(result.writes)) throw new Error("invalid command result");
    const actions = result.actions.map(checkedAction);
    const writes = this.validateWrites(result.writes, handler.writes);
    if (this.pendingActions.length + actions.length > 128 || this.pendingWrites.length + writes.length > 128)
      throw new Error("pending action limit reached");
    this.pendingActions.push(...actions);
    this.mergePendingWrites(writes);
  }
  private validateWrites(writes: readonly WriteIntent[], allowed: readonly import("../contracts").ComponentDefinition<any>[]): WriteIntent[] {
    const definitions = new Map(this.pack.components.map((component) => [component.id, component]));
    const permitted = new Set(allowed.map((component) => component.id));
    return writes.map((write) => {
      if (!permitted.has(write.component) || this.reserved.has(write.component)) throw new Error(`undeclared or physical write ${write.component}`);
      const definition = definitions.get(write.component);
      if (!definition || !definition.validate(write.value)) throw new Error(`invalid component write ${write.component}`);
      if (!this.port.query({ components: [definition] }).some((row) => row.id === write.entity)) throw new Error(`unknown write target ${write.entity}`);
      return structuredClone(write);
    });
  }
  private mergePendingWrites(writes: readonly WriteIntent[]): void {
    for (const write of writes) { const index = this.pendingWrites.findIndex((existing) => existing.entity === write.entity && existing.component === write.component); if (index >= 0) this.pendingWrites[index] = write; else this.pendingWrites.push(write); }
  }
  private queryOverlay<T extends object>(spec: QuerySpec<T>): readonly QueryRow<T>[] {
    return this.port.query(spec).map((row) => ({ id: row.id, get: <V extends object>(definition: import("../contracts").ComponentDefinition<V>) => {
      const pending = this.pendingWrites.find((write) => write.entity === row.id && write.component === definition.id);
      return (pending ? pending.value : row.get(definition)) as V;
    } }));
  }
  step(delta: number): readonly ActionResult[] {
    if (delta < 0 || delta > 1 || !Number.isFinite(delta))
      throw new Error("delta must be finite and between zero and one second");
    if (this.paused) return [];
    const before = this.save();
    try {
      const clock: SimulationClock = Object.freeze({
        now: this.now,
        delta,
        tick: this.tick,
      });
      const writes: WriteIntent[] = this.pendingWrites.splice(0);
      const actions: ActionRequest[] = this.pendingActions.splice(0);
      let systemActionCount = 0;
      const context: WriteContext = {
        clock,
        random: this.random,
        outcomes: structuredClone(this.outcomes),
        query: (spec) => this.queryOverlay(spec),
        write: (definition, entity, value) => {
          if (
            [
              "hive.position",
              "hive.body",
              "hive.container",
              "hive.lot",
              "hive.carrying",
              "hive.destination",
              "hive.obstacle",
              "hive.visual",
            ].includes(definition.id)
          )
            throw new Error(
              `Physical component ${definition.id} is kernel-owned`,
            );
          writes.push({ component: definition.id, entity, value });
        },
        action: (action) => {
          if (++systemActionCount > 128)
            throw new Error("game systems exceeded 128 actions per step");
          actions.push(checkedAction(action));
        },
      };
      for (const definition of this.pack.systems) {
        if (
          definition.every !== undefined &&
          this.tick % definition.every !== 0
        )
          continue;
        definition.run(context);
      }
      const checkedWrites = this.validateWrites(writes, this.pack.systems.flatMap((system) => system.writes));
      const results = this.port.advance(delta, checkedWrites, actions);
      if (results.length !== actions.length)
        throw new Error("kernel result count mismatch");
      this.outcomes = actions.map((action, index) => ({
        action,
        result: results[index],
      }));
      this.now += delta;
      this.tick++;
      return results;
    } catch (error) {
      this.port.restore(before.kernel);
      this.now = before.now;
      this.tick = before.tick;
      this.random.restore(before.random);
      this.pendingActions = [...before.pendingActions];
      this.pendingWrites = [...before.pendingWrites];
      this.outcomes = structuredClone([...before.outcomes]);
      throw error;
    }
  }
  save(): SessionSnapshot {
    return {
      format: "hive-session",
      version: 4,
      outcomes: structuredClone(this.outcomes),
      game: this.pack.id,
      gameVersion: this.pack.version,
      paused: this.paused,
      kernel: this.port.snapshot(),
      now: this.now,
      tick: this.tick,
      random: this.random.state(),
      pendingActions: structuredClone(this.pendingActions),
      pendingWrites: structuredClone(this.pendingWrites),
      systems: this.pack.systems.map((system) => ({
        id: system.id,
        version: system.version,
      })),
    };
  }
  restore(snapshot: SessionSnapshot): void {
    if (
      snapshot.format !== "hive-session" ||
      snapshot.version !== 4 ||
      snapshot.game !== this.pack.id ||
      snapshot.gameVersion !== this.pack.version ||
      typeof snapshot.paused !== "boolean" ||
      snapshot.now < 0 ||
      !Number.isFinite(snapshot.now) ||
      !Number.isSafeInteger(snapshot.tick) ||
      snapshot.tick < 0 ||
      !Number.isInteger(snapshot.random) ||
      snapshot.random < 0 ||
      snapshot.random > 0xffffffff
    )
      throw new Error("invalid session snapshot");
    if (
      !Array.isArray(snapshot.pendingActions) ||
      snapshot.pendingActions.length > 128 ||
      !Array.isArray(snapshot.pendingWrites) ||
      snapshot.pendingWrites.length > 128 ||
      !Array.isArray(snapshot.systems)
    )
      throw new Error("invalid session queues");
    const pending = snapshot.pendingActions.map(checkedAction);
    const pendingWrites = this.validateWrites(snapshot.pendingWrites, this.pack.components.filter((component) => !this.reserved.has(component.id)));
    if (!Array.isArray(snapshot.outcomes) || snapshot.outcomes.length > 256)
      throw new Error("invalid action outcomes");
    const outcomes = snapshot.outcomes.map((outcome) => {
      if (
        !outcome.result ||
        typeof outcome.result.accepted !== "boolean" ||
        outcome.result.revision !== snapshot.kernel.revision ||
        (outcome.result.reason !== undefined &&
          typeof outcome.result.reason !== "string")
      )
        throw new Error("invalid action result");
      return {
        action: checkedAction(outcome.action),
        result: structuredClone(outcome.result),
      };
    });
    const canonical = JSON.parse(snapshot.kernel.json);
    const definition = JSON.parse(
      new TextDecoder().decode(this.pack.definition),
    );
    if (
      canonical.scene?.game !== this.pack.id ||
      canonical.time !== snapshot.now ||
      canonical.revision !== snapshot.kernel.revision ||
      canonical.revision !== snapshot.tick
    )
      throw new Error("snapshot world does not match session");
    const schema = (items: { id: string; version: number; fields: object }[]) =>
      items
        .filter(
          (item) =>
            ![
              "hive.position",
              "hive.body",
              "hive.container",
              "hive.lot",
              "hive.destination",
              "hive.obstacle",
              "hive.visual",
            ].includes(item.id),
        )
        .map((item) =>
          JSON.stringify([
            item.id,
            item.version,
            Object.entries(item.fields).sort(),
          ]),
        )
        .sort()
        .join("\n");
    if (schema(canonical.scene.components) !== schema(definition.components))
      throw new Error("snapshot component versions do not match");
    const expected = this.pack.systems
      .map((system) => `${system.id}@${system.version}`)
      .join(",");
    const actual = snapshot.systems
      .map((system) => `${system.id}@${system.version}`)
      .join(",");
    if (expected !== actual)
      throw new Error("snapshot game system versions do not match");
    this.port.restore(snapshot.kernel);
    this.now = snapshot.now;
    this.tick = snapshot.tick;
    this.random.restore(snapshot.random);
    this.pendingActions = pending;
    this.pendingWrites = pendingWrites;
    this.outcomes = outcomes;
    this.paused = snapshot.paused;
  }
  renderFacts(limit = 512) {
    return this.port.renderFacts(limit);
  }
}
