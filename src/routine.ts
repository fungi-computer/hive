import type { Clearing } from "./model.ts";
import { members } from "./actors.ts";
import { finishActivity } from "./activity.ts";
import { shelteredBeds } from "./construction.js";

// Eight minutes at 1× leaves time to lay out and build a first home.
export const DAY_TICKS = 9600;
export function hour(state: Clearing): number {
  return (8 + state.tick / (DAY_TICKS / 24)) % 24;
}
export function isNight(state: Clearing): boolean {
  const h = hour(state);
  return h >= 20 || h < 6;
}
export function updateRoutine(state: Clearing): void {
  if (!isNight(state)) {
    const nightIds = new Set(
      state.jobs.filter((job) => job.routine).map((job) => job.id),
    );
    if (!nightIds.size) return;
    for (const person of Object.values(state.actors)) {
      if (!person.task || !nightIds.has(person.task.job)) continue;
      if (person.mode === "sleep" && person.work > 0) state.rested++;
      finishActivity(state, person);
    }
    state.jobs = state.jobs.filter((job) => !nightIds.has(job.id));
    state.workDirty = true;
    state.notice = "Morning. Time to pick up the next order.";
    return;
  }
  for (const party of Object.values(state.parties)) {
    for (const person of members(state, party.id)) {
      if (
        !person.routine ||
        person.drafted ||
        person.mode !== "idle" ||
        person.cargo
      )
        continue;
      if (
        state.jobs.some(
          (job) => job.kind === "rest" && job.target === person.id,
        )
      )
        continue;
      if (!shelteredBeds(state).length) continue;
      state.jobs.unshift({
        id: `job-${state.nextId++}`,
        kind: "rest",
        target: person.id,
        scope: { party: party.id, actors: [person.id] },
        reason: "Night routine",
        routine: true,
      });
      state.workDirty = true;
    }
  }
}
