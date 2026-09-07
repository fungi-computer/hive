import { openDB } from "idb";
import { z } from "zod";
import type { Clearing } from "./model.ts";
import { inside, placementOccupant } from "./world.js";
import { CHOP_TICKS } from "./activity.ts";
import { BUILDINGS } from "./construction.js";
import { HARVEST_TICKS, SOW_TICKS, mugwortStage } from "./herbs.ts";

const SAVE_KIND = "hive-local-world" as const;
const SAVE_SCHEMA = 4 as const;
const SAVE_SCHEMA_V1 = 1 as const;
const SAVE_SCHEMA_V2 = 2 as const;
const SAVE_SCHEMA_V3 = 3 as const;
const SAVE_DB_NAME = "hive-local-world";
const SAVE_STORE = "world";
const SAVE_KEY = "current";

const finite = z.number().finite();
const integer = finite.int();
const nonNegative = integer.min(0);
const positive = integer.min(1);
const id = z.string().min(1);
const cellSchema = z
  .object({ x: integer, z: integer, level: integer })
  .strict();
const allowedWorkSchemaV3 = z
  .object({ chop: z.boolean(), haul: z.boolean(), build: z.boolean() })
  .strict();
const allowedWorkSchema = allowedWorkSchemaV3
  .extend({ garden: z.boolean() })
  .strict();
const scopeSchema = z
  .object({ party: id, actors: z.array(id).min(1).nullable() })
  .strict();

const activityBase = {
  job: id,
  target: id,
  duration: positive,
};
const chopActivitySchema = z
  .object({ ...activityBase, kind: z.literal("chop") })
  .strict();
const buildActivitySchema = z
  .object({ ...activityBase, kind: z.literal("build") })
  .strict();
const pickupActivitySchema = z
  .object({ ...activityBase, kind: z.literal("pickup") })
  .strict();
const deliverActivitySchema = z
  .object({ ...activityBase, kind: z.literal("deliver") })
  .strict();
const sleepActivitySchema = z
  .object({ ...activityBase, kind: z.literal("sleep") })
  .strict();
const deconstructActivitySchema = z
  .object({ ...activityBase, kind: z.literal("deconstruct") })
  .strict();
const activitySchemaV1 = z.discriminatedUnion("kind", [
  chopActivitySchema,
  buildActivitySchema,
  pickupActivitySchema,
  deliverActivitySchema,
  sleepActivitySchema,
]);
const activitySchemaV2 = z.discriminatedUnion("kind", [
  chopActivitySchema,
  buildActivitySchema,
  pickupActivitySchema,
  deliverActivitySchema,
  sleepActivitySchema,
  deconstructActivitySchema,
]);
const sowActivitySchema = z
  .object({ ...activityBase, kind: z.literal("sow") })
  .strict();
const harvestActivitySchema = z
  .object({ ...activityBase, kind: z.literal("harvest") })
  .strict();
const activitySchema = z.discriminatedUnion("kind", [
  chopActivitySchema,
  buildActivitySchema,
  pickupActivitySchema,
  deliverActivitySchema,
  sleepActivitySchema,
  deconstructActivitySchema,
  sowActivitySchema,
  harvestActivitySchema,
]);

const assignmentSchema = z
  .object({ character: id, task: id, cost: finite })
  .strict();
const cargoSchema = z
  .object({ job: id, site: id, amount: positive.max(2) })
  .strict();
const bodyFields = {
  x: integer,
  z: integer,
  level: integer,
  dir: integer.min(0).max(3),
  path: z.array(cellSchema),
  leg: nonNegative,
  work: nonNegative,
};
const bodySchemaV1 = z
  .object({
    ...bodyFields,
    mode: z.enum([
      "idle",
      "walk",
      "chop",
      "build",
      "pickup",
      "deliver",
      "sleep",
    ]),
  })
  .strict();
const bodySchemaV2 = z
  .object({
    ...bodyFields,
    mode: z.enum([
      "idle",
      "walk",
      "chop",
      "build",
      "deconstruct",
      "pickup",
      "deliver",
      "sleep",
    ]),
  })
  .strict();
const bodySchema = z
  .object({
    ...bodyFields,
    mode: z.enum([
      "idle",
      "walk",
      "chop",
      "build",
      "deconstruct",
      "sow",
      "harvest",
      "pickup",
      "deliver",
      "sleep",
    ]),
  })
  .strict();
const actorFieldsV3 = {
  id,
  name: z.string(),
  figure: z.string(),
  rest: finite.min(0).max(100),
  routine: z.boolean(),
  allowedWork: allowedWorkSchemaV3,
  assignment: assignmentSchema.nullable(),
  cargo: cargoSchema.nullable(),
};
const actorSchemaV1 = bodySchemaV1
  .extend({ ...actorFieldsV3, task: activitySchemaV1.nullable() })
  .strict();
const actorSchemaV2 = bodySchemaV2
  .extend({ ...actorFieldsV3, task: activitySchemaV2.nullable() })
  .strict();
const actorSchemaV3 = bodySchemaV2
  .extend({
    ...actorFieldsV3,
    drafted: z.boolean(),
    task: activitySchemaV2.nullable(),
  })
  .strict();
const actorSchema = bodySchema
  .extend({
    ...actorFieldsV3,
    allowedWork: allowedWorkSchema,
    drafted: z.boolean(),
    task: activitySchema.nullable(),
  })
  .strict();
const partySchema = z.object({ id, members: z.array(id) }).strict();
const treeSchema = cellSchema
  .extend({ id, work: nonNegative, felledAt: nonNegative.nullable() })
  .strict();
const siteSchema = cellSchema
  .extend({
    id,
    type: z.enum(["wall", "door", "roof", "bed"]),
    direction: integer.min(0).max(1),
    delivered: nonNegative,
    work: nonNegative,
    finishedAt: nonNegative.nullable(),
  })
  .strict();
const pileSchema = cellSchema.extend({ id, amount: nonNegative }).strict();
const claimSchema = z
  .object({ job: id, pile: id, site: id, amount: positive.max(2) })
  .strict();
const eventSchema = z
  .object({
    kind: z.string(),
    name: z.string(),
    tick: nonNegative,
    text: z.string(),
  })
  .strict();
const herbSchema = cellSchema
  .extend({
    id,
    kind: z.literal("mugwort"),
    stage: z.enum(["ordered", "planted", "growing", "ready"]),
    work: nonNegative,
    plantedAt: nonNegative.nullable(),
  })
  .strict();
const herbBundleSchema = cellSchema
  .extend({ id, kind: z.literal("mugwort"), amount: z.literal(1) })
  .strict();

const jobBase = {
  id,
  scope: scopeSchema,
  reason: z.string(),
  routine: z.boolean(),
};
const chopJobSchema = z
  .object({ ...jobBase, kind: z.literal("chop"), target: id })
  .strict();
const buildJobSchema = z
  .object({ ...jobBase, kind: z.literal("build"), target: id })
  .strict();
const deconstructJobSchema = z
  .object({ ...jobBase, kind: z.literal("deconstruct"), target: id })
  .strict();
const sowJobSchema = z
  .object({ ...jobBase, kind: z.literal("sow"), target: id })
  .strict();
const harvestJobSchema = z
  .object({ ...jobBase, kind: z.literal("harvest"), target: id })
  .strict();
const restJobSchema = z
  .object({ ...jobBase, kind: z.literal("rest"), target: id })
  .strict();
const jobSchemaV1 = z.discriminatedUnion("kind", [
  chopJobSchema,
  buildJobSchema,
  restJobSchema,
]);
const jobSchemaV3 = z.discriminatedUnion("kind", [
  chopJobSchema,
  buildJobSchema,
  deconstructJobSchema,
  restJobSchema,
]);
const jobSchema = z.discriminatedUnion("kind", [
  chopJobSchema,
  buildJobSchema,
  deconstructJobSchema,
  sowJobSchema,
  harvestJobSchema,
  restJobSchema,
]);

const workCommandSchema = z
  .object({
    party: id,
    actors: z.array(id).min(1).nullable(),
    direct: z.boolean().optional(),
  })
  .strict();
const chopCommandSchema = workCommandSchema
  .extend({ kind: z.literal("chop"), tree: id })
  .strict();
const buildCommandSchema = workCommandSchema
  .extend({
    kind: z.literal("build"),
    type: z.enum(["wall", "door", "roof", "bed"]),
    direction: integer,
    x: integer,
    z: integer,
    level: integer,
  })
  .strict();
const deconstructCommandSchema = workCommandSchema
  .extend({ kind: z.literal("deconstruct"), site: id })
  .strict();
const sowCommandSchema = workCommandSchema
  .extend({ kind: z.literal("sow"), x: integer, z: integer, level: integer })
  .strict();
const harvestCommandSchema = workCommandSchema
  .extend({ kind: z.literal("harvest"), herb: id })
  .strict();
const restCommandSchema = workCommandSchema
  .extend({ kind: z.literal("rest") })
  .strict();
const queueCommandSchema = z
  .object({
    party: id,
    actors: z.array(id).min(1).nullable(),
    kind: z.enum(["cancel", "next"]),
    job: id,
  })
  .strict();
const routineCommandSchema = z
  .object({
    party: id,
    actors: z.array(id).min(1).nullable(),
    kind: z.literal("routine"),
    enabled: z.boolean(),
  })
  .strict();
const workCommandSchemaWithToggleV3 = z
  .object({
    party: id,
    actors: z.array(id).min(1).nullable(),
    kind: z.literal("work"),
    work: z.enum(["chop", "haul", "build"]),
    enabled: z.boolean(),
  })
  .strict();
const workCommandSchemaWithToggleV4 = workCommandSchemaWithToggleV3
  .extend({ work: z.enum(["chop", "haul", "build", "garden"]) })
  .strict();
const recruitCommandSchema = z
  .object({ kind: z.literal("recruit"), party: id, actor: id })
  .strict();
const commandSchemasV1 = [
  chopCommandSchema,
  buildCommandSchema,
  restCommandSchema,
  queueCommandSchema,
  routineCommandSchema,
  workCommandSchemaWithToggleV3,
  recruitCommandSchema,
] as const;
const commandSchemaV1 = z.union(commandSchemasV1);
const commandSchemasV2 = [
  chopCommandSchema,
  buildCommandSchema,
  deconstructCommandSchema,
  restCommandSchema,
  queueCommandSchema,
  routineCommandSchema,
  workCommandSchemaWithToggleV3,
  recruitCommandSchema,
] as const;
const commandSchemaV2 = z.union(commandSchemasV2);
const draftCommandSchema = z
  .object({ kind: z.enum(["draft", "undraft"]), party: id, actor: id })
  .strict();
const goCommandSchema = z
  .object({ kind: z.literal("go"), party: id, actor: id, target: cellSchema })
  .strict();
const commandSchemasV3 = [
  chopCommandSchema,
  buildCommandSchema,
  deconstructCommandSchema,
  restCommandSchema,
  queueCommandSchema,
  routineCommandSchema,
  workCommandSchemaWithToggleV3,
  recruitCommandSchema,
  draftCommandSchema,
  goCommandSchema,
] as const;
const commandSchemaV3 = z.union(commandSchemasV3);
const commandSchema = z.union([
  chopCommandSchema,
  buildCommandSchema,
  deconstructCommandSchema,
  restCommandSchema,
  queueCommandSchema,
  routineCommandSchema,
  workCommandSchemaWithToggleV4,
  recruitCommandSchema,
  draftCommandSchema,
  goCommandSchema,
  sowCommandSchema,
  harvestCommandSchema,
]);
const commandHistorySchemaV1 = z.intersection(
  commandSchemaV1,
  z.object({ tick: nonNegative }).strict(),
);
const commandHistorySchemaV2 = z.intersection(
  commandSchemaV2,
  z.object({ tick: nonNegative }).strict(),
);
const commandHistorySchemaV3 = z.intersection(
  commandSchemaV3,
  z.object({ tick: nonNegative }).strict(),
);
const commandHistorySchema = z.intersection(
  commandSchema,
  z.object({ tick: nonNegative }).strict(),
);

const clearingFields = {
  seed: finite,
  tick: nonNegative,
  paused: z.boolean(),
  nextId: positive,
  parties: z.record(id, partySchema),
  trees: z.array(treeSchema),
  rocks: z.array(cellSchema),
  watcher: cellSchema,
  piles: z.array(pileSchema),
  sites: z.array(siteSchema),
  claims: z.record(id, claimSchema),
  workDirty: z.boolean(),
  felled: nonNegative,
  finishedJobs: nonNegative,
  rested: nonNegative,
  feed: z
    .object({
      seed: finite,
      sequence: nonNegative,
      nextAt: nonNegative,
      last: eventSchema.nullable(),
    })
    .strict(),
  demand: eventSchema.nullable(),
  notice: z.string(),
};
function makeClearingSchema(
  actor: any,
  body: any,
  job: any,
  commandHistory: any,
  withConsumedWood: boolean,
  withHerbs: boolean,
) {
  return z
    .object({
      ...clearingFields,
      actors: z.record(id, actor),
      cat: body.extend({ nextMove: nonNegative }).strict(),
      jobs: z.array(job),
      commands: z.array(commandHistory),
      ...(withConsumedWood ? { consumedWood: nonNegative } : {}),
      ...(withHerbs
        ? {
            herbs: z.array(herbSchema),
            herbBundles: z.array(herbBundleSchema),
            harvestedHerbs: nonNegative,
          }
        : {}),
    })
    .strict();
}
const clearingSchemaV1 = makeClearingSchema(
  actorSchemaV1,
  bodySchemaV1,
  jobSchemaV1,
  commandHistorySchemaV1,
  false,
  false,
);
const clearingSchemaV2 = makeClearingSchema(
  actorSchemaV2,
  bodySchemaV2,
  jobSchemaV3,
  commandHistorySchemaV2,
  true,
  false,
);
const clearingSchemaV3 = makeClearingSchema(
  actorSchemaV3,
  bodySchemaV2,
  jobSchemaV3,
  commandHistorySchemaV3,
  true,
  false,
);
const clearingSchema = makeClearingSchema(
  actorSchema,
  bodySchema,
  jobSchema,
  commandHistorySchema,
  true,
  true,
);
const savedClearingSchemaV1 = clearingSchemaV1.omit({ commands: true });
const savedClearingSchemaV2 = clearingSchemaV2.omit({ commands: true });
const savedClearingSchemaV3 = clearingSchemaV3.omit({ commands: true });
const savedClearingSchema = clearingSchema.omit({ commands: true });
const saveEnvelopeSchemaV1 = z
  .object({
    kind: z.literal(SAVE_KIND),
    schema: z.literal(SAVE_SCHEMA_V1),
    revision: nonNegative,
    savedState: savedClearingSchemaV1,
  })
  .strict();
const saveEnvelopeSchemaV2 = z
  .object({
    kind: z.literal(SAVE_KIND),
    schema: z.literal(SAVE_SCHEMA_V2),
    revision: nonNegative,
    savedState: savedClearingSchemaV2,
  })
  .strict();
const saveEnvelopeSchemaV3 = z
  .object({
    kind: z.literal(SAVE_KIND),
    schema: z.literal(SAVE_SCHEMA_V3),
    revision: nonNegative,
    savedState: savedClearingSchemaV3,
  })
  .strict();
const saveEnvelopeSchemaV4 = z
  .object({
    kind: z.literal(SAVE_KIND),
    schema: z.literal(SAVE_SCHEMA),
    revision: nonNegative,
    savedState: savedClearingSchema,
  })
  .strict();
const saveEnvelopeSchema = z.union([
  saveEnvelopeSchemaV1,
  saveEnvelopeSchemaV2,
  saveEnvelopeSchemaV3,
  saveEnvelopeSchemaV4,
]);

export type SerializedClearing = z.infer<typeof clearingSchema>;
type SavedClearing = z.infer<typeof savedClearingSchema>;
export type SaveEnvelope = z.infer<typeof saveEnvelopeSchema>;

function uniqueIds(values: string[], label: string): void {
  if (new Set(values).size !== values.length)
    throw new Error(`${label} contains duplicate ids`);
}

function generatedIdNumber(value: string): number | null {
  const match = /^(?:job|site|wood|herb-bundle|herb)-(\d+)$/.exec(value);
  return match ? Number(match[1]) : null;
}

function checkCell(
  cell: { x: number; z: number; level: number },
  label: string,
): void {
  if (!inside(cell)) throw new Error(`${label} is outside the clearing`);
}

function assertNever(value: never): never {
  throw new Error(`Unhandled persisted task kind: ${JSON.stringify(value)}`);
}

type ValidationContext = {
  jobs: Map<string, Clearing["jobs"][number]>;
  sites: Map<string, Clearing["sites"][number]>;
  piles: Map<string, Clearing["piles"][number]>;
  claimsByPile: Map<string, number>;
  claimsBySite: Map<string, number>;
  cargoBySite: Map<string, number>;
};

function checkIdentityAndParties(state: Clearing): void {
  const actorIds = Object.keys(state.actors);
  const partyIds = Object.keys(state.parties);
  const treeIds = state.trees.map((tree) => tree.id);
  const siteIds = state.sites.map((site) => site.id);
  const pileIds = state.piles.map((pile) => pile.id);
  const jobIds = state.jobs.map((job) => job.id);
  uniqueIds(actorIds, "actors");
  uniqueIds(partyIds, "parties");
  uniqueIds(treeIds, "trees");
  uniqueIds(siteIds, "sites");
  uniqueIds(pileIds, "piles");
  uniqueIds(jobIds, "jobs");
  if (!state.parties.home) throw new Error("home party is missing");
  for (const [key, actor] of Object.entries(state.actors)) {
    if (key !== actor.id) throw new Error(`actor key mismatch: ${key}`);
    checkCell(actor, `actor ${actor.id}`);
    actor.path.forEach((cell, index) =>
      checkCell(cell, `actor ${actor.id} path ${index}`),
    );
  }
  for (const [key, party] of Object.entries(state.parties)) {
    if (key !== party.id) throw new Error(`party key mismatch: ${key}`);
  }
  const memberParty = new Map<string, string>();
  for (const party of Object.values(state.parties)) {
    uniqueIds(party.members, `party ${party.id}`);
    for (const member of party.members) {
      if (!state.actors[member])
        throw new Error(`party ${party.id} has missing actor`);
      if (memberParty.has(member))
        throw new Error(`actor ${member} belongs to multiple parties`);
      memberParty.set(member, party.id);
    }
  }
}

function checkCellsAndTreeProgress(state: Clearing): void {
  for (const tree of state.trees) checkCell(tree, `tree ${tree.id}`);
  for (const rock of state.rocks) checkCell(rock, "rock");
  for (const site of state.sites) checkCell(site, `site ${site.id}`);
  for (const pile of state.piles) checkCell(pile, `pile ${pile.id}`);
  checkCell(state.cat, "cat");
  state.cat.path.forEach((cell, index) => checkCell(cell, `cat path ${index}`));
  checkCell(state.watcher, "watcher");
  const felledTrees = state.trees.filter((tree) => tree.felledAt !== null);
  if (state.felled !== felledTrees.length)
    throw new Error("felled count disagrees with felled trees");
  for (const tree of state.trees) {
    if (tree.felledAt !== null) {
      if (tree.work !== CHOP_TICKS || tree.felledAt > state.tick)
        throw new Error(`tree ${tree.id} has inconsistent felled progress`);
    } else if (tree.work >= CHOP_TICKS) {
      throw new Error(
        `tree ${tree.id} has completed work without a felled tick`,
      );
    }
  }
}

function createValidationContext(state: Clearing): ValidationContext {
  return {
    jobs: new Map(state.jobs.map((job) => [job.id, job])),
    sites: new Map(state.sites.map((site) => [site.id, site])),
    piles: new Map(state.piles.map((pile) => [pile.id, pile])),
    claimsByPile: new Map(),
    claimsBySite: new Map(),
    cargoBySite: new Map(),
  };
}

function checkJobTargetsAndScope(
  state: Clearing,
  context: ValidationContext,
): void {
  const deconstructTargets = new Set<string>();
  for (const job of state.jobs) {
    const party = state.parties[job.scope.party];
    if (!party) throw new Error(`job ${job.id} has missing party`);
    if (job.scope.actors !== null)
      for (const actor of job.scope.actors)
        if (!party.members.includes(actor))
          throw new Error(`job ${job.id} has out-of-scope actor`);
    if (job.kind === "chop") {
      const tree = state.trees.find((candidate) => candidate.id === job.target);
      if (!tree) throw new Error(`job ${job.id} has missing tree`);
      if (tree.felledAt !== null)
        throw new Error(`job ${job.id} targets a felled tree`);
    }
    if (job.kind === "build") {
      const site = context.sites.get(job.target);
      if (!site) throw new Error(`job ${job.id} has missing site`);
      if (site.finishedAt !== null)
        throw new Error(`job ${job.id} targets a finished site`);
    }
    if (job.kind === "deconstruct") {
      const site = context.sites.get(job.target);
      if (!site) throw new Error(`job ${job.id} has missing site`);
      if (site.finishedAt === null)
        throw new Error(`job ${job.id} targets an unfinished site`);
      if (deconstructTargets.has(site.id))
        throw new Error(`site ${site.id} has duplicate deconstruction jobs`);
      deconstructTargets.add(site.id);
    }
    if (job.kind === "rest" && !state.actors[job.target])
      throw new Error(`job ${job.id} has missing actor`);
    if (job.kind === "rest") {
      const party = state.parties[job.scope.party];
      if (
        !party.members.includes(job.target) ||
        job.scope.actors === null ||
        !job.scope.actors.includes(job.target)
      )
        throw new Error(`rest job ${job.id} is not personal to its target`);
    }
  }
}

function checkActorTaskAssignmentAndCargo(
  state: Clearing,
  context: ValidationContext,
): void {
  for (const actor of Object.values(state.actors)) {
    if (
      actor.drafted &&
      (actor.task ||
        actor.assignment ||
        actor.cargo ||
        state.claims[actor.id] !== undefined)
    )
      throw new Error(`drafted actor ${actor.id} retains ordinary work`);
    if (
      !actor.task &&
      actor.mode !== "idle" &&
      !(actor.drafted && actor.mode === "walk")
    )
      throw new Error(`actor ${actor.id} has a mode without a task`);
    if (actor.task) {
      const job = context.jobs.get(actor.task.job);
      if (!job) throw new Error(`actor ${actor.id} has missing task job`);
      const party = state.parties[job.scope.party];
      if (
        !party.members.includes(actor.id) ||
        (job.scope.actors !== null && !job.scope.actors.includes(actor.id))
      )
        throw new Error(`actor ${actor.id} task job is not in actor scope`);
      if (!actor.assignment)
        throw new Error(`actor ${actor.id} task has no assignment`);
      if (
        actor.assignment.character !== actor.id ||
        actor.assignment.task !== actor.task.job
      )
        throw new Error(`actor ${actor.id} assignment does not match task`);
      switch (actor.task.kind) {
        case "chop":
          if (
            job.kind !== "chop" ||
            job.target !== actor.task.target ||
            !state.trees.some((tree) => tree.id === actor.task!.target)
          )
            throw new Error(
              `actor ${actor.id} chop task disagrees with job target`,
            );
          break;
        case "build":
          if (
            job.kind !== "build" ||
            job.target !== actor.task.target ||
            !context.sites.has(actor.task.target)
          )
            throw new Error(
              `actor ${actor.id} build task disagrees with job target`,
            );
          break;
        case "deconstruct": {
          const site = context.sites.get(actor.task.target);
          if (
            job.kind !== "deconstruct" ||
            job.target !== actor.task.target ||
            !site ||
            site.finishedAt === null ||
            state.claims[actor.id] !== undefined ||
            actor.cargo !== null
          )
            throw new Error(
              `actor ${actor.id} deconstruct task disagrees with site`,
            );
          break;
        }
        case "pickup": {
          const claim = state.claims[actor.id];
          if (
            job.kind !== "build" ||
            !context.sites.has(job.target) ||
            !context.piles.has(actor.task.target) ||
            !claim ||
            claim.job !== job.id ||
            claim.pile !== actor.task.target ||
            claim.site !== job.target ||
            actor.cargo !== null
          )
            throw new Error(
              `actor ${actor.id} pickup task disagrees with claim`,
            );
          break;
        }
        case "deliver":
          if (
            job.kind !== "build" ||
            job.target !== actor.task.target ||
            !context.sites.has(actor.task.target) ||
            state.claims[actor.id] !== undefined ||
            !actor.cargo ||
            actor.cargo.job !== job.id ||
            actor.cargo.site !== actor.task.target
          )
            throw new Error(
              `actor ${actor.id} deliver task disagrees with cargo`,
            );
          break;
        case "sleep": {
          const bed = context.sites.get(actor.task.target);
          if (
            job.kind !== "rest" ||
            job.target !== actor.id ||
            !bed ||
            bed.type !== "bed" ||
            bed.finishedAt === null
          )
            throw new Error(
              `actor ${actor.id} sleep task disagrees with job or bed`,
            );
          break;
        }
        case "sow":
        case "harvest":
          break;
        default:
          assertNever(actor.task);
      }
      if (actor.mode !== "walk" && actor.mode !== actor.task.kind)
        throw new Error(`actor ${actor.id} mode disagrees with task`);
    }
    if (actor.assignment) {
      if (actor.assignment.character !== actor.id)
        throw new Error(`actor ${actor.id} assignment owner mismatch`);
      if (!actor.task || actor.assignment.task !== actor.task.job)
        throw new Error(`actor ${actor.id} assignment has no matching task`);
    }
    if (actor.cargo) {
      const job = context.jobs.get(actor.cargo.job);
      const site = context.sites.get(actor.cargo.site);
      if (
        !job ||
        job.kind !== "build" ||
        !site ||
        job.target !== site.id ||
        !state.parties[job.scope.party].members.includes(actor.id) ||
        (job.scope.actors !== null && !job.scope.actors.includes(actor.id))
      )
        throw new Error(`actor ${actor.id} has invalid cargo reference`);
      if (state.claims[actor.id])
        throw new Error(`actor ${actor.id} has claim and cargo`);
      context.cargoBySite.set(
        actor.cargo.site,
        (context.cargoBySite.get(actor.cargo.site) ?? 0) + actor.cargo.amount,
      );
    }
  }
}

function checkClaimsAndReservations(
  state: Clearing,
  context: ValidationContext,
): void {
  for (const [actorId, claim] of Object.entries(state.claims)) {
    const actor = state.actors[actorId];
    const job = context.jobs.get(claim.job);
    const pile = context.piles.get(claim.pile);
    const site = context.sites.get(claim.site);
    if (
      !actor ||
      !actor.task ||
      actor.task.kind !== "pickup" ||
      actor.task.job !== claim.job ||
      actor.task.target !== claim.pile ||
      !job ||
      job.kind !== "build" ||
      !pile ||
      !site ||
      job.target !== claim.site ||
      actor.cargo !== null ||
      claim.amount > pile.amount
    )
      throw new Error(`claim for ${actorId} has no matching pickup task`);
    context.claimsByPile.set(
      claim.pile,
      (context.claimsByPile.get(claim.pile) ?? 0) + claim.amount,
    );
    context.claimsBySite.set(
      claim.site,
      (context.claimsBySite.get(claim.site) ?? 0) + claim.amount,
    );
  }
  for (const [pileId, claimed] of context.claimsByPile) {
    const pile = context.piles.get(pileId);
    if (!pile || claimed > pile.amount)
      throw new Error(`claims exceed pile ${pileId}`);
  }
}

function checkSitesAndProgress(
  state: Clearing,
  context: ValidationContext,
): void {
  for (const site of state.sites) {
    const recipe = BUILDINGS[site.type];
    const committed =
      site.delivered +
      (context.claimsBySite.get(site.id) ?? 0) +
      (context.cargoBySite.get(site.id) ?? 0);
    if (site.delivered > recipe.wood || committed > recipe.wood)
      throw new Error(`site ${site.id} exceeds its wood recipe`);
    if (
      site.work > 0 &&
      (site.delivered !== recipe.wood ||
        (context.claimsBySite.get(site.id) ?? 0) > 0 ||
        (context.cargoBySite.get(site.id) ?? 0) > 0)
    )
      throw new Error(
        `site ${site.id} has work before its delivery is settled`,
      );
    if (site.finishedAt !== null) {
      if (
        site.work !== recipe.ticks ||
        site.delivered !== recipe.wood ||
        site.finishedAt > state.tick
      )
        throw new Error(`site ${site.id} has inconsistent finished progress`);
    } else if (site.work >= recipe.ticks) {
      throw new Error(
        `site ${site.id} has completed work without a finished tick`,
      );
    }
  }
}

function checkMaterialConservation(
  state: Clearing,
  context: ValidationContext,
): void {
  const physicalWood =
    state.piles.reduce((total, pile) => total + pile.amount, 0) +
    state.sites.reduce((total, site) => total + site.delivered, 0) +
    [...context.cargoBySite.values()].reduce(
      (total, amount) => total + amount,
      0,
    ) +
    state.consumedWood;
  if (physicalWood !== state.felled * 6)
    throw new Error("physical wood does not match felled oaks");
}

function checkFeedAndNextId(state: Clearing): void {
  if (state.feed.seed !== state.seed)
    throw new Error("feed seed disagrees with clearing seed");
  const jobIds = state.jobs.map((job) => job.id);
  const siteIds = state.sites.map((site) => site.id);
  const pileIds = state.piles.map((pile) => pile.id);
  const generated = [...jobIds, ...siteIds, ...pileIds]
    .map(generatedIdNumber)
    .filter((value): value is number => value !== null);
  if (generated.some((value) => value >= state.nextId))
    throw new Error("nextId can collide with a generated id");
}

function checkHerbs(state: Clearing): void {
  const herbIds = state.herbs.map((herb) => herb.id);
  const bundleIds = state.herbBundles.map((bundle) => bundle.id);
  uniqueIds(herbIds, "herbs");
  uniqueIds(bundleIds, "herb bundles");
  const cells = new Set<string>();
  const jobs = new Map(state.jobs.map((job) => [job.id, job]));
  const sowTargets = new Set<string>();
  const harvestTargets = new Set<string>();
  for (const herb of state.herbs) {
    checkCell(herb, `herb ${herb.id}`);
    const key = `${herb.x},${herb.z},${herb.level}`;
    if (cells.has(key)) throw new Error(`herbs contain duplicate cells`);
    cells.add(key);
    const occupant = placementOccupant(state, herb, herb.id);
    if (occupant) throw new Error(`herb ${herb.id} overlaps ${occupant}`);
    if (herb.stage === "ordered") {
      if (herb.plantedAt !== null || herb.work >= SOW_TICKS)
        throw new Error(`herb ${herb.id} has inconsistent ordered progress`);
      continue;
    }
    if (
      herb.plantedAt === null ||
      herb.plantedAt > state.tick ||
      herb.stage !== mugwortStage(state.tick - herb.plantedAt)
    )
      throw new Error(`herb ${herb.id} has inconsistent growth stage`);
    if (herb.stage !== "ready" && herb.work !== 0)
      throw new Error(`herb ${herb.id} has nonzero growth work`);
    if (herb.stage === "ready" && herb.work >= HARVEST_TICKS)
      throw new Error(`herb ${herb.id} has completed harvest work`);
  }
  for (const bundle of state.herbBundles) {
    checkCell(bundle, `herb bundle ${bundle.id}`);
    const key = `${bundle.x},${bundle.z},${bundle.level}`;
    if (cells.has(key)) throw new Error(`herb bundles overlap a herb cell`);
    cells.add(key);
    const occupant = placementOccupant(state, bundle, bundle.id);
    if (occupant)
      throw new Error(`herb bundle ${bundle.id} overlaps ${occupant}`);
  }
  for (const job of state.jobs) {
    if (job.kind !== "sow" && job.kind !== "harvest") continue;
    const herb = state.herbs.find((candidate) => candidate.id === job.target);
    if (!herb) throw new Error(`job ${job.id} has missing herb`);
    if (job.kind === "sow") {
      if (herb.stage !== "ordered")
        throw new Error(`job ${job.id} targets a non-ordered herb`);
      if (sowTargets.has(herb.id))
        throw new Error(`herb ${herb.id} has duplicate sow jobs`);
      sowTargets.add(herb.id);
    } else {
      if (herb.stage !== "ready")
        throw new Error(`job ${job.id} targets a non-ready herb`);
      if (harvestTargets.has(herb.id))
        throw new Error(`herb ${herb.id} has duplicate harvest jobs`);
      harvestTargets.add(herb.id);
    }
  }
  for (const herb of state.herbs) {
    if (herb.stage === "ordered" && !sowTargets.has(herb.id))
      throw new Error(`ordered herb ${herb.id} has no sow job`);
  }
  for (const actor of Object.values(state.actors)) {
    if (
      !actor.task ||
      (actor.task.kind !== "sow" && actor.task.kind !== "harvest")
    )
      continue;
    const herb = state.herbs.find(
      (candidate) => candidate.id === actor.task!.target,
    );
    const job = jobs.get(actor.task.job);
    const expected = actor.task.kind === "sow" ? "ordered" : "ready";
    if (
      !herb ||
      !job ||
      job.kind !== actor.task.kind ||
      job.target !== herb.id ||
      herb.stage !== expected
    )
      throw new Error(
        `actor ${actor.id} ${actor.task.kind} task disagrees with herb`,
      );
  }
  if (
    state.herbBundles.reduce((sum, bundle) => sum + bundle.amount, 0) !==
    state.harvestedHerbs
  )
    throw new Error("harvested herbs do not match herb bundles");
  const generated = [...herbIds, ...bundleIds]
    .map(generatedIdNumber)
    .filter((value): value is number => value !== null);
  if (generated.some((value) => value >= state.nextId))
    throw new Error("nextId can collide with a generated id");
}

function checkInvariants(state: Clearing): void {
  checkIdentityAndParties(state);
  checkCellsAndTreeProgress(state);
  const context = createValidationContext(state);
  checkJobTargetsAndScope(state, context);
  checkActorTaskAssignmentAndCargo(state, context);
  checkClaimsAndReservations(state, context);
  checkSitesAndProgress(state, context);
  checkMaterialConservation(state, context);
  checkFeedAndNextId(state);
  checkHerbs(state);
}

export function validateClearing(value: unknown): SerializedClearing {
  const parsed = clearingSchema.parse(value);
  checkInvariants(parsed as unknown as Clearing);
  return parsed;
}

export function validateSaveEnvelope(value: unknown): SaveEnvelope {
  const parsed = saveEnvelopeSchema.parse(value);
  validateSavedClearing(normalizeSavedState(parsed));
  return parsed;
}

function normalizeSavedState(envelope: SaveEnvelope): Record<string, unknown> {
  const actors = Object.fromEntries(
    Object.entries(envelope.savedState.actors).map(([id, actor]) => [
      id,
      {
        ...actor,
        allowedWork: {
          ...actor.allowedWork,
          garden:
            "garden" in actor.allowedWork ? actor.allowedWork.garden : true,
        },
        drafted: "drafted" in actor ? actor.drafted : false,
      },
    ]),
  );
  return {
    ...envelope.savedState,
    actors,
    ...(envelope.schema === SAVE_SCHEMA_V1 ? { consumedWood: 0 } : {}),
    ...(envelope.schema !== SAVE_SCHEMA
      ? {
          herbs: [],
          herbBundles: [],
          harvestedHerbs: 0,
        }
      : {}),
  };
}

export function snapshotFor(state: Clearing): SaveEnvelope {
  const { commands: _commands, ...withoutHistory } = structuredClone(state);
  const savedState = validateSavedClearing(withoutHistory);
  return {
    kind: SAVE_KIND,
    schema: SAVE_SCHEMA,
    revision: 0,
    savedState: structuredClone(savedState),
  };
}

function validateSavedClearing(value: unknown): SavedClearing {
  const parsed = savedClearingSchema.parse(value);
  checkInvariants({ ...parsed, commands: [] } as unknown as Clearing);
  return parsed;
}

export function restoreSnapshot(value: unknown): {
  state: Clearing;
  revision: number;
} {
  const envelope = validateSaveEnvelope(value);
  const savedState = normalizeSavedState(envelope);
  return {
    state: structuredClone({
      ...savedState,
      commands: [],
      paused: true,
    }) as unknown as Clearing,
    revision: envelope.revision,
  };
}

export function backupJson(state: Clearing, revision: number): string {
  return `${JSON.stringify({ ...snapshotFor(state), revision }, null, 2)}\n`;
}

export function rawBackupJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export type LoadResult =
  | { kind: "missing" }
  | { kind: "loaded"; state: Clearing; revision: number }
  | { kind: "invalid"; raw: unknown; reason: string }
  | { kind: "failed"; error: unknown };

class StaleRevisionError extends Error {
  constructor() {
    super("The local world changed in another tab.");
    this.name = "StaleRevisionError";
  }
}

class MalformedSaveError extends Error {
  constructor() {
    super("The local world record is malformed and was not overwritten.");
    this.name = "MalformedSaveError";
  }
}

const database =
  typeof indexedDB === "undefined"
    ? null
    : openDB(SAVE_DB_NAME, 1, {
        upgrade(db) {
          if (!db.objectStoreNames.contains(SAVE_STORE))
            db.createObjectStore(SAVE_STORE);
        },
      });

async function readRecord(): Promise<unknown> {
  if (!database) throw new Error("IndexedDB is unavailable.");
  const db = await database;
  return db.get(SAVE_STORE, SAVE_KEY);
}

export async function loadWorld(): Promise<LoadResult> {
  if (!database)
    return { kind: "failed", error: new Error("IndexedDB is unavailable.") };
  try {
    const raw = await readRecord();
    if (raw === undefined) return { kind: "missing" };
    try {
      return { kind: "loaded", ...restoreSnapshot(raw) };
    } catch (error) {
      return {
        kind: "invalid",
        raw,
        reason: error instanceof Error ? error.message : "Unknown save format.",
      };
    }
  } catch (error) {
    return { kind: "failed", error };
  }
}

export type SaveRevisionDecision =
  | { kind: "write"; revision: number }
  | { kind: "stale"; currentRevision: number }
  | { kind: "malformed" };

export type ReplaceRevisionDecision = SaveRevisionDecision;

export function decideSaveRevision(
  current: unknown,
  expectedRevision: number,
): SaveRevisionDecision {
  if (current === undefined)
    return expectedRevision === 0
      ? { kind: "write", revision: 1 }
      : { kind: "stale", currentRevision: 0 };
  let currentRevision: number;
  try {
    currentRevision = validateSaveEnvelope(current).revision;
  } catch {
    return { kind: "malformed" };
  }
  return currentRevision === expectedRevision
    ? { kind: "write", revision: currentRevision + 1 }
    : { kind: "stale", currentRevision };
}

export function decideReplaceRevision(
  current: unknown,
  expectedRevision: number,
  mode: "cas" | "discardMalformed" = "cas",
): ReplaceRevisionDecision {
  if (current === undefined)
    return mode === "cas" && expectedRevision === 0
      ? { kind: "write", revision: 1 }
      : { kind: "stale", currentRevision: 0 };
  try {
    const currentRevision = validateSaveEnvelope(current).revision;
    if (mode === "discardMalformed") return { kind: "stale", currentRevision };
    return currentRevision === expectedRevision
      ? { kind: "write", revision: currentRevision + 1 }
      : { kind: "stale", currentRevision };
  } catch {
    return mode === "discardMalformed"
      ? { kind: "write", revision: 1 }
      : { kind: "malformed" };
  }
}

export async function saveWorld(
  state: Clearing,
  expectedRevision: number,
): Promise<{ revision: number }> {
  const envelope = snapshotFor(state);
  if (!database) throw new Error("IndexedDB is unavailable.");
  const db = await database;
  const tx = db.transaction(SAVE_STORE, "readwrite");
  const current = await tx.store.get(SAVE_KEY);
  const decision = decideSaveRevision(current, expectedRevision);
  if (decision.kind !== "write") {
    tx.abort();
    await tx.done.catch(() => undefined);
    if (decision.kind === "malformed") throw new MalformedSaveError();
    throw new StaleRevisionError();
  }
  const revision = decision.revision;
  await tx.store.put({ ...envelope, revision }, SAVE_KEY);
  await tx.done;
  return { revision };
}

export async function replaceWorld(
  state: Clearing,
  expectedRevision: number,
  mode: "cas" | "discardMalformed" = "cas",
): Promise<{ revision: number }> {
  const envelope = snapshotFor(state);
  if (!database) throw new Error("IndexedDB is unavailable.");
  const db = await database;
  const tx = db.transaction(SAVE_STORE, "readwrite");
  const current = await tx.store.get(SAVE_KEY);
  const decision = decideReplaceRevision(current, expectedRevision, mode);
  if (decision.kind !== "write") {
    tx.abort();
    await tx.done.catch(() => undefined);
    if (decision.kind === "malformed") throw new MalformedSaveError();
    throw new StaleRevisionError();
  }
  const revision = decision.revision;
  await tx.store.put({ ...envelope, revision }, SAVE_KEY);
  await tx.done;
  return { revision };
}
