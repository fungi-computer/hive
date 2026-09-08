import type { BuildingKind, Cell, Command } from "./model.ts";

export type ToolKind = "chop" | BuildingKind | "herb";
export type LogicalLevel = 0 | 1;

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
  | { kind: "deconstruct"; site: string }
  | { kind: "store"; lot: string; shelf: string }
  | { kind: "rest"; actors?: string[] }
  | { kind: "routine"; enabled: boolean; actors?: string[] }
  | {
      kind: "work";
      work: "chop" | "haul" | "build" | "garden";
      enabled: boolean;
      actors: string[];
    }
  | { kind: "cancel" | "next"; job: string }
  | { kind: "draft" | "undraft"; actor: string }
  | { kind: "go"; actor: string; target: Cell };

export type UiAction =
  | { kind: "select"; actor: string; toggle?: boolean }
  | { kind: "select-many"; ids: string[] }
  | { kind: "tree"; id: string; point: { x: number; y: number } }
  | { kind: "inspect-herb"; id: string; point: { x: number; y: number } }
  | { kind: "inspect-lot"; id: string; point: { x: number; y: number } }
  | { kind: "inspect-site"; id: string; point: { x: number; y: number } }
  | {
      kind: "panel";
      panel: "build" | "work" | "orders" | "menu" | "character";
    }
  | {
      kind:
        | "close-target"
        | "close"
        | "finish-placement"
        | "cancel-stroke"
        | "camera-move"
        | "escape"
        | "reset"
        | "continue"
        | "download-backup"
        | "download-raw-save"
        | "pan-mode"
        | "help"
        | "rotate"
        | "pause"
        | "speed"
        | "focus"
        | "fullscreen";
    }
  | { kind: "tool"; tool: ToolKind | null }
  | { kind: "begin" | "move" | "end"; point: GesturePoint }
  | { kind: "placement-result"; point: GesturePoint }
  | { kind: "set-designation"; ids: string[] }
  | { kind: "commit-designation" }
  | { kind: "commit-result"; accepted: number }
  | { kind: "cutaway"; value: boolean }
  | { kind: "debug-picking" }
  | { kind: "level"; level: LogicalLevel }
  | { kind: "command"; command: UiCommand | Command }
  | { kind: "recruit"; actor: string }
  | { kind: "go"; point: GesturePoint }
  | { kind: "notice"; text: string }
  | { kind: "zoom"; delta: number }
  | { kind: "pan"; x: number; y: number };

export type UiEffect =
  | { kind: "notice"; text: string }
  | { kind: "command"; command: UiCommand | Command }
  | { kind: "recruit"; actor: string }
  | { kind: "submit-designation"; targetIds: string[] }
  | {
      kind:
        | "pause"
        | "speed"
        | "focus"
        | "reset"
        | "continue"
        | "download-backup"
        | "download-raw-save"
        | "fullscreen";
    }
  | { kind: "zoom"; delta: number }
  | { kind: "pan"; x: number; y: number };

export type LevelNavigationControl = {
  readonly name: string;
  readonly level: LogicalLevel;
  readonly label: "Ground" | "Upper";
  readonly key: "pageup" | "pagedown";
  readonly title: string;
  readonly enabled: (current: LogicalLevel) => boolean;
  readonly action: { kind: "level"; level: LogicalLevel };
};

export const LEVEL_NAVIGATION = [
  {
    name: "view.level.ground",
    level: 0,
    label: "Ground",
    key: "pagedown",
    title: "Show Ground level",
    enabled: (current: LogicalLevel) => current !== 0,
    action: { kind: "level", level: 0 },
  },
  {
    name: "view.level.upper",
    level: 1,
    label: "Upper",
    key: "pageup",
    title: "Show Upper level",
    enabled: (current: LogicalLevel) => current !== 1,
    action: { kind: "level", level: 1 },
  },
] as const satisfies readonly LevelNavigationControl[];

export const DEBUG_PICKING_CONTROL = {
  name: "view.debug-picking",
  label: "Picking debug",
  key: "shift+d",
  title: "Toggle picking geometry",
  action: { kind: "debug-picking" },
} as const satisfies {
  readonly name: string;
  readonly label: string;
  readonly key: string;
  readonly title: string;
  readonly action: Extract<UiAction, { kind: "debug-picking" }>;
};

export function requiredToolLevel(tool: ToolKind): LogicalLevel | null {
  switch (tool) {
    case "floor":
      return 1;
    case "stair":
    case "chop":
    case "herb":
      return 0;
    case "wall":
    case "door":
    case "roof":
    case "bed":
    case "shelf":
      return null;
    default:
      return neverAction(tool);
  }
}

export type LevelTransition = {
  readonly changed: boolean;
  readonly level: LogicalLevel;
  readonly disarm: boolean;
  readonly notice: string | null;
};

export function decideLevelTransition(
  current: LogicalLevel,
  requested: LogicalLevel,
  tool: ToolKind | null,
): LevelTransition {
  if (current === requested)
    return { changed: false, level: current, disarm: false, notice: null };
  const required = tool === null ? null : requiredToolLevel(tool);
  const disarm = required !== null && required !== requested;
  return {
    changed: true,
    level: requested,
    disarm,
    notice: disarm
      ? `${requested === 1 ? "Upper" : "Ground"} selected; the armed tool was disarmed because it is unavailable on this level.`
      : null,
  };
}

export type LevelActionOwner = {
  readonly currentLevel: () => LogicalLevel;
  readonly armedTool: () => ToolKind | null;
  readonly resetGesture: () => void;
  readonly disarmTool: () => void;
  readonly setLevel: (level: LogicalLevel) => void;
  readonly clearInspection: () => void;
  readonly notice: (text: string) => void;
};

export function dispatchLevelAction(
  action: Extract<UiAction, { kind: "level" }>,
  owner: LevelActionOwner,
): void {
  const transition = decideLevelTransition(
    owner.currentLevel(),
    action.level,
    owner.armedTool(),
  );
  if (!transition.changed) return;
  owner.resetGesture();
  if (transition.disarm) owner.disarmTool();
  owner.setLevel(transition.level);
  owner.clearInspection();
  if (transition.notice) owner.notice(transition.notice);
}

export function submitDesignation(targetIds: string[]): UiEffect {
  return { kind: "submit-designation", targetIds: [...targetIds] };
}

function neverAction(value: never): never {
  throw new Error(`Unhandled UI action: ${String(value)}`);
}

export type NonLevelUiAction = Exclude<UiAction, { kind: "level" }>;

export type UiActionOwners = {
  readonly run: (action: NonLevelUiAction) => void;
  readonly level: LevelActionOwner;
};

export function dispatchUiAction(
  action: UiAction,
  owners: UiActionOwners,
): void {
  switch (action.kind) {
    case "level":
      dispatchLevelAction(action, owners.level);
      return;
    case "select":
    case "select-many":
    case "tree":
    case "inspect-herb":
    case "inspect-lot":
    case "inspect-site":
    case "panel":
    case "close-target":
    case "close":
    case "finish-placement":
    case "cancel-stroke":
    case "camera-move":
    case "escape":
    case "reset":
    case "continue":
    case "download-backup":
    case "download-raw-save":
    case "pan-mode":
    case "debug-picking":
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
    case "go":
    case "notice":
    case "zoom":
    case "pan":
      owners.run(action);
      return;
    default:
      return neverAction(action);
  }
}
