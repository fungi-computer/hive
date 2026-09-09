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
import { constructionBuffer, placementProblem } from "./construction.js";
import { cacheRepairBuffer, sourceIsOpen } from "./finite-sources.ts";
import { interruptWork } from "./activity.ts";
import {
  brewForJob,
  brewStationOutputProblem,
  cancelPreparingBrew,
  recipeOutputReadiness,
} from "./brewing.ts";
import { recipeOutputActionForWire } from "./recipes.ts";
import {
  containerContents,
  interruptOperationPail,
  releaseContainer,
  retireOperationPail,
} from "./materials.ts";
import {
  blockedCells,
  cellKey,
  inside,
  placementOccupant,
  sourceAccessCells,
  terrainEditProblem,
  terrainRimCells,
} from "./world.js";
import { route, beginWalk } from "./movement.js";
import { terrainCell, terrainBackfillBuffer } from "./terrain.ts";
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
  if (c.kind === "dig" || c.kind === "backfill") {
    const geometry = terrainCell(s.terrain, c.x, c.z);
    if (c.level !== 0 || !inside(c))
      return "Choose shallow ground in the clearing.";
    if (c.kind === "dig" ? !geometry.solid : geometry.solid)
      return c.kind === "dig"
        ? "That shallow voxel is already removed."
        : "That ground is already filled.";
    const occupied = terrainEditProblem(s, c);
    if (occupied) return occupied;
    if (
      s.jobs.some(
        (job) =>
          (job.kind === "dig" || job.kind === "backfill") &&
          job.x === c.x &&
          job.z === c.z,
      )
    )
      return "That ground already has a terrain order.";
    if (
      !terrainRimCells(s, c).some((cell) => !blockedCells(s).has(cellKey(cell)))
    )
      return "No safe cardinal rim reaches that ground.";
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
    (!inside(c) ||
      placementOccupant(s, c) ||
      !terrainCell(s.terrain, c.x, c.z).support)
  )
    return "Choose clear ground.";
  if (c.kind === "cancel" || c.kind === "next") {
    const job = s.jobs.find((entry) => entry.id === c.job);
    if (!job) return "That order is no longer available.";
    if (c.kind === "cancel" && job.kind === "repair-cache") {
      const cache = s.sources.find((source) => source.id === job.target);
      const buffer = cache && cacheRepairBuffer(cache);
      if (
        buffer &&
        containerContents(s.materials, buffer.id).length > 0 &&
        !sourceAccessCells(cache!).some(
          (cell) => !blockedCells(s).has(cellKey(cell)),
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
    if (c.kind === "cancel" && job.kind === "backfill") {
      const buffer = terrainBackfillBuffer(job.id);
      if (
        containerContents(s.materials, buffer.id).length > 0 &&
        !terrainRimCells(s, job).some(
          (cell) => !blockedCells(s).has(cellKey(cell)),
        )
      )
        return "No legal place to release the backfill soil.";
    }
    return "";
  }
  if (c.kind === "draft" || c.kind === "undraft" || c.kind === "go") {
    const p = s.actors[c.actor],
      party = s.parties[c.party];
    return !p || !party?.members.includes(c.actor)
      ? "Choose a home member."
      : c.kind === "go" &&
          (!p.drafted ||
            !inside(c.target) ||
            blockedCells(s).has(cellKey(c.target)))
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
      id,
      kind: "repair-cache",
      target: cache.id,
      scope: sc,
      reason: "Ordered",
      routine: false,
    };
  } else if (c.kind === "fill-kettle")
    j = {
      id,
      kind: "fill-kettle",
      target: c.station,
      scope: sc,
      reason: "Ordered",
      routine: false,
    };
  else if (c.kind === "brew")
    j = {
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
      id,
      kind: "build",
      target: site.id,
      scope: sc,
      reason: "Ordered",
      routine: false,
    };
  } else if (c.kind === "chop")
    j = {
      id,
      kind: "chop",
      target: c.tree,
      scope: sc,
      reason: "Ordered",
      routine: false,
    };
  else if (c.kind === "dig" || c.kind === "backfill")
    j = {
      id,
      kind: c.kind,
      x: c.x,
      z: c.z,
      level: 0,
      scope: sc,
      reason: "Ordered",
      routine: false,
    };
  else if (c.kind === "deconstruct")
    j = {
      id,
      kind: "deconstruct",
      target: c.site,
      scope: sc,
      reason: "Ordered",
      routine: false,
    };
  else if (c.kind === "harvest")
    j = {
      id,
      kind: "harvest",
      target: c.herb,
      scope: sc,
      reason: "Ordered",
      routine: false,
    };
  else if (c.kind === "water-mugwort")
    j = {
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
      x: c.x,
      z: c.z,
      level: c.level,
      stage: "ordered" as const,
      work: 0,
      establishment: null,
      plantedAt: null,
    };
    s.herbs.push(h);
    j = {
      id,
      kind: "sow",
      target: h.id,
      scope: sc,
      reason: "Ordered",
      routine: false,
    };
  } else
    j = {
      id,
      kind: "rest",
      target: sc.actors![0],
      scope: sc,
      reason: "Ordered",
      routine: false,
    };
  s.jobs.push(j);
  s.workDirty = true;
}
function cancel(s: Clearing, id: string) {
  const j = s.jobs.find((x) => x.id === id);
  if (!j) return;
  for (const p of Object.values(s.actors))
    if (p.task?.job === id) interruptWork(s, p);
  if (j.kind === "build") {
    const site = s.sites.find((x) => x.id === j.target);
    if (site) {
      const r = releaseContainer(s.materials, constructionBuffer(site), {
        contentsDrop: {
          cell: { x: site.x, z: site.z, level: site.level },
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
          (cell) => !blockedCells(s).has(cellKey(cell)),
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
  } else if (j.kind === "fill-kettle" || j.kind === "water-mugwort") {
    const active = s.operations.find((operation) => operation.job === j.id);
    if (active) {
      const custody = s.materials.transfers.find(
        (transfer) =>
          transfer.owner.kind === "operation" &&
          transfer.owner.operation === active.id,
      );
      if (custody) {
        const actor = s.actors[custody.actor];
        if (!actor) throw new Error("water operation has missing actor");
        const released = interruptOperationPail(s.materials, active.id, {
          cell: { x: actor.x, z: actor.z, level: actor.level },
          legal: true,
        });
        if (!released.ok) throw new Error(released.reason);
      }
      retireOperationPail(s.materials, active.id);
      s.operations = s.operations.filter((operation) => operation !== active);
    }
  } else if (j.kind === "brew") {
    const released = cancelPreparingBrew(s, j.id);
    if (!released.ok) throw new Error(released.reason);
  } else if (j.kind === "backfill") {
    const buffer = terrainBackfillBuffer(j.id);
    const drop = terrainRimCells(s, j).find(
      (cell) => !blockedCells(s).has(cellKey(cell)),
    );
    if (containerContents(s.materials, buffer.id).length > 0) {
      if (!drop) throw new Error("no legal backfill-buffer drop");
      const released = releaseContainer(s.materials, buffer, {
        contentsDrop: { cell: drop, legal: true },
        carriedDrops: Object.fromEntries(
          Object.values(s.actors).map((p) => [p.id, { cell: p, legal: true }]),
        ),
      });
      if (!released.ok) throw new Error(released.reason);
    }
  }
  s.jobs = s.jobs.filter((x) => x.id !== id);
  s.workDirty = true;
}
function accept(s: Clearing, c: Command): CommandResult {
  const e = commandProblem(s, c);
  if (e) return { status: "rejected", reason: e };
  if (c.kind === "cancel") {
    cancel(s, c.job);
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
    s.actors[c.actor].drafted = false;
    s.workDirty = true;
  } else if (c.kind === "go") {
    const p = s.actors[c.actor],
      path = route(p, c.target, blockedCells(s), s);
    if (path) beginWalk(p, path);
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
    c.kind === "backfill" ||
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
    c.kind === "clear-spent-grain" ||
    c.kind === "rest"
  )
    add(s, c);
  s.commands.push({ ...structuredClone(c), tick: s.tick } as any);
  return { status: "applied" };
}
export function admitCommands(s: Clearing, cs: Command[]): CommandResult[] {
  return cs.map((c) => accept(s, c));
}
