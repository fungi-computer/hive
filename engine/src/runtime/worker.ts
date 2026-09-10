import type {
  ActionRequest,
  GamePack,
  KernelPort,
  RenderFact,
} from "../contracts";
import { GameSession } from "./session";
import type { SessionSnapshot } from "./session";
import { buildObservation } from "./observation";
import type { PresentationControl } from "../presentation";

export type WorkerCommand =
  | {
      readonly type: "command";
      readonly name: string;
      readonly input?: unknown;
    }
  | { readonly type: "start"; readonly game: string; readonly seed?: number }
  | { readonly type: "pause" | "resume" | "reset" }
  | { readonly type: "step"; readonly delta: number }
  | { readonly type: "action"; readonly action: ActionRequest }
  | { readonly type: "save" }
  | { readonly type: "restore"; readonly snapshot: SessionSnapshot };
export type WorkerEvent =
  | { readonly type: "ready"; readonly game: string }
  | { readonly type: "restored" }
  | { readonly type: "state"; readonly paused: boolean }
  | {
      readonly type: "frame";
      readonly time: number;
      readonly epoch: number;
      readonly sequence: number;
      readonly facts: readonly RenderFact[];
    }
  | {
      readonly type: "presentation";
      readonly facts: readonly {
        readonly id: string;
        readonly label: string;
        readonly value: string | number | boolean;
      }[];
      readonly controls: readonly PresentationControl[];
    }
  | { readonly type: "saved"; readonly snapshot: SessionSnapshot }
  | { readonly type: "results"; readonly results: readonly unknown[] }
  | { readonly type: "error"; readonly message: string };

/** Worker-side host. The port must be backed by the Rust/WASM kernel. */
export class WorkerRuntime {
  private session?: GameSession;
  constructor(
    private readonly kernel: KernelPort,
    private readonly packs: Readonly<Record<string, GamePack>>,
    private readonly emit: (event: WorkerEvent) => void,
  ) {}
  private frameEpoch = 0;
  private frameSequence = 0;
  private emitObservation(
    discontinuity = false,
    stateOnly = false,
  ): void {
    if (!this.session) return;
    if (stateOnly) {
      this.emit({ type: "state", paused: this.session.isPaused });
      return;
    }
    if (discontinuity) this.frameEpoch++;
    const observation = buildObservation(this.session, {
      epoch: this.frameEpoch,
      sequence: this.frameSequence + 1,
    });
    this.frameSequence = observation.sequence;
    this.emit({
      type: "frame",
      time: observation.time,
      epoch: observation.epoch,
      sequence: observation.sequence,
      facts: observation.facts,
    });
    this.emit({
      type: "presentation",
      facts: observation.presentationFacts,
      controls: observation.presentationControls,
    });
  }
  command(command: WorkerCommand): void {
    try {
      if (command.type === "start") {
        const pack = this.packs[command.game];
        if (!pack || !Object.hasOwn(this.packs, command.game))
          throw new Error(`unknown game ${command.game}`);
        this.session = new GameSession({
          port: this.kernel,
          pack,
          seed: command.seed,
        });
        this.session.start();
        this.emit({ type: "ready", game: pack.id });
        this.emit({ type: "state", paused: this.session.isPaused });
        this.emitObservation(true);
        return;
      }
      const session = this.session;
      if (!session) throw new Error("runtime has not started");
      if (command.type === "pause") {
        session.pause();
        this.emitObservation(false, true);
      } else if (command.type === "resume") {
        session.resume();
        this.emitObservation(false, true);
      } else if (command.type === "reset") {
        session.reset();
        this.emitObservation(true);
        this.emit({ type: "state", paused: session.isPaused });
      } else if (command.type === "action") session.request(command.action);
      else if (command.type === "command")
        session.command(command.name, command.input);
      else if (command.type === "save")
        this.emit({ type: "saved", snapshot: session.save() });
      else if (command.type === "restore") {
        session.restore(command.snapshot);
        this.emit({ type: "restored" });
        this.emitObservation(true);
        this.emit({ type: "state", paused: session.isPaused });
      } else if (command.type === "step") {
        const results = session.step(command.delta);
        this.emit({ type: "results", results });
        this.emitObservation();
      }
    } catch (error) {
      this.emit({
        type: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
