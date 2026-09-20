import type { GamePack, KernelPort } from "../contracts";
import { GameSession } from "./session";
import { buildObservation } from "./observation";
import type { WorkerCommand, WorkerPlacementCommand, WorkerTerrainRegionsCommand, WorkerTransportEvent } from "./protocol";
import { terrainRegionRequestSchema } from "./terrain-regions";
import { startTerrainRegionStream } from "./terrain-region-stream";
import { terrainWireForRevision } from "./terrain-wire";

/** Worker-side host. The port must be backed by the Rust/WASM kernel. */
export class WorkerRuntime {
  private session?: GameSession;
  private port?: KernelPort;
  private accepted?: import("./session").SessionSnapshot;
  private seed = 1;
  private terrainStream?: ReturnType<typeof startTerrainRegionStream>;
  constructor(
    private readonly createKernel: () => KernelPort,
    private readonly packs: Readonly<Record<string, GamePack>>,
    private readonly emit: (event: WorkerTransportEvent) => void,
    private readonly options: Readonly<{ metrics?: boolean }> = {},
  ) {}
  private replaceSession(pack: GamePack, seed?: number, snapshot?: import("./session").SessionSnapshot): GameSession {
    this.terrainStream?.cancel(); this.terrainStream = undefined;
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
      this.whistleRevision = undefined;
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
    this.terrainStream?.cancel(); this.terrainStream = undefined;
    this.port?.dispose();
    this.port = undefined;
    this.session = undefined;
    this.accepted = undefined;
  }
  private frameEpoch = 0;
  private frameSequence = 0;
  private terrainRevision?: number;
  private whistleRevision?: number;
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
    const changes = observation.terrain !== undefined && this.terrainRevision !== undefined && this.terrainRevision !== observation.terrain.revision
      ? this.session.terrainChanges(this.terrainRevision) : undefined;
    const terrain = observation.terrain === undefined ? undefined : terrainWireForRevision(observation.terrain, this.terrainRevision, changes);
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
      terrainMarks: observation.terrainMarks,
      environmentVisuals: observation.environmentVisuals,
    });
    if (this.whistleRevision !== observation.whistleRevision) {
      this.whistleRevision = observation.whistleRevision;
      this.emit({ type: "whistle", agent: observation.whistleAgent, targets: observation.whistleTargets });
    }
  }
  command(command: WorkerCommand | WorkerPlacementCommand | WorkerTerrainRegionsCommand): void {
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
      if (command.type === "terrain-regions") {
        const { type: _type, ...raw } = command;
        const request = terrainRegionRequestSchema.parse(raw);
        this.terrainStream?.cancel();
        const stream = startTerrainRegionStream(request,
          key => session.terrainRegion(request, key, this.frameEpoch),
          event => this.emit({ type: "terrain-regions", event }));
        this.terrainStream = stream;
        void stream.done.finally(() => { if (this.terrainStream === stream) this.terrainStream = undefined; });
      } else if (command.type === "terrain-credit") {
        if (this.terrainStream?.requestId === command.requestId) this.terrainStream.acknowledge(command.received);
      } else if (command.type === "terrain-cancel") {
        if (this.terrainStream?.requestId === command.requestId) { this.terrainStream.cancel(); this.terrainStream = undefined; }
      } else if (command.type === "placement-decisions") {
        try {
          const result = session.placementDecisions(command.party as import("../contracts").EntityId, command.candidates);
          this.emit({ type: "placement-decisions", requestId: command.requestId,
            observationRevision: this.frameSequence, nativeRevision: result.revision,
            placementRevision: result.placementRevision,
            decisions: result.decisions });
        } catch (error) {
          this.emit({ type: "placement-decision-error", requestId: command.requestId,
            message: error instanceof Error ? error.message : String(error) });
        }
      } else if (command.type === "pause") {
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
        const started = this.options.metrics ? (globalThis.performance?.now?.() ?? Date.now()) : 0;
        const results = session.step(command.delta);
        const ended = this.options.metrics ? (globalThis.performance?.now?.() ?? Date.now()) : 0;
        this.captureAccepted();
        if (!this.options.metrics) this.emit({ type: "results", results });
        else this.emit({ type: "results", results, metrics: {
          stepCpuMs: ended - started,
          routeRequests: session.lastStepMetrics.routeRequests,
          snapshotBytes: this.accepted ? new TextEncoder().encode(JSON.stringify(this.accepted)).byteLength : 0,
          assignmentCost: session.lastStepMetrics.assignmentCost,
          activeWaterWork: null,
          activeGasWork: null,
        } });
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
