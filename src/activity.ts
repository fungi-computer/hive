import type {
  Activity,
  Actor,
  BrewWaterOperation,
  Cell,
  Clearing,
  Site,
  Transfer,
} from "./model.ts";
import { blockedCells, sameCell, sourceAccessCells } from "./world.js";
import { beginWalk, route, walk, face } from "./movement.js";
import {
  BUILDINGS,
  brewKettle,
  brewStationAccessCells,
  constructionBuffer,
  removalProblem,
  resolveMaterialDestination,
  resolveMaterialEndpoint,
  shelfContainer,
  shelteredBeds,
  workPosition,
} from "./construction.js";
import {
  consumeContainerPortion,
  createGroundLot,
  deliverTransfer,
  drawPailWater,
  embedConstruction,
  interruptOperationPail,
  interruptTransfer,
  parkOperationPail,
  pickupTransfer,
  pourPailWater,
  releaseContainer,
  retireOperationPail,
  salvageConstruction,
  transferForActor,
} from "./materials.ts";
import {
  repairReclaimedCache,
  cacheRepairBuffer,
  resolveCacheRepairBuffer,
  resolveOpenFiniteSourceContainer,
  sourceContainerSpec,
  sourceIsOpen,
  sourcePailContainer,
} from "./finite-sources.ts";
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
  const operation =
    p.task?.kind === "brew-water"
      ? state.operations.find((entry) => entry.id === p.task?.target)
      : undefined;
  const r = operation
    ? parkOperationPail(state.materials, {
        actor: p.id,
        operation: operation.id,
        drop: {
          cell: { x: p.x, z: p.z, level: p.level },
          legal: true,
        },
      })
    : interruptTransfer(state.materials, p.id, {
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
function transferEndpoint(s: Clearing, id: string) {
  const site = resolveMaterialDestination(s.sites, id);
  if (site)
    return { destination: site.destination, target: site.site, access: null };
  const repair = resolveCacheRepairBuffer(s, id);
  return repair
    ? {
        destination: repair.destination,
        target: repair.source,
        access: sourceAccessCells(repair.source),
      }
    : null;
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
  if (x.intent.kind !== "deliver") {
    s.notice = `${p.name} is holding material for its operation.`;
    finishActivity(s, p);
    return;
  }
  if (x.owner.kind !== "job") {
    interruptWork(s, p);
    return;
  }
  const owner = x.owner;
  const resolved = transferEndpoint(s, x.intent.destination);
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
  if (s.jobs.find((job) => job.id === owner.job)?.kind === "store")
    finishJob(s, p, owner.job);
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
  const r = embedConstruction(
    s.materials,
    constructionBuffer(site),
    "wood",
    BUILDINGS[site.type].wood,
  );
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
    const releasedJobs = new Set(
      rel.value.owners.flatMap((owner) =>
        owner.kind === "job" ? [owner.job] : [],
      ),
    );
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
function nearestPath(s: Clearing, from: Cell, cells: readonly Cell[]) {
  return (
    cells
      .map((cell) => route(from, cell, blockedCells(s), s))
      .filter((path): path is Cell[] => path !== null)
      .sort((left, right) => left.length - right.length)[0] ?? null
  );
}
function atAny(p: Actor, cells: readonly Cell[]): boolean {
  return cells.some((cell) => sameCell(p, cell));
}
function accessWork(s: Clearing, p: Actor, cells: readonly Cell[]): boolean {
  if (p.mode === "walk") {
    const walked = walk(p, blockedCells(s), s);
    if (walked === "blocked") interruptWork(s, p);
    if (walked !== "arrived") return false;
    p.mode = p.task?.kind ?? "idle";
  }
  if (atAny(p, cells)) return true;
  const path = nearestPath(s, p, cells);
  if (!path) {
    interruptWork(s, p);
    return false;
  }
  beginWalk(p, path);
  return false;
}
function repairCache(s: Clearing, p: Actor, t: Activity): void {
  const cache = s.sources.find(
    (source) =>
      source.id === t.target && source.kind === "reclaimed-timber-cache",
  );
  if (!cache || cache.kind !== "reclaimed-timber-cache" || cache.repaired) {
    interruptWork(s, p);
    return;
  }
  if (!accessWork(s, p, sourceAccessCells(cache))) return;
  if (++p.work < t.duration) return;
  const buffer = cacheRepairBuffer(cache);
  const wood =
    buffer &&
    s.materials.lots.find(
      (lot) =>
        lot.material === "wood" &&
        lot.location.kind === "container" &&
        lot.location.container === buffer.id &&
        lot.quantity >= 2,
    );
  if (!wood || !buffer) {
    interruptWork(s, p);
    return;
  }
  const consumed = consumeContainerPortion(s.materials, {
    lot: wood.id,
    container: buffer.id,
    material: "wood",
    quantity: 2,
  });
  if (!consumed.ok || !repairReclaimedCache(s, cache.id)) {
    interruptWork(s, p);
    return;
  }
  s.notice = "The reclaimed cache is open.";
  finishJob(s, p, t.job);
}
function acquireBrewPail(
  s: Clearing,
  p: Actor,
  operation: BrewWaterOperation,
  held: Transfer,
): boolean {
  if (held.phase.kind === "carrying") return true;
  const origin = held.phase.origin;
  const cache =
    origin.kind === "container"
      ? s.sources.find(
          (source) =>
            origin.kind === "container" &&
            origin.container === sourcePailContainer(source.id),
        )
      : undefined;
  const acquireCells =
    origin.kind === "ground"
      ? [origin.cell]
      : cache
        ? sourceAccessCells(cache)
        : [];
  if ((cache && !sourceIsOpen(cache)) || acquireCells.length === 0) {
    interruptWork(s, p);
    return false;
  }
  if (!accessWork(s, p, acquireCells)) return false;
  const picked = pickupTransfer(s.materials, held.id, {
    sourceReachable: true,
    destinationReachableWithPayload: true,
  });
  if (!picked.ok) {
    interruptWork(s, p);
    return false;
  }
  if (operation.phase === "acquire") operation.phase = "draw";
  return true;
}

function drawBrewWater(
  s: Clearing,
  p: Actor,
  operation: BrewWaterOperation,
): boolean {
  if (operation.phase !== "draw") return true;
  const spring = s.sources.find(
    (source) => source.id === operation.spring && source.kind === "spring",
  );
  if (!spring) {
    interruptWork(s, p);
    return false;
  }
  if (!accessWork(s, p, sourceAccessCells(spring))) return false;
  const drawn = drawPailWater(s.materials, {
    operation: operation.id,
    source: sourceContainerSpec(spring),
    sourceLot: `source-lot:${spring.id}`,
    quantity: 2,
    access: {
      sourceReachable: true,
      destinationReachableWithPayload: true,
    },
  });
  if (!drawn.ok) {
    interruptWork(s, p);
    return false;
  }
  operation.water = drawn.value.id;
  operation.phase = "pour";
  return true;
}

function pourBrewWater(
  s: Clearing,
  p: Actor,
  t: Activity,
  operation: BrewWaterOperation,
  station: Site,
): void {
  if (operation.phase !== "pour") return;
  if (!accessWork(s, p, brewStationAccessCells(station))) return;
  const poured = pourPailWater(s.materials, {
    operation: operation.id,
    destination: brewKettle(station),
    sourceLot: operation.water ?? "",
    quantity: 2,
    access: {
      sourceReachable: true,
      destinationReachableWithPayload: true,
    },
  });
  if (!poured.ok) {
    interruptWork(s, p);
    return;
  }
  const settled = interruptOperationPail(s.materials, operation.id, {
    cell: groundCell(p),
    legal: true,
  });
  if (!settled.ok) throw new Error(settled.reason);
  retireOperationPail(s.materials, operation.id);
  s.notice = "The kettle holds two water.";
  finishJob(s, p, t.job);
  s.operations = s.operations.filter((entry) => entry !== operation);
}

function brewWater(s: Clearing, p: Actor, t: Activity): void {
  const operation = s.operations.find((entry) => entry.id === t.target);
  const job = s.jobs.find((entry) => entry.id === t.job);
  const pail =
    operation && s.materials.lots.find((lot) => lot.id === operation.pail);
  if (
    !operation ||
    operation.actor !== p.id ||
    operation.job !== t.job ||
    job?.kind !== "fill-kettle" ||
    !pail ||
    pail.material !== "pail"
  ) {
    interruptWork(s, p);
    return;
  }
  const held = transferForActor(s.materials, p.id);
  if (
    held &&
    (held.intent.kind !== "use" ||
      held.intent.operation !== operation.id ||
      held.owner.kind !== "operation" ||
      held.owner.operation !== operation.id ||
      (held.phase.kind === "reserved"
        ? held.phase.sourceLot
        : held.phase.lot) !== pail.id)
  ) {
    interruptWork(s, p);
    return;
  }
  if (!held) {
    interruptWork(s, p);
    return;
  }
  const station = s.sites.find(
    (site) =>
      site.id === operation.station &&
      site.type === "brew-station" &&
      site.finishedAt !== null,
  );
  if (!station) {
    interruptWork(s, p);
    return;
  }
  if (!acquireBrewPail(s, p, operation, held)) return;
  if (!drawBrewWater(s, p, operation)) return;
  pourBrewWater(s, p, t, operation, station);
}
export function advanceWork(s: Clearing, p: Actor): void {
  const t = p.task;
  if (!t) return;
  if (t.kind === "repair-cache") return repairCache(s, p, t);
  if (t.kind === "brew-water") return brewWater(s, p, t);
  const target =
    t.kind === "transfer"
      ? (() => {
          const x = s.materials.transfers.find((x) => x.id === t.target);
          if (!x) return;
          const phase = x.phase;
          if (phase.kind === "carrying")
            return x.intent.kind === "deliver"
              ? transferEndpoint(s, x.intent.destination)?.target
              : p;
          return phase.origin.kind === "ground"
            ? phase.origin.cell
            : (resolveMaterialEndpoint(
                s.sites,
                phase.origin.container,
                "withdraw",
              )?.site ??
                resolveOpenFiniteSourceContainer(s, phase.origin.container)
                  ?.source);
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
  const carriedRepairAccess =
    currentTransfer?.phase.kind === "carrying" &&
    currentTransfer.intent.kind === "deliver"
      ? transferEndpoint(s, currentTransfer.intent.destination)?.access
      : null;
  const okay =
    t.kind === "transfer" && carriedRepairAccess
      ? atAny(p, carriedRepairAccess)
      : t.kind === "transfer" && currentTransfer?.phase.kind === "reserved"
        ? currentTransfer.phase.origin.kind === "ground"
          ? sameCell(p, target)
          : workPosition(s, p, target, "build")
        : t.kind === "build" ||
            t.kind === "deconstruct" ||
            t.kind === "transfer"
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
