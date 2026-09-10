const INPUTS = new Set(["input", "textarea", "select", "button", "a", "[contenteditable='true']"]);
import { createMachine, assign } from "xstate";

export const pointerGestureMachine = createMachine({
  id: "hive-pointer-gesture",
  initial: "idle",
  context: { start: null, current: null, additive: false },
  states: {
    idle: { on: { BEGIN: { target: "dragging", actions: "begin" } } },
    dragging: { on: { MOVE: { actions: "move" }, END: { target: "idle", actions: "finish" }, CANCEL: { target: "idle", actions: "clear" }, ESCAPE: { target: "idle", actions: "clear" }, CANCEL_STROKE: { target: "idle", actions: "clear" } } },
  },
}, {
  actions: { begin: assign(({ event }) => ({ start: event.point, current: event.point, additive: !!event.additive })), move: assign(({ event }) => ({ current: event.point })), finish: assign({ start: null, current: null, additive: false }), clear: assign({ start: null, current: null, additive: false }) },
});

export function isTypingTarget(target) {
  return !!target?.closest?.([...INPUTS].join(","));
}

export function selectionFromSubjects(subjects, box, additive = false, previous = []) {
  const selected = additive ? new Set(previous) : new Set();
  for (const subject of subjects) {
    const left = Math.min(box.left, box.right), right = Math.max(box.left, box.right), top = Math.min(box.top, box.bottom), bottom = Math.max(box.top, box.bottom);
    const pointHit = left === right && top === bottom && Math.hypot(subject.screen.x - left, subject.screen.y - top) <= (subject.radius ?? 20);
    if (pointHit || (subject.screen.x >= left && subject.screen.x <= right && subject.screen.y >= top && subject.screen.y <= bottom))
      selected.add(subject.id);
  }
  return [...selected];
}
