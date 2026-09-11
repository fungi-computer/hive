import type { GamePack, KernelPort } from "../contracts";
import { GameSession } from "./session";
import { buildObservation } from "./observation";
import type { WorkerCommand, WorkerTransportEvent } from "./protocol";
import { terrainWireForRevision } from "./terrain-wire";

/** Worker-side host. The port must be backed by the Rust/WASM kernel. */
export class WorkerRuntime {
  private session?: GameSession;
  private port?: KernelPort;
  private accepted?: import("./session").SessionSnapshot;
  private seed = 1;
  constructor(
    private readonly createKernel: () => KernelPort,
    private readonly packs: Readonly<Record<string, GamePack>>,
    private readonly emit: (event: WorkerTransportEvent) => void,
  ) {}
  private replaceSession(pack: GamePack, seed?: number, snapshot?: import("./session").SessionSnapshot): GameSession {
    const oldPort = this.port;
    this.port = undefined;
    this.session = undefined;
    oldPort?.dispose();
    let port: KernelPort | undefined;
    try {
      const created = this.createKernel();
      port = created;
      const session = new GameSession({ port: created, pack, seed });
      if (snapshot) session.restore(snapshot); else session.start();
      this.port = port;
      this.session = session;
      return session;
    } catch (error) {
      port?.dispose(); this.port = undefined; this.session = undefined; throw error;
    }
  }
  private captureAccepted(): void {
    if (!this.session) throw new Error("runtime has not started");
    this.accepted = this.session.save();
  }
  private recover(): void {
    this.terrainRevision = undefined;
    if (!this.accepted) {
      this.port?.dispose(); this.port = undefined; this.session = undefined; return;
    }
    const pack = this.packs[this.accepted.game];
    if (!pack) throw new Error("accepted game is unavailable");
    this.replaceSession(pack, this.seed, this.accepted);
  }
  dispose(): void {
    this.port?.dispose();
    this.port = undefined;
    this.session = undefined;
    this.accepted = undefined;
  }
  private frameEpoch = 0;
  private frameSequence = 0;
  private terrainRevision?: number;
  private emitObservation(
    discontinuity = false,
    stateOnly = false,
  ): void {
    if (!this.session) return;
    if (stateOnly) {
      this.emit({ type: "state", paused: this.session.isPaused });
      return;
    }
    if (discontinuity) { this.frameEpoch++; this.terrainRevision = undefined; }
    const observation = buildObservation(this.session, {
      epoch: this.frameEpoch,
      sequence: this.frameSequence + 1,
    });
    this.frameSequence = observation.sequence;
    const terrain = observation.terrain === undefined ? undefined : terrainWireForRevision(observation.terrain, this.terrainRevision);
    if (observation.terrain === undefined) this.terrainRevision = undefined;
    else this.terrainRevision = observation.terrain.revision;
    this.emit({
      type: "frame",
      time: observation.time,
      epoch: observation.epoch,
      sequence: observation.sequence,
      facts: observation.facts,
      ...(terrain === undefined ? {} : { terrain }),
      cues: observation.cues,
    });
    this.emit({
      type: "presentation",
      facts: observation.presentationFacts,
      controls: observation.presentationControls,
      terrainMarks: observation.terrainMarks,
      environmentVisuals: observation.environmentVisuals,
    });
  }
  command(command: WorkerCommand): void {
    try {
      if (command.type === "start") {
        const pack = this.packs[command.game];
        if (!pack || !Object.hasOwn(this.packs, command.game))
          throw new Error(`unknown game ${command.game}`);
        const started = this.replaceSession(pack, command.seed);
        this.seed = command.seed ?? 1;
        this.captureAccepted();
        this.emit({ type: "ready", game: pack.id });
        this.emit({ type: "state", paused: started.isPaused });
        this.emitObservation(true);
        return;
      }
      const session = this.session;
      if (!session) throw new Error("runtime has not started");
      if (command.type === "pause") {
        session.pause();
        this.captureAccepted();
        this.emitObservation(false, true);
      } else if (command.type === "resume") {
        session.resume();
        this.captureAccepted();
        this.emitObservation(false, true);
      } else if (command.type === "reset") {
        session.reset();
        this.captureAccepted();
        this.emitObservation(true);
        this.emit({ type: "state", paused: session.isPaused });
      } else if (command.type === "action") {
        session.request(command.action);
        this.captureAccepted();
      } else if (command.type === "command") {
        session.command(command.name, command.input);
        this.captureAccepted();
      }
      else if (command.type === "save")
        this.emit({ type: "saved", snapshot: session.save() });
      else if (command.type === "restore") {
        session.restore(command.snapshot);
        this.captureAccepted();
        this.emit({ type: "restored" });
        this.emitObservation(true);
        this.emit({ type: "state", paused: session.isPaused });
      } else if (command.type === "step") {
        const results = session.step(command.delta);
        this.captureAccepted();
        this.emit({ type: "results", results });
        this.emitObservation();
      }
    } catch (error) {
      try { this.recover(); } catch { this.port?.dispose(); this.port = undefined; this.session = undefined; }
      this.emit({
        type: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
