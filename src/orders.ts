import { standing } from "./engine/navigation/index.ts";
import {
  createNavigationSpaces,
  HUMAN_NAVIGATION,
} from "./navigation-space.ts";
import { cancelJob } from "./job-cancellation.ts";
import { placementFooting, insidePlacement } from "./game-space.ts";
import { deconstructionTargetProblem } from "./physical-completion.ts";
import type {
  Clearing,
  Command,
  Job,
  RepairCacheCommand,
  BrewCommand,
  ClearSpentGrainCommand,
  TapCommand,
  Scope,
  StoreCommand,
  WorkCommand,
} from "./model.ts";
import { inScope, scopeProblem } from "./actors.ts";
import { placementProblem } from "./construction.js";
import { cacheRepairBuffer, sourceIsOpen } from "./finite-sources.ts";
import { interruptWork } from "./activity-lifecycle.ts";
import {
  brewForJob,
  brewStationOutputProblem,
  recipeOutputReadiness,
} from "./brewing.ts";
import { recipeOutputActionForWire } from "./recipes.ts";
import { containerContents } from "./materials.ts";
import { inside, placementOccupant, sourceAccessCells } from "./world.js";
import { movement } from "./movement.ts";
import { excavationTargetProblem, excavationPositions } from "./excavation.ts";
export type CommandResult =
  { status: "applied" } | { status: "rejected"; reason: string };
export function commandProblem(s: Clearing, c: Command): string {
  if (c.kind === "store") {
    const l = s.materials.lots.find(
        (x) => x.id === c.lot && x.location.kind === "ground",
      ),
      sh = s.sites.find(
        (x) => x.id === c.shelf && x.type === "shelf" && x.finishedAt !== null,
      );
    return !l
      ? "That material lot is no longer on the ground."
      : !sh
        ? "That shelf is not finished."
        : s.jobs.some(
              (j) =>
                j.kind === "store" &&
                (j.source === c.lot || j.destination === `shelf:${c.shelf}`),
            )
          ? "That material is already marked for storage."
          : "";
  }
  if (c.kind === "repair-cache") {
    const cache = s.sources.find(
      (source) => source.kind === "reclaimed-timber-cache",
    );
    return !cache
      ? "The reclaimed cache has not arrived."
      : sourceIsOpen(cache)
        ? "The reclaimed cache is already repaired."
        : scopeProblem(s, c);
  }
  if (c.kind === "fill-kettle") {
    const station = s.sites.find(
      (site) =>
        site.id === c.station &&
        site.type === "brew-station" &&
        site.finishedAt !== null,
    );
    return !station ? "That brew station is not finished." : scopeProblem(s, c);
  }
  if (c.kind === "brew") {
    const station = s.sites.find(
      (site) =>
        site.id === c.station &&
        site.type === "brew-station" &&
        site.finishedAt !== null,
    );
    return !station
      ? "That brew station is not finished."
      : (brewStationOutputProblem(s, station) ?? scopeProblem(s, c));
  }
  if (c.kind === "tap" || c.kind === "clear-spent-grain") {
    const station = s.sites.find(
      (site) =>
        site.id === c.station &&
        site.type === "brew-station" &&
        site.finishedAt !== null,
    );
    if (!station) return "That brew station is not finished.";
    const readiness = recipeOutputReadiness(
      s,
      station,
      recipeOutputActionForWire(c.kind),
      undefined,
      c.kind === "tap"
        ? "Waiting for a settled ale serving"
        : "Waiting for spent grain to clear",
    );
    return readiness.kind === "waiting"
      ? readiness.reason
      : s.jobs.some(
            (job) =>
              job.kind === c.kind &&
              job.transformation === readiness.transformation,
          )
        ? c.kind === "tap"
          ? "That settled batch is already being tapped."
          : "That spent grain is already being cleared."
        : scopeProblem(s, c);
  }
  if (c.kind === "build") return placementProblem(s, c);
  if (c.kind === "deconstruct")
    return deconstructionTargetProblem(s, c.site) || scopeProblem(s, c);
  if (c.kind === "dig") {
    const problem = excavationTargetProblem(s, c.voxel);
    if (problem) return problem;
    if (
      s.jobs.some(
        (job) => job.kind === "dig" && job.voxel.join() === c.voxel.join(),
      )
    )
      return "That voxel is already designated.";
    if (!excavationPositions(s, c.voxel).length)
      return "No safe excavation position.";
    return scopeProblem(s, c);
  }
  if (c.kind === "harvest") {
    const h = s.herbs.find((x) => x.id === c.herb);
    return !h || h.stage !== "ready"
      ? "Only ready mugwort can be harvested."
      : "";
  }
  if (c.kind === "water-mugwort") {
    const herb = s.herbs.find((entry) => entry.id === c.herb);
    return !herb
      ? "That mugwort is no longer planted."
      : herb.stage !== "planted" || herb.establishment !== null
        ? "That mugwort is already established."
        : s.jobs.some(
              (job) => job.kind === "water-mugwort" && job.target === c.herb,
            )
          ? "That mugwort is already waiting for water."
          : scopeProblem(s, c);
  }
  if (
    c.kind === "sow" &&
    (c.level !== 0 ||
      !insidePlacement(c) ||
      placementOccupant(s, placementFooting(c)) ||
      !terrainCell(s.terrain, c.x, c.z).support)
  )
    return "Choose clear ground.";
  if (c.kind === "cancel" || c.kind === "next") {
    const job = s.jobs.find((entry) => entry.id === c.job);
    if (!job) return "That order is no longer available.";
    if (
      job.kind === "care" &&
      !s.parties[c.party]?.members.includes(job.target)
    )
      return "Only home members' care can be ordered.";
    if (c.kind === "cancel" && job.kind === "repair-cache") {
      const cache = s.sources.find((source) => source.id === job.target);
      const buffer = cache && cacheRepairBuffer(cache);
      if (
        buffer &&
        containerContents(s.materials, buffer.id).length > 0 &&
        !sourceAccessCells(cache!).some(
          (cell) =>
            standing(createNavigationSpaces(s)(), cell, HUMAN_NAVIGATION) ===
            "supported",
        )
      )
        return "No legal place to release the repair wood.";
    }
    if (
      c.kind === "cancel" &&
      job.kind === "brew" &&
      brewForJob(s, job.id)?.phase !== undefined &&
      brewForJob(s, job.id)?.phase !== "prepare"
    )
      return "A committed batch cannot be cancelled.";
    return "";
  }
  if (c.kind === "draft" || c.kind === "undraft" || c.kind === "go") {
    const p = s.actors[c.actor],
      party = s.parties[c.party];
    if (!p || !party?.members.includes(c.actor)) return "Choose a home member.";
    if (c.kind !== "go") return "";
    if (p.workDisposition === "interrupt-at-footing")
      return "Wait until they finish stepping and put down their work.";
    return !p.drafted || !inside(c.target) || !movement(s).canGo(p, c.target)
      ? "Choose reachable clear ground."
      : "";
  }
  if (c.kind === "recruit") {
    const party = s.parties[c.party];
    return !s.actors[c.actor] || !party
      ? "That person is not here."
      : party.members.includes(c.actor)
        ? "That person has already joined this party."
        : "";
  }
  if (c.kind === "rest" && !c.actors?.length)
    return "Select a home member to rest.";
  return scopeProblem(s, c);
}
function scope(
  c:
    | WorkCommand
    | StoreCommand
    | RepairCacheCommand
    | BrewCommand
    | TapCommand
    | ClearSpentGrainCommand
    | Extract<Command, { kind: "fill-kettle" | "water-mugwort" }>,
): Scope {
  return c.kind === "store"
    ? { party: c.party, actors: null }
    : { party: c.party, actors: c.actors && [...c.actors] };
}
function add(
  s: Clearing,
  c:
    | WorkCommand
    | StoreCommand
    | RepairCacheCommand
    | BrewCommand
    | TapCommand
    | ClearSpentGrainCommand
    | Extract<Command, { kind: "fill-kettle" | "water-mugwort" }>,
) {
  const sc = scope(c),
    id = `job-${s.nextId++}`;
  let j: Job;
  if (c.kind === "store")
    j = {
      lifecycle: "active",
      id,
      kind: "store",
      source: c.lot,
      destination: `shelf:${c.shelf}`,
      scope: sc,
      reason: "Ordered",
      routine: false,
    };
  else if (c.kind === "repair-cache") {
    const cache = s.sources.find(
      (source) => source.kind === "reclaimed-timber-cache",
    )!;
    j = {
      lifecycle: "active",
      id,
      kind: "repair-cache",
      target: cache.id,
      scope: sc,
      reason: "Ordered",
      routine: false,
    };
  } else if (c.kind === "fill-kettle")
    j = {
      lifecycle: "active",
      id,
      kind: "fill-kettle",
      target: c.station,
      scope: sc,
      reason: "Ordered",
      routine: false,
    };
  else if (c.kind === "brew")
    j = {
      lifecycle: "active",
      id,
      kind: "brew",
      target: c.station,
      scope: sc,
      reason: "Ordered",
      routine: false,
    };
  else if (c.kind === "tap" || c.kind === "clear-spent-grain") {
    const station = s.sites.find((site) => site.id === c.station)!;
    const readiness = recipeOutputReadiness(
      s,
      station,
      recipeOutputActionForWire(c.kind),
      undefined,
      c.kind === "tap"
        ? "Waiting for a settled ale serving"
        : "Waiting for spent grain to clear",
    );
    if (readiness.kind !== "ready") throw new Error(readiness.reason);
    j = {
      lifecycle: "active",
      id,
      kind: c.kind,
      target: c.station,
      transformation: readiness.transformation,
      progress: 0,
      scope: sc,
      reason: "Ordered",
      routine: false,
    };
  } else if (c.kind === "build") {
    const site = {
      id: `site-${s.nextId++}`,
      type: c.type,
      x: c.x,
      z: c.z,
      level: c.level,
      direction: c.direction === 1 ? 1 : 0,
      work: 0,
      finishedAt: null,
    };
    s.sites.push(site);
    j = {
      lifecycle: "active",
      id,
      kind: "build",
      target: site.id,
      scope: sc,
      reason: "Ordered",
      routine: false,
    };
  } else if (c.kind === "chop")
    j = {
      lifecycle: "active",
      id,
      kind: "chop",
      target: c.tree,
      scope: sc,
      reason: "Ordered",
      routine: false,
    };
  else if (c.kind === "dig")
    j = {
      lifecycle: "active",
      id,
      kind: c.kind,
      voxel: [...c.voxel],
      scope: sc,
      reason: "Ordered",
      routine: false,
    };
  else if (c.kind === "deconstruct")
    j = {
      lifecycle: "active",
      id,
      kind: "deconstruct",
      target: c.site,
      scope: sc,
      reason: "Ordered",
      routine: false,
    };
  else if (c.kind === "harvest")
    j = {
      lifecycle: "active",
      id,
      kind: "harvest",
      target: c.herb,
      scope: sc,
      reason: "Ordered",
      routine: false,
    };
  else if (c.kind === "water-mugwort")
    j = {
      lifecycle: "active",
      id,
      kind: "water-mugwort",
      target: c.herb,
      scope: sc,
      reason: "Ordered",
      routine: false,
    };
  else if (c.kind === "sow") {
    const h = {
      id: `herb-${s.nextId++}`,
      kind: "mugwort" as const,
      ...placementFooting(c),
      stage: "ordered" as const,
      work: 0,
      establishment: null,
      plantedAt: null,
    };
    s.herbs.push(h);
    j = {
      lifecycle: "active",
      id,
      kind: "sow",
      target: h.id,
      scope: sc,
      reason: "Ordered",
      routine: false,
    };
  } else
    j = {
      lifecycle: "active",
      id,
      kind: "care",
      target: sc.actors![0],
      need: "rest",
      policy: "manual-rest",
      reason: "Ordered",
      routine: false,
    };
  s.jobs.push(j);
  s.workDirty = true;
  return j.id;
}
export type CommandAdmission =
  | { status: "applied"; createdJobs: string[] }
  | { status: "rejected"; reason: string };
/** Admit intent without advancing time; creation IDs come from the job owner. */
export function admitCommand(s: Clearing, c: Command): CommandAdmission {
  const e = commandProblem(s, c);
  if (e) return { status: "rejected", reason: e };
  const createdJobs: string[] = [];
  if (c.kind === "rest") {
    for (const actor of new Set(c.actors!)) {
      if (
        s.jobs.some(
          (job) =>
            job.kind === "care" && job.target === actor && job.need === "rest",
        )
      )
        continue;
      createdJobs.push(add(s, { ...c, actors: [actor] }));
    }
  } else if (c.kind === "cancel") {
    cancelJob(s, c.job);
  } else if (c.kind === "next") {
    const j = s.jobs.find((x) => x.id === c.job)!;
    s.jobs = [j, ...s.jobs.filter((x) => x !== j)];
    s.workDirty = true;
  } else if (c.kind === "draft") {
    const p = s.actors[c.actor];
    interruptWork(s, p);
    p.drafted = true;
    s.workDirty = true;
  } else if (c.kind === "undraft") {
    interruptWork(s, s.actors[c.actor]);
    s.actors[c.actor].drafted = false;
    s.workDirty = true;
  } else if (c.kind === "go") {
    if (!movement(s).go(s.actors[c.actor], c.target))
      return {
        status: "rejected",
        reason: "That route is not currently clear.",
      };
  } else if (c.kind === "work") {
    for (const p of Object.values(s.actors))
      if (inScope(s, p, c)) p.allowedWork[c.work] = c.enabled;
    s.workDirty = true;
  } else if (c.kind === "routine") {
    for (const p of Object.values(s.actors))
      if (inScope(s, p, c)) p.routine = c.enabled;
    s.workDirty = true;
  } else if (c.kind === "recruit") {
    s.parties[c.party].members.push(c.actor);
    s.workDirty = true;
  } else if (
    c.kind === "chop" ||
    c.kind === "dig" ||
    c.kind === "build" ||
    c.kind === "deconstruct" ||
    c.kind === "sow" ||
    c.kind === "harvest" ||
    c.kind === "store" ||
    c.kind === "repair-cache" ||
    c.kind === "fill-kettle" ||
    c.kind === "water-mugwort" ||
    c.kind === "brew" ||
    c.kind === "tap" ||
    c.kind === "clear-spent-grain"
  )
    createdJobs.push(add(s, c));
  return { status: "applied", createdJobs };
}
export function admitCommands(s: Clearing, cs: Command[]): CommandResult[] {
  return cs.map((c) => {
    const result = admitCommand(s, c);
    if (result.status === "rejected") return result;
    s.commands.push({ ...structuredClone(c), tick: s.tick });
    return { status: "applied" };
  });
}
