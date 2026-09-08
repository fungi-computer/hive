import { openDB } from "idb";
import { z } from "zod";
import type { Clearing, Job, PositiveInt } from "./model.ts";
import { inside, sameCell } from "./world.js";
import {
  BUILDINGS,
  brewKettle,
  constructionBuffer,
  floorSupported,
  footprint,
  resolveMaterialDestination,
  roofSupported,
  shelfContainer,
} from "./construction.js";
import {
  pailInterior,
  sourceContainer,
  type ContainerSpec,
} from "./materials.ts";
import {
  finiteSourceProblem,
  introduceFiniteSources,
  cacheRepairBuffer,
  sourcePailContainerSpec,
  sourceContainerSpec,
} from "./finite-sources.ts";

const SAVE_KIND = "hive-local-world" as const;
const SAVE_SCHEMA = 10 as const;
const SAVE_DB_NAME = "hive-local-world";
const SAVE_STORE = "world";
const SAVE_KEY = "current";
const finite = z.number().finite();
const integer = finite.int();
const nonNegative = integer.min(0);
const nonNegativeScalar = finite.min(0);
const positive = integer
  .min(1)
  .transform((value): PositiveInt => value as PositiveInt);
const id = z.string().min(1);
const cell = z.object({ x: integer, z: integer, level: integer }).strict();
const scope = z
  .object({ party: id, actors: z.array(id).min(1).nullable() })
  .strict();
const allowedWork = z
  .object({
    chop: z.boolean(),
    haul: z.boolean(),
    build: z.boolean(),
    garden: z.boolean(),
  })
  .strict();
const activity = z.discriminatedUnion("kind", [
  z
    .object({
      job: id,
      target: id,
      duration: positive,
      kind: z.literal("chop"),
    })
    .strict(),
  z
    .object({
      job: id,
      target: id,
      duration: positive,
      kind: z.literal("build"),
    })
    .strict(),
  z
    .object({
      job: id,
      target: id,
      duration: positive,
      kind: z.literal("deconstruct"),
    })
    .strict(),
  z
    .object({ job: id, target: id, duration: positive, kind: z.literal("sow") })
    .strict(),
  z
    .object({
      job: id,
      target: id,
      duration: positive,
      kind: z.literal("harvest"),
    })
    .strict(),
  z
    .object({
      job: id,
      target: id,
      duration: positive,
      kind: z.literal("transfer"),
    })
    .strict(),
  z
    .object({
      job: id,
      target: id,
      duration: positive,
      kind: z.literal("sleep"),
    })
    .strict(),
  z
    .object({
      job: id,
      target: id,
      duration: positive,
      kind: z.literal("repair-cache"),
    })
    .strict(),
  z
    .object({
      job: id,
      target: id,
      duration: positive,
      kind: z.literal("brew-water"),
    })
    .strict(),
]);
const actor = cell
  .extend({
    id,
    name: z.string(),
    figure: z.string(),
    dir: integer,
    mode: z.enum([
      "idle",
      "walk",
      "chop",
      "build",
      "deconstruct",
      "sow",
      "harvest",
      "transfer",
      "sleep",
      "repair-cache",
      "brew-water",
    ]),
    path: z.array(cell),
    leg: nonNegative,
    work: nonNegative,
    drafted: z.boolean(),
    rest: nonNegativeScalar,
    routine: z.boolean(),
    allowedWork,
    task: activity.nullable(),
    assignment: z
      .object({ character: id, task: id, cost: finite })
      .strict()
      .nullable(),
  })
  .strict();
const jobBase = { id, scope, reason: z.string(), routine: z.boolean() };
const job = z.discriminatedUnion("kind", [
  z.object({ ...jobBase, kind: z.literal("chop"), target: id }).strict(),
  z.object({ ...jobBase, kind: z.literal("build"), target: id }).strict(),
  z.object({ ...jobBase, kind: z.literal("deconstruct"), target: id }).strict(),
  z.object({ ...jobBase, kind: z.literal("sow"), target: id }).strict(),
  z.object({ ...jobBase, kind: z.literal("harvest"), target: id }).strict(),
  z
    .object({
      ...jobBase,
      kind: z.literal("store"),
      source: id,
      destination: id,
    })
    .strict(),
  z.object({ ...jobBase, kind: z.literal("rest"), target: id }).strict(),
  z
    .object({ ...jobBase, kind: z.literal("repair-cache"), target: id })
    .strict(),
  z.object({ ...jobBase, kind: z.literal("fill-kettle"), target: id }).strict(),
]);
const v8Material = z.enum(["wood", "mugwort"]);
const material = z.enum(["wood", "mugwort", "water", "pail"]);
const v8Lot = z
  .object({
    id,
    material: v8Material,
    quantity: positive,
    location: z.discriminatedUnion("kind", [
      cell.extend({ kind: z.literal("ground") }).strict(),
      z.object({ kind: z.literal("hand"), actor: id }).strict(),
      z.object({ kind: z.literal("container"), container: id }).strict(),
    ]),
  })
  .strict();
const request = z
  .object({
    source: z.discriminatedUnion("kind", [
      z
        .object({
          kind: z.literal("eligible-ground"),
          material,
        })
        .strict(),
      z
        .object({
          kind: z.literal("eligible-container"),
          material,
          container: id,
        })
        .strict(),
      z.object({ kind: z.literal("exact-lot"), lot: id }).strict(),
    ]),
    quantityPolicy: z.enum(["whole-lot", "portion"]),
    quantity: positive,
  })
  .strict();
const intent = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("deliver"), destination: id }).strict(),
  z.object({ kind: z.literal("use"), operation: id }).strict(),
]);
const transferOwner = z.discriminatedUnion("kind", [
  z
    .object({ kind: z.literal("job"), job: id, step: z.string().min(1) })
    .strict(),
  z.object({ kind: z.literal("operation"), operation: id }).strict(),
]);
const transfer = z
  .object({
    id,
    actor: id,
    owner: transferOwner,
    request,
    intent,
    phase: z.discriminatedUnion("kind", [
      z
        .object({
          kind: z.literal("reserved"),
          sourceLot: id,
          quantity: positive,
          origin: z.discriminatedUnion("kind", [
            z.object({ kind: z.literal("ground"), cell }).strict(),
            z.object({ kind: z.literal("container"), container: id }).strict(),
          ]),
        })
        .strict(),
      z.object({ kind: z.literal("carrying"), lot: id }).strict(),
    ]),
  })
  .strict();
const v8Request = request.extend({
  source: z.discriminatedUnion("kind", [
    z
      .object({ kind: z.literal("eligible-ground"), material: v8Material })
      .strict(),
    z
      .object({
        kind: z.literal("eligible-container"),
        material: v8Material,
        container: id,
      })
      .strict(),
    z.object({ kind: z.literal("exact-lot"), lot: id }).strict(),
  ]),
  destination: id,
});
const v8Transfer = transfer
  .omit({ intent: true, request: true, owner: true })
  .extend({
    owner: z.object({ job: id, step: z.string().min(1) }).strict(),
    request: v8Request,
  });
const site = cell
  .extend({
    id,
    type: z.enum([
      "wall",
      "door",
      "roof",
      "bed",
      "shelf",
      "floor",
      "stair",
      "brew-station",
    ]),
    direction: z.union([z.literal(0), z.literal(1)]),
    work: nonNegative,
    finishedAt: nonNegative.nullable(),
  })
  .strict();
const event = z
  .object({
    kind: z.string(),
    name: z.string(),
    tick: nonNegative,
    text: z.string(),
  })
  .strict();
const brewWaterOperation = z
  .object({
    id,
    job: id,
    actor: id,
    spring: id,
    station: id,
    pail: id,
    water: id.nullable(),
    phase: z.enum(["acquire", "draw", "pour"]),
  })
  .strict();
const sourceFeature = z.discriminatedUnion("kind", [
  cell
    .extend({ id, kind: z.literal("spring"), access: z.literal("open") })
    .strict(),
  cell
    .extend({
      id,
      kind: z.literal("reclaimed-timber-cache"),
      access: z.literal("sealed"),
      repaired: z.boolean(),
    })
    .strict(),
]);
const v9SourceFeature = cell
  .extend({
    id,
    kind: z.enum(["spring", "reclaimed-timber-cache"]),
    access: z.enum(["open", "sealed"]),
  })
  .strict();
const stateSchema = z
  .object({
    seed: finite,
    tick: nonNegative,
    paused: z.boolean(),
    nextId: nonNegative,
    actors: z.record(id, actor),
    parties: z.record(id, z.object({ id, members: z.array(id) }).strict()),
    cat: cell
      .extend({
        dir: integer,
        mode: z.enum(["idle", "walk", "sleep"]),
        path: z.array(cell),
        leg: nonNegative,
        work: nonNegative,
        nextMove: nonNegative,
      })
      .strict(),
    trees: z.array(
      cell
        .extend({ id, work: nonNegative, felledAt: nonNegative.nullable() })
        .strict(),
    ),
    herbs: z.array(
      cell
        .extend({
          id,
          kind: z.literal("mugwort"),
          stage: z.enum(["ordered", "planted", "growing", "ready"]),
          work: nonNegative,
          plantedAt: nonNegative.nullable(),
        })
        .strict(),
    ),
    materials: z
      .object({
        lots: z.array(v8Lot.extend({ material }).strict()),
        transfers: z.array(transfer),
        vesselUses: z.array(z.object({ id, vessel: id }).strict()),
        embedded: z.array(
          z
            .object({
              container: id,
              material: v8Material,
              quantity: positive,
            })
            .strict(),
        ),
        nextLotId: nonNegative,
        consumedWood: nonNegative,
      })
      .strict(),
    rocks: z.array(cell),
    watcher: cell,
    sites: z.array(site),
    sources: z.array(sourceFeature),
    pendingSources: z.array(
      z
        .object({
          id,
          kind: z.enum(["spring", "reclaimed-timber-cache"]),
          preferred: cell,
        })
        .strict(),
    ),
    operations: z.array(brewWaterOperation),
    jobs: z.array(job),
    workDirty: z.boolean(),
    felled: nonNegative,
    finishedJobs: nonNegative,
    rested: nonNegative,
    harvestedHerbs: nonNegative,
    feed: z
      .object({
        seed: finite,
        sequence: nonNegative,
        nextAt: nonNegative,
        last: event.nullable(),
      })
      .strict(),
    demand: event.nullable(),
    notice: z.string(),
  })
  .strict();
type SavedClearing = Omit<Clearing, "commands">;
const v8StateSchema = stateSchema
  .omit({ sources: true, pendingSources: true, operations: true })
  .extend({
    materials: stateSchema.shape.materials.omit({ vesselUses: true }).extend({
      lots: z.array(v8Lot),
      transfers: z.array(v8Transfer),
    }),
  })
  .strict();
type V8SavedClearing = z.infer<typeof v8StateSchema>;
const v9StateSchema = stateSchema
  .omit({ operations: true })
  .extend({
    sources: z.array(v9SourceFeature),
  })
  .strict();
type V9SavedClearing = z.infer<typeof v9StateSchema>;
const savedSchema = stateSchema.transform((value): SavedClearing => value);
const envelopeSchema = z
  .object({
    kind: z.literal(SAVE_KIND),
    schema: z.literal(SAVE_SCHEMA),
    revision: nonNegative,
    savedState: savedSchema,
  })
  .strict();
export type SerializedClearing = SavedClearing;
export type SaveEnvelope = z.infer<typeof envelopeSchema>;
const v8EnvelopeSchema = z
  .object({
    kind: z.literal(SAVE_KIND),
    schema: z.literal(8),
    revision: nonNegative,
    savedState: v8StateSchema,
  })
  .strict();
const v9EnvelopeSchema = z
  .object({
    kind: z.literal(SAVE_KIND),
    schema: z.literal(9),
    revision: nonNegative,
    savedState: v9StateSchema,
  })
  .strict();
function fail(message: string): never {
  throw new Error(`Invalid v10 save: ${message}`);
}

function liveState(state: SavedClearing): Clearing {
  return { ...state, commands: [] };
}

function activityMatchesJob(
  state: SavedClearing,
  actorId: string,
  job: Job,
  task: NonNullable<SavedClearing["actors"][string]["task"]>,
): boolean {
  if (task.kind === "repair-cache")
    return (
      job.kind === "repair-cache" &&
      task.target === job.target &&
      state.sources.some(
        (source) =>
          source.id === job.target &&
          source.kind === "reclaimed-timber-cache" &&
          !source.repaired,
      )
    );
  if (task.kind === "brew-water") {
    const operation = state.operations.find(
      (entry) => entry.id === task.target,
    );
    return (
      job.kind === "fill-kettle" &&
      operation?.job === job.id &&
      operation.actor === actorId &&
      operation.station === job.target &&
      true
    );
  }
  if (task.kind === "transfer") {
    const transfer = state.materials.transfers.find(
      (candidate) => candidate.id === task.target,
    );
    if (!transfer || transfer.actor !== actorId) return false;
    if (transfer.intent.kind === "use" || transfer.owner.kind !== "job")
      return false;
    if (transfer.owner.job !== job.id) return false;
    const destinationId = transfer.intent.destination;
    const resolved = resolveMaterialDestination(state.sites, destinationId);
    const repair = state.sources.find(
      (source) => cacheRepairBuffer(source)?.id === destinationId,
    );
    if (!resolved && !repair) return false;
    return (
      (resolved?.destination.id === destinationId &&
        job.kind === "build" &&
        resolved.site.id === job.target &&
        resolved.destination.id === constructionBuffer(resolved.site).id) ||
      (job.kind === "store" && destinationId === job.destination) ||
      (job.kind === "repair-cache" &&
        repair?.id === job.target &&
        destinationId === cacheRepairBuffer(repair)?.id)
    );
  }
  if (job.kind === "rest")
    return (
      task.kind === "sleep" &&
      job.target === actorId &&
      state.sites.some(
        (site) =>
          site.id === task.target &&
          site.type === "bed" &&
          site.finishedAt !== null,
      )
    );
  if (task.kind !== job.kind || task.target !== job.target) return false;
  return job.kind === "chop"
    ? state.trees.some((tree) => tree.id === job.target)
    : job.kind === "build" || job.kind === "deconstruct"
      ? state.sites.some((site) => site.id === job.target)
      : state.herbs.some((herb) => herb.id === job.target);
}

type SavedSite = SavedClearing["sites"][number];
type SavedLot = SavedClearing["materials"]["lots"][number];
type SavedTransfer = SavedClearing["materials"]["transfers"][number];
type RelationContext = {
  state: SavedClearing;
  jobs: Map<string, Job>;
  sites: Map<string, SavedSite>;
  containers: Map<string, ContainerSpec>;
};

function validateMaterialLots(state: SavedClearing): void {
  const lotIds = new Set<string>();
  for (const lot of state.materials.lots) {
    if (lotIds.has(lot.id)) fail(`duplicate material lot ${lot.id}`);
    lotIds.add(lot.id);
    if (lot.material === "pail" && lot.quantity !== 1)
      fail(`vessel lot ${lot.id} must have quantity 1`);
    if (lot.material === "water" && lot.location.kind !== "container")
      fail(`water lot ${lot.id} must be contained`);
    if (lot.location.kind === "hand" && !state.actors[lot.location.actor])
      fail(`hand lot ${lot.id} has missing actor ${lot.location.actor}`);
    if (lot.location.kind === "ground" && !inside(lot.location))
      fail(`ground lot ${lot.id} is outside the clearing`);
  }
}

function validateVesselUses({ state }: RelationContext): void {
  const ids = new Set<string>(),
    vessels = new Set<string>();
  for (const use of state.materials.vesselUses) {
    if (ids.has(use.id)) fail(`duplicate vessel use ${use.id}`);
    ids.add(use.id);
    if (vessels.has(use.vessel)) fail(`duplicate vessel binding ${use.vessel}`);
    vessels.add(use.vessel);
    const lot = state.materials.lots.find(
      (candidate) => candidate.id === use.vessel,
    );
    if (!lot || lot.material !== "pail" || lot.quantity !== 1)
      fail(`vessel use ${use.id} has invalid pail`);
    const custody = state.materials.transfers.filter(
      (transfer) =>
        transfer.intent.kind === "use" &&
        transfer.intent.operation === use.id &&
        transfer.owner.kind === "operation" &&
        transfer.owner.operation === use.id &&
        (transfer.phase.kind === "reserved"
          ? transfer.phase.sourceLot === use.vessel
          : transfer.phase.lot === use.vessel),
    );
    const operation = state.operations.find((entry) => entry.id === use.id);
    if (!operation || operation.pail !== use.vessel)
      fail(`vessel use ${use.id} has no matching operation`);
    const actor = state.actors[operation.actor];
    const active =
      actor?.task?.kind === "brew-water" &&
      actor.task.target === operation.id &&
      actor.task.job === operation.job &&
      actor.assignment?.task === operation.job;
    if (
      custody.length !== (active ? 1 : 0) ||
      (active && custody[0].actor !== operation.actor)
    )
      fail(`vessel use ${use.id} has invalid executor custody`);
  }
}

function validateSources(state: SavedClearing, requireAll = true): void {
  const problem = finiteSourceProblem(state, requireAll);
  if (problem) fail(problem);
}

function relationContext(state: SavedClearing): RelationContext {
  const jobs = new Map(state.jobs.map((job) => [job.id, job]));
  const sites = new Map(state.sites.map((site) => [site.id, site]));
  if (jobs.size !== state.jobs.length) fail("duplicate job ID");
  if (sites.size !== state.sites.length) fail("duplicate site ID");
  const containers = new Map<string, ContainerSpec>();
  for (const site of state.sites) {
    const buffer = constructionBuffer(site);
    if (site.finishedAt === null) containers.set(buffer.id, buffer);
    if (site.type === "shelf" && site.finishedAt !== null)
      containers.set(shelfContainer(site.id).id, shelfContainer(site.id));
    if (site.type === "brew-station" && site.finishedAt !== null)
      containers.set(brewKettle(site).id, brewKettle(site));
  }
  for (const feature of state.sources) {
    containers.set(sourceContainer(feature.id), sourceContainerSpec(feature));
    const repair = cacheRepairBuffer(feature);
    if (feature.kind === "reclaimed-timber-cache" && !feature.repaired)
      containers.set(repair!.id, repair!);
    const pail = sourcePailContainerSpec(feature);
    if (pail) containers.set(pail.id, pail);
  }
  for (const lot of state.materials.lots) {
    const interior = pailInterior(lot);
    if (interior) containers.set(interior.id, interior);
  }
  return { state, jobs, sites, containers };
}

function validateJobScopes({ state }: RelationContext): void {
  for (const [partyId, party] of Object.entries(state.parties)) {
    if (
      party.id !== partyId ||
      new Set(party.members).size !== party.members.length ||
      party.members.some((member) => !state.actors[member])
    )
      fail(`party ${partyId} has invalid members`);
  }
  for (const job of state.jobs) {
    const party = state.parties[job.scope.party];
    if (!party) fail(`job ${job.id} has missing party`);
    if (
      job.scope.actors !== null &&
      (new Set(job.scope.actors).size !== job.scope.actors.length ||
        job.scope.actors.some((actor) => !party.members.includes(actor)))
    )
      fail(`job ${job.id} has invalid scope`);
  }
}

function validateContainerLots({ state, containers }: RelationContext): void {
  for (const lot of state.materials.lots) {
    if (lot.location.kind !== "container") continue;
    const destination = containers.get(lot.location.container);
    if (!destination)
      fail(
        `container lot ${lot.id} has unknown destination ${lot.location.container}`,
      );
    if (!destination.accepts.includes(lot.material))
      fail(`container lot ${lot.id} has invalid material`);
  }
}

function operationIsActive(
  state: SavedClearing,
  operation: SavedClearing["operations"][number],
): boolean {
  const actor = state.actors[operation.actor];
  return !!(
    actor?.task?.kind === "brew-water" &&
    actor.task.target === operation.id &&
    actor.task.job === operation.job &&
    actor.assignment?.task === operation.job
  );
}

function validateOperationEndpoints(
  { state, sites, containers }: RelationContext,
  operation: SavedClearing["operations"][number],
): void {
  const actor = state.actors[operation.actor];
  const spring = state.sources.find(
    (source) => source.id === operation.spring && source.kind === "spring",
  );
  const station = sites.get(operation.station);
  const pail = state.materials.lots.find((lot) => lot.id === operation.pail);
  if (
    !actor ||
    !spring ||
    !station ||
    station.type !== "brew-station" ||
    station.finishedAt === null ||
    !pail ||
    pail.material !== "pail" ||
    pail.quantity !== 1 ||
    !containers.has(brewKettle(station).id)
  )
    fail(`brew operation ${operation.id} has invalid endpoint`);
}

function validateOperationCustody(
  { state, jobs, sites }: RelationContext,
  operation: SavedClearing["operations"][number],
): void {
  const job = jobs.get(operation.job);
  const station = sites.get(operation.station)!;
  const custody = state.materials.transfers.filter(
    (transfer) =>
      transfer.owner.kind === "operation" &&
      transfer.owner.operation === operation.id,
  );
  const active = operationIsActive(state, operation);
  if (!job || job.kind !== "fill-kettle" || job.target !== station.id)
    fail(`brew operation ${operation.id} lacks fill job`);
  if (custody.length !== (active ? 1 : 0))
    fail(`brew operation ${operation.id} lacks pail custody`);
  const use = state.materials.vesselUses.find(
    (candidate) => candidate.id === operation.id,
  );
  if (
    !use ||
    use.vessel !== operation.pail ||
    (active && custody[0].actor !== operation.actor)
  )
    fail(`brew operation ${operation.id} has invalid pail custody`);
}

function validateOperationWater(
  { state }: RelationContext,
  operation: SavedClearing["operations"][number],
): void {
  const pail = state.materials.lots.find((lot) => lot.id === operation.pail);
  const interior = pail && pailInterior(pail);
  if (!interior) fail(`brew operation ${operation.id} has invalid pail`);
  const water = operation.water
    ? state.materials.lots.find((lot) => lot.id === operation.water)
    : null;
  const interiorWater = state.materials.lots.filter(
    (lot) =>
      lot.material === "water" &&
      lot.location.kind === "container" &&
      lot.location.container === interior.id,
  );
  if (operation.phase === "acquire" || operation.phase === "draw") {
    if (operation.water !== null || interiorWater.length !== 0)
      fail(`brew operation ${operation.id} has premature water`);
  } else if (
    !water ||
    water.material !== "water" ||
    water.quantity !== 2 ||
    water.location.kind !== "container" ||
    water.location.container !== interior.id ||
    interiorWater.length !== 1
  )
    fail(`brew operation ${operation.id} has invalid water custody`);
}

function validateOperations(context: RelationContext): void {
  const { state } = context;
  const ids = new Set<string>();
  for (const operation of state.operations) {
    if (ids.has(operation.id)) fail(`duplicate brew operation ${operation.id}`);
    ids.add(operation.id);
    validateOperationEndpoints(context, operation);
    validateOperationCustody(context, operation);
    validateOperationWater(context, operation);
  }
}

function transferLot(state: SavedClearing, transfer: SavedTransfer): SavedLot {
  const lot = state.materials.lots.find(
    (candidate) =>
      candidate.id ===
      (transfer.phase.kind === "reserved"
        ? transfer.phase.sourceLot
        : transfer.phase.lot),
  );
  if (!lot) fail(`transfer ${transfer.id} has missing material lot`);
  return lot;
}

function validateTransferOwner(
  { state, sites, jobs, containers }: RelationContext,
  transfer: SavedTransfer,
): ContainerSpec | null {
  if (transfer.intent.kind === "use") {
    const operation = transfer.intent.operation;
    const use = state.materials.vesselUses.find(
      (candidate) => candidate.id === operation,
    );
    if (
      !use ||
      transfer.owner.kind !== "operation" ||
      transfer.owner.operation !== use.id ||
      use.vessel !==
        (transfer.phase.kind === "reserved"
          ? transfer.phase.sourceLot
          : transfer.phase.lot)
    )
      fail(`transfer ${transfer.id} has invalid held-use owner`);
    return null;
  }
  if (transfer.owner.kind !== "job")
    fail(`transfer ${transfer.id} has invalid delivery owner`);
  const owner = jobs.get(transfer.owner.job);
  if (!owner) fail(`transfer ${transfer.id} has missing job`);
  const destination = containers.get(transfer.intent.destination);
  if (!destination) fail(`transfer ${transfer.id} has missing destination`);
  const ownerSite =
    owner.kind === "build" ? sites.get(owner.target) : undefined;
  const repairSource =
    owner.kind === "repair-cache"
      ? state.sources.find((source) => source.id === owner.target)
      : undefined;
  if (
    (owner.kind === "build" &&
      (!ownerSite ||
        transfer.intent.destination !== constructionBuffer(ownerSite).id)) ||
    (owner.kind === "store" &&
      transfer.intent.destination !== owner.destination) ||
    (owner.kind === "repair-cache" &&
      (!repairSource ||
        transfer.intent.destination !== cacheRepairBuffer(repairSource)?.id)) ||
    (owner.kind !== "build" &&
      owner.kind !== "store" &&
      owner.kind !== "repair-cache")
  )
    fail(`transfer ${transfer.id} does not match owner destination`);
  if (
    (owner.kind === "build" &&
      (transfer.request.source.kind === "exact-lot" ||
        transfer.request.source.material !== "wood" ||
        transfer.request.quantityPolicy !== "portion")) ||
    (owner.kind === "store" &&
      (transfer.request.source.kind !== "exact-lot" ||
        transfer.request.source.lot !== owner.source ||
        (transfer.request.quantityPolicy !== "whole-lot" &&
          transfer.request.quantityPolicy !== "portion"))) ||
    (owner.kind === "repair-cache" &&
      (transfer.request.source.kind === "exact-lot" ||
        transfer.request.source.material !== "wood" ||
        transfer.request.quantityPolicy !== "portion"))
  )
    fail(`transfer ${transfer.id} does not match owner request`);
  return destination;
}

function validateReservedTransfer(
  { state }: RelationContext,
  transfer: SavedTransfer,
  lot: SavedLot,
  destination: ContainerSpec | null,
  reservedBySource: Map<string, number>,
): void {
  if (transfer.phase.kind !== "reserved") return;
  if (transfer.intent.kind === "use") {
    const operationId = transfer.intent.operation;
    const operation = state.operations.find(
      (candidate) => candidate.id === operationId,
    );
    const use = state.materials.vesselUses.find(
      (candidate) => candidate.id === operationId,
    );
    const actor = state.actors[transfer.actor];
    const active =
      actor?.task?.kind === "brew-water" &&
      actor.task.target === operation?.id &&
      actor.task.job === operation?.job &&
      actor.assignment?.task === operation?.job;
    if (
      !operation ||
      !use ||
      !actor ||
      transfer.owner.kind !== "operation" ||
      transfer.owner.operation !== operation.id ||
      use.vessel !== operation.pail ||
      transfer.phase.sourceLot !== operation.pail ||
      lot.id !== operation.pail ||
      lot.material !== "pail" ||
      lot.quantity !== 1 ||
      transfer.request.source.kind !== "exact-lot" ||
      transfer.request.source.lot !== operation.pail ||
      transfer.request.quantityPolicy !== "whole-lot" ||
      transfer.request.quantity !== 1 ||
      transfer.phase.quantity !== 1 ||
      (transfer.phase.origin.kind === "ground" &&
        (lot.location.kind !== "ground" ||
          !sameCell(lot.location, transfer.phase.origin.cell))) ||
      (transfer.phase.origin.kind === "container" &&
        (lot.location.kind !== "container" ||
          lot.location.container !== transfer.phase.origin.container)) ||
      !active
    )
      fail(
        `reserved held-use transfer ${transfer.id} has invalid pail custody`,
      );
    return;
  }
  if (transfer.owner.kind !== "job")
    fail(`reserved transfer ${transfer.id} has invalid delivery owner`);
  const owner = transfer.owner;
  if (destination && !destination.accepts.includes(lot.material))
    fail(`reserved transfer ${transfer.id} has invalid destination material`);
  if (
    (transfer.phase.origin.kind === "ground" &&
      (lot.location.kind !== "ground" ||
        lot.location.x !== transfer.phase.origin.cell.x ||
        lot.location.z !== transfer.phase.origin.cell.z ||
        lot.location.level !== transfer.phase.origin.cell.level)) ||
    (transfer.phase.origin.kind === "container" &&
      (lot.location.kind !== "container" ||
        lot.location.container !== transfer.phase.origin.container))
  )
    fail(`reserved transfer ${transfer.id} source no longer matches origin`);
  if (transfer.phase.quantity !== transfer.request.quantity)
    fail(`reserved transfer ${transfer.id} has mismatched quantity`);
  if (
    (transfer.request.source.kind === "exact-lot" &&
      transfer.request.source.lot !== lot.id) ||
    (transfer.request.source.kind === "eligible-ground" &&
      (transfer.request.source.material !== lot.material ||
        lot.location.kind !== "ground")) ||
    (transfer.request.source.kind === "eligible-container" &&
      (transfer.request.source.material !== lot.material ||
        lot.location.kind !== "container" ||
        lot.location.container !== transfer.request.source.container))
  )
    fail(`reserved transfer ${transfer.id} has invalid source`);
  const reserved =
    (reservedBySource.get(lot.id) ?? 0) + transfer.phase.quantity;
  if (reserved > lot.quantity)
    fail(`reserved source ${lot.id} exceeds quantity`);
  reservedBySource.set(lot.id, reserved);
  const actor = state.actors[transfer.actor];
  if (
    !actor.task ||
    actor.task.kind !== "transfer" ||
    actor.task.target !== transfer.id ||
    actor.task.job !== owner.job ||
    !actor.assignment ||
    actor.assignment.character !== actor.id ||
    actor.assignment.task !== owner.job
  )
    fail(`reserved transfer ${transfer.id} lacks matching actor task`);
}

function validateCarryingTransfer(
  transfer: SavedTransfer,
  lot: SavedLot,
  destination: ContainerSpec | null,
): void {
  if (transfer.phase.kind !== "carrying") return;
  if (lot.location.kind !== "hand" || lot.location.actor !== transfer.actor)
    fail(`carrying transfer ${transfer.id} has invalid hand lot`);
  if (lot.quantity !== transfer.request.quantity)
    fail(`carrying transfer ${transfer.id} has mismatched quantity`);
  if (
    (transfer.request.source.kind === "exact-lot" &&
      transfer.request.source.lot !== lot.id) ||
    (transfer.request.source.kind === "eligible-ground" &&
      transfer.request.source.material !== lot.material) ||
    (transfer.request.source.kind === "eligible-container" &&
      transfer.request.source.material !== lot.material) ||
    (destination !== null && !destination.accepts.includes(lot.material))
  )
    fail(`carrying transfer ${transfer.id} has invalid material`);
}

function validateTransfers(context: RelationContext): void {
  const { state } = context;
  const transferIds = new Set<string>();
  for (const transfer of state.materials.transfers) {
    if (transferIds.has(transfer.id)) fail(`duplicate transfer ${transfer.id}`);
    transferIds.add(transfer.id);
  }
  transferIds.clear();
  const actorsWithTransfer = new Set<string>();
  const owners = new Set<string>();
  const reservedBySource = new Map<string, number>();
  for (const transfer of state.materials.transfers) {
    transferIds.add(transfer.id);
    if (!state.actors[transfer.actor])
      fail(`transfer ${transfer.id} has missing actor`);
    if (actorsWithTransfer.has(transfer.actor))
      fail(`actor ${transfer.actor} has multiple transfers`);
    actorsWithTransfer.add(transfer.actor);
    const ownerKey =
      transfer.owner.kind === "job"
        ? `job/${transfer.owner.job}/${transfer.owner.step}`
        : `operation/${transfer.owner.operation}`;
    if (owners.has(ownerKey)) fail(`duplicate transfer owner ${ownerKey}`);
    owners.add(ownerKey);
    const destination = validateTransferOwner(context, transfer);
    const lot = transferLot(state, transfer);
    validateCarryingTransfer(transfer, lot, destination);
    if (
      destination &&
      (!destination.accepts.includes(lot.material) ||
        transfer.request.quantity *
          (destination.bulk[lot.material] ?? Infinity) >
          destination.capacity)
    )
      fail(`transfer ${transfer.id} exceeds destination capacity`);
    validateReservedTransfer(
      context,
      transfer,
      lot,
      destination,
      reservedBySource,
    );
  }
}

function validateContainerCapacity({
  state,
  containers,
}: RelationContext): void {
  for (const destination of containers.values()) {
    const occupied = state.materials.lots
      .filter(
        (lot) =>
          lot.location.kind === "container" &&
          lot.location.container === destination.id,
      )
      .reduce(
        (sum, lot) =>
          sum + lot.quantity * (destination.bulk[lot.material] ?? Infinity),
        0,
      );
    const incoming = state.materials.transfers
      .filter(
        (transfer) =>
          transfer.intent.kind === "deliver" &&
          transfer.intent.destination === destination.id,
      )
      .reduce(
        (sum, transfer) =>
          sum +
          transfer.request.quantity *
            (destination.bulk[transferLot(state, transfer).material] ??
              Infinity),
        0,
      );
    if (occupied + incoming > destination.capacity)
      fail(`container ${destination.id} exceeds capacity`);
  }
}

function validateActorJobRelations({ state, jobs }: RelationContext): void {
  for (const actor of Object.values(state.actors)) {
    if (!inside(actor) || actor.path.some((cell) => !inside(cell)))
      fail(`actor ${actor.id} has an invalid path`);
    if (actor.task) {
      const taskJob = jobs.get(actor.task.job);
      if (!taskJob) fail(`actor ${actor.id} has missing task job`);
      if (
        !actor.assignment ||
        actor.assignment.character !== actor.id ||
        actor.assignment.task !== actor.task.job
      )
        fail(`actor ${actor.id} task and assignment disagree`);
      const party = state.parties[taskJob.scope.party];
      if (
        !party.members.includes(actor.id) ||
        (taskJob.scope.actors !== null &&
          !taskJob.scope.actors.includes(actor.id)) ||
        !activityMatchesJob(state, actor.id, taskJob, actor.task)
      )
        fail(`actor ${actor.id} has inconsistent task activity`);
    } else if (actor.assignment) {
      fail(`actor ${actor.id} has assignment without task`);
    }
  }
}

function validateHandCustody({ state }: RelationContext): void {
  for (const lot of state.materials.lots)
    if (lot.location.kind === "hand") {
      const actorId = lot.location.actor;
      const carrying = state.materials.transfers.filter(
        (transfer) =>
          transfer.actor === actorId &&
          transfer.phase.kind === "carrying" &&
          transfer.phase.lot === lot.id,
      );
      if (carrying.length !== 1)
        fail(`hand lot ${lot.id} lacks unique transfer custody`);
    }
}

function validateEmbeddings({ state, sites }: RelationContext): void {
  const embeddedContainers = new Set<string>();
  for (const entry of state.materials.embedded) {
    const siteId = entry.container.replace("construction-buffer:", "");
    const site = sites.get(siteId);
    if (
      !site ||
      site.finishedAt === null ||
      entry.container !== constructionBuffer(site).id ||
      entry.material !== "wood" ||
      entry.quantity !== BUILDINGS[site.type].wood ||
      embeddedContainers.has(entry.container)
    )
      fail(`embedded material has unknown container ${entry.container}`);
    embeddedContainers.add(entry.container);
  }
}

function validateSiteTopology({ state }: RelationContext): void {
  for (const site of state.sites) {
    if (!footprint(site).every(inside))
      fail(`site ${site.id} is outside the clearing`);
    if (
      site.finishedAt !== null &&
      state.materials.embedded.filter(
        (entry) => entry.container === constructionBuffer(site).id,
      ).length !== 1
    )
      fail(`finished site ${site.id} lacks construction embedding`);
    if (site.type === "floor" && !floorSupported(liveState(state), site))
      fail(`unsupported floor ${site.id}`);
    if (
      site.type === "roof" &&
      site.finishedAt !== null &&
      !roofSupported(liveState(state), site)
    )
      fail(`unsupported roof ${site.id}`);
  }
}

function validateConservation({ state }: RelationContext): void {
  const wood =
    state.materials.lots.reduce(
      (sum, lot) => sum + (lot.material === "wood" ? lot.quantity : 0),
      0,
    ) +
    state.materials.embedded.reduce(
      (sum, entry) => sum + (entry.material === "wood" ? entry.quantity : 0),
      0,
    ) +
    state.materials.consumedWood;
  const reclaimedWood = state.sources
    .filter((source) => source.kind === "reclaimed-timber-cache")
    .reduce((sum, source) => sum + sourceContainerSpec(source).capacity, 0);
  if (wood !== state.felled * 6 + reclaimedWood)
    fail(
      `wood conservation is ${wood}, expected ${state.felled * 6 + reclaimedWood}`,
    );
  const mugwort =
    state.materials.lots.reduce(
      (sum, lot) => sum + (lot.material === "mugwort" ? lot.quantity : 0),
      0,
    ) +
    state.materials.embedded.reduce(
      (sum, entry) => sum + (entry.material === "mugwort" ? entry.quantity : 0),
      0,
    );
  if (mugwort !== state.harvestedHerbs)
    fail(
      `mugwort conservation is ${mugwort}, expected ${state.harvestedHerbs}`,
    );
  const water = state.materials.lots.reduce(
    (sum, lot) => sum + (lot.material === "water" ? lot.quantity : 0),
    0,
  );
  const springWater = state.sources
    .filter((source) => source.kind === "spring")
    .reduce((sum, source) => sum + sourceContainerSpec(source).capacity, 0);
  if (water !== springWater)
    fail(`water conservation is ${water}, expected ${springWater}`);
}

function validateRelations(
  state: SavedClearing,
  requireFiniteSources = true,
): SavedClearing {
  validateMaterialLots(state);
  validateSources(state, requireFiniteSources);
  const context = relationContext(state);
  validateJobScopes(context);
  validateContainerLots(context);
  validateOperations(context);
  validateVesselUses(context);
  validateTransfers(context);
  validateContainerCapacity(context);
  validateActorJobRelations(context);
  validateHandCustody(context);
  validateEmbeddings(context);
  validateSiteTopology(context);
  validateConservation(context);
  return state;
}
function validateClearing(value: unknown): SerializedClearing {
  return validateRelations(savedSchema.parse(value));
}

/** Schema 8 had only delivery transfers and no finite source features. */
function convertV8State(predecessor: V8SavedClearing): SavedClearing {
  const state: Clearing = {
    ...predecessor,
    materials: {
      ...predecessor.materials,
      vesselUses: [],
      transfers: predecessor.materials.transfers.map((transfer) => ({
        ...transfer,
        owner: {
          kind: "job" as const,
          job: transfer.owner.job,
          step: transfer.owner.step,
        },
        request: {
          source: transfer.request.source,
          quantityPolicy: transfer.request.quantityPolicy,
          quantity: transfer.request.quantity,
        },
        intent: {
          kind: "deliver" as const,
          destination: transfer.request.destination,
        },
      })),
    },
    sources: [],
    pendingSources: [],
    operations: [],
    commands: [],
  };
  const { commands: _predecessorCommands, ...beforeIntroduction } = state;
  validateRelations(beforeIntroduction, false);
  introduceFiniteSources(state);
  const { commands: _commands, ...saved } = state;
  return saved;
}
/** Schema 9 introduced the finite providers but predates repair/use operations. */
function convertV9State(predecessor: V9SavedClearing): SavedClearing {
  if (
    predecessor.sources.some(
      (source) =>
        (source.kind === "spring" && source.access !== "open") ||
        (source.kind === "reclaimed-timber-cache" &&
          source.access !== "sealed"),
    )
  )
    fail("schema 9 source has invalid access");
  const state: Clearing = {
    ...predecessor,
    sources: predecessor.sources.map((source) =>
      source.kind === "spring"
        ? { ...source, kind: "spring" as const, access: "open" as const }
        : {
            ...source,
            kind: "reclaimed-timber-cache" as const,
            access: "sealed" as const,
            repaired: false,
          },
    ),
    operations: [],
    commands: [],
  };
  const { commands: _commands, ...saved } = state;
  validateRelations(saved);
  return saved;
}

function validateSaveEnvelope(value: unknown): SaveEnvelope {
  if (
    typeof value === "object" &&
    value !== null &&
    "schema" in value &&
    value.schema === SAVE_SCHEMA
  ) {
    const current = envelopeSchema.parse(value);
    return {
      ...current,
      savedState: validateRelations(current.savedState),
    };
  }
  if (
    typeof value === "object" &&
    value !== null &&
    "schema" in value &&
    value.schema === 9
  ) {
    const predecessor = v9EnvelopeSchema.parse(value);
    return {
      kind: SAVE_KIND,
      schema: SAVE_SCHEMA,
      revision: predecessor.revision,
      savedState: validateRelations(convertV9State(predecessor.savedState)),
    };
  }
  const predecessor = v8EnvelopeSchema.parse(value);
  const migrated = convertV8State(predecessor.savedState);
  return {
    kind: SAVE_KIND,
    schema: SAVE_SCHEMA,
    revision: predecessor.revision,
    savedState: validateRelations(migrated),
  };
}
export function snapshotFor(state: Clearing): SaveEnvelope {
  const { commands: _commands, ...savedState } = structuredClone(state);
  return {
    kind: SAVE_KIND,
    schema: SAVE_SCHEMA,
    revision: 0,
    savedState: validateClearing(savedState),
  };
}
export function restoreSnapshot(value: unknown): {
  state: Clearing;
  revision: number;
} {
  const value7 = validateSaveEnvelope(value);
  return {
    state: {
      ...structuredClone(value7.savedState),
      commands: [],
      paused: true,
    },
    revision: value7.revision,
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
  return (await database).get(SAVE_STORE, SAVE_KEY);
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
  expected: number,
): SaveRevisionDecision {
  if (current === undefined)
    return expected === 0
      ? { kind: "write", revision: 1 }
      : { kind: "stale", currentRevision: 0 };
  try {
    const revision = validateSaveEnvelope(current).revision;
    return revision === expected
      ? { kind: "write", revision: revision + 1 }
      : { kind: "stale", currentRevision: revision };
  } catch {
    return { kind: "malformed" };
  }
}
export function decideReplaceRevision(
  current: unknown,
  expected: number,
  mode: "cas" | "discardMalformed" = "cas",
): ReplaceRevisionDecision {
  if (current === undefined)
    return mode === "cas" && expected === 0
      ? { kind: "write", revision: 1 }
      : { kind: "stale", currentRevision: 0 };
  try {
    const revision = validateSaveEnvelope(current).revision;
    return mode === "discardMalformed"
      ? { kind: "stale", currentRevision: revision }
      : revision === expected
        ? { kind: "write", revision: revision + 1 }
        : { kind: "stale", currentRevision: revision };
  } catch {
    return mode === "discardMalformed"
      ? { kind: "write", revision: 1 }
      : { kind: "malformed" };
  }
}
export async function saveWorld(
  state: Clearing,
  expected: number,
): Promise<{ revision: number }> {
  return write(state, expected, "cas");
}
export async function replaceWorld(
  state: Clearing,
  expected: number,
  mode: "cas" | "discardMalformed" = "cas",
): Promise<{ revision: number }> {
  return write(state, expected, mode);
}
async function write(
  state: Clearing,
  expected: number,
  mode: "cas" | "discardMalformed",
): Promise<{ revision: number }> {
  if (!database) throw new Error("IndexedDB is unavailable.");
  const db = await database,
    tx = db.transaction(SAVE_STORE, "readwrite"),
    decision =
      mode === "cas"
        ? decideSaveRevision(await tx.store.get(SAVE_KEY), expected)
        : decideReplaceRevision(await tx.store.get(SAVE_KEY), expected, mode);
  if (decision.kind !== "write") {
    tx.abort();
    throw new Error(decision.kind);
  }
  await tx.store.put(
    { ...snapshotFor(state), revision: decision.revision },
    SAVE_KEY,
  );
  await tx.done;
  return { revision: decision.revision };
}
