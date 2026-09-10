import { physicalOccupancyProblem } from "./navigation-space.ts";
import { placementFooting } from "./game-space.ts";
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
function cell(at: Actor) {
  return { x: at.x, y: at.y, z: at.z };
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

type WorkTarget = {
  required: number;
  progress: number;
} & (
  | { kind: "dig"; job: Extract<PhysicalJob, { kind: "dig" }> }
  | { kind: "build"; job: Extract<PhysicalJob, { kind: "build" }>; site: Site }
  | {
      kind: "deconstruct";
      job: Extract<PhysicalJob, { kind: "deconstruct" }>;
      site: Site;
    }
);

/** Resolve the target-owned duration/progress and structure identity together. */
function resolveTarget(
  state: Clearing,
  actor: Actor,
  job: PhysicalJob,
): WorkTarget | Refusal {
  if (job.kind === "dig")
    return {
      kind: "dig",
      job,
      required: TERRAIN_WORK_TICKS,
      progress: actor.work,
    };
  const site = state.sites.find((site) => site.id === job.target);
  if (!site) return invalid("The structure no longer exists.");
  if (job.kind === "build") {
    if (site.finishedAt !== null)
      return invalid("The structure is already finished.");
    return {
      kind: "build",
      job,
      site,
      required: BUILDINGS[site.type].ticks,
      progress: site.work,
    };
  }
  const problem = deconstructionTargetProblem(state, job.target, job.id);
  if (problem) return invalid(problem);
  return {
    kind: "deconstruct",
    job,
    site,
    required: BUILDINGS[site.type].deconstructTicks,
    progress: actor.work,
  };
}

/** Current reach/occupancy is a settlement precondition, never saved permission. */
function accessProblem(
  state: Clearing,
  actor: Actor,
  target: WorkTarget,
): Refusal | null {
  if (target.kind === "dig") {
    const problem = terrainDigProblem(state.terrain, target.job.voxel);
    if (problem) return invalid(problem);
    const at = placementFooting(terrainColumn(target.job.voxel));
    const blocked = terrainEditProblem(state, at);
    if (blocked) return waiting(blocked);
    if (!terrainRimCells(state, at).some((rim) => sameCell(actor, rim)))
      return waiting("Waiting for safe excavation access.");
  } else {
    if (!workPosition(state, actor, target.site, target.kind))
      return waiting("Waiting for construction access.");
    if (target.kind === "deconstruct") {
      const problem = removalProblem(state, target.site, actor);
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

type ReadyWork = { status: "ready"; actor: Actor; target: WorkTarget };
type GeometryEdit = {
  status: "prepared";
  terrain: Clearing["terrain"];
  sites: Site[];
  finishedSite: { original: Site; finished: Site } | null;
  retired: Set<string>;
  notice: string;
};
type PreparedEdit = GeometryEdit & {
  work: ReadyWork;
  materials: Clearing["materials"];
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
  const target = resolveTarget(state, actor, job);
  if ("status" in target) return target;
  const { required, progress } = target;
  if (!Number.isSafeInteger(progress) || progress < 0 || progress >= required)
    throw new Error("invalid-physical-work-progress");
  if (progress !== required - 1)
    return invalid("Physical work is not ready to settle.");
  const access = accessProblem(state, actor, target);
  if (access) return access;
  if (!Number.isSafeInteger(state.finishedJobs + 1))
    throw new Error("invalid-finished-job-counter");
  return { status: "ready", actor, target };
}

/** Excavated field stock and its one ordinary soil lot are prepared together. */
function prepareExcavation(
  state: Clearing,
  materials: Clearing["materials"],
  actor: Actor,
  target: Extract<WorkTarget, { kind: "dig" }>,
): GeometryEdit | Refusal {
  const terrain = excavateTerrain(state.terrain, target.job.voxel);
  const result = createGroundLot(materials, "soil", 1, cell(actor));
  if (!result.ok) return materialRefusal(result.reason);
  return {
    status: "prepared",
    terrain,
    sites: state.sites,
    finishedSite: null,
    retired: new Set(),
    notice: "Soil is piled beside the hole.",
  };
}

/** Embedding and the completed site must become visible in the same publication. */
function prepareConstruction(
  state: Clearing,
  materials: Clearing["materials"],
  target: Extract<WorkTarget, { kind: "build" }>,
): GeometryEdit | Refusal {
  const { site, required } = target;
  const result = embedConstruction(
    materials,
    constructionBuffer(site),
    "wood",
    BUILDINGS[site.type].wood,
  );
  if (!result.ok) return materialRefusal(result.reason);
  const finished = { ...site, work: required, finishedAt: state.tick };
  return {
    status: "prepared",
    terrain: state.terrain,
    sites: state.sites.map((current) =>
      current === site ? finished : current,
    ),
    finishedSite: { original: site, finished },
    retired: new Set(),
    notice: `${BUILDINGS[site.type].label} finished.`,
  };
}

/** Ejection determines exact affected transfer owners; no live task is retired yet. */
function prepareShelfRelease(
  state: Clearing,
  materials: Clearing["materials"],
  site: Site,
): Set<string> | Refusal {
  const destination = shelfContainer(site.id);
  const released = releaseContainer(materials, destination, {
    contentsDrop: { cell: placementFooting(site), legal: true },
    carriedDrops: Object.fromEntries(
      Object.values(state.actors).map((actor) => [
        actor.id,
        { cell: cell(actor), legal: true },
      ]),
    ),
  });
  if (!released.ok) return materialRefusal(released.reason);
  const retired = new Set<string>();
  for (const owner of released.value.owners)
    if (owner.kind === "job") retired.add(owner.job);
  for (const pending of state.jobs)
    if (pending.kind === "store" && pending.destination === destination.id)
      retired.add(pending.id);
  return retired;
}

/** Shelf release and salvage share the branch, including late allocation failure. */
function prepareRemoval(
  state: Clearing,
  materials: Clearing["materials"],
  target: Extract<WorkTarget, { kind: "deconstruct" }>,
): GeometryEdit | Refusal {
  const { site } = target;
  const retired =
    site.type === "shelf"
      ? prepareShelfRelease(state, materials, site)
      : new Set<string>();
  if (!(retired instanceof Set)) return retired;
  const result = salvageConstruction(
    materials,
    constructionBuffer(site),
    BUILDINGS[site.type].salvageWood,
    { cell: placementFooting(site), legal: true },
  );
  if (!result.ok) return materialRefusal(result.reason);
  return {
    status: "prepared",
    terrain: state.terrain,
    sites: state.sites.filter((current) => current !== site),
    finishedSite: null,
    retired,
    notice: state.notice,
  };
}

/** One material branch, one exhaustive physical operation, then joined validation. */
function prepareEdit(state: Clearing, work: ReadyWork): PreparedEdit | Refusal {
  const materials = structuredClone(state.materials);
  const { target, actor } = work;
  let edit: GeometryEdit | Refusal;
  switch (target.kind) {
    case "dig":
      edit = prepareExcavation(state, materials, actor, target);
      break;
    case "build":
      edit = prepareConstruction(state, materials, target);
      break;
    case "deconstruct":
      edit = prepareRemoval(state, materials, target);
      break;
  }
  if (edit.status !== "prepared") return edit;
  const retired = edit.retired;
  if (
    Object.values(state.actors).some(
      (actor) =>
        actor.task &&
        retired.has(actor.task.job) &&
        actor.traversal &&
        actor.traversal.elapsed > 0,
    )
  )
    return waiting(
      "Waiting for carried goods to reach safe ground before removing their destination.",
    );
  const candidate = {
    ...state,
    materials,
    terrain: edit.terrain,
    sites: edit.sites,
  };
  const bodyProblem = physicalOccupancyProblem(candidate);
  if (bodyProblem) return waiting(bodyProblem);
  validateCandidate(candidate);
  return { ...edit, work, materials };
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
    work: { actor, target },
  } = prepared;
  Object.assign(state.materials, materials);
  state.terrain = terrain;
  if (finishedSite) Object.assign(finishedSite.original, finishedSite.finished);
  else state.sites = sites;
  for (const current of Object.values(state.actors))
    if (current.task && retired.has(current.task.job))
      finishActivity(state, current);
  state.jobs = state.jobs.filter((pending) => !retired.has(pending.id));
  state.notice = prepared.notice;
  finishJob(state, actor, target.job.id);
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
