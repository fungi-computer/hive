import type { PresentationCue } from "./presentation-cues";
import type { ActionRequest, PlacementCandidate, PlacementDecision, RenderFact } from "../contracts";
import type { SessionSnapshot } from "./session";
import type { EnvironmentVisual, PresentationFact, TerrainMark } from "../presentation";
import type { WhistleAgentProjection } from "@fungi.computer/whistle";
import type { WhistleContextualTarget } from "./whistle";
import type { TerrainWireFrame, TerrainWireObservation } from "./terrain-wire";
import type { TerrainChunkReply, TerrainChunkRequest } from "./terrain-chunks";

export type WorkerCommand =
  | { readonly type: "command"; readonly name: string; readonly input?: unknown }
  | { readonly type: "start"; readonly game: string; readonly seed?: number }
  | { readonly type: "pause" | "resume" | "reset" }
  | { readonly type: "step"; readonly delta: number }
  | { readonly type: "action"; readonly action: ActionRequest }
  | { readonly type: "save" }
  | { readonly type: "restore"; readonly snapshot: SessionSnapshot };
export type PlacementDecisionQuery = {
  readonly party: string;
  readonly candidates: readonly PlacementCandidate[];
};
export type PlacementDecisionResult = {
  readonly observationRevision: number;
  readonly nativeRevision: number;
  readonly placementRevision: number;
  readonly decisions: readonly PlacementDecision[];
};
export type WorkerPlacementCommand = PlacementDecisionQuery & {
  readonly type: "placement-decisions";
  readonly requestId: number;
};
export type WorkerTerrainChunksCommand = TerrainChunkRequest & { readonly type: "terrain-chunks" };

type WorkerEventBase =
  | { readonly type: "ready"; readonly game: string }
  | { readonly type: "party"; readonly player: string; readonly party: string; readonly people: readonly [string, string] }
  | { readonly type: "connection"; readonly status: "online" | "recovering" | "unavailable"; readonly pending: number }
  | { readonly type: "restored" }
  | { readonly type: "state"; readonly paused: boolean }
  | {
      readonly type: "frame";
      readonly time: number;
      readonly epoch: number;
      readonly sequence: number;
      readonly facts: readonly RenderFact[];
      readonly terrain?: TerrainWireFrame;
      readonly cues: readonly PresentationCue[];
    }
  | {
      readonly type: "presentation";
      readonly facts: readonly PresentationFact[];
      readonly terrainMarks: readonly TerrainMark[];
      readonly environmentVisuals: readonly EnvironmentVisual[];
    }
  | { readonly type: "whistle"; readonly agent: readonly WhistleAgentProjection[]; readonly targets: readonly WhistleContextualTarget[] }
  | { readonly type: "saved"; readonly snapshot: SessionSnapshot }
  | { readonly type: "results"; readonly results: readonly unknown[]; readonly metrics?: RuntimeMetrics }
  | ({ readonly type: "placement-decisions"; readonly requestId: number } & PlacementDecisionResult)
  | { readonly type: "placement-decision-error"; readonly requestId: number; readonly message: string }
  | { readonly type: "terrain-chunks"; readonly reply: TerrainChunkReply }
  | { readonly type: "error"; readonly message: string };

export type WorkerEvent = WorkerEventBase;
export interface RuntimeMetrics {
  readonly stepCpuMs: number;
  readonly routeRequests: number;
  readonly snapshotBytes: number;
  readonly assignmentCost: number | null;
  readonly activeWaterWork: number | null;
  readonly activeGasWork: number | null;
}
export type WorkerTransportEvent = Exclude<WorkerEventBase, { readonly type: "frame" }> | {
  readonly type: "frame";
  readonly time: number;
  readonly epoch: number;
  readonly sequence: number;
  readonly facts: readonly RenderFact[];
  readonly terrain?: TerrainWireObservation;
  readonly cues: readonly PresentationCue[];
};
