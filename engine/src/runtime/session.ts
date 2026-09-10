import type { ActionRequest, ActionResult, GamePack, KernelPort, QuerySpec, QueryRow, RandomSource, SimulationClock, WriteContext, WriteIntent } from "../contracts";

class DeterministicRandom implements RandomSource {
  private state: number;
  constructor(seed: number) { this.state = seed >>> 0 || 1; }
  next(): number { this.state = Math.imul(1664525, this.state) + 1013904223 | 0; return (this.state >>> 0) / 0x1_0000_0000; }
  getState(): number { return this.state; }
  setState(value: number): void { this.state = value >>> 0 || 1; }
}

export interface SessionOptions { readonly seed?: number; readonly port: KernelPort; readonly pack: GamePack }
export interface SessionSnapshot { readonly format: "hive-session"; readonly version: 1; readonly kernel: ReturnType<KernelPort["snapshot"]>; readonly now: number; readonly tick: number; readonly random: number; readonly pendingActions: readonly ActionRequest[]; readonly pendingWrites: readonly WriteIntent[]; readonly systems: readonly { id: string; version: number }[] }
export class GameSession {
  readonly pack: GamePack;
  private readonly port: KernelPort;
  private readonly random: RandomSource;
  private paused = false;
  private now = 0;
  private tick = 0;
  private pendingWrites: WriteIntent[] = [];
  private pendingActions: ActionRequest[] = [];
  constructor(options: SessionOptions) {
    this.pack = options.pack; this.port = options.port; this.random = new DeterministicRandom(options.seed ?? 1);
  }
  start(): void { this.port.load(this.pack.definition); if (this.pack.initialActions) this.pendingActions.push(...this.pack.initialActions); }
  pause(): void { this.paused = true; }
  resume(): void { this.paused = false; }
  get isPaused(): boolean { return this.paused; }
  reset(): void { this.port.reset(); this.now = 0; this.tick = 0; this.pendingWrites = []; this.pendingActions = []; this.start(); }
  query<T extends object>(spec: QuerySpec<T>): readonly QueryRow<T>[] { return this.port.query(spec); }
  request(action: ActionRequest): void { this.pendingActions.push(action); }
  step(delta: number): readonly ActionResult[] {
    if (delta < 0 || !Number.isFinite(delta)) throw new Error("delta must be finite and non-negative");
    if (this.paused) return [];
    const before = this.save();
    const clock: SimulationClock = Object.freeze({ now: this.now, delta, tick: this.tick });
    const writes: WriteIntent[] = [];
    const actions: ActionRequest[] = this.pendingActions.splice(0);
    const context: WriteContext = {
      clock, random: this.random,
      query: spec => this.port.query(spec),
      write: (definition, entity, value) => {
        if (["hive.position", "hive.food", "hive.carrying", "hive.destination"].includes(definition.id)) throw new Error(`Physical component ${definition.id} is kernel-owned`);
        writes.push({ component: definition.id, entity, value });
      },
      action: action => actions.push(action),
    };
    for (const definition of this.pack.systems) {
      if (definition.every !== undefined && this.tick % definition.every !== 0) continue;
      definition.run(context);
    }
    try {
      const results = this.port.advance(delta, writes, actions);
      if (results.some(result => !result.accepted)) throw new Error(results.find(result => !result.accepted)?.reason ?? "kernel rejected action");
      this.now += delta; this.tick++;
      return results;
    } catch (error) {
      this.port.restore(before.kernel); this.now = before.now; this.tick = before.tick; this.random.setState(before.random);
      this.pendingActions = [...before.pendingActions]; this.pendingWrites = [...before.pendingWrites];
      throw error;
    }
  }
  save(): SessionSnapshot { return { format: "hive-session", version: 1, kernel: this.port.snapshot(), now: this.now, tick: this.tick, random: (this.random as DeterministicRandom).getState(), pendingActions: [...this.pendingActions], pendingWrites: [...this.pendingWrites], systems: this.pack.systems.map(system => ({ id: system.id, version: system.version })) }; }
  restore(snapshot: SessionSnapshot): void { if (snapshot.format !== "hive-session" || snapshot.version !== 1) throw new Error("unsupported session snapshot"); this.port.restore(snapshot.kernel); this.now = snapshot.now; this.tick = snapshot.tick; (this.random as DeterministicRandom).setState(snapshot.random); this.pendingActions = [...snapshot.pendingActions]; this.pendingWrites = [...snapshot.pendingWrites]; }
  renderFacts(limit = 512) { return this.port.renderFacts(limit); }
}
