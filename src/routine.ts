import type { Clearing } from "./model.ts";
import { transferForActor } from "./materials.ts";
import { members } from "./actors.ts";
import { cancelJob } from "./job-cancellation.ts";
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
    for (const id of nightIds) cancelJob(state, id);
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
        transferForActor(state.materials, person.id)
      )
        continue;
      if (
        state.jobs.some(
          (job) => job.kind === "care" && job.target === person.id,
        )
      )
        continue;
      if (!shelteredBeds(state).length) continue;
      state.jobs.unshift({
        lifecycle: "active",
        id: `job-${state.nextId++}`,
        kind: "care",
        target: person.id,
        need: "rest",
        policy: "routine-rest",
        reason: "Night routine",
        routine: true,
      });
      state.workDirty = true;
    }
  }
}
