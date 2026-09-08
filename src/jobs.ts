import type {
  Activity,
  Actor,
  Assignment,
  CarryIntent,
  Cell,
  Clearing,
  Colony,
  Job,
  PositiveInt,
  TransferRequest,
  WorkType,
} from "./model.ts";
import { inScope } from "./actors.ts";
import { optimizeEligible } from "./matching.ts";
import { blockedCells, sameCell, sourceAccessCells } from "./world.js";
import { approach, pathTicks, route, beginWalk } from "./movement.js";
import {
  BUILDINGS,
  brewKettle,
  constructionBuffer,
  removalProblem,
  roofSupported,
  shelfContainer,
  resolveMaterialEndpoint,
  shelteredBeds,
  brewStationAccessCells,
  workApproach,
} from "./construction.js";
import {
  cacheRepairBuffer,
  resolveCacheRepairBuffer,
  resolveOpenFiniteSourceContainer,
  sourceIsOpen,
  sourcePailContainer,
} from "./finite-sources.ts";
import {
  availableMaterialFacts,
  acquirePailForOperation,
  containerQuantity,
  remainingContainerQuantity,
  rebindOperationPail,
  reserveTransfer,
  transferForActor,
  type ContainerSpec,
  type AvailableLotFact,
} from "./materials.ts";
import {
  brewForJob,
  brewPrepareRemaining,
  brewProcessId,
  brewStationReadiness,
  admitBrew,
  type BrewSupplyRequirement,
} from "./brewing.ts";
import { CHOP_TICKS, interruptWork } from "./activity.ts";
import { HARVEST_TICKS, SOW_TICKS } from "./herbs.ts";
type Candidate = {
  activity: Activity;
  path: Cell[];
  travel: number;
  transfer?: {
    sourceLot: string;
    destination: ContainerSpec;
    request: TransferRequest;
    intent: CarryIntent;
    owner: { kind: "job"; job: string; step: string };
    /** The resolved route exists only for this scheduling pass. */
    destinationReachableWithPayload: boolean;
  };
  brew?: { station: string; spring: string; pail: string; operation?: string };
  recipe?: {
    id: string;
    station: string;
    binding: Parameters<typeof admitBrew>[1]["binding"];
  };
};
type Options = { reason: string; candidate: Candidate | null };
const no = (reason: string): Options => ({ reason, candidate: null });
const make = (
  job: Job,
  kind: Activity["kind"],
  target: string,
  path: Cell[],
  duration: number,
  travel: number,
): Candidate => ({
  activity: { job: job.id, kind, target, duration },
  path,
  travel,
});
/** Shared transfer demand rule: portions may converge over several lots; whole lots do not split. */
function supplyQuantity(
  policy: TransferRequest["quantityPolicy"],
  remaining: number,
  available: number,
): number {
  return policy === "whole-lot"
    ? available === remaining
      ? remaining
      : 0
    : Math.min(2, remaining, available);
}
function constructionTransferOption(
  state: Clearing,
  person: Actor,
  job: Extract<Job, { kind: "build" }>,
  blocked: Set<string>,
  sourceFacts: readonly AvailableLotFact[],
): Options {
  const t = state.materials.transfers.find(
    (x) => x.owner.kind === "job" && x.owner.job === job.id,
  );
  if (t) return no("Wood is on its way");
  const site = state.sites.find((s) => s.id === job.target);
  if (!site) return no("Waiting for site");
  if (site.type === "roof" && !roofSupported(state, site))
    return no("Waiting for enclosing walls and a doorway");
  const destination = constructionBuffer(site);
  const requiredWood = BUILDINGS[site.type].wood;
  const have = containerQuantity(state.materials, destination.id, "wood");
  if (have === requiredWood) return no("Ready to build");
  const remaining = requiredWood - have;
  const choices = [
    ...sourceFacts.filter(
      ({ lot }) => lot.material === "wood" && lot.location.kind === "ground",
    ),
    ...sourceFacts.filter(
      ({ lot }) =>
        lot.material === "wood" &&
        lot.location.kind === "container" &&
        (!!resolveMaterialEndpoint(
          state.sites,
          lot.location.container,
          "withdraw",
        ) ||
          !!resolveOpenFiniteSourceContainer(state, lot.location.container)),
    ),
  ];
  let selected:
    | {
        sourceLot: string;
        path: Cell[];
        travel: number;
        request: TransferRequest;
        destinationReachableWithPayload: boolean;
      }
    | undefined;
  for (const part of choices) {
    const quantity = supplyQuantity("portion", remaining, part.quantity);
    if (quantity < 1) continue;
    const lot = part.lot;
    const sourceSite =
      lot.location.kind === "container"
        ? resolveMaterialEndpoint(
            state.sites,
            lot.location.container,
            "withdraw",
          )?.site
        : null;
    const finiteSource =
      lot.location.kind === "container"
        ? resolveOpenFiniteSourceContainer(state, lot.location.container)
        : null;
    const a = sourceSite
        ? workApproach(state, person, sourceSite, blocked)
        : finiteSource
          ? nearestPath(state, person, finiteSource.accessCells, blocked)
          : route(person, lot.location, blocked, state),
      from = a?.at(-1) ?? person,
      b = a && workApproach(state, from, site, blocked);
    if (!a || !b) continue;
    const travel = pathTicks(person, a) + pathTicks(from, b);
    if (selected === undefined || travel < selected.travel)
      selected = {
        sourceLot: lot.id,
        path: a,
        travel,
        request: {
          source:
            lot.location.kind === "container"
              ? {
                  kind: "eligible-container",
                  material: "wood",
                  container: lot.location.container,
                }
              : { kind: "eligible-ground", material: "wood" },
          quantityPolicy: "portion",
          quantity: quantity as PositiveInt,
        },
        destinationReachableWithPayload: true,
      };
  }
  if (!selected) return no("Waiting for reachable wood");
  return {
    reason: "Ready to haul wood",
    candidate: {
      ...make(
        job,
        "transfer",
        selected.sourceLot,
        selected.path,
        8,
        selected.travel,
      ),
      transfer: {
        sourceLot: selected.sourceLot,
        destination,
        request: selected.request,
        intent: { kind: "deliver", destination: destination.id },
        owner: { kind: "job", job: job.id, step: "construction-materials" },
        destinationReachableWithPayload:
          selected.destinationReachableWithPayload,
      },
    },
  };
}
function storageTransferOption(
  state: Clearing,
  person: Actor,
  job: Extract<Job, { kind: "store" }>,
  blocked: Set<string>,
  sourceFacts: readonly AvailableLotFact[],
): Options {
  const sourceLot = job.source;
  const resolved = resolveMaterialEndpoint(
    state.sites,
    job.destination,
    "deposit",
  );
  if (!resolved) return no("Waiting for material or shelf");
  const { destination, site } = resolved;
  const lot = sourceFacts.find((fact) => fact.lot.id === sourceLot);
  if (!lot || lot.lot.location.kind !== "ground")
    return no("Waiting for material or shelf");
  const free = remainingContainerQuantity(
    state.materials,
    destination,
    lot.lot.material,
  );
  if (!free.ok) return no("Waiting for material or shelf");
  const quantity = Math.min(
    lot.lot.material === "wood" ? 2 : 1,
    lot.quantity,
    free.value,
  );
  if (quantity < 1) return no("Shelf is full");
  const request: TransferRequest = {
    source: { kind: "exact-lot", lot: sourceLot },
    quantityPolicy: lot.lot.material === "mugwort" ? "whole-lot" : "portion",
    quantity: quantity as PositiveInt,
  };
  const path = route(person, lot.lot.location, blocked, state),
    d = workApproach(state, lot.lot.location, site, blocked);
  if (!path || !d) return no("No route to this material");
  return {
    reason: `Ready to store ${lot.lot.material}`,
    candidate: {
      ...make(
        job,
        "transfer",
        sourceLot,
        path,
        8,
        pathTicks(person, path) + pathTicks(lot.lot.location, d),
      ),
      transfer: {
        sourceLot,
        destination,
        request,
        intent: { kind: "deliver", destination: destination.id },
        owner: { kind: "job", job: job.id, step: "shelf-store" },
        destinationReachableWithPayload: true,
      },
    },
  };
}
function nearestPath(
  state: Clearing,
  from: Cell,
  cells: readonly Cell[],
  blocked: Set<string>,
) {
  return (
    cells
      .map((cell) => route(from, cell, blocked, state))
      .filter((path): path is Cell[] => path !== null)
      .sort(
        (left, right) => pathTicks(from, left) - pathTicks(from, right),
      )[0] ?? null
  );
}
function repairCacheOption(
  state: Clearing,
  person: Actor,
  job: Extract<Job, { kind: "repair-cache" }>,
  blocked: Set<string>,
  sourceFacts: readonly AvailableLotFact[],
): Options {
  const cache = state.sources.find((source) => source.id === job.target);
  if (!cache || cache.kind !== "reclaimed-timber-cache" || sourceIsOpen(cache))
    return no("The reclaimed cache is already repaired");
  const destination = cacheRepairBuffer(cache)!;
  const delivered = containerQuantity(state.materials, destination.id, "wood");
  if (delivered === 2) {
    const path = nearestPath(state, person, sourceAccessCells(cache), blocked);
    return path
      ? {
          reason: "Ready to repair the cache",
          candidate: make(
            job,
            "repair-cache",
            cache.id,
            path,
            8,
            pathTicks(person, path),
          ),
        }
      : no("No route to the cache");
  }
  const remaining = 2 - delivered;
  let selected:
    | {
        lot: AvailableLotFact["lot"];
        quantity: number;
        path: Cell[];
        travel: number;
      }
    | undefined;
  for (const fact of sourceFacts) {
    const lot = fact.lot;
    if (lot.material !== "wood") continue;
    const sourceSite =
      lot.location.kind === "container"
        ? resolveMaterialEndpoint(
            state.sites,
            lot.location.container,
            "withdraw",
          )?.site
        : null;
    const path = sourceSite
      ? workApproach(state, person, sourceSite, blocked)
      : lot.location.kind === "ground"
        ? route(person, lot.location, blocked, state)
        : null;
    if (!path) continue;
    const toRepair = nearestPath(
      state,
      path.at(-1) ?? person,
      sourceAccessCells(cache),
      blocked,
    );
    if (!toRepair) continue;
    const travel =
      pathTicks(person, path) + pathTicks(path.at(-1) ?? person, toRepair);
    if (!selected || travel < selected.travel)
      selected = { lot, quantity: fact.quantity, path, travel };
  }
  if (!selected) return no("Waiting for reachable repair wood");
  const quantity = supplyQuantity("portion", remaining, selected.quantity);
  if (quantity < 1) return no("Waiting for reachable repair wood");
  return {
    reason: "Ready to haul repair wood",
    candidate: {
      ...make(
        job,
        "transfer",
        selected.lot.id,
        selected.path,
        8,
        selected.travel,
      ),
      transfer: {
        sourceLot: selected.lot.id,
        destination,
        request: {
          source:
            selected.lot.location.kind === "container"
              ? {
                  kind: "eligible-container",
                  material: "wood",
                  container: selected.lot.location.container,
                }
              : { kind: "eligible-ground", material: "wood" },
          quantityPolicy: "portion",
          quantity: quantity as PositiveInt,
        },
        intent: { kind: "deliver", destination: destination.id },
        owner: { kind: "job", job: job.id, step: "cache-repair-materials" },
        destinationReachableWithPayload: true,
      },
    },
  };
}
function fillKettleOption(
  state: Clearing,
  person: Actor,
  job: Extract<Job, { kind: "fill-kettle" }>,
  blocked: Set<string>,
  sourceFacts: readonly AvailableLotFact[],
): Options {
  const existing = state.operations.find(
    (operation) => operation.job === job.id,
  );
  const station = state.sites.find(
    (site) =>
      site.id === (existing?.station ?? job.target) &&
      site.type === "brew-station" &&
      site.finishedAt !== null,
  );
  if (!station) return no("Waiting for a finished brew station");
  if (containerQuantity(state.materials, brewKettle(station).id, "water") >= 2)
    return no("The kettle is full");
  const phase = existing?.phase ?? "acquire";
  if (
    existing &&
    !state.materials.bindings.some(
      (binding) =>
        binding.kind === "vessel-use" &&
        binding.id === existing.id &&
        binding.vessel === existing.pail,
    )
  )
    return no("Waiting for its bound pail");
  const pailFacts = existing
    ? (() => {
        const lot = state.materials.lots.find(
          (candidate) => candidate.id === existing.pail,
        );
        return lot && lot.id === existing.pail ? [{ lot }] : [];
      })()
    : sourceFacts.filter(
        ({ lot }) => lot.material === "pail" && lot.quantity === 1,
      );
  const candidates = pailFacts
    .flatMap(({ lot }) => {
      const cache = state.sources.find(
        (source) =>
          lot.location.kind === "container" &&
          lot.location.container === sourcePailContainer(source.id),
      );
      const access =
        lot.location.kind === "ground"
          ? [lot.location]
          : cache && sourceIsOpen(cache)
            ? sourceAccessCells(cache)
            : [];
      const path =
        lot.location.kind === "hand" && lot.location.actor === person.id
          ? []
          : nearestPath(state, person, access, blocked);
      return path ? [{ lot, path }] : [];
    })
    .sort(
      (left, right) =>
        pathTicks(person, left.path) - pathTicks(person, right.path),
    );
  const selected = candidates[0];
  if (!selected) return no("Waiting for the recoverable pail");
  const spring =
    phase === "pour"
      ? undefined
      : state.sources.find(
          (source) =>
            source.id === existing?.spring ||
            (!existing && source.kind === "spring"),
        );
  if (
    phase !== "pour" &&
    (!spring ||
      containerQuantity(state.materials, `source:${spring.id}`, "water") < 2)
  )
    return no("Waiting for the spring");
  const pailAt = selected.path.at(-1) ?? person;
  const springPath = spring
    ? nearestPath(state, pailAt, sourceAccessCells(spring), blocked)
    : [];
  const stationPath = spring
    ? springPath &&
      nearestPath(
        state,
        springPath.at(-1) ?? pailAt,
        brewStationAccessCells(station),
        blocked,
      )
    : nearestPath(state, pailAt, brewStationAccessCells(station), blocked);
  if (!stationPath || (spring && !springPath))
    return no("No route from pail to kettle");
  return {
    reason: "Ready to fill the kettle",
    candidate: {
      ...make(
        job,
        "brew-water",
        "pending-operation",
        selected.path,
        1,
        pathTicks(person, selected.path) +
          pathTicks(pailAt, springPath) +
          pathTicks(springPath.at(-1) ?? pailAt, stationPath),
      ),
      brew: {
        station: station.id,
        spring: existing?.spring ?? spring!.id,
        pail: selected.lot.id,
        operation: existing?.id,
      },
    },
  };
}

function brewSupplyOption(
  state: Clearing,
  person: Actor,
  job: Extract<Job, { kind: "brew" }>,
  station: Clearing["sites"][number],
  blocked: Set<string>,
  sourceFacts: readonly AvailableLotFact[],
  input: BrewSupplyRequirement,
): Options {
  const choices = sourceFacts.filter(({ lot }) => {
    if (lot.material !== input.material) return false;
    if (lot.location.kind === "ground") return true;
    return (
      lot.location.kind === "container" &&
      (!!resolveMaterialEndpoint(
        state.sites,
        lot.location.container,
        "withdraw",
      ) ||
        !!resolveOpenFiniteSourceContainer(state, lot.location.container))
    );
  });
  let selected:
    | {
        lot: AvailableLotFact["lot"];
        path: Cell[];
        travel: number;
        quantity: number;
      }
    | undefined;
  for (const fact of choices) {
    const quantity = supplyQuantity(
      input.quantityPolicy,
      input.quantity,
      fact.quantity,
    );
    if (quantity < 1) continue;
    const lot = fact.lot;
    const sourceSite =
      lot.location.kind === "container"
        ? resolveMaterialEndpoint(
            state.sites,
            lot.location.container,
            "withdraw",
          )?.site
        : null;
    const finiteSource =
      lot.location.kind === "container"
        ? resolveOpenFiniteSourceContainer(state, lot.location.container)
        : null;
    const from = sourceSite
      ? workApproach(state, person, sourceSite, blocked)
      : finiteSource
        ? nearestPath(state, person, finiteSource.accessCells, blocked)
        : lot.location.kind === "ground"
          ? route(person, lot.location, blocked, state)
          : null;
    if (!from) continue;
    const to = workApproach(state, from.at(-1) ?? person, station, blocked);
    if (!to) continue;
    const travel =
      pathTicks(person, from) + pathTicks(from.at(-1) ?? person, to);
    if (!selected || travel < selected.travel)
      selected = { lot, path: from, travel, quantity };
  }
  if (!selected) return no(`Waiting for reachable ${input.material}`);
  return {
    reason: `Ready to haul ${input.material}`,
    candidate: {
      ...make(
        job,
        "transfer",
        selected.lot.id,
        selected.path,
        8,
        selected.travel,
      ),
      transfer: {
        sourceLot: selected.lot.id,
        destination: input.destination,
        request: {
          source: { kind: "exact-lot", lot: selected.lot.id },
          quantityPolicy: input.quantityPolicy,
          quantity: selected.quantity as PositiveInt,
        },
        intent: { kind: "deliver", destination: input.destination.id },
        owner: { kind: "job", job: job.id, step: input.step },
        destinationReachableWithPayload: true,
      },
    },
  };
}

function brewOption(
  state: Clearing,
  person: Actor,
  job: Extract<Job, { kind: "brew" }>,
  blocked: Set<string>,
  sourceFacts: readonly AvailableLotFact[],
): Options {
  const station = state.sites.find(
    (site) =>
      site.id === job.target &&
      site.type === "brew-station" &&
      site.finishedAt !== null,
  );
  if (!station) return no("Waiting for a finished brew station");
  const process = brewForJob(state, job.id);
  if (process)
    return process.phase === "ferment"
      ? no("Fermenting")
      : (() => {
          const path = workApproach(state, person, station, blocked);
          return path
            ? {
                reason: "Ready to prepare herbal ale",
                candidate: make(
                  job,
                  "brew",
                  process.id,
                  path,
                  brewPrepareRemaining(state, process),
                  pathTicks(person, path),
                ),
              }
            : no("No route to the brew station");
        })();
  const readiness = brewStationReadiness(state, station, brewProcessId(job.id));
  if (readiness.kind === "waiting") return no(readiness.reason);
  if (readiness.kind === "supply")
    return brewSupplyOption(
      state,
      person,
      job,
      station,
      blocked,
      sourceFacts,
      readiness.requirement,
    );
  const path = workApproach(state, person, station, blocked);
  if (!path) return no("No route to the brew station");
  return {
    reason: "Ready to prepare herbal ale",
    candidate: {
      ...make(
        job,
        "brew",
        brewProcessId(job.id),
        path,
        readiness.prepareTicks,
        pathTicks(person, path),
      ),
      recipe: {
        id: brewProcessId(job.id),
        station: station.id,
        binding: readiness.binding,
      },
    },
  };
}
function option(
  state: Clearing,
  p: Actor,
  j: Job,
  b: Set<string>,
  sourceFacts: readonly AvailableLotFact[],
): Options {
  if (j.kind === "repair-cache")
    return repairCacheOption(state, p, j, b, sourceFacts);
  if (j.kind === "fill-kettle")
    return fillKettleOption(state, p, j, b, sourceFacts);
  if (j.kind === "brew") return brewOption(state, p, j, b, sourceFacts);
  if (j.kind === "build") {
    const site = state.sites.find((x) => x.id === j.target)!;
    const c = constructionBuffer(site);
    if (
      containerQuantity(state.materials, c.id, "wood") ===
      BUILDINGS[site.type].wood
    ) {
      const path = workApproach(state, p, site, b);
      return path
        ? {
            reason: "Ready to build",
            candidate: make(
              j,
              "build",
              site.id,
              path,
              BUILDINGS[site.type].ticks - site.work,
              pathTicks(p, path),
            ),
          }
        : no("No route to this site");
    }
    return constructionTransferOption(state, p, j, b, sourceFacts);
  }
  if (j.kind === "store")
    return storageTransferOption(state, p, j, b, sourceFacts);
  if (j.kind === "chop") {
    const x = state.trees.find((x) => x.id === j.target)!;
    const path = approach(p, x, b, state);
    return path
      ? {
          reason: "Ready to chop",
          candidate: make(
            j,
            "chop",
            x.id,
            path,
            CHOP_TICKS - x.work,
            pathTicks(p, path),
          ),
        }
      : no("No route to this tree");
  }
  if (j.kind === "sow" || j.kind === "harvest") {
    const x = state.herbs.find((x) => x.id === j.target);
    const path = x && approach(p, x, b, state);
    return x && path
      ? {
          reason: "Ready",
          candidate: make(
            j,
            j.kind,
            x.id,
            path,
            (j.kind === "sow" ? SOW_TICKS : HARVEST_TICKS) - x.work,
            pathTicks(p, path),
          ),
        }
      : no("Waiting for mugwort");
  }
  if (j.kind === "deconstruct") {
    const x = state.sites.find((x) => x.id === j.target);
    const path =
      x &&
      !removalProblem(state, x, p) &&
      workApproach(state, p, x, b, "deconstruct");
    return x && path
      ? {
          reason: "Ready to deconstruct",
          candidate: make(
            j,
            "deconstruct",
            x.id,
            path,
            BUILDINGS[x.type].deconstructTicks,
            pathTicks(p, path),
          ),
        }
      : no("Waiting to deconstruct");
  }
  const bed = shelteredBeds(state)[0];
  const path = bed && route(p, bed, b, state);
  return bed && path
    ? {
        reason: "Ready to rest",
        candidate: make(j, "sleep", bed.id, path, 80, pathTicks(p, path)),
      }
    : no("Needs a bed");
}
function automatic(a: Activity): WorkType | null {
  return a.kind === "transfer"
    ? "haul"
    : a.kind === "repair-cache"
      ? "build"
      : a.kind === "brew-water"
        ? "haul"
        : a.kind === "brew"
          ? "craft"
          : a.kind === "build" || a.kind === "deconstruct"
            ? "build"
            : a.kind === "chop"
              ? "chop"
              : a.kind === "sow" || a.kind === "harvest"
                ? "garden"
                : null;
}
export function assignWork(state: Clearing, colony: Colony): void {
  if (!state.workDirty) return;
  state.workDirty = false;
  const blocked = blockedCells(state),
    members = new Set(Object.values(state.parties).flatMap((p) => p.members)),
    idle = Object.values(state.actors).filter(
      (p) => p.mode === "idle" && !p.drafted && members.has(p.id),
    ),
    offered: Assignment[] = [],
    choices = new Map<string, Candidate>(),
    sourceFacts = availableMaterialFacts(state.materials);
  const offer = (p: Actor, j: Job, personal = false): boolean => {
    if (
      state.materials.transfers.some(
        (t) => t.owner.kind === "job" && t.owner.job === j.id,
      ) ||
      Object.values(state.actors).some((a) => a.task?.job === j.id)
    )
      return false;
    const o = option(state, p, j, blocked, sourceFacts);
    j.reason = o.reason;
    if (
      !o.candidate ||
      (!personal &&
        automatic(o.candidate.activity) &&
        !p.allowedWork[automatic(o.candidate.activity)!])
    )
      return false;
    choices.set(`${p.id}/${j.id}`, o.candidate);
    offered.push({
      character: p.id,
      task: j.id,
      cost: colony.compute_cost({
        travel_time: o.candidate.travel,
        work_time: o.candidate.activity.duration,
        priority: 1,
      }),
    });
    return true;
  };
  const sharedWorkers: Actor[] = [];
  for (const p of idle) {
    const carry = transferForActor(state.materials, p.id);
    if (carry?.phase.kind === "carrying") {
      if (carry.intent.kind !== "deliver") continue;
      const site = resolveMaterialEndpoint(
        state.sites,
        carry.intent.destination,
        "deposit",
      )?.site;
      const repair = resolveCacheRepairBuffer(state, carry.intent.destination);
      const path = site
        ? workApproach(state, p, site, blocked)
        : repair
          ? nearestPath(state, p, sourceAccessCells(repair.source), blocked)
          : null;
      if (path) {
        const c = make(
          state.jobs.find(
            (j) => carry.owner.kind === "job" && j.id === carry.owner.job,
          )!,
          "transfer",
          carry.id,
          path,
          8,
          pathTicks(p, path),
        );
        choices.set(`${p.id}/${c.activity.job}`, c);
        offered.push({
          character: p.id,
          task: c.activity.job,
          cost: colony.compute_cost({
            travel_time: c.travel,
            work_time: 8,
            priority: 1,
          }),
        });
      } else interruptWork(state, p);
      continue;
    }
    const personal = state.jobs.filter(
      (j) => inScope(state, p, j.scope) && j.scope.actors?.includes(p.id),
    );
    if (personal.some((j) => offer(p, j, true))) continue;
    sharedWorkers.push(p);
  }
  // Queue order selects a bounded, distinct shared-job frontier once for the
  // party.  Every eligible worker may then compete for those jobs; a worker
  // being unable to reach an earlier job cannot silently promote a later one.
  let frontier = 0;
  for (const job of state.jobs) {
    if (frontier >= sharedWorkers.length) break;
    if (job.scope.actors !== null) continue;
    let viable = false;
    for (const worker of sharedWorkers)
      if (inScope(state, worker, job.scope))
        viable = offer(worker, job) || viable;
    if (viable) frontier++;
  }
  const committedActors = new Set<string>(),
    committedJobs = new Set<string>();
  const jobOrder = new Map(state.jobs.map((job, index) => [job.id, index]));
  for (const m of optimizeEligible(colony, offered).sort(
    (a, b) =>
      (jobOrder.get(a.task) ?? Infinity) - (jobOrder.get(b.task) ?? Infinity) ||
      a.character.localeCompare(b.character),
  )) {
    const p = state.actors[m.character],
      c = choices.get(`${m.character}/${m.task}`);
    if (!c) continue;
    if (c.transfer) {
      if (
        !reserveTransfer(state.materials, {
          id: `transfer-${state.nextId++}`,
          actor: p.id,
          owner: c.transfer.owner,
          request: c.transfer.request,
          intent: c.transfer.intent,
          sourceLot: c.transfer.sourceLot,
          destination: c.transfer.destination,
          access: {
            sourceReachable: true,
            destinationReachableWithPayload:
              c.transfer.destinationReachableWithPayload,
          },
        }).ok
      )
        continue;
      c.activity.target = state.materials.transfers.at(-1)!.id;
    }
    if (c.brew) {
      const id = c.brew.operation ?? `brew-water-${state.nextId}`;
      const existing = state.operations.find(
        (operation) => operation.id === id,
      );
      if (existing) {
        const rebound = rebindOperationPail(state.materials, {
          id: `vessel-use-${id}-${state.nextId}`,
          operation: existing.id,
          actor: p.id,
          access: {
            sourceReachable: true,
            destinationReachableWithPayload: true,
          },
        });
        if (!rebound.ok) {
          state.workDirty = true;
          continue;
        }
        existing.actor = p.id;
        state.nextId++;
      } else {
        state.operations.push({
          id,
          job: m.task,
          actor: p.id,
          station: c.brew.station,
          spring: c.brew.spring,
          pail: c.brew.pail,
          water: null,
          phase: "acquire",
        });
        const acquired = acquirePailForOperation(state.materials, {
          id: `vessel-use-${id}`,
          operation: id,
          actor: p.id,
          vessel: c.brew.pail,
          access: {
            sourceReachable: true,
            destinationReachableWithPayload: true,
          },
        });
        if (!acquired.ok) {
          state.operations = state.operations.filter(
            (operation) => operation.id !== id,
          );
          state.workDirty = true;
          continue;
        }
        state.nextId++;
      }
      c.activity.target = id;
    }
    if (c.recipe) {
      const admitted = admitBrew(state, {
        id: c.recipe.id,
        job: m.task,
        station: c.recipe.station,
        binding: c.recipe.binding,
      });
      if (!admitted.ok) {
        state.workDirty = true;
        continue;
      }
    }
    p.assignment = { ...m };
    p.task = c.activity;
    beginWalk(p, [...c.path]);
    committedActors.add(p.id);
    committedJobs.add(m.task);
  }
  state.workDirty = offered.some(
    (edge) =>
      !committedActors.has(edge.character) && !committedJobs.has(edge.task),
  );
}
