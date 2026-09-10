import type { ActionRequest, GamePack, KernelPort, KernelSnapshot, RenderFact } from "../contracts";
import { GameSession } from "./session";

export type WorkerCommand =
  | { readonly type: "start"; readonly pack: GamePack; readonly seed?: number }
  | { readonly type: "pause" | "resume" | "reset" }
  | { readonly type: "step"; readonly delta: number }
  | { readonly type: "action"; readonly action: ActionRequest }
  | { readonly type: "save" } | { readonly type: "restore"; readonly snapshot: KernelSnapshot };
export type WorkerEvent =
  | { readonly type: "ready"; readonly game: string }
  | { readonly type: "frame"; readonly facts: readonly RenderFact[] }
  | { readonly type: "saved"; readonly snapshot: KernelSnapshot }
  | { readonly type: "results"; readonly results: readonly unknown[] }
  | { readonly type: "error"; readonly message: string };

/** Worker-side host. The port must be backed by the Rust/WASM kernel. */
export class WorkerRuntime {
  private session?: GameSession;
  constructor(private readonly kernel: KernelPort, private readonly emit: (event: WorkerEvent) => void) {}
  async command(command: WorkerCommand): Promise<void> {
    try {
      if (command.type === "start") { this.session = new GameSession({ port: this.kernel, pack: command.pack, seed: command.seed }); await this.session.start(); this.emit({ type: "ready", game: command.pack.id }); return; }
      const session = this.session;
      if (!session) throw new Error("runtime has not started");
      if (command.type === "pause") session.pause();
      else if (command.type === "resume") session.resume();
      else if (command.type === "reset") await session.reset();
      else if (command.type === "action") session.request(command.action);
      else if (command.type === "save") this.emit({ type: "saved", snapshot: await session.save() });
      else if (command.type === "restore") await session.restore(command.snapshot);
      else if (command.type === "step") { const results = await session.step(command.delta); this.emit({ type: "results", results }); this.emit({ type: "frame", facts: await session.renderFacts() }); }
    } catch (error) { this.emit({ type: "error", message: error instanceof Error ? error.message : String(error) }); }
  }
}
