import type { ActionRequest, ActionResult, GamePack, KernelPort, QuerySpec, QueryRow, RandomSource, SimulationClock, WriteContext, WriteIntent } from "../contracts";

class DeterministicRandom implements RandomSource {
  private value: number;
  constructor(seed: number) { this.value = seed >>> 0; }
  next(): number { this.value = Math.imul(1664525, this.value) + 1013904223 | 0; return (this.value >>> 0) / 0x1_0000_0000; }
  state(): number { return this.value >>> 0; }
  restore(value: number): void { if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) throw new Error("invalid random state"); this.value = value >>> 0; }
}

export interface SessionOptions { readonly seed?: number; readonly port: KernelPort; readonly pack: GamePack }
export interface SessionSnapshot { readonly format: "hive-session"; readonly version: 1; readonly kernel: ReturnType<KernelPort["snapshot"]>; readonly now: number; readonly tick: number; readonly random: number; readonly pendingActions: readonly ActionRequest[]; readonly pendingWrites: readonly WriteIntent[]; readonly systems: readonly { id: string; version: number }[] }
export class GameSession {
  readonly pack: GamePack;
  private readonly port: KernelPort;
  private readonly random: DeterministicRandom;
  private readonly seed: number;
  private paused = false;
  private now = 0;
  private tick = 0;
  private pendingWrites: WriteIntent[] = [];
  private pendingActions: ActionRequest[] = [];
  constructor(options: SessionOptions) {
    this.pack = options.pack; this.port = options.port; this.seed = (options.seed ?? 1) >>> 0; this.random = new DeterministicRandom(this.seed);
  }
  start(): void { this.port.load(this.pack.definition); if (this.pack.initialActions) this.pendingActions.push(...this.pack.initialActions); }
  pause(): void { this.paused = true; }
  resume(): void { this.paused = false; }
  get isPaused(): boolean { return this.paused; }
  reset(): void { this.random.restore(this.seed); this.paused = false; this.now = 0; this.tick = 0; this.pendingWrites = []; this.pendingActions = []; this.start(); }
  query<T extends object>(spec: QuerySpec<T>): readonly QueryRow<T>[] { return this.port.query(spec); }
  request(action: ActionRequest): void { this.pendingActions.push(action); }
  step(delta: number): readonly ActionResult[] {
    if (delta < 0 || delta > 1 || !Number.isFinite(delta)) throw new Error("delta must be finite and between zero and one second");
    if (this.paused) return [];
    const before = this.save();
    try {
      const clock: SimulationClock = Object.freeze({ now: this.now, delta, tick: this.tick });
      const writes: WriteIntent[] = [];
      const actions: ActionRequest[] = this.pendingActions.splice(0);
      const context: WriteContext = {
      clock, random: this.random,
      query: spec => this.port.query(spec),
      write: (definition, entity, value) => {
        if (["hive.position", "hive.body", "hive.container", "hive.lot", "hive.carrying", "hive.destination", "hive.obstacle", "hive.visual"].includes(definition.id)) throw new Error(`Physical component ${definition.id} is kernel-owned`);
        writes.push({ component: definition.id, entity, value });
      },
      action: action => actions.push(action),
      };
      for (const definition of this.pack.systems) {
        if (definition.every !== undefined && this.tick % definition.every !== 0) continue;
        definition.run(context);
      }
      const results = this.port.advance(delta, writes, actions);
      this.now += delta; this.tick++;
      return results;
    } catch (error) {
      this.port.restore(before.kernel); this.now = before.now; this.tick = before.tick; this.random.restore(before.random);
      this.pendingActions = [...before.pendingActions]; this.pendingWrites = [...before.pendingWrites];
      throw error;
    }
  }
  save(): SessionSnapshot { return { format: "hive-session", version: 1, kernel: this.port.snapshot(), now: this.now, tick: this.tick, random: this.random.state(), pendingActions: [...this.pendingActions], pendingWrites: [...this.pendingWrites], systems: this.pack.systems.map(system => ({ id: system.id, version: system.version })) }; }
  restore(snapshot: SessionSnapshot): void {
    if (snapshot.format !== "hive-session" || snapshot.version !== 1 || !Number.isFinite(snapshot.now) || !Number.isSafeInteger(snapshot.tick) || snapshot.tick < 0 || !Number.isInteger(snapshot.random) || snapshot.random < 0 || snapshot.random > 0xffffffff) throw new Error("invalid session snapshot");
    const expected = this.pack.systems.map(system => `${system.id}@${system.version}`).join(",");
    const actual = snapshot.systems.map(system => `${system.id}@${system.version}`).join(",");
    if (expected !== actual) throw new Error("snapshot game system versions do not match");
    this.port.restore(snapshot.kernel); this.now = snapshot.now; this.tick = snapshot.tick; this.random.restore(snapshot.random); this.pendingActions = [...snapshot.pendingActions]; this.pendingWrites = [...snapshot.pendingWrites];
  }
  renderFacts(limit = 512) { return this.port.renderFacts(limit); }
}
