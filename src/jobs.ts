import { TERRAIN_WORK_TICKS } from "./physical-completion.ts";
import { waterSupplyOptions, type WaterSupply } from "./water-supply.ts";
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
import { sameCell, sourceAccessCells, neighbors } from "./world.js";
import { terrainEditProblem, terrainRimCells } from "./world.js";
import { movement, type RoutePlan, type BodyRoutes } from "./movement.ts";
import { placementFooting } from "./game-space.ts";
import {
  BUILDINGS,
  constructionBuffer,
  removalProblem,
  buildingSupportProblem,
  shelfContainer,
  resolveMaterialEndpoint,
  shelteredBeds,
  workApproach,
} from "./construction.js";
import {
  cacheRepairBuffer,
  resolveCacheRepairBuffer,
  resolveMaterialWithdrawal,
  resolveOpenFiniteSourceContainer,
  sourceIsOpen,
  sourcePailContainer,
} from "./finite-sources.ts";
import {
  availableMaterialFacts,
  containerQuantity,
  remainingContainerQuantity,
  reserveTransfer,
  transferForActor,
  type ContainerSpec,
  type AvailableLotFact,
} from "./materials.ts";
import {
  brewForJob,
  brewKegRemaining,
  brewPrepareRemaining,
  brewProcessId,
  brewStationReadiness,
  recipeOutputReadiness,
  recipeOutputRemaining,
  admitBrew,
  type BrewSupplyRequirement,
} from "./brewing.ts";
import { recipeOutputActionForWire } from "./recipes.ts";
import { CHOP_TICKS } from "./activity.ts";
import { interruptWork } from "./activity-lifecycle.ts";
import { terrainColumn, terrainDigProblem } from "./terrain.ts";
import { HARVEST_TICKS, SOW_TICKS } from "./herbs.ts";
import {
  finiteWorkOwner,
  resolveWaterDelivery,
  waterDeliveryTargetForJob,
} from "./water-delivery.ts";
import {
  consumableCareDefinition,
  consumableCareDefinitionsFor,
} from "./needs.ts";
type Candidate = {
  activity: Activity;
  path: RoutePlan;
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
  water?: {
    target: import("./model.ts").WaterDeliveryTarget;
    quantity: import("./model.ts").PositiveInt;
    supply: WaterSupply;
    pail: string;
    operation?: string;
  };
  consume?: {
    sourceLot: string;
    definition: string;
    material: import("./model.ts").Material;
    quantity: PositiveInt;
  };
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
  path: RoutePlan,
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
  paths: BodyRoutes,
  sourceFacts: readonly AvailableLotFact[],
): Options {
  const t = state.materials.transfers.find(
    (x) => x.owner.kind === "job" && x.owner.job === job.id,
  );
  if (t) return no("Wood is on its way");
  const site = state.sites.find((s) => s.id === job.target);
  if (!site) return no("Waiting for site");
  const support = buildingSupportProblem(state, site);
  if (support) return no(support);
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
        path: RoutePlan;
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
        ? workApproach(state, person, sourceSite, paths)
        : finiteSource
          ? paths.closest(person, finiteSource.accessCells)
          : lot.location.kind === "ground"
            ? paths.route(person, lot.location)
            : null,
      from = a?.edges.at(-1)?.to ?? person,
      b = a && workApproach(state, from, site, paths);
    if (!a || !b) continue;
    const travel = a.ticks + b.ticks;
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
  paths: BodyRoutes,
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
  const path = paths.route(person, lot.lot.location),
    d = workApproach(state, lot.lot.location, site, paths);
  if (!path || !d) return no("No route to this material");
  return {
    reason: `Ready to store ${lot.lot.material}`,
    candidate: {
      ...make(job, "transfer", sourceLot, path, 8, path.ticks + d.ticks),
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
function repairCacheOption(
  state: Clearing,
  person: Actor,
  job: Extract<Job, { kind: "repair-cache" }>,
  paths: BodyRoutes,
  sourceFacts: readonly AvailableLotFact[],
): Options {
  const cache = state.sources.find((source) => source.id === job.target);
  if (!cache || cache.kind !== "reclaimed-timber-cache" || sourceIsOpen(cache))
    return no("The reclaimed cache is already repaired");
  const destination = cacheRepairBuffer(cache)!;
  const delivered = containerQuantity(state.materials, destination.id, "wood");
  if (delivered === 2) {
    const path = paths.closest(person, sourceAccessCells(cache));
    return path
      ? {
          reason: "Ready to repair the cache",
          candidate: make(job, "repair-cache", cache.id, path, 8, path.ticks),
        }
      : no("No route to the cache");
  }
  const remaining = 2 - delivered;
  let selected:
    | {
        lot: AvailableLotFact["lot"];
        quantity: number;
        path: RoutePlan;
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
      ? workApproach(state, person, sourceSite, paths)
      : lot.location.kind === "ground"
        ? paths.route(person, lot.location)
        : null;
    if (!path) continue;
    const toRepair = paths.closest(
      path.edges.at(-1)?.to ?? person,
      sourceAccessCells(cache),
    );
    if (!toRepair) continue;
    const travel = path.ticks + toRepair.ticks;
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
/** Route ranking considers every eligible supply; stock selection never grants reach. */
function waterDeliveryRoute(
  state: Clearing,
  person: Actor,
  paths: BodyRoutes,
  pailFacts: readonly { lot: import("./model.ts").ItemLot }[],
  destination: NonNullable<ReturnType<typeof resolveWaterDelivery>>,
  existing?: import("./model.ts").WaterDeliveryOperation,
) {
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
          ? { edges: [], ticks: 0 }
          : paths.closest(person, access);
      return path ? [{ lot, path }] : [];
    })
    .sort((left, right) => left.path.ticks - right.path.ticks);
  const routes = candidates
    .flatMap((selected) => {
      const pailAt = selected.path.edges.at(-1)?.to ?? person;
      const supplies =
        existing?.execution.phase === "deliver"
          ? [{ supply: existing!.supply, source: null }]
          : waterSupplyOptions(state, selected.lot.id, destination.quantity);
      return supplies.flatMap((supply) => {
        const sourcePath = supply.source
          ? paths.closest(pailAt, supply.source.accessCells)
          : { edges: [], ticks: 0 };
        if (!sourcePath) return [];
        const sourceAt = sourcePath.edges.at(-1)?.to ?? pailAt;
        const deliveryPath = paths.closest(sourceAt, destination.access);
        if (!deliveryPath) return [];
        const travel =
          selected.path.ticks + sourcePath.ticks + deliveryPath.ticks;
        return [{ selected, supply: supply.supply, travel }];
      });
    })
    .sort(
      (a, b) =>
        a.travel - b.travel ||
        a.selected.lot.id.localeCompare(b.selected.lot.id),
    );
  const route = routes[0];
  return route ?? null;
}

function waterDeliveryOption(
  state: Clearing,
  person: Actor,
  job: Extract<Job, { kind: "fill-kettle" | "water-mugwort" | "care" }>,
  paths: BodyRoutes,
  sourceFacts: readonly AvailableLotFact[],
): Options {
  const existing = state.operations.find(
    (operation): operation is import("./model.ts").WaterDeliveryOperation =>
      operation.kind === "water-delivery" && operation.job === job.id,
  );
  const target = existing?.target ?? waterDeliveryTargetForJob(state, job);
  const destination = target && resolveWaterDelivery(state, target);
  if (!destination)
    return no(
      job.kind === "fill-kettle"
        ? "Waiting for a finished brew station"
        : job.kind === "water-mugwort"
          ? "Waiting for planted mugwort"
          : "Waiting for water access",
    );
  if (existing && existing.quantity !== destination.quantity)
    return no("Waiting for the checked water requirement");
  if (
    destination.destination &&
    containerQuantity(state.materials, destination.destination.id, "water") +
      destination.quantity >
      destination.destination.capacity
  )
    return no("The kettle is full");
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
  const route = waterDeliveryRoute(
    state,
    person,
    paths,
    pailFacts,
    destination,
    existing,
  );
  if (!route) return no("Waiting for a reachable pail and enough water");
  const { selected } = route;
  return {
    reason:
      job.kind === "fill-kettle"
        ? "Ready to fill the kettle"
        : job.kind === "water-mugwort"
          ? "Ready to water mugwort"
          : "Ready to drink",
    candidate: {
      ...make(
        job,
        "water-delivery",
        "pending-operation",
        selected.path,
        1,
        route.travel,
      ),
      water: {
        target,
        quantity: existing?.quantity ?? destination.quantity,
        supply: route.supply,
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
  paths: BodyRoutes,
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
        path: RoutePlan;
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
      ? workApproach(state, person, sourceSite, paths)
      : finiteSource
        ? paths.closest(person, finiteSource.accessCells)
        : lot.location.kind === "ground"
          ? paths.route(person, lot.location)
          : null;
    if (!from) continue;
    const to = workApproach(
      state,
      from.edges.at(-1)?.to ?? person,
      station,
      paths,
    );
    if (!to) continue;
    const travel = from.ticks + to.ticks;
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
  paths: BodyRoutes,
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
          const path = workApproach(state, person, station, paths);
          return path
            ? {
                reason:
                  process.phase === "keg"
                    ? "Ready to keg herbal ale"
                    : "Ready to prepare herbal ale",
                candidate: make(
                  job,
                  "brew",
                  process.id,
                  path,
                  process.phase === "keg"
                    ? brewKegRemaining(state, process)
                    : brewPrepareRemaining(state, process),
                  path.ticks,
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
      paths,
      sourceFacts,
      readiness.requirement,
    );
  const path = workApproach(state, person, station, paths);
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
        path.ticks,
      ),
      recipe: {
        id: brewProcessId(job.id),
        station: station.id,
        binding: readiness.binding,
      },
    },
  };
}

function recipeOutputOption(
  state: Clearing,
  person: Actor,
  job: Extract<Job, { kind: "tap" | "clear-spent-grain" }>,
  paths: BodyRoutes,
): Options {
  const station = state.sites.find(
    (site) =>
      site.id === job.target &&
      site.type === "brew-station" &&
      site.finishedAt !== null,
  );
  if (!station) return no("Waiting for a finished brew station");
  const action = recipeOutputActionForWire(job.kind);
  const readiness = recipeOutputReadiness(
    state,
    station,
    action,
    job.transformation,
    job.kind === "tap"
      ? "Waiting for a settled ale serving"
      : "Waiting for spent grain to clear",
  );
  if (readiness.kind === "waiting") return no(readiness.reason);
  const path = workApproach(state, person, station, paths);
  const duration = recipeOutputRemaining(
    state,
    station,
    action,
    job.transformation,
    job.progress,
  );
  return !path || duration === null
    ? no(
        job.kind === "tap"
          ? "Waiting for a settled ale serving"
          : "Waiting for spent grain to clear",
      )
    : {
        reason:
          job.kind === "tap"
            ? "Ready to tap herbal ale"
            : "Ready to clear spent grain",
        candidate: make(
          job,
          job.kind,
          job.transformation,
          path,
          duration,
          path.ticks,
        ),
      };
}
type TerrainRim = { rim: Cell[] };

function terrainRimCandidate(
  state: Clearing,
  job: Extract<Job, { kind: "dig" }>,
  paths: BodyRoutes,
): TerrainRim | Options {
  const target = placementFooting(terrainColumn(job.voxel));
  if (terrainEditProblem(state, target)) return no("Ground is occupied");
  const problem = terrainDigProblem(state.terrain, job.voxel);
  if (problem) return no(problem);
  const rim = terrainRimCells(state, target).filter((cell) =>
    paths.standing(cell),
  );
  return rim.length ? { rim } : no("No safe cardinal rim");
}

function rimWorkOption(
  state: Clearing,
  person: Actor,
  job: Extract<Job, { kind: "dig" }>,
  rim: readonly Cell[],
  paths: BodyRoutes,
): Options {
  const path = paths.closest(person, rim);
  return path
    ? {
        reason: "Ready to dig",
        candidate: make(
          job,
          job.kind,
          job.id,
          path,
          TERRAIN_WORK_TICKS,
          path.ticks,
        ),
      }
    : no("No route to the safe rim");
}

function terrainOption(
  state: Clearing,
  person: Actor,
  job: Extract<Job, { kind: "dig" }>,
  paths: BodyRoutes,
): Options {
  const terrain = terrainRimCandidate(state, job, paths);
  return "reason" in terrain
    ? terrain
    : rimWorkOption(state, person, job, terrain.rim, paths);
}
function consumeOption(
  state: Clearing,
  person: Actor,
  job: Extract<Job, { kind: "care" }>,
  paths: BodyRoutes,
  sourceFacts: readonly AvailableLotFact[],
): Options {
  if (job.need !== "nourishment") return no("Care does not use a ration");
  const existing = state.operations.find(
    (entry) => entry.kind === "consume" && entry.job === job.id,
  );
  if (existing) return no("Waiting for the ration transfer");
  const selected = consumableCareDefinitionsFor(job.need)
    .flatMap((definition, definitionOrder) =>
      sourceFacts
        .filter(
          ({ lot, quantity }) =>
            lot.material === definition.consume.material &&
            quantity >= definition.consume.quantity,
        )
        .flatMap(({ lot }) => {
          const withdrawal =
            lot.location.kind === "container"
              ? resolveMaterialWithdrawal(state, lot.location.container)
              : null;
          const path =
            lot.location.kind === "hand" && lot.location.actor === person.id
              ? { edges: [], ticks: 0 }
              : lot.location.kind === "ground"
                ? paths.route(person, lot.location)
                : withdrawal?.kind === "site"
                  ? workApproach(state, person, withdrawal.site, paths)
                  : withdrawal?.kind === "finite-source"
                    ? paths.closest(person, withdrawal.accessCells)
                    : null;
          return path ? [{ definition, definitionOrder, lot, path }] : [];
        }),
    )
    .sort(
      (left, right) =>
        left.path.ticks - right.path.ticks ||
        left.definitionOrder - right.definitionOrder ||
        left.lot.id.localeCompare(right.lot.id),
    )[0];
  return selected
    ? {
        reason: "Ready to eat",
        candidate: {
          ...make(
            job,
            "consume",
            "pending-operation",
            selected.path,
            selected.definition.attendTicks,
            selected.path.ticks,
          ),
          consume: {
            sourceLot: selected.lot.id,
            definition: selected.definition.id,
            material: selected.definition.consume.material,
            quantity: selected.definition.consume.quantity as PositiveInt,
          },
        },
      }
    : no("Waiting for a ration");
}
function sleepOption(
  state: Clearing,
  person: Actor,
  job: Extract<Job, { kind: "care" }>,
  paths: BodyRoutes,
): Options {
  const occupied = new Set(
    Object.values(state.actors).flatMap((actor) =>
      actor.task?.kind === "sleep" ? [actor.task.target] : [],
    ),
  );
  const selected = shelteredBeds(state)
    .filter(
      (candidate: Clearing["sites"][number]) => !occupied.has(candidate.id),
    )
    .flatMap((bed: Clearing["sites"][number]) => {
      const path = paths.route(person, placementFooting(bed), { bed: bed.id });
      return path ? [{ bed, path }] : [];
    })
    .sort(
      (
        left: { bed: Clearing["sites"][number]; path: RoutePlan },
        right: { bed: Clearing["sites"][number]; path: RoutePlan },
      ) =>
        left.path.ticks - right.path.ticks ||
        left.bed.id.localeCompare(right.bed.id),
    )[0];
  return selected
    ? {
        reason: "Ready to rest",
        candidate: make(
          job,
          "sleep",
          selected.bed.id,
          selected.path,
          80,
          selected.path.ticks,
        ),
      }
    : no("Needs a free bed");
}
function careOption(
  state: Clearing,
  person: Actor,
  job: Extract<Job, { kind: "care" }>,
  paths: BodyRoutes,
  sourceFacts: readonly AvailableLotFact[],
): Options {
  const values = person.needs;
  const active = state.operations.find((operation) => operation.job === job.id);
  if (active) {
    return active.kind === "water-delivery"
      ? waterDeliveryOption(
          state,
          person,
          { ...job, need: "hydration" },
          paths,
          sourceFacts,
        )
      : consumeOption(
          state,
          person,
          { ...job, need: "nourishment" },
          paths,
          sourceFacts,
        );
  }
  const choices =
    job.policy === "automatic"
      ? (["hydration", "nourishment", "rest"] as const)
          .filter((need) => values[need] <= 35)
          .sort((left, right) => values[left] - values[right])
      : [];
  const attempted = choices.length ? choices : [job.need];
  let waiting = "Care is unavailable";
  for (const need of attempted) {
    const candidate =
      need === "hydration"
        ? waterDeliveryOption(
            state,
            person,
            { ...job, need },
            paths,
            sourceFacts,
          )
        : need === "nourishment"
          ? consumeOption(state, person, { ...job, need }, paths, sourceFacts)
          : sleepOption(state, person, { ...job, need }, paths);
    if (candidate.candidate) {
      job.need = need;
      return candidate;
    }
    waiting = candidate.reason;
  }
  return no(waiting);
}
function option(
  state: Clearing,
  p: Actor,
  j: Job,
  b: BodyRoutes,
  sourceFacts: readonly AvailableLotFact[],
): Options {
  if (j.kind === "repair-cache")
    return repairCacheOption(state, p, j, b, sourceFacts);
  if (j.kind === "care") return careOption(state, p, j, b, sourceFacts);
  if (j.kind === "fill-kettle" || j.kind === "water-mugwort")
    return waterDeliveryOption(state, p, j, b, sourceFacts);
  if (j.kind === "brew") return brewOption(state, p, j, b, sourceFacts);
  if (j.kind === "tap" || j.kind === "clear-spent-grain")
    return recipeOutputOption(state, p, j, b);
  if (j.kind === "dig") return terrainOption(state, p, j, b);
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
              path.ticks,
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
    const path = b.closest(p, neighbors(x));
    return path
      ? {
          reason: "Ready to chop",
          candidate: make(
            j,
            "chop",
            x.id,
            path,
            CHOP_TICKS - x.work,
            path.ticks,
          ),
        }
      : no("No route to this tree");
  }
  if (j.kind === "sow" || j.kind === "harvest") {
    const x = state.herbs.find((x) => x.id === j.target);
    const path = x && b.closest(p, neighbors(x));
    return x && path
      ? {
          reason: "Ready",
          candidate: make(
            j,
            j.kind,
            x.id,
            path,
            (j.kind === "sow" ? SOW_TICKS : HARVEST_TICKS) - x.work,
            path.ticks,
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
            path.ticks,
          ),
        }
      : no("Waiting to deconstruct");
  }
  const unsupported: never = j;
  throw new Error(`Unsupported job: ${JSON.stringify(unsupported)}`);
}
function automatic(a: Activity): WorkType | null {
  return a.kind === "transfer"
    ? "haul"
    : a.kind === "consume"
      ? null
      : a.kind === "repair-cache"
        ? "build"
        : a.kind === "water-delivery"
          ? "haul"
          : a.kind === "brew"
            ? "craft"
            : a.kind === "tap" || a.kind === "clear-spent-grain"
              ? "craft"
              : a.kind === "build" ||
                  a.kind === "deconstruct" ||
                  a.kind === "dig"
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
  const navigation = movement(state),
    members = new Set(Object.values(state.parties).flatMap((p) => p.members)),
    idle = Object.values(state.actors).filter(
      (p) =>
        p.mode === "idle" &&
        p.workDisposition === "continue" &&
        !p.traversal &&
        !p.drafted &&
        (members.has(p.id) ||
          state.jobs.some((job) => job.kind === "care" && job.target === p.id)),
    ),
    offered: Assignment[] = [],
    choices = new Map<string, Candidate>(),
    sourceFacts = availableMaterialFacts(state.materials);
  const offer = (p: Actor, j: Job, personal = false): boolean => {
    if (j.lifecycle === "canceling") return false;
    if (
      state.materials.transfers.some(
        (t) => t.owner.kind === "job" && t.owner.job === j.id,
      ) ||
      Object.values(state.actors).some((a) => a.task?.job === j.id)
    )
      return false;
    const paths = navigation.forBody(p);
    const o = option(state, p, j, paths, sourceFacts);
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
    const paths = navigation.forBody(p);
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
        ? workApproach(state, p, site, paths)
        : repair
          ? paths.closest(p, sourceAccessCells(repair.source))
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
          path.ticks,
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
    const care = state.jobs.filter(
      (j): j is Extract<Job, { kind: "care" }> =>
        j.kind === "care" && j.target === p.id,
    );
    if (care.some((j) => offer(p, j, true))) continue;
    if (!members.has(p.id)) continue;
    const personal = state.jobs.filter(
      (j): j is Exclude<Job, { kind: "care" }> =>
        j.kind !== "care" &&
        inScope(state, p, j.scope) &&
        j.scope.actors?.includes(p.id) === true,
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
    if (job.kind === "care" || job.scope.actors !== null) continue;
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
    if (
      c.activity.kind === "sleep" &&
      Object.values(state.actors).some(
        (actor) =>
          actor.task?.kind === "sleep" &&
          actor.task.target === c.activity.target,
      )
    ) {
      state.workDirty = true;
      continue;
    }
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
    if (c.water) {
      const id = c.water.operation ?? `water-delivery-${state.nextId}`;
      const existing = state.operations.find(
        (operation): operation is import("./model.ts").WaterDeliveryOperation =>
          operation.kind === "water-delivery" && operation.id === id,
      );
      if (existing) {
        const rebound = finiteWorkOwner.attach(
          state.operations,
          state.materials,
          {
            id: `vessel-use-${id}-${state.nextId}`,
            operation: existing.id,
            actor: p.id,
            access: {
              sourceReachable: true,
              destinationReachableWithPayload: true,
            },
          },
        );
        if (!rebound.ok) {
          state.workDirty = true;
          continue;
        }
        if (existing.execution.phase !== "deliver")
          existing.supply = c.water.supply;
        state.nextId++;
      } else {
        const record: import("./model.ts").WaterDeliveryOperation = {
          kind: "water-delivery",
          id,
          job: m.task,
          target: c.water.target,
          quantity: c.water.quantity,
          supply: c.water.supply,
          pail: c.water.pail,
          execution: { phase: "acquire" },
        };
        const acquired = finiteWorkOwner.admit(
          state.operations,
          state.materials,
          record,
          {
            kind: "vessel",
            request: {
              id: `vessel-use-${id}`,
              operation: id,
              actor: p.id,
              vessel: c.water.pail,
              access: {
                sourceReachable: true,
                destinationReachableWithPayload: true,
              },
            },
          },
        );
        if (!acquired.ok) {
          state.workDirty = true;
          continue;
        }
        state.nextId++;
      }
      c.activity.target = id;
    }
    if (c.consume) {
      const id = `consume-${state.nextId}`;
      const definition = consumableCareDefinition(c.consume.definition);
      if (
        !definition ||
        definition.consume.kind !== "held-lot" ||
        definition.consume.material !== c.consume.material ||
        definition.consume.quantity !== c.consume.quantity
      ) {
        state.workDirty = true;
        continue;
      }
      const acquired = finiteWorkOwner.admit(
        state.operations,
        state.materials,
        {
          kind: "consume",
          id,
          job: m.task,
          actor: p.id,
          definition: definition.id,
          execution: { phase: "acquire" },
        },
        {
          kind: "portion",
          request: {
            id: `consume-use-${id}`,
            operation: id,
            actor: p.id,
            lot: c.consume.sourceLot,
            material: c.consume.material,
            quantity: c.consume.quantity,
            access: {
              sourceReachable: true,
              destinationReachableWithPayload: true,
            },
          },
        },
      );
      if (!acquired.ok) {
        state.workDirty = true;
        continue;
      }
      state.nextId++;
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
    if (!navigation.start(p, c.path)) {
      interruptWork(state, p);
      continue;
    }
    committedActors.add(p.id);
    committedJobs.add(m.task);
  }
  state.workDirty = offered.some(
    (edge) =>
      !committedActors.has(edge.character) && !committedJobs.has(edge.task),
  );
}
