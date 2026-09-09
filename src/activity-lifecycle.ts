import type { Clearing, Actor } from "./model.ts";

export function finishActivity(state: Clearing, p: Actor): void {
  Object.assign(p, {
    mode: "idle",
    task: null,
    assignment: null,
    path: [],
    leg: 0,
    work: 0,
  });
  state.workDirty = true;
}
export function finishJob(s: Clearing, p: Actor, id: string) {
  s.jobs = s.jobs.filter((j) => j.id !== id);
  s.finishedJobs++;
  finishActivity(s, p);
}
