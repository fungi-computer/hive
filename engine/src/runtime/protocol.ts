import type { PresentationCue } from "./presentation-cues";
import type { ActionRequest, RenderFact } from "../contracts";
import type { SessionSnapshot } from "./session";
import type { EnvironmentVisual, PresentationControl, PresentationFact, TerrainMark } from "../presentation";
import type { TerrainWireFrame, TerrainWireObservation } from "./terrain-wire";

export type WorkerCommand =
  | { readonly type: "command"; readonly name: string; readonly input?: unknown }
  | { readonly type: "start"; readonly game: string; readonly seed?: number }
  | { readonly type: "pause" | "resume" | "reset" }
  | { readonly type: "step"; readonly delta: number }
  | { readonly type: "action"; readonly action: ActionRequest }
  | { readonly type: "save" }
  | { readonly type: "restore"; readonly snapshot: SessionSnapshot };

type WorkerEventBase =
  | { readonly type: "ready"; readonly game: string }
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
      readonly controls: readonly PresentationControl[];
      readonly terrainMarks: readonly TerrainMark[];
      readonly environmentVisuals: readonly EnvironmentVisual[];
    }
  | { readonly type: "saved"; readonly snapshot: SessionSnapshot }
  | { readonly type: "results"; readonly results: readonly unknown[]; readonly metrics?: RuntimeMetrics }
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
