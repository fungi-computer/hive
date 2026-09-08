import { openDB } from "idb";
import { z } from "zod";
import type { Clearing, Job, PositiveInt } from "./model.ts";
import { inside } from "./world.js";
import {
  BUILDINGS,
  constructionBuffer,
  floorSupported,
  footprint,
  resolveMaterialDestination,
  roofSupported,
  shelfContainer,
} from "./construction.js";
import type { ContainerSpec } from "./materials.ts";

const SAVE_KIND = "hive-local-world" as const;
const SAVE_SCHEMA = 7 as const;
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
      kind: z.literal("transfer"),
      source: id,
      destination: id,
    })
    .strict(),
  z.object({ ...jobBase, kind: z.literal("rest"), target: id }).strict(),
]);
const lot = z
  .object({
    id,
    material: z.enum(["wood", "mugwort"]),
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
          material: z.enum(["wood", "mugwort"]),
        })
        .strict(),
      z.object({ kind: z.literal("exact-lot"), lot: id }).strict(),
    ]),
    quantityPolicy: z.enum(["whole-lot", "portion"]),
    quantity: positive,
    destination: id,
  })
  .strict();
const transfer = z
  .object({
    id,
    actor: id,
    owner: z.object({ job: id, step: z.string().min(1) }).strict(),
    request,
    phase: z.discriminatedUnion("kind", [
      z
        .object({
          kind: z.literal("reserved"),
          sourceLot: id,
          quantity: positive,
        })
        .strict(),
      z.object({ kind: z.literal("carrying"), lot: id }).strict(),
    ]),
  })
  .strict();
const site = cell
  .extend({
    id,
    type: z.enum(["wall", "door", "roof", "bed", "shelf", "floor", "stair"]),
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
        lots: z.array(lot),
        transfers: z.array(transfer),
        embedded: z.array(
          z
            .object({
              container: id,
              material: z.enum(["wood", "mugwort"]),
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
function fail(message: string): never {
  throw new Error(`Invalid v7 save: ${message}`);
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
  if (task.kind === "transfer") {
    const transfer = state.materials.transfers.find(
      (candidate) => candidate.id === task.target,
    );
    const resolved = transfer
      ? resolveMaterialDestination(state.sites, transfer.request.destination)
      : null;
    if (!transfer || !resolved) return false;
    return (
      transfer.actor === actorId &&
      transfer.owner.job === job.id &&
      resolved.destination.id === transfer.request.destination &&
      ((job.kind === "build" &&
        resolved.site.id === job.target &&
        resolved.destination.id === constructionBuffer(resolved.site).id) ||
        (job.kind === "transfer" &&
          transfer.request.destination === job.destination))
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
    if (lot.location.kind === "hand" && !state.actors[lot.location.actor])
      fail(`hand lot ${lot.id} has missing actor ${lot.location.actor}`);
    if (lot.location.kind === "ground" && !inside(lot.location))
      fail(`ground lot ${lot.id} is outside the clearing`);
  }
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
  { sites, jobs }: RelationContext,
  transfer: SavedTransfer,
): ContainerSpec {
  const owner = jobs.get(transfer.owner.job);
  if (!owner) fail(`transfer ${transfer.id} has missing job`);
  const resolved = resolveMaterialDestination(
    [...sites.values()],
    transfer.request.destination,
  );
  if (!resolved) fail(`transfer ${transfer.id} has missing destination`);
  const destination = resolved.destination;
  const ownerSite =
    owner.kind === "build" ? sites.get(owner.target) : undefined;
  if (
    (owner.kind === "build" &&
      (!ownerSite ||
        transfer.request.destination !== constructionBuffer(ownerSite).id)) ||
    (owner.kind === "transfer" &&
      transfer.request.destination !== owner.destination) ||
    (owner.kind !== "build" && owner.kind !== "transfer")
  )
    fail(`transfer ${transfer.id} does not match owner destination`);
  if (
    (owner.kind === "build" &&
      (transfer.request.source.kind !== "eligible-ground" ||
        transfer.request.source.material !== "wood" ||
        transfer.request.quantityPolicy !== "portion")) ||
    (owner.kind === "transfer" &&
      (transfer.request.source.kind !== "exact-lot" ||
        transfer.request.source.lot !== owner.source ||
        transfer.request.quantityPolicy !== "whole-lot" ||
        transfer.request.quantity !== 1))
  )
    fail(`transfer ${transfer.id} does not match owner request`);
  if (transfer.request.quantity > destination.capacity)
    fail(`transfer ${transfer.id} exceeds destination capacity`);
  return destination;
}

function validateReservedTransfer(
  { state }: RelationContext,
  transfer: SavedTransfer,
  lot: SavedLot,
  reservedBySource: Map<string, number>,
): void {
  if (transfer.phase.kind !== "reserved") return;
  if (lot.location.kind !== "ground")
    fail(`reserved transfer ${transfer.id} source is not ground`);
  if (transfer.phase.quantity !== transfer.request.quantity)
    fail(`reserved transfer ${transfer.id} has mismatched quantity`);
  if (
    (transfer.request.source.kind === "exact-lot" &&
      transfer.request.source.lot !== lot.id) ||
    (transfer.request.source.kind === "eligible-ground" &&
      transfer.request.source.material !== lot.material)
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
    actor.task.job !== transfer.owner.job ||
    !actor.assignment ||
    actor.assignment.character !== actor.id ||
    actor.assignment.task !== transfer.owner.job
  )
    fail(`reserved transfer ${transfer.id} lacks matching actor task`);
}

function validateCarryingTransfer(
  transfer: SavedTransfer,
  lot: SavedLot,
  destination: ContainerSpec,
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
    !destination.accepts.includes(lot.material)
  )
    fail(`carrying transfer ${transfer.id} has invalid material`);
}

function validateTransfers(context: RelationContext): void {
  const { state, jobs } = context;
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
    if (!jobs.has(transfer.owner.job))
      fail(`transfer ${transfer.id} has missing job`);
    const ownerKey = `${transfer.owner.job}/${transfer.owner.step}`;
    if (owners.has(ownerKey)) fail(`duplicate transfer owner ${ownerKey}`);
    owners.add(ownerKey);
    const destination = validateTransferOwner(context, transfer);
    const lot = transferLot(state, transfer);
    validateReservedTransfer(context, transfer, lot, reservedBySource);
    validateCarryingTransfer(transfer, lot, destination);
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
      .reduce((sum, lot) => sum + lot.quantity, 0);
    const incoming = state.materials.transfers
      .filter((transfer) => transfer.request.destination === destination.id)
      .reduce((sum, transfer) => sum + transfer.request.quantity, 0);
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
      entry.quantity !== constructionBuffer(site).capacity ||
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
  if (wood !== state.felled * 6)
    fail(`wood conservation is ${wood}, expected ${state.felled * 6}`);
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
}

function validateRelations(state: SavedClearing): SavedClearing {
  validateMaterialLots(state);
  const context = relationContext(state);
  validateJobScopes(context);
  validateContainerLots(context);
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
function validateSaveEnvelope(value: unknown): SaveEnvelope {
  const parsed = envelopeSchema.parse(value);
  return { ...parsed, savedState: validateRelations(parsed.savedState) };
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
