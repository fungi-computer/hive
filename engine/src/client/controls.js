const INPUTS = new Set(["input", "textarea", "select", "button", "a", "[contenteditable='true']"]);
import { createMachine } from "xstate";

export const pointerGestureMachine = createMachine({
  id: "hive-pointer-gesture",
  initial: "idle",
  states: { idle: { on: { BEGIN: "dragging" } }, dragging: { on: { END: "idle", CANCEL: "idle" } } },
});

export function isTypingTarget(target) {
  return !!target?.closest?.([...INPUTS].join(","));
}

export function selectionFromSubjects(subjects, box, additive = false, previous = []) {
  const selected = additive ? new Set(previous) : new Set();
  for (const subject of subjects) {
    if (subject.screen.x >= box.left && subject.screen.x <= box.right && subject.screen.y >= box.top && subject.screen.y <= box.bottom)
      selected.add(subject.id);
  }
  return [...selected];
}
