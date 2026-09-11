import type { PresentationCue } from "./presentation-cues";
import type { ActionRequest, RenderFact } from "../contracts";
import type { SessionSnapshot } from "./session";
import type { PresentationControl, TerrainMark } from "../presentation";
import type { TerrainWireFrame } from "./terrain-wire";

export type WorkerCommand =
  | { readonly type: "command"; readonly name: string; readonly input?: unknown }
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
      readonly terrain?: TerrainWireFrame;
      readonly cues: readonly PresentationCue[];
    }
  | {
      readonly type: "presentation";
      readonly facts: readonly {
        readonly id: string;
        readonly label: string;
        readonly value: string | number | boolean;
      }[];
      readonly controls: readonly PresentationControl[];
      readonly terrainMarks: readonly TerrainMark[];
    }
  | { readonly type: "saved"; readonly snapshot: SessionSnapshot }
  | { readonly type: "results"; readonly results: readonly unknown[] }
  | { readonly type: "error"; readonly message: string };
