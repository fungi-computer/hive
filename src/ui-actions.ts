import type { BuildingKind, Cell, Command } from "./model.ts";
import { setup } from "xstate";

export type TerrainToolKind = "dig" | "backfill";
export type ToolKind = "chop" | BuildingKind | "herb" | TerrainToolKind;
export type LogicalLevel = 0 | 1;

/** Checked terrain controls share their labels and help with their typed tool. */
export const TERRAIN_TOOL_CATALOG = [
  {
    kind: "dig",
    label: "Dig",
    detail: "remove one shallow soil voxel · shared Build work",
    title: "Designate shallow excavation",
  },
  {
    kind: "backfill",
    label: "Backfill",
    detail: "fill one shallow pit with soil · shared Build work",
    title: "Designate shallow backfill",
  },
] as const satisfies readonly {
  readonly kind: TerrainToolKind;
  readonly label: string;
  readonly detail: string;
  readonly title: string;
}[];

/** A read-only UI projection of a physical lot.  It deliberately carries no
 * command or stock policy: callers can only find the loose goods at a cell. */
export type LocalGoodsLot = {
  readonly location: {
    readonly kind: string;
    readonly x?: number;
    readonly z?: number;
    readonly level?: number;
  };
};

/** Returns projected loose lots at one exact logical cell, including level. */
export function localGoodsAt<T extends LocalGoodsLot>(
  lots: readonly T[],
  at: Cell,
): T[] {
  return lots.filter(
    (lot) =>
      lot.location.kind === "ground" &&
      lot.location.x === at.x &&
      lot.location.z === at.z &&
      lot.location.level === at.level,
  );
}

/** Camera presentation changes retain an armed placement tool while clearing
 * only its in-progress stroke. */
export function cameraMoveKeepsTool(tool: ToolKind | null): boolean {
  return tool !== null;
}

export type GesturePoint = {
  cell: { x: number; z: number; level: number };
  screen: { x: number; y: number };
};

export type TerrainDesignation = {
  readonly kind: TerrainToolKind;
  readonly x: number;
  readonly z: number;
  readonly level: 0;
};

/** The gesture selects a rectangle only. Terrain admission owns every law. */
export function terrainDesignationCells(
  kind: TerrainToolKind,
  start: Pick<GesturePoint["cell"], "x" | "z"> | null,
  end: Pick<GesturePoint["cell"], "x" | "z">,
): TerrainDesignation[] {
  const from = start ?? end;
  const left = Math.min(from.x, end.x);
  const right = Math.max(from.x, end.x);
  const top = Math.min(from.z, end.z);
  const bottom = Math.max(from.z, end.z);
  const cells: TerrainDesignation[] = [];
  for (let z = top; z <= bottom; z++)
    for (let x = left; x <= right; x++) cells.push({ kind, x, z, level: 0 });
  return cells;
}

type ToolGestureContext = {
  tool: ToolKind | null;
  gesture: "box" | "tool" | null;
  start: GesturePoint | null;
  end: GesturePoint | null;
  commitRequested: boolean;
};
type ToolGestureEvent =
  | { type: "TOOL"; tool: ToolKind | null }
  | {
      type:
        | "CANCEL"
        | "CAMERA_MOVE"
        | "ESCAPE"
        | "RESET"
        | "LEVEL_CHANGE"
        | "CANCEL_STROKE";
    }
  | { type: "BEGIN" | "MOVE" | "END" | "PLACED"; point: GesturePoint }
  | { type: "COMMIT" }
  | { type: "COMMIT_RESULT"; accepted: number };

const toolGesture = setup({
  types: {
    context: {} as ToolGestureContext,
    events: {} as ToolGestureEvent,
  },
});

function toolFromEvent(event: ToolGestureEvent): ToolKind | null {
  if (event.type !== "TOOL") throw new Error("Tool event required");
  return event.tool;
}

function pointFromEvent(event: ToolGestureEvent): GesturePoint {
  if (!("point" in event)) throw new Error("Gesture point event required");
  return event.point;
}

const clearGesture = toolGesture.assign(() => ({
  tool: null,
  gesture: null,
  start: null,
  end: null,
  commitRequested: false,
}));

const clearGestureKeepTool = toolGesture.assign(({ context }) => ({
  tool: context.tool,
  gesture: null,
  start: null,
  end: null,
  commitRequested: false,
}));

const keepToolReady = toolGesture.assign(({ context, event }) => ({
  tool: context.tool,
  gesture: null,
  start: null,
  end: event.type === "PLACED" ? event.point : context.end,
  commitRequested: false,
}));

/** XState owns gestures only; command admission and terrain remain below UI. */
export const toolMachine = toolGesture.createMachine({
  id: "tool-gesture",
  initial: "idle",
  context: {
    tool: null,
    gesture: null,
    start: null,
    end: null,
    commitRequested: false,
  },
  on: {
    TOOL: [
      {
        target: ".ready",
        actions: [
          clearGesture,
          toolGesture.assign(({ event }) => ({ tool: toolFromEvent(event) })),
        ],
        guard: ({ event }) => !!toolFromEvent(event),
      },
      { target: ".idle", actions: clearGesture },
    ],
    CANCEL: { target: ".idle", actions: clearGesture },
    CAMERA_MOVE: [
      {
        target: ".ready",
        guard: ({ context }) => cameraMoveKeepsTool(context.tool),
        actions: clearGestureKeepTool,
      },
      { target: ".idle", actions: clearGesture },
    ],
    ESCAPE: { target: ".idle", actions: clearGesture },
    RESET: { target: ".idle", actions: clearGesture },
    LEVEL_CHANGE: [
      {
        target: ".ready",
        guard: ({ context }) => !!context.tool,
        actions: clearGestureKeepTool,
      },
      { target: ".idle", actions: clearGesture },
    ],
    CANCEL_STROKE: [
      {
        target: ".ready",
        guard: ({ context }) => !!context.tool,
        actions: clearGestureKeepTool,
      },
      { target: ".idle", actions: clearGesture },
    ],
  },
  states: {
    idle: {
      on: {
        BEGIN: {
          target: "dragging",
          actions: toolGesture.assign(({ event }) => ({
            tool: null,
            gesture: "box",
            start: pointFromEvent(event),
            end: pointFromEvent(event),
            commitRequested: false,
          })),
        },
      },
    },
    ready: {
      on: {
        MOVE: {
          actions: toolGesture.assign(({ event }) => ({
            end: pointFromEvent(event),
          })),
        },
        BEGIN: {
          target: "dragging",
          actions: toolGesture.assign(({ context, event }) => ({
            gesture: "tool",
            start: pointFromEvent(event),
            end: pointFromEvent(event),
            tool: context.tool,
            commitRequested: false,
          })),
        },
      },
    },
    dragging: {
      on: {
        MOVE: {
          actions: toolGesture.assign(({ event }) => ({
            end: pointFromEvent(event),
          })),
        },
        END: {
          target: "fixed",
          actions: toolGesture.assign(({ event }) => ({
            end: pointFromEvent(event),
          })),
        },
      },
    },
    fixed: {
      on: {
        PLACED: { target: "ready", actions: keepToolReady },
        COMMIT: {
          actions: toolGesture.assign(() => ({ commitRequested: true })),
          guard: ({ context }) => !context.commitRequested,
        },
        COMMIT_RESULT: [
          {
            target: "ready",
            guard: ({ event }) => event.accepted > 0,
            actions: keepToolReady,
          },
          { target: "ready", actions: keepToolReady },
        ],
      },
    },
  },
});

export type UiCommand =
  | { kind: "chop"; tree: string; direct?: boolean; actors?: string[] | null }
  | {
      kind: TerrainToolKind;
      x: number;
      z: number;
      level: 0;
      direct?: boolean;
      actors?: string[] | null;
    }
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
  | { kind: "repair-cache"; actors?: string[] | null }
  | { kind: "fill-kettle"; station: string; actors?: string[] | null }
  | { kind: "water-mugwort"; herb: string; actors?: string[] | null }
  | { kind: "brew"; station: string; actors?: string[] | null }
  | { kind: "tap"; station: string; actors?: string[] | null }
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
  | { kind: "inspect-source"; id: string; point: { x: number; y: number } }
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
  | { kind: "submit-terrain-designation"; cells: TerrainDesignation[] }
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
  | { kind: "pan"; x: number; y: number }
  | { kind: "recenter"; cell: Cell };

export type UiEffect =
  | { kind: "notice"; text: string }
  | { kind: "command"; command: UiCommand | Command }
  | { kind: "recruit"; actor: string }
  | { kind: "submit-designation"; targetIds: string[] }
  | { kind: "submit-terrain-designation"; cells: TerrainDesignation[] }
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
  | { kind: "pan"; x: number; y: number }
  | { kind: "recenter"; cell: Cell };

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
    case "brew-station":
    case "chop":
    case "herb":
    case "dig":
    case "backfill":
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

/** These footprints are admitted from one anchor cell; drag is not replication. */
export function singlePlacementTool(tool: ToolKind): boolean {
  return tool === "bed" || tool === "stair" || tool === "brew-station";
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

export function submitTerrainDesignation(
  cells: readonly TerrainDesignation[],
): UiEffect {
  return {
    kind: "submit-terrain-designation",
    cells: cells.map((cell) => ({ ...cell })),
  };
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
    case "inspect-source":
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
    case "submit-terrain-designation":
    case "commit-designation":
    case "commit-result":
    case "cutaway":
    case "command":
    case "recruit":
    case "go":
    case "notice":
    case "zoom":
    case "pan":
    case "recenter":
      owners.run(action);
      return;
    default:
      return neverAction(action);
  }
}
