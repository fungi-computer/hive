import type { Activity, Actor, Cell, Clearing } from "./model.ts";
import { blockedCells, sameCell } from "./world.js";
import { walk, face } from "./movement.js";
import {
  BUILDINGS,
  constructionBuffer,
  removalProblem,
  resolveMaterialDestination,
  resolveMaterialEndpoint,
  shelfContainer,
  shelteredBeds,
  workPosition,
} from "./construction.js";
import {
  createGroundLot,
  deliverTransfer,
  embedConstruction,
  interruptTransfer,
  pickupTransfer,
  releaseContainer,
  salvageConstruction,
  transferForActor,
} from "./materials.ts";
import { isNight } from "./routine.ts";
import { HARVEST_TICKS, SOW_TICKS } from "./herbs.ts";
export const CHOP_TICKS = 80;
function groundCell(at: Cell): Cell {
  return { x: at.x, z: at.z, level: at.level };
}
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
export function interruptWork(state: Clearing, p: Actor): void {
  const r = interruptTransfer(state.materials, p.id, {
    cell: { x: p.x, z: p.z, level: p.level },
    legal: true,
  });
  if (!r.ok) throw new Error(r.reason);
  finishActivity(state, p);
}
function finishJob(s: Clearing, p: Actor, id: string) {
  s.jobs = s.jobs.filter((j) => j.id !== id);
  s.finishedJobs++;
  finishActivity(s, p);
}
function siteFor(s: Clearing, id: string) {
  return resolveMaterialDestination(s.sites, id)?.site;
}
function transfer(s: Clearing, p: Actor, t: Activity) {
  const x = s.materials.transfers.find((x) => x.id === t.target);
  if (!x) {
    interruptWork(s, p);
    return;
  }
  if (x.phase.kind === "reserved") {
    const r = pickupTransfer(s.materials, x.id, {
      sourceReachable: true,
      destinationReachableWithPayload: true,
    });
    if (!r.ok) {
      interruptWork(s, p);
      return;
    }
    s.notice = `${p.name} picked up ${r.value.material}.`;
    finishActivity(s, p);
    return;
  }
  const resolved = resolveMaterialDestination(s.sites, x.request.destination);
  if (!resolved) {
    interruptWork(s, p);
    return;
  }
  const r = deliverTransfer(s.materials, x.id, resolved.destination, true);
  if (!r.ok) {
    interruptWork(s, p);
    return;
  }
  s.notice = `${p.name} delivered material.`;
  if (s.jobs.find((job) => job.id === x.owner.job)?.kind === "store")
    finishJob(s, p, x.owner.job);
  else finishActivity(s, p);
}
function build(s: Clearing, p: Actor, t: Activity) {
  const site = s.sites.find((x) => x.id === t.target);
  if (!site) {
    interruptWork(s, p);
    return;
  }
  if (++site.work < BUILDINGS[site.type].ticks) {
    p.work = site.work;
    return;
  }
  const r = embedConstruction(s.materials, constructionBuffer(site), "wood");
  if (!r.ok) {
    interruptWork(s, p);
    return;
  }
  site.finishedAt = s.tick;
  s.notice = `${BUILDINGS[site.type].label} finished.`;
  finishJob(s, p, t.job);
}
function deconstruct(s: Clearing, p: Actor, t: Activity) {
  const site = s.sites.find((x) => x.id === t.target);
  if (!site || removalProblem(s, site, p)) {
    interruptWork(s, p);
    return;
  }
  if (++p.work < BUILDINGS[site.type].deconstructTicks) return;
  if (site.type === "shelf") {
    const rel = releaseContainer(s.materials, shelfContainer(site.id), {
      contentsDrop: { cell: groundCell(site), legal: true },
      carriedDrops: Object.fromEntries(
        Object.values(s.actors).map((a) => [
          a.id,
          { cell: { x: a.x, z: a.z, level: a.level }, legal: true },
        ]),
      ),
    });
    if (!rel.ok) {
      interruptWork(s, p);
      return;
    }
    const releasedJobs = new Set(rel.value.owners.map((owner) => owner.job));
    for (const job of s.jobs)
      if (
        job.kind === "store" &&
        job.destination === shelfContainer(site.id).id
      )
        releasedJobs.add(job.id);
    for (const actor of Object.values(s.actors))
      if (actor.task && releasedJobs.has(actor.task.job))
        finishActivity(s, actor);
    s.jobs = s.jobs.filter((job) => !releasedJobs.has(job.id));
  }
  const sal = salvageConstruction(
    s.materials,
    constructionBuffer(site),
    BUILDINGS[site.type].salvageWood,
    { cell: groundCell(site), legal: true },
  );
  if (!sal.ok) {
    interruptWork(s, p);
    return;
  }
  s.sites = s.sites.filter((x) => x.id !== site.id);
  finishJob(s, p, t.job);
}
function herb(s: Clearing, p: Actor, t: Activity) {
  const h = s.herbs.find((x) => x.id === t.target);
  if (!h) {
    interruptWork(s, p);
    return;
  }
  const sow = t.kind === "sow";
  if (++h.work < (sow ? SOW_TICKS : HARVEST_TICKS)) return;
  if (sow) {
    h.stage = "planted";
    h.work = 0;
    h.plantedAt = s.tick;
    finishJob(s, p, t.job);
  } else {
    s.herbs = s.herbs.filter((x) => x !== h);
    const r = createGroundLot(
      s.materials,
      "mugwort",
      1 as any,
      groundCell(h),
      `herb-bundle-${s.nextId++}`,
    );
    if (!r.ok) throw new Error(r.reason);
    s.harvestedHerbs++;
    finishJob(s, p, t.job);
  }
}
export function advanceWork(s: Clearing, p: Actor): void {
  const t = p.task;
  if (!t) return;
  const target =
    t.kind === "transfer"
      ? (() => {
          const x = s.materials.transfers.find((x) => x.id === t.target);
          if (!x) return;
          const phase = x.phase;
          if (phase.kind === "carrying")
            return siteFor(s, x.request.destination);
          return phase.origin.kind === "ground"
            ? phase.origin.cell
            : resolveMaterialEndpoint(
                s.sites,
                phase.origin.container,
                "withdraw",
              )?.site;
        })()
      : t.kind === "chop"
        ? s.trees.find((x) => x.id === t.target)
        : t.kind === "sow" || t.kind === "harvest"
          ? s.herbs.find((x) => x.id === t.target)
          : s.sites.find((x) => x.id === t.target);
  if (!target || !s.jobs.some((j) => j.id === t.job)) {
    interruptWork(s, p);
    return;
  }
  if (p.mode === "walk") {
    const r = walk(p, blockedCells(s), s);
    if (r === "blocked") interruptWork(s, p);
    if (r !== "arrived") return;
    p.mode = t.kind;
    face(p, target);
    return;
  }
  const currentTransfer =
    t.kind === "transfer"
      ? s.materials.transfers.find((x) => x.id === t.target)
      : undefined;
  const okay =
    t.kind === "transfer" && currentTransfer?.phase.kind === "reserved"
      ? currentTransfer.phase.origin.kind === "ground"
        ? sameCell(p, target)
        : workPosition(s, p, target, "build")
      : t.kind === "build" || t.kind === "deconstruct" || t.kind === "transfer"
        ? workPosition(
            s,
            p,
            target,
            t.kind === "deconstruct" ? "deconstruct" : "build",
          )
        : t.kind === "sleep"
          ? sameCell(p, target)
          : Math.abs(p.x - target.x) + Math.abs(p.z - target.z) === 1 &&
            p.level === target.level;
  if (!okay) {
    interruptWork(s, p);
    return;
  }
  if (t.kind === "transfer") {
    if (++p.work >= t.duration) transfer(s, p, t);
  } else if (t.kind === "build") build(s, p, t);
  else if (t.kind === "deconstruct") deconstruct(s, p, t);
  else if (t.kind === "sow" || t.kind === "harvest") herb(s, p, t);
  else if (t.kind === "chop") {
    const tree = target as any;
    if (++tree.work >= CHOP_TICKS) {
      tree.felledAt = s.tick;
      createGroundLot(s.materials, "wood", 6 as any, groundCell(tree));
      s.felled++;
      finishJob(s, p, t.job);
    }
  } else if (t.kind === "sleep") {
    p.rest = Math.min(100, p.rest + 0.3);
    if (
      p.rest >= 95 &&
      !(s.jobs.find((j) => j.id === t.job)?.routine && isNight(s))
    )
      finishJob(s, p, t.job);
  }
}
