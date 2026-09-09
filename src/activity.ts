import { resolveWaterSupply } from "./water-supply.ts";
import { type AccessOutcome } from "./engine/work/index.ts";
import type {
  Activity,
  Actor,
  Cell,
  Clearing,
  Job,
  Site,
  Transfer,
  WaterDeliveryOperation,
} from "./model.ts";
import {
  blockedCells,
  sameCell,
  sourceAccessCells,
  terrainEditProblem,
  terrainRimCells,
} from "./world.js";
import { beginWalk, route, walk, face } from "./movement.js";
import {
  BUILDINGS,
  brewStationAccessCells,
  constructionBuffer,
  removalProblem,
  resolveMaterialDestination,
  resolveMaterialEndpoint,
  shelfContainer,
  shelteredBeds,
  workPosition,
  workPositions,
} from "./construction.js";
import {
  consumeContainerPortion,
  createGroundLot,
  deliverTransfer,
  drawPailWater,
  embedConstruction,
  interruptTransfer,
  pickupTransfer,
  releaseContainer,
  salvageConstruction,
  transferForActor,
} from "./materials.ts";
import {
  advanceRestContact,
  consumableCareDefinition,
  REST_CONTACT,
  settleCareConsumption,
} from "./needs.ts";
import {
  repairReclaimedCache,
  cacheRepairBuffer,
  resolveCacheRepairBuffer,
  resolveMaterialWithdrawal,
  resolveOpenFiniteSourceContainer,
  sourceIsOpen,
  sourcePailContainer,
} from "./finite-sources.ts";
import { isNight } from "./routine.ts";
import { HARVEST_TICKS, SOW_TICKS } from "./herbs.ts";
import { attendBrew, attendRecipeOutput } from "./brewing.ts";
import { recipeOutputActionForWire } from "./recipes.ts";
import {
  finiteWorkOwner,
  sameWaterDeliveryTarget,
  resolveWaterDelivery,
  settleWaterDelivery,
  waterDeliveryTargetForJob,
} from "./water-delivery.ts";
import {
  terrainColumn,
  terrainDigProblem,
  excavateTerrain,
} from "./terrain.ts";
export const CHOP_TICKS = 80;
const TERRAIN_TICKS = 40;
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
    p.task?.kind === "water-delivery"
      ? state.operations.find(
          (entry): entry is WaterDeliveryOperation =>
            entry.kind === "water-delivery" && entry.id === p.task?.target,
        )
      : undefined;
  const drop = { cell: { x: p.x, z: p.z, level: p.level }, legal: true };
  const r = operation
    ? finiteWorkOwner.interrupt(state.operations, state.materials, {
        kind: "park",
        actor: p.id,
        operation: operation.id,
        drop,
      })
    : p.task?.kind === "consume"
      ? finiteWorkOwner.interrupt(state.operations, state.materials, {
          kind: "release",
          operation: p.task.target,
          drop,
        })
      : interruptTransfer(state.materials, p.id, drop);
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
  if (repair)
    return {
      destination: repair.destination,
      target: repair.source,
      access: sourceAccessCells(repair.source),
    };
  return null;
}

function terrainWork(
  s: Clearing,
  p: Actor,
  t: Extract<Activity, { kind: "dig" }>,
): void {
  const job = s.jobs.find(
    (candidate): candidate is Extract<Job, { kind: "dig" }> =>
      candidate.id === t.job && candidate.kind === "dig",
  );
  if (!job || t.target !== job.id) {
    interruptWork(s, p);
    return;
  }
  const at = terrainColumn(job.voxel);
  if (terrainEditProblem(s, at) || terrainDigProblem(s.terrain, job.voxel)) {
    interruptWork(s, p);
    return;
  }
  const rim = terrainRimCells(s, at);
  if (!accessWork(s, p, rim)) return;
  face(p, at);
  if (++p.work < TERRAIN_TICKS) return;
  const next = excavateTerrain(s.terrain, job.voxel);
  const created = createGroundLot(s.materials, "soil", 1, groundCell(p));
  if (!created.ok)
    throw new Error(`excavation soil admission failed: ${created.reason}`);
  s.terrain = next;
  s.notice = "Soil is piled beside the hole.";
  s.workDirty = true;
  finishJob(s, p, job.id);
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
    h.establishment = null;
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
/** Access query/progress returns an outcome; it cannot recursively retire work. */
function approachWork(
  s: Clearing,
  p: Actor,
  cells: readonly Cell[],
): AccessOutcome {
  if (p.mode === "walk") {
    const outcome = walk(p, blockedCells(s), s);
    if (outcome === "blocked") return "invalid";
    if (outcome !== "arrived") return "pending";
    p.mode = p.task?.kind ?? "idle";
  }
  if (atAny(p, cells)) return "ready";
  const path = nearestPath(s, p, cells);
  if (!path) return "invalid";
  beginWalk(p, path);
  return "pending";
}
function finiteWork(s: Clearing, p: Actor, t: Activity): void {
  const operation = s.operations.find(
    (entry) => entry.id === t.target && entry.job === t.job,
  );
  const job = s.jobs.find((entry) => entry.id === t.job);
  const held = transferForActor(s.materials, p.id);
  const definition =
    operation?.kind === "consume"
      ? consumableCareDefinition(operation.definition)
      : null;
  const destination =
    operation?.kind === "water-delivery"
      ? resolveWaterDelivery(s, operation.target)
      : null;
  const expected = job && waterDeliveryTargetForJob(s, job);
  const valid =
    operation?.kind === "consume"
      ? definition &&
        job?.kind === "care" &&
        job.target === p.id &&
        operation.actor === p.id &&
        job.need === definition.effect.need
      : operation &&
        destination &&
        expected &&
        sameWaterDeliveryTarget(expected, operation.target);
  if (
    !operation ||
    !valid ||
    !held ||
    held.intent.kind !== "use" ||
    held.intent.operation !== operation.id ||
    held.owner.kind !== "operation" ||
    held.owner.operation !== operation.id
  ) {
    interruptWork(s, p);
    return;
  }
  const outcome = finiteWorkOwner.advance(
    s.operations,
    s.materials,
    operation.id,
    operation.kind === "water-delivery"
      ? { kind: "vessel", interruption: "park" }
      : {
          kind: "portion",
          interruption: "release",
          attendTicks: definition!.attendTicks,
        },
    {
      acquire() {
        if (held.phase.kind === "carrying") return "ready";
        const origin = held.phase.origin;
        const endpoint =
          origin.kind === "container"
            ? resolveMaterialWithdrawal(s, origin.container)
            : null;
        const cells =
          origin.kind === "ground"
            ? [origin.cell]
            : endpoint?.kind === "site"
              ? workPositions(s, endpoint.site, "build")
              : endpoint?.kind === "finite-source"
                ? endpoint.accessCells
                : [];
        if (!cells.length) return "invalid";
        const access = approachWork(s, p, cells);
        if (access !== "ready") return access;
        return pickupTransfer(s.materials, held.id, {
          sourceReachable: true,
          destinationReachableWithPayload: true,
        }).ok
          ? "ready"
          : "invalid";
      },
      draw() {
        if (operation.kind !== "water-delivery") return { status: "invalid" };
        const supply = resolveWaterSupply(
          s,
          operation.pail,
          operation.quantity,
          operation.supply,
        );
        if (!supply) return { status: "invalid" };
        if (!supply.source)
          return { status: "ready", contents: supply.contents };
        const access = approachWork(s, p, supply.source.accessCells);
        if (access !== "ready") return { status: access };
        const drawn = drawPailWater(s.materials, {
          operation: operation.id,
          source: supply.source.provider,
          portions: supply.portions,
          quantity: supply.deficit,
          access: {
            sourceReachable: true,
            destinationReachableWithPayload: true,
          },
        });
        return drawn.ok
          ? {
              status: "ready",
              contents: [...supply.contents, ...drawn.value].sort((a, b) =>
                a.lot.localeCompare(b.lot),
              ),
            }
          : { status: "invalid" };
      },
      deliver() {
        if (operation.kind !== "water-delivery") return "invalid";
        const currentDestination = resolveWaterDelivery(s, operation.target);
        if (!currentDestination) return "invalid";
        const access = approachWork(s, p, currentDestination.access);
        if (access !== "ready") return access;
        return settleWaterDelivery(s, operation).ok ? "ready" : "invalid";
      },
      consume() {
        const custody = transferForActor(s.materials, p.id);
        return (
          operation.kind === "consume" &&
          custody?.phase.kind === "carrying" &&
          settleCareConsumption(s, {
            actor: p.id,
            operation,
            lot: custody.phase.lot,
          })
        );
      },
    },
    p.id,
    { cell: groundCell(p), legal: true },
  );
  if (outcome === "pending") return;
  if (outcome === "interrupted") {
    finishActivity(s, p);
    return;
  }
  s.notice =
    operation.kind === "consume"
      ? "A ration restores nourishment."
      : operation.target.kind === "kettle"
        ? "The kettle holds two water."
        : operation.target.kind === "mugwort"
          ? "The mugwort is established."
          : "Water restores hydration.";
  finishJob(s, p, t.job);
}
function brew(s: Clearing, p: Actor, t: Activity): void {
  const process = s.processes.find((candidate) => candidate.id === t.target);
  const job = s.jobs.find((candidate) => candidate.id === t.job);
  const station =
    process && s.sites.find((site) => site.id === process.station);
  if (
    !process ||
    process.job !== t.job ||
    (process.phase !== "prepare" && process.phase !== "keg") ||
    job?.kind !== "brew" ||
    !station ||
    station.type !== "brew-station" ||
    station.finishedAt === null
  ) {
    interruptWork(s, p);
    return;
  }
  if (!accessWork(s, p, brewStationAccessCells(station))) return;
  const advanced = attendBrew(s, process.id);
  if (!advanced.ok) {
    interruptWork(s, p);
    return;
  }
  p.work = process.progress;
  if (advanced.value === "fermenting") {
    s.notice = "Herbal ale is fermenting.";
    finishActivity(s, p);
  } else if (advanced.value === "settled") {
    s.notice = "Herbal ale is settled in the keg.";
    finishJob(s, p, t.job);
  }
}
function recipeOutput(s: Clearing, p: Actor, t: Activity): void {
  const job = s.jobs.find(
    (
      candidate,
    ): candidate is Extract<
      typeof candidate,
      { kind: "tap" | "clear-spent-grain" }
    > =>
      candidate.id === t.job &&
      (candidate.kind === "tap" || candidate.kind === "clear-spent-grain"),
  );
  const station = job && s.sites.find((site) => site.id === job.target);
  if (
    !job ||
    t.target !== job.transformation ||
    !station ||
    station.type !== "brew-station" ||
    station.finishedAt === null
  ) {
    interruptWork(s, p);
    return;
  }
  if (!accessWork(s, p, brewStationAccessCells(station))) return;
  const advanced = attendRecipeOutput(s, {
    id: `${recipeOutputActionForWire(job.kind)}:${job.id}`,
    station,
    action: recipeOutputActionForWire(job.kind),
    transformation: job.transformation,
    progress: job.progress,
  });
  if (!advanced.ok) {
    interruptWork(s, p);
    return;
  }
  if (advanced.value === "working") {
    job.progress++;
    p.work = job.progress;
    return;
  }
  s.notice =
    job.kind === "tap"
      ? "One herbal ale serving is tapped."
      : "Spent grain cleared from the tray.";
  finishJob(s, p, job.id);
}
export function advanceWork(s: Clearing, p: Actor): void {
  const t = p.task;
  if (!t) return;
  if (t.kind === "repair-cache") return repairCache(s, p, t);
  if (t.kind === "water-delivery" || t.kind === "consume")
    return finiteWork(s, p, t);
  if (t.kind === "brew") return brew(s, p, t);
  if (t.kind === "tap" || t.kind === "clear-spent-grain")
    return recipeOutput(s, p, t);
  if (t.kind === "dig") return terrainWork(s, p, t);
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
  const carriedDeliveryAccess =
    currentTransfer?.phase.kind === "carrying" &&
    currentTransfer.intent.kind === "deliver"
      ? transferEndpoint(s, currentTransfer.intent.destination)?.access
      : null;
  const reservedFiniteAccess =
    currentTransfer?.phase.kind === "reserved" &&
    currentTransfer.phase.origin.kind === "container"
      ? resolveOpenFiniteSourceContainer(
          s,
          currentTransfer.phase.origin.container,
        )?.accessCells
      : null;
  const okay =
    t.kind === "transfer" && carriedDeliveryAccess
      ? atAny(p, carriedDeliveryAccess)
      : t.kind === "transfer" && reservedFiniteAccess
        ? atAny(p, reservedFiniteAccess)
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
    if (!advanceRestContact(s, { actor: p.id, job: t.job, bed: t.target })) {
      interruptWork(s, p);
      return;
    }
    if (
      p.needs.rest >= REST_CONTACT.recoverAt &&
      !(s.jobs.find((j) => j.id === t.job)?.routine && isNight(s))
    )
      finishJob(s, p, t.job);
  }
}
