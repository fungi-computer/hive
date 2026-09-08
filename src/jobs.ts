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
import { blockedCells } from "./world.js";
import { approach, pathTicks, route, beginWalk } from "./movement.js";
import {
  BUILDINGS,
  constructionBuffer,
  removalProblem,
  roofSupported,
  shelfContainer,
  resolveMaterialEndpoint,
  shelteredBeds,
  workApproach,
} from "./construction.js";
import {
  availableMaterialFacts,
  containerQuantity,
  remainingContainerQuantity,
  reserveTransfer,
  transferForActor,
  type ContainerSpec,
  type AvailableLotFact,
} from "./materials.ts";
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
        !!resolveMaterialEndpoint(
          state.sites,
          lot.location.container,
          "withdraw",
        ),
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
    const quantity = Math.min(2, remaining, part.quantity);
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
    const a = sourceSite
        ? workApproach(state, person, sourceSite, blocked)
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
function option(
  state: Clearing,
  p: Actor,
  j: Job,
  b: Set<string>,
  sourceFacts: readonly AvailableLotFact[],
): Options {
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
      const path = site && workApproach(state, p, site, blocked);
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
