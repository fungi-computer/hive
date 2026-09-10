import type { ActionRequest, GamePack, KernelPort, RenderFact } from "../contracts";
import { GameSession } from "./session";
import type { SessionSnapshot } from "./session";

export type WorkerCommand =
  | { readonly type: "start"; readonly game: string; readonly seed?: number }
  | { readonly type: "pause" | "resume" | "reset" }
  | { readonly type: "step"; readonly delta: number }
  | { readonly type: "action"; readonly action: ActionRequest }
  | { readonly type: "save" } | { readonly type: "restore"; readonly snapshot: KernelSnapshot };
export type WorkerEvent =
  | { readonly type: "ready"; readonly game: string }
  | { readonly type: "frame"; readonly facts: readonly RenderFact[] }
  | { readonly type: "saved"; readonly snapshot: SessionSnapshot }
  | { readonly type: "results"; readonly results: readonly unknown[] }
  | { readonly type: "error"; readonly message: string };

/** Worker-side host. The port must be backed by the Rust/WASM kernel. */
export class WorkerRuntime {
  private session?: GameSession;
  constructor(private readonly kernel: KernelPort, private readonly packs: Readonly<Record<string, GamePack>>, private readonly emit: (event: WorkerEvent) => void) {}
  async command(command: WorkerCommand): Promise<void> {
    try {
      if (command.type === "start") { const pack = this.packs[command.game]; if (!pack) throw new Error(`unknown game ${command.game}`); this.session = new GameSession({ port: this.kernel, pack, seed: command.seed }); this.session.start(); this.emit({ type: "ready", game: pack.id }); return; }
      const session = this.session;
      if (!session) throw new Error("runtime has not started");
      if (command.type === "pause") session.pause();
      else if (command.type === "resume") session.resume();
      else if (command.type === "reset") session.reset();
      else if (command.type === "action") session.request(command.action);
      else if (command.type === "save") this.emit({ type: "saved", snapshot: await session.save() });
      else if (command.type === "restore") session.restore(command.snapshot);
      else if (command.type === "step") { const results = await session.step(command.delta); this.emit({ type: "results", results }); this.emit({ type: "frame", facts: await session.renderFacts() }); }
    } catch (error) { this.emit({ type: "error", message: error instanceof Error ? error.message : String(error) }); }
  }
}
