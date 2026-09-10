import {
  finishActivity,
  finishJob,
  interruptWork,
} from "./activity-lifecycle.ts";
import {
  settlePhysicalEdit,
  TERRAIN_WORK_TICKS,
} from "./physical-completion.ts";
import { drawFieldWater } from "./field-water.ts";
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
} from "./model.ts";
import {
  sameCell,
  sourceAccessCells,
  terrainEditProblem,
  terrainRimCells,
} from "./world.js";
import { movement, face } from "./movement.ts";
import { placementFooting } from "./game-space.ts";
import {
  BUILDINGS,
  brewStationAccessCells,
  constructionBuffer,
  removalProblem,
  resolveMaterialDestination,
  resolveMaterialEndpoint,
  shelteredBeds,
  workPosition,
  workPositions,
} from "./construction.js";
import {
  consumeContainerPortion,
  createGroundLot,
  deliverTransfer,
  drawPailWater,
  pickupTransfer,
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
import { terrainColumn, terrainDigProblem } from "./terrain.ts";
export const CHOP_TICKS = 80;
function groundCell(at: Cell): Cell {
  return { x: at.x, y: at.y, z: at.z };
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
  const at = placementFooting(terrainColumn(job.voxel));
  if (terrainDigProblem(s.terrain, job.voxel)) {
    interruptWork(s, p);
    return;
  }
  const blocked = terrainEditProblem(s, at);
  if (blocked) {
    job.reason = blocked;
    return;
  }
  const rim = terrainRimCells(s, at);
  if (!accessWork(s, p, rim)) return;
  face(p, at);
  if (p.work + 1 < TERRAIN_WORK_TICKS) {
    p.work++;
    return;
  }
  completePhysicalWork(s, p, job);
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
function completePhysicalWork(s: Clearing, p: Actor, job: Job): void {
  const result = settlePhysicalEdit(s, { actorId: p.id, jobId: job.id });
  if (result.status === "waiting") job.reason = result.reason;
  else if (result.status === "invalid") interruptWork(s, p);
}
function build(s: Clearing, p: Actor, t: Activity) {
  const site = s.sites.find((site) => site.id === t.target);
  const job = s.jobs.find((job) => job.id === t.job);
  if (!site || !job) {
    interruptWork(s, p);
    return;
  }
  if (site.work + 1 < BUILDINGS[site.type].ticks) {
    p.work = ++site.work;
    return;
  }
  completePhysicalWork(s, p, job);
}
function deconstruct(s: Clearing, p: Actor, t: Activity) {
  const site = s.sites.find((site) => site.id === t.target);
  const job = s.jobs.find((job) => job.id === t.job);
  if (!site || !job) {
    interruptWork(s, p);
    return;
  }
  const blocked = removalProblem(s, site, p);
  if (blocked) {
    job.reason = blocked;
    return;
  }
  if (p.work + 1 < BUILDINGS[site.type].deconstructTicks) {
    p.work++;
    return;
  }
  completePhysicalWork(s, p, job);
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
function atAny(p: Actor, cells: readonly Cell[]): boolean {
  return cells.some((cell) => sameCell(p, cell));
}
function accessWork(s: Clearing, p: Actor, cells: readonly Cell[]): boolean {
  const outcome = approachWork(s, p, cells);
  if (outcome === "invalid") interruptWork(s, p);
  return outcome === "ready";
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
  const navigation = movement(s);
  if (p.mode === "walk") {
    const outcome = navigation.advance(p);
    if (outcome === "blocked") return "invalid";
    if (outcome === "moving" || outcome === "waiting") return "pending";
    p.mode = p.task?.kind ?? "idle";
  }
  if (atAny(p, cells)) return "ready";
  const path = navigation.forBody(p).closest(p, cells);
  if (!path || !navigation.start(p, path)) return "invalid";
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
        const drawn =
          supply.source.kind === "field"
            ? operation.supply.kind === "field"
              ? drawFieldWater(s, {
                  operation: operation.id,
                  binding: operation.supply.binding,
                  nodeId: operation.supply.nodeId,
                  quantity: supply.deficit,
                })
              : { ok: false as const, reason: "field-supply-mismatch" }
            : drawPailWater(s.materials, {
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
  const targetAt =
    "type" in target ? placementFooting(target as Site) : (target as Cell);
  if (p.mode === "walk") {
    const r = movement(s).advance(p);
    if (r === "blocked") interruptWork(s, p);
    if (r !== "arrived" && r !== "idle") return;
    p.mode = t.kind;
    face(p, targetAt);
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
              ? sameCell(p, targetAt)
              : Math.abs(p.x - targetAt.x) + Math.abs(p.z - targetAt.z) === 1 &&
                p.y === targetAt.y;
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
