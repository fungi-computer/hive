import type { Clearing } from "./model.ts";
import { placementFooting } from "./game-space.ts";
import { interruptWork } from "./activity-lifecycle.ts";
import { constructionBuffer } from "./construction.js";
import { cacheRepairBuffer } from "./finite-sources.ts";
import { sourceAccessCells } from "./world.js";
import { finiteWorkOwner } from "./water-delivery.ts";
import { containerContents, releaseContainer } from "./materials.ts";
import { cancelPreparingBrew } from "./brewing.ts";
import {
  createNavigationSpaces,
  HUMAN_NAVIGATION,
} from "./navigation-space.ts";
import { standing } from "./engine/navigation/index.ts";

/** Cancel intent is durable immediately; physical cleanup waits for the exact
 * assigned bodies to reach their safe footing. No parallel cancellation queue. */
export function cancelJob(s: Clearing, id: string) {
  const j = s.jobs.find((x) => x.id === id);
  if (!j) return;
  j.lifecycle = "canceling";
  j.reason = "Finishing the current step before canceling";
  for (const p of Object.values(s.actors))
    if (p.task?.job === id) interruptWork(s, p);
  if (Object.values(s.actors).some((actor) => actor.task?.job === id)) return;
  if (j.kind === "build") {
    const site = s.sites.find((x) => x.id === j.target);
    if (site) {
      const r = releaseContainer(s.materials, constructionBuffer(site), {
        contentsDrop: {
          cell: placementFooting(site),
          legal: true,
        },
        carriedDrops: Object.fromEntries(
          Object.values(s.actors).map((p) => [p.id, { cell: p, legal: true }]),
        ),
      });
      if (!r.ok) throw new Error(r.reason);
      s.sites = s.sites.filter((x) => x !== site);
    }
  } else if (j.kind === "repair-cache") {
    const cache = s.sources.find((source) => source.id === j.target);
    const buffer = cache && cacheRepairBuffer(cache);
    const drop = cache
      ? sourceAccessCells(cache).find(
          (cell) =>
            standing(createNavigationSpaces(s)(), cell, HUMAN_NAVIGATION) ===
            "supported",
        )
      : undefined;
    if (buffer && containerContents(s.materials, buffer.id).length > 0) {
      if (!drop) throw new Error("no legal repair-buffer drop");
      const r = releaseContainer(s.materials, buffer, {
        contentsDrop: { cell: drop, legal: true },
        carriedDrops: Object.fromEntries(
          Object.values(s.actors).map((p) => [p.id, { cell: p, legal: true }]),
        ),
      });
      if (!r.ok) throw new Error(r.reason);
    }
  } else if (
    j.kind === "fill-kettle" ||
    j.kind === "water-mugwort" ||
    j.kind === "care"
  ) {
    const active = s.operations.find((operation) => operation.job === j.id);
    if (active?.kind === "water-delivery") {
      const custody = s.materials.transfers.find(
        (transfer) =>
          transfer.owner.kind === "operation" &&
          transfer.owner.operation === active.id,
      );
      const actor = custody ? s.actors[custody.actor] : undefined;
      if (custody && !actor)
        throw new Error("water operation has missing actor");
      const released = finiteWorkOwner.interrupt(s.operations, s.materials, {
        kind: "release",
        operation: active.id,
        drop: actor
          ? {
              cell: { x: actor.x, y: actor.y, z: actor.z },
              legal: true,
            }
          : undefined,
      });
      if (!released.ok) throw new Error(released.reason);
    }
  } else if (j.kind === "brew") {
    const released = cancelPreparingBrew(s, j.id);
    if (!released.ok) throw new Error(released.reason);
  }
  s.jobs = s.jobs.filter((x) => x.id !== id);
  s.workDirty = true;
}

export function advanceCancellations(state: Clearing): void {
  for (const job of state.jobs.filter((job) => job.lifecycle === "canceling"))
    cancelJob(state, job.id);
}
