import type { BuildingKind, Command } from "./model.ts";

export type GesturePoint = {
  cell: { x: number; z: number; level: number };
  screen: { x: number; y: number };
};
export type UiCommand =
  | { kind: "chop"; tree: string; direct?: boolean; actors?: string[] | null }
  | {
      kind: "build";
      type: BuildingKind;
      direction: number;
      x: number;
      z: number;
      level: number;
    }
  | { kind: "rest"; actors?: string[] }
  | { kind: "routine"; enabled: boolean; actors?: string[] }
  | { kind: "cancel" | "next"; job: string };

export type UiAction =
  | { kind: "select"; actor: string; toggle?: boolean }
  | { kind: "select-many"; ids: string[] }
  | { kind: "tree"; id: string; point: { x: number; y: number } }
  | { kind: "panel"; panel: "build" | "orders" | "menu" | "character" }
  | {
      kind:
        | "close-target"
        | "close"
        | "finish-placement"
        | "camera-move"
        | "escape"
        | "reset"
        | "pan-mode"
        | "help"
        | "rotate"
        | "pause"
        | "speed"
        | "focus"
        | "fullscreen";
    }
  | { kind: "tool"; tool: string | null }
  | { kind: "begin" | "move" | "end"; point: GesturePoint }
  | { kind: "placement-result"; point: GesturePoint }
  | { kind: "set-designation"; ids: string[] }
  | { kind: "commit-designation" }
  | { kind: "commit-result"; accepted: number }
  | { kind: "cutaway"; value: boolean }
  | { kind: "command"; command: UiCommand | Command }
  | { kind: "recruit"; actor: string }
  | { kind: "notice"; text: string }
  | { kind: "zoom"; delta: number }
  | { kind: "pan"; x: number; y: number };

function neverAction(value: never): never {
  throw new Error(`Unhandled UI action: ${String(value)}`);
}

// This is the actual producer/router boundary used by HUD and OpenTUI. Every
// discriminant is checked by TypeScript; a new action cannot silently fall
// through to an unowned producer.
export function routeUiAction(
  action: UiAction,
  run: (action: UiAction) => void,
): void {
  switch (action.kind) {
    case "select":
    case "select-many":
    case "tree":
    case "panel":
    case "close-target":
    case "close":
    case "finish-placement":
    case "camera-move":
    case "escape":
    case "reset":
    case "pan-mode":
    case "help":
    case "rotate":
    case "pause":
    case "speed":
    case "focus":
    case "fullscreen":
    case "tool":
    case "begin":
    case "move":
    case "end":
    case "placement-result":
    case "set-designation":
    case "commit-designation":
    case "commit-result":
    case "cutaway":
    case "command":
    case "recruit":
    case "notice":
    case "zoom":
    case "pan":
      run(action);
      return;
    default:
      return neverAction(action);
  }
}
