import type { Actor, Clearing, Job, Site } from "./model.ts";
import { finishActivity, finishJob } from "./activity-lifecycle.ts";
import {
  BUILDINGS,
  constructionBuffer,
  removalProblem,
  shelfContainer,
  workPosition,
} from "./construction.js";
import {
  createGroundLot,
  embedConstruction,
  releaseContainer,
  salvageConstruction,
  validateMaterialState,
  type MaterialFailure,
} from "./materials.ts";
import { materialContainerFacts } from "./material-container-facts.ts";
import {
  terrainColumn,
  terrainDigProblem,
  excavateTerrain,
} from "./terrain.ts";
import { sameCell, terrainEditProblem, terrainRimCells } from "./world.js";
import { waterConservationProblem } from "./field-water.ts";
import { waterSupplyProblem } from "./water-supply.ts";

export const TERRAIN_WORK_TICKS = 40;
type Refusal = { status: "waiting" | "invalid"; reason: string };
type Result = { status: "completed" } | Refusal;
const waiting = (reason: string): Refusal => ({ status: "waiting", reason });
const invalid = (reason: string): Refusal => ({ status: "invalid", reason });

/** Target identity only: transient occupancy is checked when work settles. */
export function deconstructionTargetProblem(
  state: Pick<Clearing, "sites" | "jobs">,
  target: string,
  ownJob?: string,
): string {
  const site = state.sites.find((site) => site.id === target);
  if (!site || site.finishedAt === null)
    return "Choose a live finished structure.";
  return state.jobs.some(
    (job) =>
      job.kind === "deconstruct" && job.target === target && job.id !== ownJob,
  )
    ? "That structure is already marked for removal."
    : "";
}

function materialRefusal(reason: MaterialFailure): Refusal {
  if (
    reason === "container-incomplete" ||
    reason === "container-has-incoming" ||
    reason === "owner-busy"
  )
    return waiting("Waiting for materials to be ready.");
  // Invalid allocator/numeric results are fatal, including exhaustion: the
  // material owner does not currently distinguish those cases in its result.
  throw new Error(`physical material invariant: ${reason}`);
}
function cell(at: Actor | Site) {
  return { x: at.x, z: at.z, level: at.level };
}

type PhysicalJob = Extract<Job, { kind: "dig" | "build" | "deconstruct" }>;
function resolveWork(
  state: Clearing,
  actorId: string,
  jobId: string,
): { actor: Actor; job: PhysicalJob } | null {
  const actor = state.actors[actorId];
  const job = state.jobs.find(
    (job): job is PhysicalJob =>
      job.id === jobId &&
      (job.kind === "dig" ||
        job.kind === "build" ||
        job.kind === "deconstruct"),
  );
  if (
    !actor ||
    !job ||
    actor.drafted ||
    actor.mode !== job.kind ||
    actor.task?.job !== job.id ||
    actor.task.kind !== job.kind ||
    actor.assignment?.task !== job.id ||
    actor.assignment.character !== actor.id
  )
    return null;
  if (actor.task.target !== (job.kind === "dig" ? job.id : job.target))
    return null;
  return { actor, job };
}

/** Current reach/occupancy is a settlement precondition, never saved permission. */
function accessProblem(
  state: Clearing,
  actor: Actor,
  job: PhysicalJob,
  site: Site | null,
): Refusal | null {
  if (job.kind === "dig") {
    const problem = terrainDigProblem(state.terrain, job.voxel);
    if (problem) return invalid(problem);
    const at = terrainColumn(job.voxel);
    const blocked = terrainEditProblem(state, at);
    if (blocked) return waiting(blocked);
    if (!terrainRimCells(state, at).some((rim) => sameCell(actor, rim)))
      return waiting("Waiting for safe excavation access.");
  } else {
    if (!workPosition(state, actor, site, job.kind))
      return waiting("Waiting for construction access.");
    if (job.kind === "deconstruct") {
      const problem = removalProblem(state, site, actor);
      if (problem) return waiting(problem);
    }
  }
  return null;
}

/** Validate the joined candidate without parsing/cloning the whole Clearing. */
function validateCandidate(prospective: Clearing): void {
  validateMaterialState(
    prospective.materials,
    materialContainerFacts(prospective),
  );
  const waterProblem = waterConservationProblem(prospective);
  if (waterProblem) throw new Error(waterProblem);
  for (const operation of prospective.operations)
    if (
      operation.kind === "water-delivery" &&
      operation.execution.phase !== "deliver"
    ) {
      const problem = waterSupplyProblem(
        prospective,
        operation.pail,
        operation.quantity,
        operation.supply,
      );
      if (problem) throw new Error(problem);
    }
}

type ReadyWork = {
  status: "ready";
  actor: Actor;
  job: PhysicalJob;
  site: Site | null;
  required: number;
};
type PreparedEdit = {
  status: "prepared";
  work: ReadyWork;
  materials: Clearing["materials"];
  terrain: Clearing["terrain"];
  sites: Site[];
  finishedSite: Site | null;
  retired: Set<string>;
  notice: string;
};

/** Resolve live work and every precondition before allocating a material branch. */
function readyWork(
  state: Clearing,
  input: { actorId: string; jobId: string },
): ReadyWork | Refusal {
  if (state.paused) return waiting("Work is paused.");
  const resolved = resolveWork(state, input.actorId, input.jobId);
  if (!resolved) return invalid("Physical work no longer matches its worker.");
  const { actor, job } = resolved;
  const site =
    job.kind === "dig"
      ? null
      : state.sites.find((site) => site.id === job.target);
  if (job.kind !== "dig" && !site)
    return invalid("The structure no longer exists.");
  if (job.kind === "deconstruct") {
    const problem = deconstructionTargetProblem(state, job.target, job.id);
    if (problem) return invalid(problem);
  }
  if (job.kind === "build" && site!.finishedAt !== null)
    return invalid("The structure is already finished.");
  const required =
    job.kind === "dig"
      ? TERRAIN_WORK_TICKS
      : job.kind === "build"
        ? BUILDINGS[site!.type].ticks
        : BUILDINGS[site!.type].deconstructTicks;
  const progress = job.kind === "build" ? site!.work : actor.work;
  if (!Number.isSafeInteger(progress) || progress < 0 || progress >= required)
    throw new Error("invalid-physical-work-progress");
  if (progress !== required - 1)
    return invalid("Physical work is not ready to settle.");
  const access = accessProblem(state, actor, job, site ?? null);
  if (access) return access;
  if (!Number.isSafeInteger(state.finishedJobs + 1))
    throw new Error("invalid-finished-job-counter");
  return { status: "ready", actor, job, site: site ?? null, required };
}

/** All owner operations and joined validation finish on this detached branch.
 * A refusal or exception leaves both physical facts and work handles untouched. */
function prepareEdit(state: Clearing, work: ReadyWork): PreparedEdit | Refusal {
  const { actor, job, site, required } = work;
  const materials = structuredClone(state.materials);
  let terrain = state.terrain;
  let sites = state.sites;
  let finishedSite: Site | null = null;
  const retired = new Set<string>();
  if (job.kind === "dig") {
    terrain = excavateTerrain(state.terrain, job.voxel);
    const result = createGroundLot(materials, "soil", 1, cell(actor));
    if (!result.ok) return materialRefusal(result.reason);
  } else if (job.kind === "build") {
    const result = embedConstruction(
      materials,
      constructionBuffer(site),
      "wood",
      BUILDINGS[site!.type].wood,
    );
    if (!result.ok) return materialRefusal(result.reason);
    finishedSite = { ...site!, work: required, finishedAt: state.tick };
    sites = state.sites.map((current) =>
      current === site ? finishedSite! : current,
    );
  } else {
    if (site!.type === "shelf") {
      const destination = shelfContainer(site!.id);
      const released = releaseContainer(materials, destination, {
        contentsDrop: { cell: cell(site!), legal: true },
        carriedDrops: Object.fromEntries(
          Object.values(state.actors).map((current) => [
            current.id,
            { cell: cell(current), legal: true },
          ]),
        ),
      });
      if (!released.ok) return materialRefusal(released.reason);
      for (const owner of released.value.owners)
        if (owner.kind === "job") retired.add(owner.job);
      for (const pending of state.jobs)
        if (pending.kind === "store" && pending.destination === destination.id)
          retired.add(pending.id);
    }
    const result = salvageConstruction(
      materials,
      constructionBuffer(site),
      BUILDINGS[site!.type].salvageWood,
      { cell: cell(site!), legal: true },
    );
    if (!result.ok) return materialRefusal(result.reason);
    sites = state.sites.filter((current) => current !== site);
  }
  validateCandidate({ ...state, materials, terrain, sites });
  const notice =
    job.kind === "dig"
      ? "Soil is piled beside the hole."
      : job.kind === "build"
        ? `${BUILDINGS[site!.type].label} finished.`
        : state.notice;
  return {
    status: "prepared",
    work,
    materials,
    terrain,
    sites,
    finishedSite,
    retired,
    notice,
  };
}

/** No owner calls or validation remain: publish facts and retire exact work.
 * Retain the handles used by the current actor iteration and callbacks. */
function publishEdit(state: Clearing, prepared: PreparedEdit): void {
  const {
    materials,
    terrain,
    sites,
    finishedSite,
    retired,
    work: { actor, job, site },
  } = prepared;
  Object.assign(state.materials, materials);
  state.terrain = terrain;
  if (finishedSite) Object.assign(site!, finishedSite);
  else state.sites = sites;
  for (const current of Object.values(state.actors))
    if (current.task && retired.has(current.task.job))
      finishActivity(state, current);
  state.jobs = state.jobs.filter((pending) => !retired.has(pending.id));
  state.notice = prepared.notice;
  finishJob(state, actor, job.id);
}

/** The only completion entry: checked live work → detached preparation → publication. */
export function settlePhysicalEdit(
  state: Clearing,
  input: { actorId: string; jobId: string },
): Result {
  const work = readyWork(state, input);
  if (work.status !== "ready") return work;
  const prepared = prepareEdit(state, work);
  if (prepared.status !== "prepared") return prepared;
  publishEdit(state, prepared);
  return { status: "completed" };
}
