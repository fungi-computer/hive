import { createMachine, assign } from "xstate";

const MODES = new Set(["point", "line", "rectangle", "entities"]);
const integer = (value) => Number.isSafeInteger(value);

function cell(value) {
  if (!Array.isArray(value) || value.length !== 3 || !value.every(integer))
    throw new Error("spatial designation cell must contain three safe integers");
  return [value[0], value[1], value[2]];
}

function sameLevel(start, end) {
  if (start[1] !== end[1]) throw new RangeError("Selection must stay on one level");
}

export function pointDesignation(value) { return { kind: "point", cells: [cell(value)] }; }

/** A deterministic horizontal line. Ties choose X so a diagonal drag is stable. */
export function lineDesignation(startValue, endValue, maxArea = 256) {
  const start = cell(startValue), end = cell(endValue);
  sameLevel(start, end);
  const alongX = Math.abs(end[0] - start[0]) >= Math.abs(end[2] - start[2]);
  const finish = alongX ? [end[0], start[1], start[2]] : [start[0], start[1], end[2]];
  const from = alongX ? start[0] : start[2], to = alongX ? finish[0] : finish[2];
  if (!integer(maxArea) || maxArea < 1 || maxArea > 4096) throw new Error("spatial designation area limit is invalid");
  if (Math.abs(to - from) + 1 > maxArea) throw new RangeError(`Select at most ${maxArea} cells at once`);
  const step = from <= to ? 1 : -1;
  const cells = [];
  for (let value = from; ; value += step) {
    cells.push(alongX ? [value, start[1], start[2]] : [start[0], start[1], value]);
    if (value === to) break;
  }
  return { kind: "line", cells };
}

export function rectangleDesignation(startValue, endValue, maxArea = 256) {
  const start = cell(startValue), end = cell(endValue);
  sameLevel(start, end);
  if (!integer(maxArea) || maxArea < 1 || maxArea > 4096) throw new Error("spatial designation area limit is invalid");
  const width = Math.abs(end[0] - start[0]) + 1, depth = Math.abs(end[2] - start[2]) + 1;
  if (!integer(width * depth) || width * depth > maxArea) throw new RangeError(`Select at most ${maxArea} cells at once`);
  const cells = [];
  for (let z = Math.min(start[2], end[2]); z <= Math.max(start[2], end[2]); z++)
    for (let x = Math.min(start[0], end[0]); x <= Math.max(start[0], end[0]); x++) cells.push([x, start[1], z]);
  return { kind: "rectangle", cells };
}

export function entityDesignation(values) {
  if (!Array.isArray(values) || values.length > 128 || values.some((id) => typeof id !== "string" || !id || id.length > 128))
    throw new Error("spatial designation entity set is invalid");
  return { kind: "entities", entities: [...new Set(values)].sort() };
}

export function designation(mode, start, end, maxArea = 256) {
  if (!MODES.has(mode)) throw new Error("spatial designation mode is invalid");
  if (mode === "point") return pointDesignation(start);
  if (mode === "line") return lineDesignation(start, end, maxArea);
  if (mode === "rectangle") return rectangleDesignation(start, end, maxArea);
  return entityDesignation(start);
}

/** Expected player-sized selection failures are data; programming errors still throw. */
export function evaluateDesignation(mode, start, end, maxArea = 256) {
  try { return { accepted: true, designation: designation(mode, start, end, maxArea) }; }
  catch (error) {
    if (!(error instanceof RangeError)) throw error;
    return { accepted: false, reason: error.message };
  }
}

/** One XState owner for all world gestures; it owns lifecycle, not authority. */
export const spatialDesignationMachine = createMachine({
  id: "hive-spatial-designation",
  initial: "idle",
  context: { mode: "rectangle", start: null, current: null, committed: [], rejection: null, maxArea: 256 },
  states: {
    idle: { on: {
      SET_MODE: { actions: "setMode" },
      BEGIN: { target: "dragging", actions: "begin" },
      BEGIN_ENTITIES: { target: "idle", actions: "commitEntities" },
    } },
    dragging: { on: {
      MOVE: { actions: "move" },
      END: { target: "idle", actions: "commit" },
      CANCEL: { target: "idle", actions: "cancel" },
      ESCAPE: { target: "idle", actions: "cancel" },
    } },
  },
}, { actions: {
  setMode: assign(({ event }) => { if (!MODES.has(event.mode)) throw new Error("spatial designation mode is invalid"); return { mode: event.mode, committed: [], rejection: null }; }),
  begin: assign(({ event }) => ({ start: cell(event.cell), current: cell(event.cell), committed: [], rejection: null })),
  move: assign(({ context, event }) => {
    const current = cell(event.cell);
    const result = evaluateDesignation(context.mode, context.start, current, context.maxArea);
    return { current, rejection: result.accepted ? null : result.reason };
  }),
  commit: assign(({ context }) => {
    const result = evaluateDesignation(context.mode, context.start, context.current, context.maxArea);
    return result.accepted
      ? { committed: result.designation, rejection: null }
      : { committed: [], rejection: result.reason };
  }),
  commitEntities: assign(({ event }) => ({ committed: designation("entities", event.entities), rejection: null })),
  cancel: assign({ start: null, current: null, committed: [], rejection: null }),
} });
