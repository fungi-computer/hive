import type {
  Activity,
  Actor,
  Assignment,
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
  shelteredBeds,
  workApproach,
} from "./construction.js";
import {
  availablePortions,
  containerQuantity,
  reserveTransfer,
  transferForActor,
  type ContainerSpec,
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
    owner: { job: string; step: string };
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
function transferOption(
  state: Clearing,
  person: Actor,
  job: Job,
  blocked: Set<string>,
): Options {
  const t = state.materials.transfers.find((x) => x.owner.job === job.id);
  if (t)
    return no(
      job.kind === "build" ? "Wood is on its way" : "Mugwort is on its way",
    );
  if (job.kind === "build") {
    const site = state.sites.find((s) => s.id === job.target);
    if (!site) return no("Waiting for site");
    if (site.type === "roof" && !roofSupported(state, site))
      return no("Waiting for enclosing walls and a doorway");
    const destination = constructionBuffer(site);
    const have = containerQuantity(state.materials, destination.id, "wood");
    if (have === destination.capacity) return no("Ready to build");
    const remaining = destination.capacity - have;
    const choices = availablePortions(state.materials, {
      kind: "eligible-ground",
      material: "wood",
    });
    let selected:
      | {
          sourceLot: string;
          path: Cell[];
          travel: number;
          request: TransferRequest;
        }
      | undefined;
    for (const part of choices) {
      const quantity = Math.min(2, remaining, part.quantity);
      if (quantity < 1) continue;
      const lot = state.materials.lots.find((l) => l.id === part.lot);
      if (!lot || lot.location.kind !== "ground") continue;
      const a = route(person, lot.location, blocked, state),
        b = workApproach(state, lot.location, site, blocked);
      if (!a || !b) continue;
      const travel = pathTicks(person, a) + pathTicks(lot.location, b);
      if (selected === undefined || travel < selected.travel)
        selected = {
          sourceLot: part.lot,
          path: a,
          travel,
          request: {
            source: { kind: "eligible-ground", material: "wood" },
            quantityPolicy: "portion",
            quantity: quantity as PositiveInt,
            destination: destination.id,
          },
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
          owner: { job: job.id, step: "construction-materials" },
        },
      },
    };
  }
  if (job.kind === "transfer") {
    const sourceLot = job.source;
    const destination = shelfContainer(job.destination.slice("shelf:".length));
    const lot = state.materials.lots.find((l) => l.id === sourceLot);
    if (!lot || lot.location.kind !== "ground" || lot.quantity !== 1)
      return no("Waiting for mugwort or shelf");
    const request: TransferRequest = {
      source: { kind: "exact-lot", lot: sourceLot },
      quantityPolicy: "whole-lot",
      quantity: lot.quantity,
      destination: destination.id,
    };
    const site = state.sites.find((s) => destination.id === `shelf:${s.id}`);
    if (!site) return no("Waiting for mugwort or shelf");
    const path = route(person, lot.location, blocked, state),
      d = workApproach(state, lot.location, site, blocked);
    if (!path || !d) return no("No route to this mugwort");
    return {
      reason: "Ready to store mugwort",
      candidate: {
        ...make(
          job,
          "transfer",
          sourceLot,
          path,
          8,
          pathTicks(person, path) + pathTicks(lot.location, d),
        ),
        transfer: {
          sourceLot,
          destination,
          request,
          owner: { job: job.id, step: "shelf-store" },
        },
      },
    };
  }
  return no("");
}
function option(state: Clearing, p: Actor, j: Job, b: Set<string>): Options {
  if (j.kind === "build") {
    const site = state.sites.find((x) => x.id === j.target)!;
    const c = constructionBuffer(site);
    if (containerQuantity(state.materials, c.id, "wood") === c.capacity) {
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
    return transferOption(state, p, j, b);
  }
  if (j.kind === "transfer") return transferOption(state, p, j, b);
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
    choices = new Map<string, Candidate>();
  for (const p of idle) {
    const carry = transferForActor(state.materials, p.id);
    if (carry?.phase.kind === "carrying") {
      const site = state.sites.find(
        (s) =>
          carry.request.destination === `construction-buffer:${s.id}` ||
          carry.request.destination === `shelf:${s.id}`,
      );
      const path = site && workApproach(state, p, site, blocked);
      if (path) {
        const c = make(
          state.jobs.find((j) => j.id === carry.owner.job)!,
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
    for (const j of state.jobs) {
      if (
        !inScope(state, p, j.scope) ||
        state.materials.transfers.some((t) => t.owner.job === j.id) ||
        Object.values(state.actors).some((a) => a.task?.job === j.id)
      )
        continue;
      const o = option(state, p, j, blocked);
      j.reason = o.reason;
      if (
        !o.candidate ||
        (automatic(o.candidate.activity) &&
          !p.allowedWork[automatic(o.candidate.activity)!])
      )
        continue;
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
      break;
    }
  }
  for (const m of optimizeEligible(colony, offered).sort((a, b) =>
    a.character.localeCompare(b.character),
  )) {
    const p = state.actors[m.character],
      c = choices.get(`${m.character}/${m.task}`);
    if (!c) continue;
    if (c.transfer) {
      const site = state.sites.find(
        (s) =>
          c.transfer!.destination.id === `construction-buffer:${s.id}` ||
          c.transfer!.destination.id === `shelf:${s.id}`,
      )!;
      const delivered = workApproach(
        state,
        state.materials.lots.find((l) => l.id === c.transfer!.sourceLot)!
          .location,
        site,
        blocked,
      )!;
      if (
        !reserveTransfer(state.materials, {
          id: `transfer-${state.nextId++}`,
          actor: p.id,
          owner: c.transfer.owner,
          request: c.transfer.request,
          sourceLot: c.transfer.sourceLot,
          destination: c.transfer.destination,
          access: {
            sourceReachable: true,
            destinationReachableWithPayload: !!delivered,
          },
        }).ok
      )
        continue;
      c.activity.target = state.materials.transfers.at(-1)!.id;
    }
    p.assignment = { ...m };
    p.task = c.activity;
    beginWalk(p, c.path);
  }
}
