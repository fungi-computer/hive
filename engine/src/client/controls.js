const INPUTS = new Set([
  "input",
  "textarea",
  "select",
  "button",
  "a",
  "[contenteditable='true']",
]);
import { createMachine, assign } from "xstate";
import { spatialDesignationMachine } from "./spatial-designation.js";
import { acquireEdgeStroke } from "./edge-gesture.js";

export const WORLD_VIEW_CONTROLS = Object.freeze([
  { id: "view.level.down", key: "pagedown", delta: -1, label: "Lower" },
  { id: "view.level.up", key: "pageup", delta: 1, label: "Higher" },
]);

export const pointerGestureMachine = createMachine(
  {
    id: "hive-pointer-gesture",
    initial: "idle",
    context: { start: null, current: null, additive: false },
    states: {
      idle: { on: { BEGIN: { target: "dragging", actions: "begin" } } },
      dragging: {
        on: {
          MOVE: { actions: "move" },
          END: { target: "idle", actions: "finish" },
          CANCEL: { target: "idle", actions: "clear" },
          ESCAPE: { target: "idle", actions: "clear" },
          CANCEL_STROKE: { target: "idle", actions: "clear" },
        },
      },
    },
  },
  {
    actions: {
      begin: assign(({ event }) => ({
        start: event.point,
        current: event.point,
        additive: !!event.additive,
      })),
      move: assign(({ event }) => ({ current: event.point })),
      finish: assign({ start: null, current: null, additive: false }),
      clear: assign({ start: null, current: null, additive: false }),
    },
  },
);

// Persistent world tool intent is separate from each pointer stroke.
export const terrainTargetMachine = createMachine({
  id: "hive-terrain-target",
  initial: "idle",
  context: { control: null, planeY: null, hover: null },
  states: {
    idle: { on: { ARM: { target: "armed", actions: "arm" } } },
    armed: { on: {
      ARM: { actions: "arm" },
      ROTATE: { actions: "rotate" },
      CLEAR_PLACEMENT: { actions: "clearPlacement" },
      SET_BUILD_PLANE: { actions: "setBuildPlane" },
      HOVER: { actions: "hover" },
      CANCEL_STROKE: {},
      ESCAPE: { target: "idle", actions: "clear" },
      CANCEL: { target: "idle", actions: "clear" },
    } },
  },
}, { actions: {
      arm: assign(({ event }) => ({ control: event.control, planeY: null, hover: null })),
      rotate: assign(({ event }) => ({ control: event.control })),
      clear: assign({ control: null, planeY: null, hover: null }),
      clearPlacement: assign({ planeY: null, hover: null }),
      setBuildPlane: assign(({ event }) => ({ planeY: event.y, hover: null })),
      hover: assign(({ event }) => ({ hover: event.cell ?? null })),
} });

// The terrain area consumer uses the shared spatial gesture owner in its
// default rectangle mode. Build, Dig and future tools therefore share the
// same deterministic preview/commit/cancel lifecycle.
export const terrainAreaGestureMachine = spatialDesignationMachine;

// Edge construction owns a canonical physical stroke while the persistent
// terrain target machine owns the armed build tool. The machine receives
// projected cells; it derives the locked grid line and inclusive edge list.
export const edgeGestureMachine = createMachine(
  {
    id: "hive-edge-gesture",
    initial: "idle",
    context: { start: null, current: null, edges: [], committed: [], rejection: null },
    states: {
      idle: { on: { BEGIN_EDGE: { target: "dragging", actions: "beginEdge" } } },
      dragging: {
        on: {
          MOVE_EDGE: { actions: "moveEdge" },
          END: { target: "idle", actions: "finishEdge" },
          CANCEL: { target: "idle", actions: "clearEdge" },
          ESCAPE: { target: "idle", actions: "clearEdge" },
        },
      },
    },
  },
  {
    actions: {
      beginEdge: assign(({ event }) => {
        const start = { cell: [...event.edge.cell], axis: event.edge.axis };
        return { start, current: [...start.cell], edges: [start], committed: [], rejection: null };
      }),
      moveEdge: assign(({ context, event }) => {
        const cell = event.cell;
        const current = context.start.axis === "x"
          ? [context.start.cell[0], context.start.cell[1], cell[2]]
          : [cell[0], context.start.cell[1], context.start.cell[2]];
        try {
          return { current, edges: acquireEdgeStroke(context.start, current, 256), rejection: null };
        } catch (error) {
          return { current, rejection: error instanceof Error ? error.message : String(error) };
        }
      }),
      finishEdge: assign(({ context }) => ({ start: null, current: null, edges: [], committed: context.rejection ? [] : context.edges, rejection: context.rejection })),
      clearEdge: assign({ start: null, current: null, edges: [], committed: [], rejection: null }),
    },
  },
);

// RTS aiming is a distinct gesture so a cannon click cannot accidentally
// select a soldier or become a march order. Escape and a completed fire both
// return to ordinary selection; paused/invalid commands are handled by the
// runtime at the existing command boundary.
export const aimGestureMachine = createMachine(
  {
    id: "hive-aim-gesture",
    initial: "idle",
    context: { launcherId: null, point: null, elevation: 0.12 },
    states: {
      idle: { on: { ENTER: { target: "aiming", actions: "enter" } } },
      aiming: {
        on: {
          MOVE: { actions: "move" },
          SET_ELEVATION: { actions: "elevation" },
          FIRE: { target: "idle", actions: "clear" },
          ESCAPE: { target: "idle", actions: "clear" },
          CANCEL: { target: "idle", actions: "clear" },
        },
      },
    },
  },
  {
    actions: {
      enter: assign(({ event }) => ({ launcherId: event.launcherId, point: event.point ?? null })),
      move: assign(({ event }) => ({ point: event.point })),
      elevation: assign(({ event }) => ({ elevation: event.elevation })),
      clear: assign({ launcherId: null, point: null, elevation: 0.12 }),
    },
  },
);

export function isTypingTarget(target) {
  return !!target?.closest?.([...INPUTS].join(","));
}

export function selectionFromSubjects(
  subjects,
  box,
  additive = false,
  previous = [],
) {
  const left = Math.min(box.left, box.right),
    right = Math.max(box.left, box.right),
    top = Math.min(box.top, box.bottom),
    bottom = Math.max(box.top, box.bottom);
  const pointSelection = left === right && top === bottom;
  if (pointSelection) {
    const hits = subjects
      .map((subject, index) => ({
        subject,
        index,
        distance: Math.hypot(subject.screen.x - left, subject.screen.y - top),
        rank: Number.isFinite(subject.renderRank) ? subject.renderRank : index,
      }))
      .filter(({ subject, distance }) => {
        if (subject.pickable === false) return false;
        if (subject.hitArea) {
          const zoom = Number.isFinite(subject.hitZoom) && subject.hitZoom > 0 ? subject.hitZoom : 1;
          return subject.hitArea.contains((left - subject.screen.x) / zoom, (top - subject.screen.y) / zoom);
        }
        if (subject.visual) return false;
        return distance <= (subject.radius ?? 20);
      })
      .sort(
        (a, b) =>
          b.rank - a.rank || a.distance - b.distance || b.index - a.index,
      );
    const nearest = hits[0]?.subject;
    if (!nearest) return additive ? [...previous] : [];
    if (!additive) return [nearest.id];
    return previous.includes(nearest.id)
      ? previous.filter((id) => id !== nearest.id)
      : [...new Set([...previous, nearest.id])];
  }
  const selected = additive ? new Set(previous) : new Set();
  for (const subject of subjects) {
    if (
      subject.pickable !== false &&
      subject.screen.x >= left &&
      subject.screen.x <= right &&
      subject.screen.y >= top &&
      subject.screen.y <= bottom
    )
      selected.add(subject.id);
  }
  return [...selected];
}

export function eligibleSelectedIds(subjects, selectedIds) {
  const eligible = new Set(
    subjects.filter((subject) => subject.pickable !== false).map((subject) => subject.id),
  );
  return selectedIds.filter((id) => eligible.has(id));
}
