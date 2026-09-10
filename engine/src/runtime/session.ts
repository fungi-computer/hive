import type { ActionRequest, ActionResult, GamePack, KernelPort, QuerySpec, QueryRow, RandomSource, SimulationClock, WriteContext, WriteIntent } from "../contracts";

class DeterministicRandom implements RandomSource {
  private state: number;
  constructor(seed: number) { this.state = seed >>> 0 || 1; }
  next(): number { this.state = Math.imul(1664525, this.state) + 1013904223 | 0; return (this.state >>> 0) / 0x1_0000_0000; }
}

export interface SessionOptions { readonly seed?: number; readonly port: KernelPort; readonly pack: GamePack }
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
  async start(): Promise<void> { await this.port.load(this.pack.definition); if (this.pack.initialActions) this.pendingActions.push(...this.pack.initialActions); }
  pause(): void { this.paused = true; }
  resume(): void { this.paused = false; }
  get isPaused(): boolean { return this.paused; }
  async reset(): Promise<void> { await this.port.reset(); this.now = 0; this.tick = 0; this.pendingWrites = []; this.pendingActions = []; await this.start(); }
  query<T extends object>(spec: QuerySpec<T>): Promise<readonly QueryRow<T>[]> { return this.port.query(spec); }
  request(action: ActionRequest): void { this.pendingActions.push(action); }
  async step(delta: number): Promise<readonly ActionResult[]> {
    if (delta < 0 || !Number.isFinite(delta)) throw new Error("delta must be finite and non-negative");
    if (this.paused) return [];
    const clock: SimulationClock = Object.freeze({ now: this.now, delta, tick: this.tick });
    const writes: WriteIntent[] = [];
    const actions: ActionRequest[] = this.pendingActions.splice(0);
    const context: WriteContext = {
      clock, random: this.random,
      query: spec => this.port.query(spec),
      write: (definition, entity, value) => writes.push({ component: definition.id, entity, value }),
      action: action => actions.push(action),
    };
    for (const definition of this.pack.systems) {
      if (definition.every !== undefined && this.tick % definition.every !== 0) continue;
      definition.run(context);
    }
    const results = await this.port.advance(delta, writes, actions);
    this.now += delta; this.tick++;
    return results;
  }
  save() { return this.port.snapshot(); }
  restore(snapshot: Awaited<ReturnType<KernelPort["snapshot"]>>) { return this.port.restore(snapshot); }
  renderFacts(limit = 512) { return this.port.renderFacts(limit); }
}
