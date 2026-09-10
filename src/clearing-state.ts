import { navigationStateProblem } from "./navigation-space.ts";
import { placementFooting, insidePlacement } from "./game-space.ts";
import { footingSchema } from "./engine/world/footing.ts";
import { traversalSchema } from "./engine/navigation/schema.ts";
import { materialContainerFacts } from "./material-container-facts.ts";
import {
  deconstructionTargetProblem,
  TERRAIN_WORK_TICKS,
} from "./physical-completion.ts";
import { waterConservationProblem } from "./field-water.ts";
import { waterSupplySchema, waterSupplyProblem } from "./water-supply.ts";
import { materialPortionsSchema } from "./engine/materials/index.ts";
import {
  workProgressSchema,
  workProgressProblem,
} from "./engine/work/index.ts";
import { validateMaterialState } from "./materials.ts";
import { z } from "zod";
import type {
  Clearing,
  Job,
  PositiveInt,
  WaterDeliveryOperation,
} from "./model.ts";
import {
  parseTerrain,
  terrainColumn,
  terrainCell,
  terrainDigProblem,
  voxelSchema,
  terrainFacts,
  terrainExcavatedColumns,
} from "./terrain.ts";
import { STEP_SECONDS } from "./ticker.js";
import { inside, sameCell, terrainEditProblem } from "./world.js";
import {
  BUILDINGS,
  constructionBuffer,
  floorSupported,
  footprint,
  resolveMaterialDestination,
  roofSupported,
  siteMaterialEndpoint,
} from "./construction.js";
import {
  containerQuantity,
  sourceContainer,
  type ContainerSpec,
} from "./materials.ts";
import { portableContainerInterior } from "./item-containers.ts";
import {
  finiteSourceProblem,
  FINITE_SOURCE_DEFINITIONS,
  cacheRepairBuffer,
  sourceContainerSpec,
} from "./finite-sources.ts";
import {
  recipeDefinition,
  recipeOutputAction,
  recipeOutputActionForWire,
  recipeOutputConsumptionAction,
} from "./recipes.ts";
import {
  resolveWaterDelivery,
  waterDeliveryQuantity,
  waterDeliveryTargetForJob,
} from "./water-delivery.ts";
import { MUGWORT_ESTABLISHMENT_WATER } from "./herbs.ts";
import { careConsumptionDefinition, careIntentsConflict } from "./needs.ts";

const SAVE_KIND = "hive-local-world" as const;
const SAVE_SCHEMA = 22 as const;
const finite = z.number().finite();
const integer = finite.int();
const nonNegative = integer.min(0);
const nonNegativeScalar = finite.min(0);
const positive = integer
  .min(1)
  .transform((value): PositiveInt => value as PositiveInt);
const id = z.string().min(1);
/** Recipe identities are structurally open; definitions check supported IDs. */
const recipeId = id.transform(
  (value) => value as import("./model.ts").RecipeId,
);
const cell = footingSchema;
const placement = z.object({ x: integer, z: integer, level: integer }).strict();
const scope = z
  .object({ party: id, actors: z.array(id).min(1).nullable() })
  .strict();
const allowedWork = z
  .object({
    chop: z.boolean(),
    haul: z.boolean(),
    build: z.boolean(),
    garden: z.boolean(),
    craft: z.boolean(),
  })
  .strict();
const currentActivityKind = <Kind extends string>(kind: Kind) =>
  z
    .object({ job: id, target: id, duration: positive, kind: z.literal(kind) })
    .strict();
const activity = z.discriminatedUnion("kind", [
  currentActivityKind("chop"),
  currentActivityKind("build"),
  currentActivityKind("deconstruct"),
  currentActivityKind("sow"),
  currentActivityKind("harvest"),
  currentActivityKind("transfer"),
  currentActivityKind("sleep"),
  currentActivityKind("repair-cache"),
  currentActivityKind("water-delivery"),
  currentActivityKind("brew"),
  currentActivityKind("tap"),
  currentActivityKind("clear-spent-grain"),
  currentActivityKind("dig"),
  currentActivityKind("consume"),
]);
const actor = cell
  .extend({
    needs: z
      .object({
        advancedAt: nonNegative,
        nourishment: nonNegativeScalar.max(100),
        hydration: nonNegativeScalar.max(100),
        rest: nonNegativeScalar.max(100),
      })
      .strict(),
    id,
    name: z.string(),
    figure: z.string(),
    dir: integer,
    mode: z.enum([
      "consume",
      "dig",
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
      "water-delivery",
      "brew",
      "tap",
      "clear-spent-grain",
    ]),
    traversal: traversalSchema.nullable(),
    navigationProfile: z.enum(["upright", "small"]),
    work: nonNegative,
    drafted: z.boolean(),
    workDisposition: z.enum(["continue", "interrupt-at-footing"]),
    routine: z.boolean(),
    allowedWork,
    task: activity.nullable(),
    assignment: z
      .object({ character: id, task: id, cost: finite })
      .strict()
      .nullable(),
  })
  .strict();
const jobBase = {
  id,
  lifecycle: z.enum(["active", "canceling"]),
  scope,
  reason: z.string(),
  routine: z.boolean(),
};
const careJob = z
  .object({
    id,
    lifecycle: z.enum(["active", "canceling"]),
    kind: z.literal("care"),
    target: id,
    need: z.enum(["nourishment", "hydration", "rest"]),
    policy: z.enum(["automatic", "manual-rest", "routine-rest"]),
    reason: z.string(),
    routine: z.boolean(),
  })
  .strict();
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
  z
    .object({
      ...jobBase,
      kind: z.literal("clear-spent-grain"),
      target: id,
      transformation: id,
      progress: nonNegative,
    })
    .strict(),
  z.object({ ...jobBase, kind: z.literal("rest"), target: id }).strict(),
  z
    .object({ ...jobBase, kind: z.literal("repair-cache"), target: id })
    .strict(),
  z.object({ ...jobBase, kind: z.literal("fill-kettle"), target: id }).strict(),
  z.object({ ...jobBase, kind: z.literal("brew"), target: id }).strict(),
  z
    .object({
      ...jobBase,
      kind: z.literal("tap"),
      target: id,
      transformation: id,
      progress: nonNegative,
    })
    .strict(),
  z
    .object({ ...jobBase, kind: z.literal("water-mugwort"), target: id })
    .strict(),
  z.object({ ...jobBase, kind: z.literal("dig"), voxel: voxelSchema }).strict(),
  careJob,
]);
const recipeMaterial = z.enum([
  "wood",
  "mugwort",
  "water",
  "pail",
  "malt",
  "barm",
  "keg",
  "ale",
  "spent-grain",
]);
const material = z.enum([...recipeMaterial.options, "soil", "ration"]);
const sinkMaterial = z.enum([...recipeMaterial.options, "ration"]);
const lot = z
  .object({
    id,
    material,
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
    resolvedMaterial: material,
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
const site = placement
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
const brewProcess = z
  .object({
    id,
    job: id,
    station: id,
    binding: id,
    phase: z.enum(["prepare", "ferment", "keg"]),
    progress: nonNegative,
    enteredAt: nonNegative,
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
const herb = cell
  .extend({
    id,
    kind: z.literal("mugwort"),
    stage: z.enum(["ordered", "planted", "growing", "ready"]),
    work: nonNegative,
    establishment: z
      .discriminatedUnion("kind", [
        z.object({ kind: z.literal("legacy"), at: nonNegative }).strict(),
        z
          .object({ kind: z.literal("water"), at: nonNegative, receipt: id })
          .strict(),
      ])
      .nullable(),
    plantedAt: nonNegative.nullable(),
  })
  .strict();
const waterOperation = z
  .object({
    id,
    job: id,
    supply: waterSupplySchema,
    pail: id,
    quantity: positive,
    execution: workProgressSchema,
    kind: z.literal("water-delivery"),
    target: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("kettle"), station: id }).strict(),
      z.object({ kind: z.literal("mugwort"), herb: id }).strict(),
      z.object({ kind: z.literal("hydration"), actor: id }).strict(),
    ]),
  })
  .strict();
const consumeOperation = z
  .object({
    kind: z.literal("consume"),
    id,
    job: id,
    actor: id,
    definition: id,
    execution: workProgressSchema,
  })
  .strict();
const currentStateSchema = z
  .object({
    terrain: z.unknown().transform(parseTerrain),
    careOutcomes: z.array(
      z
        .object({
          id,
          receipt: id,
          actor: id,
          need: z.enum(["nourishment", "hydration"]),
          definition: id,
          amount: nonNegativeScalar,
          tick: nonNegative,
        })
        .strict(),
    ),
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
        traversal: traversalSchema.nullable(),
        navigationProfile: z.enum(["upright", "small"]),
        work: nonNegative,
        nextMove: nonNegative,
      })
      .strict(),
    trees: z.array(
      cell
        .extend({ id, work: nonNegative, felledAt: nonNegative.nullable() })
        .strict(),
    ),
    herbs: z.array(herb),
    materials: z
      .object({
        lots: z.array(lot),
        transfers: z.array(transfer),
        bindings: z.array(
          z.discriminatedUnion("kind", [
            z
              .object({
                kind: z.literal("operation-use"),
                id,
                lot: id,
                quantity: positive,
              })
              .strict(),
            z
              .object({ kind: z.literal("vessel-use"), id, vessel: id })
              .strict(),
            z
              .object({
                kind: z.literal("recipe"),
                id,
                definition: recipeId,
                station: id,
                consumed: z.array(
                  z
                    .object({
                      role: id,
                      lot: id,
                      material: recipeMaterial,
                      quantity: positive,
                    })
                    .strict(),
                ),
                retained: z.array(
                  z
                    .object({
                      role: id,
                      lot: id,
                      material: recipeMaterial,
                      quantity: positive,
                    })
                    .strict(),
                ),
                promises: z.array(
                  z
                    .object({
                      role: id,
                      destination: id,
                      material: recipeMaterial,
                      quantity: positive,
                    })
                    .strict(),
                ),
              })
              .strict(),
          ]),
        ),
        transformations: z.array(
          z
            .object({
              id,
              definition: recipeId,
              inputs: z.array(
                z
                  .object({
                    role: id,
                    lot: id,
                    material: recipeMaterial,
                    quantity: positive,
                  })
                  .strict(),
              ),
              settlement: z
                .object({
                  station: id,
                  retained: z.array(
                    z
                      .object({
                        role: id,
                        lot: id,
                        material: recipeMaterial,
                        quantity: positive,
                      })
                      .strict(),
                  ),
                  outputs: z.array(
                    z
                      .object({
                        role: id,
                        destination: id,
                        material: recipeMaterial,
                        quantity: positive,
                      })
                      .strict(),
                  ),
                })
                .strict()
                .nullable()
                .default(null),
            })
            .strict(),
        ),
        consumptions: z
          .array(
            z
              .object({
                id,
                transformation: id,
                role: id,
                material: recipeMaterial,
                quantity: positive,
              })
              .strict(),
          )
          .default([]),
        embedded: z.array(
          z
            .object({
              container: id,
              material: z.enum(["wood", "mugwort"]),
              quantity: positive,
            })
            .strict(),
        ),
        sinks: z
          .array(
            z
              .object({ id, material: sinkMaterial, quantity: positive })
              .strict(),
          )
          .default([]),
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
    operations: z.array(
      z.discriminatedUnion("kind", [waterOperation, consumeOperation]),
    ),
    processes: z.array(brewProcess),
    jobs: z.array(job),
    workDirty: z.boolean(),
    felled: nonNegative,
    finishedJobs: nonNegative,
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
type SavedWaterOperation = WaterDeliveryOperation;
const savedSchema = currentStateSchema.transform(
  (value): SavedClearing => value as SavedClearing,
);
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
  throw new Error(`Invalid Hive save: ${message}`);
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
  if (task.kind === "water-delivery") {
    const operation = state.operations.find(
      (entry) => entry.id === task.target,
    );
    return (
      (job.kind === "fill-kettle" ||
        job.kind === "water-mugwort" ||
        (job.kind === "care" && job.need === "hydration")) &&
      operation?.job === job.id &&
      state.materials.transfers.some(
        (transfer) =>
          transfer.actor === actorId &&
          transfer.owner.kind === "operation" &&
          transfer.owner.operation === operation.id,
      )
    );
  }
  if (task.kind === "consume") {
    const operation = state.operations.find(
      (
        entry,
      ): entry is Extract<
        Clearing["operations"][number],
        { kind: "consume" }
      > => entry.kind === "consume" && entry.id === task.target,
    );
    return (
      job.kind === "care" &&
      job.need === "nourishment" &&
      job.target === actorId &&
      operation?.job === job.id &&
      operation.actor === actorId
    );
  }
  if (task.kind === "brew") {
    const process = state.processes.find((entry) => entry.id === task.target);
    return (
      job.kind === "brew" &&
      process?.job === job.id &&
      (process.phase === "prepare" || process.phase === "keg") &&
      process.station === job.target
    );
  }
  if (task.kind === "tap" || task.kind === "clear-spent-grain") {
    const transformation = state.materials.transformations.find(
      (entry) => entry.id === task.target && entry.settlement !== null,
    );
    return (
      job.kind === task.kind &&
      job.transformation === task.target &&
      transformation !== undefined
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
        destinationId === cacheRepairBuffer(repair)?.id) ||
      (job.kind === "brew" &&
        resolved?.site.id === job.target &&
        resolved.destination.id === destinationId)
    );
  }
  if (job.kind === "care" && job.need === "rest")
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
  if (job.kind === "dig")
    return task.kind === job.kind && task.target === job.id;
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
  for (const lot of state.materials.lots) {
    if (lot.location.kind === "hand" && !state.actors[lot.location.actor])
      fail(`hand lot ${lot.id} has missing actor ${lot.location.actor}`);
    if (lot.location.kind === "ground" && !inside(lot.location))
      fail(`ground lot ${lot.id} is outside the clearing`);
  }
}

function validateMaterialBindings({
  state,
  containers,
}: RelationContext): void {
  for (const use of state.materials.bindings) {
    if (use.kind === "recipe") {
      const definition = recipeDefinition(use.definition);
      const transformation = state.materials.transformations.find(
        (entry) => entry.id === use.id,
      );
      const station = state.sites.find(
        (site) =>
          site.type === "brew-station" &&
          site.finishedAt !== null &&
          siteMaterialEndpoint(site, definition.stationSlot)?.destination.id ===
            use.station,
      );
      const requiresStaging = state.processes.some(
        (process) => process.binding === use.id,
      );
      if (
        use.consumed.length < definition.consumed.length ||
        use.consumed.some(
          (portion) =>
            !definition.consumed.some(
              (requirement) => requirement.role === portion.role,
            ),
        ) ||
        use.retained.length !== definition.retained.length ||
        use.promises.length !== definition.promises.length
      )
        fail(`recipe binding ${use.id} has invalid roles`);
      for (const requirement of definition.consumed) {
        const portions = use.consumed.filter(
          (portion) => portion.role === requirement.role,
        );
        const destination =
          station &&
          siteMaterialEndpoint(station, requirement.slot)?.destination;
        if (
          portions.length === 0 ||
          portions.some(
            (portion) => portion.material !== requirement.material,
          ) ||
          portions.reduce((sum, portion) => sum + portion.quantity, 0) !==
            requirement.quantity
        )
          fail(
            `recipe binding ${use.id} has invalid consumed role ${requirement.role}`,
          );
        for (const portion of portions) {
          const lot = state.materials.lots.find(
            (candidate) => candidate.id === portion.lot,
          );
          const consumed = transformation?.inputs.some(
            (input) =>
              input.role === portion.role &&
              input.lot === portion.lot &&
              input.material === portion.material &&
              input.quantity === portion.quantity,
          );
          if (
            (!lot && !consumed) ||
            (lot &&
              (lot.material !== portion.material ||
                lot.quantity < portion.quantity ||
                lot.location.kind === "hand" ||
                (requiresStaging &&
                  !transformation &&
                  (!destination ||
                    lot.location.kind !== "container" ||
                    lot.location.container !== destination.id))))
          )
            fail(
              `recipe binding ${use.id} has invalid consumed lot ${portion.lot}`,
            );
        }
      }
      for (const requirement of definition.retained) {
        const retained = use.retained.find(
          (entry) => entry.role === requirement.role,
        );
        const destination =
          station &&
          siteMaterialEndpoint(station, requirement.slot)?.destination;
        const lot =
          retained &&
          state.materials.lots.find(
            (candidate) => candidate.id === retained.lot,
          );
        if (
          !retained ||
          retained.material !== requirement.material ||
          retained.quantity !== requirement.quantity ||
          !lot ||
          lot.material !== retained.material ||
          lot.quantity !== retained.quantity ||
          lot.location.kind === "hand" ||
          (requiresStaging &&
            (!destination ||
              lot.location.kind !== "container" ||
              lot.location.container !== destination.id))
        )
          fail(
            `recipe binding ${use.id} has invalid retained ${retained?.lot}`,
          );
      }
      for (const requirement of definition.promises) {
        const promise = use.promises.find(
          (entry) => entry.role === requirement.role,
        );
        const expected =
          station && requirement.destination.kind === "station-slot"
            ? siteMaterialEndpoint(station, requirement.destination.slot)
                ?.destination.id
            : (() => {
                const retained = use.retained.find(
                  (entry) =>
                    requirement.destination.kind === "retained-interior" &&
                    entry.role === requirement.destination.role,
                );
                return retained ? `vessel:${retained.lot}` : null;
              })();
        const destination = promise && containers.get(promise.destination);
        if (
          !promise ||
          promise.material !== requirement.material ||
          promise.quantity !== requirement.quantity ||
          !expected ||
          promise.destination !== expected ||
          !destination ||
          !destination.accepts.includes(promise.material)
        )
          fail(
            `recipe binding ${use.id} has invalid promise ${requirement.role}`,
          );
      }
      continue;
    }
    if (use.kind === "operation-use") {
      const operation = state.operations.find(
        (
          entry,
        ): entry is Extract<
          SavedClearing["operations"][number],
          { kind: "consume" }
        > => entry.kind === "consume" && entry.id === use.id,
      );
      const definition =
        operation && careConsumptionDefinition(operation.definition);
      const lot = state.materials.lots.find(
        (candidate) => candidate.id === use.lot,
      );
      if (
        !operation ||
        !definition ||
        definition.consume.kind !== "held-lot" ||
        use.quantity !== definition.consume.quantity ||
        !lot ||
        lot.material !== definition.consume.material ||
        lot.quantity < use.quantity
      )
        fail(`operation use ${use.id} has invalid bound portion`);
      continue;
    }
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
    const operation = state.operations.find(
      (entry): entry is SavedWaterOperation =>
        entry.kind === "water-delivery" && entry.id === use.id,
    );
    if (!operation || operation.pail !== use.vessel)
      fail(`vessel use ${use.id} has no matching operation`);
    const active = operationIsActive(state, operation);
    if (custody.length !== (active ? 1 : 0))
      fail(`vessel use ${use.id} has invalid executor custody`);
  }
}

function matchingRecipeEntries(
  left: readonly {
    role: string;
    lot: string;
    material: string;
    quantity: number;
  }[],
  right: readonly {
    role: string;
    lot: string;
    material: string;
    quantity: number;
  }[],
): boolean {
  const count = (entries: typeof left) => {
    const result = new Map<string, number>();
    for (const entry of entries) {
      const key = `${entry.role}\u0000${entry.lot}\u0000${entry.material}\u0000${entry.quantity}`;
      result.set(key, (result.get(key) ?? 0) + 1);
    }
    return result;
  };
  const first = count(left),
    second = count(right);
  return (
    first.size === second.size &&
    [...first].every(([key, quantity]) => second.get(key) === quantity)
  );
}

function recipeRolesMatch(
  entries: readonly { role: string; material: string; quantity: number }[],
  requirements: readonly { role: string; material: string; quantity: number }[],
): boolean {
  return (
    entries.length === requirements.length &&
    requirements.every((requirement) => {
      const matches = entries.filter(
        (entry) => entry.role === requirement.role,
      );
      return (
        matches.length === 1 &&
        matches[0].material === requirement.material &&
        matches[0].quantity === requirement.quantity
      );
    })
  );
}

function recipePortionsMatch(
  entries: readonly { role: string; material: string; quantity: number }[],
  requirements: readonly { role: string; material: string; quantity: number }[],
): boolean {
  return (
    entries.length >= requirements.length &&
    requirements.every((requirement) => {
      const portions = entries.filter(
        (entry) => entry.role === requirement.role,
      );
      return (
        portions.length > 0 &&
        portions.every((entry) => entry.material === requirement.material) &&
        portions.reduce((total, entry) => total + entry.quantity, 0) ===
          requirement.quantity
      );
    }) &&
    entries.every((entry) =>
      requirements.some((requirement) => requirement.role === entry.role),
    )
  );
}

function settledTransformationMatchesDefinition(
  state: SavedClearing,
  transformation: NonNullable<
    SavedClearing["materials"]["transformations"][number]
  >,
): boolean {
  const settlement = transformation.settlement;
  if (!settlement) return false;
  const definition = recipeDefinition(transformation.definition);
  const station = state.sites.find(
    (site) =>
      site.type === "brew-station" &&
      site.finishedAt !== null &&
      siteMaterialEndpoint(site, definition.stationSlot)?.destination.id ===
        settlement.station,
  );
  if (
    !station ||
    !recipePortionsMatch(transformation.inputs, definition.consumed) ||
    !recipeRolesMatch(settlement.retained, definition.retained) ||
    !recipeRolesMatch(settlement.outputs, definition.promises)
  )
    return false;
  return definition.promises.every((promise) => {
    const output = settlement.outputs.find(
      (entry) => entry.role === promise.role,
    );
    let destination: string | null | undefined;
    if (promise.destination.kind === "station-slot")
      destination = siteMaterialEndpoint(station, promise.destination.slot)
        ?.destination.id;
    else {
      const retainedRole = promise.destination.role;
      const retained = settlement.retained.find(
        (entry) => entry.role === retainedRole,
      );
      destination = retained ? `vessel:${retained.lot}` : null;
    }
    return output?.destination === destination;
  });
}

function validateTransformations({ state }: RelationContext): void {
  const ids = new Set<string>();
  for (const transformation of state.materials.transformations) {
    if (ids.has(transformation.id))
      fail(`duplicate transformation ${transformation.id}`);
    ids.add(transformation.id);
    const binding = state.materials.bindings.find(
      (candidate): candidate is Extract<typeof candidate, { kind: "recipe" }> =>
        candidate.kind === "recipe" && candidate.id === transformation.id,
    );
    if (
      binding
        ? binding.definition !== transformation.definition ||
          transformation.settlement !== null ||
          !matchingRecipeEntries(transformation.inputs, binding.consumed)
        : !settledTransformationMatchesDefinition(state, transformation)
    )
      fail(`transformation ${transformation.id} does not match recipe binding`);
  }
}

/** Settled output may move later; this durable receipt is its only consumption ledger. */
function validateRecipeConsumptions({ state }: RelationContext): void {
  const ids = new Set<string>();
  const consumed = new Map<string, number>();
  for (const entry of state.materials.consumptions) {
    if (ids.has(entry.id)) fail(`duplicate recipe consumption ${entry.id}`);
    ids.add(entry.id);
    const transformation = state.materials.transformations.find(
      (candidate) => candidate.id === entry.transformation,
    );
    if (!transformation?.settlement)
      fail(`recipe consumption ${entry.id} lacks settled transformation`);
    const definition = recipeDefinition(transformation.definition);
    const output = transformation.settlement.outputs.find(
      (candidate) =>
        candidate.role === entry.role && candidate.material === entry.material,
    );
    const action = recipeOutputConsumptionAction(
      definition,
      entry.role,
      entry.material,
    );
    if (!output || !action || action.quantity !== entry.quantity)
      fail(`recipe consumption ${entry.id} has invalid output`);
    const key = `${entry.transformation}/${entry.role}`;
    const total = (consumed.get(key) ?? 0) + entry.quantity;
    if (total > output.quantity)
      fail(`recipe consumption ${entry.id} exceeds settled output`);
    consumed.set(key, total);
  }
}

function validateRecipeOutputJobs({ state }: RelationContext): void {
  const actions = new Set<string>();
  for (const job of state.jobs) {
    if (job.kind !== "tap" && job.kind !== "clear-spent-grain") continue;
    const label = job.kind === "clear-spent-grain" ? "clear" : job.kind;
    const key = `${job.kind}/${job.transformation}`;
    if (actions.has(key)) fail(`duplicate recipe output job for ${key}`);
    actions.add(key);
    const transformation = state.materials.transformations.find(
      (entry) => entry.id === job.transformation,
    );
    const station = state.sites.find(
      (site) =>
        site.id === job.target &&
        site.type === "brew-station" &&
        site.finishedAt !== null,
    );
    if (!transformation?.settlement || !station)
      fail(`${label} job ${job.id} lacks settled station receipt`);
    const definition = recipeDefinition(transformation.definition);
    const action = recipeOutputAction(
      definition,
      recipeOutputActionForWire(job.kind),
    );
    const stationEndpoint = siteMaterialEndpoint(
      station,
      definition.stationSlot,
    )?.destination.id;
    const promise = definition.promises.find(
      (entry) =>
        entry.role === action.outputRole && entry.material === action.material,
    );
    const output = transformation.settlement.outputs.find(
      (entry) =>
        entry.role === action.outputRole && entry.material === action.material,
    );
    const consumed = state.materials.consumptions.reduce(
      (total, entry) =>
        total +
        (entry.transformation === transformation.id &&
        entry.role === action.outputRole
          ? entry.quantity
          : 0),
      0,
    );
    const liveOutput = state.materials.lots.some(
      (lot) =>
        lot.material === action.material &&
        lot.location.kind === "container" &&
        lot.location.container === output?.destination &&
        lot.quantity >= action.quantity,
    );
    if (
      !output ||
      !promise ||
      promise.material !== action.material ||
      transformation.settlement.station !== stationEndpoint ||
      job.progress >= action.ticks ||
      consumed + action.quantity > output.quantity ||
      !liveOutput
    )
      fail(`${label} job ${job.id} has invalid station or progress`);
    const prerequisite = action.requiresOutputExhausted;
    if (!prerequisite) continue;
    const requiredOutput = transformation.settlement.outputs.find(
      (entry) =>
        entry.role === prerequisite.outputRole &&
        entry.material === prerequisite.material,
    );
    const requiredConsumed = state.materials.consumptions.reduce(
      (total, entry) =>
        total +
        (entry.transformation === transformation.id &&
        entry.role === prerequisite.outputRole
          ? entry.quantity
          : 0),
      0,
    );
    if (
      !requiredOutput ||
      requiredConsumed < requiredOutput.quantity ||
      containerQuantity(
        state.materials,
        requiredOutput.destination,
        prerequisite.material,
      ) > 0
    )
      fail(`${label} job ${job.id} has unmet output prerequisite`);
  }
}

function validateSources(state: SavedClearing): void {
  const problem = finiteSourceProblem(state);
  if (problem) fail(problem);
}

function relationContext(state: SavedClearing): RelationContext {
  const jobs = new Map(state.jobs.map((job) => [job.id, job]));
  const sites = new Map(state.sites.map((site) => [site.id, site]));
  if (jobs.size !== state.jobs.length) fail("duplicate job ID");
  if (sites.size !== state.sites.length) fail("duplicate site ID");
  const containers = new Map(
    materialContainerFacts(liveState(state)).map((container) => [
      container.id,
      container,
    ]),
  );
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
  const careJobs: Extract<SavedClearing["jobs"][number], { kind: "care" }>[] =
    [];
  for (const job of state.jobs) {
    if (job.kind === "care") {
      if (
        !state.actors[job.target] ||
        careJobs.some((existing) => careIntentsConflict(existing, job)) ||
        (job.policy === "automatic" && job.routine) ||
        (job.policy === "manual-rest" &&
          (job.need !== "rest" || job.routine)) ||
        (job.policy === "routine-rest" && (job.need !== "rest" || !job.routine))
      )
        fail(`care job ${job.id} has invalid actor or intent policy`);
      careJobs.push(job);
      continue;
    }
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

function validateMaterialSinks({ state }: RelationContext): void {
  const ids = new Set<string>();
  for (const sink of state.materials.sinks) {
    if (ids.has(sink.id)) fail(`duplicate material sink ${sink.id}`);
    ids.add(sink.id);
  }
}

function validateHerbEstablishments({ state }: RelationContext): void {
  const sinks = new Map(state.materials.sinks.map((sink) => [sink.id, sink]));
  const linkedReceipts = new Set<string>();
  const careOutcomeIds = new Set<string>();
  for (const herb of state.herbs) {
    const establishment = herb.establishment;
    if (establishment === null) {
      if (herb.stage === "growing" || herb.stage === "ready")
        fail(`herb ${herb.id} grows without establishment`);
      continue;
    }
    if (establishment.at > state.tick || herb.stage === "ordered")
      fail(`herb ${herb.id} has invalid establishment`);
    if (establishment.kind === "legacy") continue;
    const sink = sinks.get(establishment.receipt);
    if (
      !sink ||
      sink.material !== "water" ||
      sink.quantity !== MUGWORT_ESTABLISHMENT_WATER ||
      linkedReceipts.has(establishment.receipt)
    )
      fail(`herb ${herb.id} has invalid water establishment receipt`);
    linkedReceipts.add(establishment.receipt);
  }
  for (const outcome of state.careOutcomes) {
    const sink = sinks.get(outcome.receipt);
    const definition = careConsumptionDefinition(outcome.definition);
    const operationId = outcome.receipt.endsWith("-sink")
      ? outcome.receipt.slice(0, -"-sink".length)
      : null;
    if (
      !sink ||
      !definition ||
      linkedReceipts.has(outcome.receipt) ||
      careOutcomeIds.has(outcome.id) ||
      operationId === null ||
      outcome.id !== `care-outcome:${operationId}` ||
      state.operations.some((operation) => operation.id === operationId) ||
      outcome.tick > state.tick ||
      !state.actors[outcome.actor] ||
      outcome.need !== definition.effect.need ||
      outcome.amount !== definition.effect.amount ||
      sink.material !== definition.consume.material ||
      sink.quantity !== definition.consume.quantity
    )
      fail(`care outcome ${outcome.id} has invalid receipt`);
    careOutcomeIds.add(outcome.id);
    linkedReceipts.add(outcome.receipt);
  }
  for (const sink of state.materials.sinks)
    if (
      (sink.material === "water" || sink.material === "ration") &&
      !linkedReceipts.has(sink.id)
    )
      fail(`material sink ${sink.id} has no settled consumer`);
}

function operationIsActive(
  state: SavedClearing,
  operation: SavedWaterOperation,
): boolean {
  return state.materials.transfers.some((transfer) => {
    const actor = state.actors[transfer.actor];
    return (
      transfer.owner.kind === "operation" &&
      transfer.owner.operation === operation.id &&
      actor?.task?.kind === "water-delivery" &&
      actor.task.target === operation.id &&
      actor.task.job === operation.job &&
      actor.assignment?.task === operation.job
    );
  });
}

function validateOperationEndpoints(
  { state }: RelationContext,
  operation: SavedWaterOperation,
): void {
  const pail = state.materials.lots.find((lot) => lot.id === operation.pail);
  const delivery = resolveWaterDelivery(liveState(state), operation.target);
  if (
    !delivery ||
    delivery.quantity !== operation.quantity ||
    !pail ||
    pail.material !== "pail" ||
    pail.quantity !== 1
  )
    fail(`water operation ${operation.id} has invalid endpoint`);
  if (operation.execution.phase !== "deliver") {
    const problem = waterSupplyProblem(
      liveState(state),
      operation.pail,
      operation.quantity,
      operation.supply,
    );
    if (problem) fail(`water operation ${operation.id}: ${problem}`);
  }
}

function validateOperationCustody(
  { state, jobs }: RelationContext,
  operation: SavedWaterOperation,
): void {
  const job = jobs.get(operation.job);
  const custody = state.materials.transfers.filter(
    (transfer) =>
      transfer.owner.kind === "operation" &&
      transfer.owner.operation === operation.id,
  );
  const active = operationIsActive(state, operation);
  const expected = job && waterDeliveryTargetForJob(liveState(state), job);
  if (
    !job ||
    !expected ||
    expected.kind !== operation.target.kind ||
    (expected.kind === "kettle" &&
      operation.target.kind === "kettle" &&
      expected.station !== operation.target.station) ||
    (expected.kind === "mugwort" &&
      operation.target.kind === "mugwort" &&
      expected.herb !== operation.target.herb) ||
    (expected.kind === "hydration" &&
      operation.target.kind === "hydration" &&
      expected.actor !== operation.target.actor)
  )
    fail(`water operation ${operation.id} lacks delivery job`);
  if (custody.length !== (active ? 1 : 0))
    fail(`brew operation ${operation.id} lacks pail custody`);
  const use = state.materials.bindings.find(
    (
      candidate,
    ): candidate is Extract<typeof candidate, { kind: "vessel-use" }> =>
      candidate.kind === "vessel-use" && candidate.id === operation.id,
  );
  if (!use || use.vessel !== operation.pail)
    fail(`water operation ${operation.id} has invalid pail custody`);
}

function validateOperationWater(
  { state }: RelationContext,
  operation: SavedWaterOperation,
): void {
  const pail = state.materials.lots.find((lot) => lot.id === operation.pail);
  const interior = pail && portableContainerInterior(pail);
  if (!interior) fail(`water operation ${operation.id} has invalid pail`);
  if (
    workProgressProblem(operation.execution, {
      kind: "vessel",
      interruption: "park",
    })
  )
    fail(`invalid vessel progress ${operation.id}`);
  if (operation.execution.phase !== "deliver") return;
  const parsed = materialPortionsSchema.safeParse(operation.execution.contents);
  if (
    !parsed.success ||
    parsed.data.reduce((sum, portion) => sum + portion.quantity, 0) !==
      operation.quantity
  )
    fail(`water operation ${operation.id} has invalid water promise`);
  for (const portion of parsed.data) {
    const lot = state.materials.lots.find((lot) => lot.id === portion.lot);
    if (
      !lot ||
      lot.material !== "water" ||
      lot.quantity < portion.quantity ||
      lot.location.kind !== "container" ||
      lot.location.container !== interior.id
    )
      fail(`water operation ${operation.id} has invalid water custody`);
  }
}

function validateOperations(context: RelationContext): void {
  const { state } = context;
  const ids = new Set<string>();
  const consumeJobs = new Set<string>();
  const consumeActors = new Set<string>();
  for (const operation of state.operations) {
    if (ids.has(operation.id))
      fail(`duplicate water operation ${operation.id}`);
    ids.add(operation.id);
    if (operation.kind === "water-delivery") {
      validateOperationEndpoints(context, operation);
      validateOperationCustody(context, operation);
      validateOperationWater(context, operation);
    } else {
      const job = state.jobs.find((job) => job.id === operation.job);
      const definition = careConsumptionDefinition(operation.definition);
      const transfers = state.materials.transfers.filter(
        (entry) =>
          entry.owner.kind === "operation" &&
          entry.owner.operation === operation.id,
      );
      const bindings = state.materials.bindings.filter(
        (entry) => entry.kind === "operation-use" && entry.id === operation.id,
      );
      const actor = state.actors[operation.actor];
      if (
        !job ||
        job.kind !== "care" ||
        job.target !== operation.actor ||
        !definition ||
        definition.consume.kind !== "held-lot" ||
        job.need !== definition.effect.need ||
        !actor ||
        actor.task?.kind !== "consume" ||
        actor.task.target !== operation.id ||
        actor.task.job !== operation.job ||
        actor.assignment?.character !== operation.actor ||
        actor.assignment.task !== operation.job ||
        transfers.length !== 1 ||
        transfers[0].actor !== operation.actor ||
        bindings.length !== 1 ||
        consumeJobs.has(operation.job) ||
        consumeActors.has(operation.actor)
      )
        fail(`consume operation ${operation.id} has invalid custody`);
      if (
        workProgressProblem(operation.execution, {
          kind: "portion",
          interruption: "release",
          attendTicks: definition!.attendTicks!,
        })
      )
        fail(`invalid portion progress ${operation.id}`);
      if (actor!.work !== 0)
        fail(`consume progress must belong to operation ${operation.id}`);
      if (
        (operation.execution.phase === "attend") !==
        (transfers[0].phase.kind === "carrying")
      )
        fail(`consume progress disagrees with custody ${operation.id}`);
      consumeJobs.add(operation.job);
      consumeActors.add(operation.actor);
    }
  }
}

function brewProcessJobAndStation(
  state: SavedClearing,
  process: SavedClearing["processes"][number],
) {
  const job = state.jobs.find(
    (
      candidate,
    ): candidate is Extract<(typeof state.jobs)[number], { kind: "brew" }> =>
      candidate.id === process.job && candidate.kind === "brew",
  );
  const station = state.sites.find(
    (site) =>
      site.id === process.station &&
      site.type === "brew-station" &&
      site.finishedAt !== null,
  );
  return job && job.target === process.station && station ? station : null;
}

function brewProcessBindingDefinition(
  state: SavedClearing,
  process: SavedClearing["processes"][number],
) {
  const binding = state.materials.bindings.find(
    (
      candidate,
    ): candidate is Extract<
      (typeof state.materials.bindings)[number],
      { kind: "recipe" }
    > => candidate.kind === "recipe" && candidate.id === process.binding,
  );
  return binding
    ? {
        binding,
        definition: recipeDefinition(binding.definition),
        transformed: state.materials.transformations.some(
          (entry) => entry.id === process.binding,
        ),
      }
    : null;
}

function brewProcessPhaseValid(
  process: SavedClearing["processes"][number],
  transformed: boolean,
  prepare: number,
  ferment: number,
  keg: number,
): boolean {
  return (
    (process.phase === "prepare" &&
      !transformed &&
      process.progress <= prepare) ||
    (process.phase === "ferment" &&
      transformed &&
      process.progress <= ferment) ||
    (process.phase === "keg" && transformed && process.progress <= keg)
  );
}

function validateBrewProcesses({ state }: RelationContext): void {
  const ids = new Set<string>(),
    stations = new Set<string>(),
    jobs = new Set<string>();
  for (const process of state.processes) {
    if (ids.has(process.id)) fail(`duplicate brew process ${process.id}`);
    ids.add(process.id);
    if (stations.has(process.station) || jobs.has(process.job))
      fail(`duplicate brew process ownership ${process.id}`);
    stations.add(process.station);
    jobs.add(process.job);
    const station = brewProcessJobAndStation(state, process);
    const recipe = brewProcessBindingDefinition(state, process);
    const stationContainer =
      station && recipe
        ? siteMaterialEndpoint(station, recipe.definition.stationSlot)
            ?.destination.id
        : null;
    if (
      !station ||
      !recipe ||
      recipe.binding.station !== stationContainer ||
      process.id !== process.binding ||
      !brewProcessPhaseValid(
        process,
        recipe.transformed,
        recipe.definition.timings.prepare,
        recipe.definition.timings.ferment,
        recipe.definition.timings.keg,
      )
    )
      fail(`brew process ${process.id} has invalid phase or binding`);
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
    const operationId = transfer.intent.operation;
    const operation = state.operations.find(
      (candidate) => candidate.id === operationId,
    );
    if (operation?.kind === "consume") {
      const definition = careConsumptionDefinition(operation.definition);
      const use = state.materials.bindings.find(
        (
          candidate,
        ): candidate is Extract<typeof candidate, { kind: "operation-use" }> =>
          candidate.kind === "operation-use" && candidate.id === operationId,
      );
      if (
        !use ||
        !definition ||
        definition.consume.kind !== "held-lot" ||
        transfer.owner.kind !== "operation" ||
        transfer.owner.operation !== operationId ||
        transfer.actor !== operation.actor ||
        (transfer.phase.kind === "reserved"
          ? transfer.phase.sourceLot
          : transfer.phase.lot) !== use.lot ||
        use.quantity !== definition.consume.quantity ||
        transfer.request.source.kind !== "exact-lot" ||
        transfer.request.quantityPolicy !== "portion" ||
        transfer.request.quantity !== definition.consume.quantity
      )
        fail(`consume operation ${operationId} has invalid custody`);
      return null;
    }
    const water = operation?.kind === "water-delivery" ? operation : null;
    const use = state.materials.bindings.find(
      (
        candidate,
      ): candidate is Extract<typeof candidate, { kind: "vessel-use" }> =>
        candidate.kind === "vessel-use" && candidate.id === operationId,
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
      owner.kind !== "repair-cache" &&
      owner.kind !== "brew")
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
        transfer.request.quantityPolicy !== "portion")) ||
    (owner.kind === "brew" && transfer.request.source.kind !== "exact-lot")
  )
    fail(`transfer ${transfer.id} does not match owner request`);
  return destination;
}

function validateReservedTransfer(
  { state }: RelationContext,
  transfer: SavedTransfer,
  lot: SavedLot,
): void {
  if (transfer.phase.kind !== "reserved") return;
  if (transfer.intent.kind === "use") {
    const operationId = transfer.intent.operation;
    const operation = state.operations.find(
      (candidate) => candidate.id === operationId,
    );
    if (operation?.kind === "consume") {
      const definition = careConsumptionDefinition(operation.definition);
      const use = state.materials.bindings.find(
        (
          candidate,
        ): candidate is Extract<typeof candidate, { kind: "operation-use" }> =>
          candidate.kind === "operation-use" && candidate.id === operation.id,
      );
      const actor = state.actors[operation.actor];
      const active =
        actor?.task?.kind === "consume" &&
        actor.task.target === operation.id &&
        actor.task.job === operation.job &&
        actor.assignment?.character === actor.id &&
        actor.assignment.task === operation.job;
      if (
        !definition ||
        definition.consume.kind !== "held-lot" ||
        !use ||
        !actor ||
        !active ||
        transfer.actor !== operation.actor ||
        transfer.owner.kind !== "operation" ||
        transfer.owner.operation !== operation.id ||
        transfer.phase.sourceLot !== use.lot ||
        lot.id !== use.lot ||
        lot.material !== definition.consume.material ||
        use.quantity !== definition.consume.quantity ||
        transfer.request.source.kind !== "exact-lot" ||
        transfer.request.source.lot !== lot.id ||
        transfer.request.quantityPolicy !== "portion" ||
        transfer.request.quantity !== definition.consume.quantity ||
        transfer.phase.quantity !== definition.consume.quantity ||
        (transfer.phase.origin.kind === "ground" &&
          (lot.location.kind !== "ground" ||
            !sameCell(lot.location, transfer.phase.origin.cell))) ||
        (transfer.phase.origin.kind === "container" &&
          (lot.location.kind !== "container" ||
            lot.location.container !== transfer.phase.origin.container))
      )
        fail(`reserved consume transfer ${transfer.id} has invalid custody`);
      return;
    }
    const water = operation?.kind === "water-delivery" ? operation : null;
    const use = state.materials.bindings.find(
      (
        candidate,
      ): candidate is Extract<typeof candidate, { kind: "vessel-use" }> =>
        candidate.kind === "vessel-use" && candidate.id === operationId,
    );
    const actor = state.actors[transfer.actor];
    const active =
      actor?.task?.kind === "water-delivery" &&
      actor.task.target === operation?.id &&
      actor.task.job === operation?.job &&
      actor.assignment?.task === operation?.job;
    if (
      !water ||
      !use ||
      !actor ||
      transfer.owner.kind !== "operation" ||
      transfer.owner.operation !== water.id ||
      use.vessel !== water.pail ||
      transfer.phase.sourceLot !== water.pail ||
      lot.id !== water.pail ||
      lot.material !== "pail" ||
      lot.quantity !== 1 ||
      transfer.request.source.kind !== "exact-lot" ||
      transfer.request.source.lot !== water.pail ||
      transfer.request.quantityPolicy !== "whole-lot" ||
      transfer.request.quantity !== 1 ||
      transfer.phase.quantity !== 1 ||
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

function validateTransfers(context: RelationContext): void {
  const { state } = context;
  for (const transfer of state.materials.transfers) {
    if (!state.actors[transfer.actor])
      fail(`transfer ${transfer.id} has missing actor`);
    validateTransferOwner(context, transfer);
    validateReservedTransfer(context, transfer, transferLot(state, transfer));
  }
}

function validateActorJobRelations({ state, jobs }: RelationContext): void {
  for (const actor of Object.values(state.actors)) {
    if (!inside(actor)) fail(`actor ${actor.id} has an invalid path`);
    if (actor.task) {
      const taskJob = jobs.get(actor.task.job);
      if (!taskJob) fail(`actor ${actor.id} has missing task job`);
      if (
        !actor.assignment ||
        actor.assignment.character !== actor.id ||
        actor.assignment.task !== actor.task.job
      )
        fail(`actor ${actor.id} task and assignment disagree`);
      if (
        taskJob.lifecycle === "canceling" &&
        actor.workDisposition !== "interrupt-at-footing"
      )
        fail(
          `canceling job ${taskJob.id} has an actor without pending cleanup`,
        );
      const care = taskJob.kind === "care";
      const party = care ? null : state.parties[taskJob.scope.party];
      if (
        (!care && !party?.members.includes(actor.id)) ||
        (!care &&
          taskJob.scope.actors !== null &&
          !taskJob.scope.actors.includes(actor.id)) ||
        (care && taskJob.target !== actor.id) ||
        !activityMatchesJob(state, actor.id, taskJob, actor.task)
      )
        fail(`actor ${actor.id} has inconsistent task activity`);
    } else if (actor.assignment) {
      fail(`actor ${actor.id} has assignment without task`);
    }
  }
  for (const job of state.jobs)
    if (
      job.lifecycle === "canceling" &&
      !Object.values(state.actors).some((actor) => actor.task?.job === job.id)
    )
      fail(`canceling job ${job.id} has no pending actor`);
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
    if (!footprint(site).every(insidePlacement))
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
  const transformed = (material: string) =>
    state.materials.transformations.reduce(
      (sum, transformation) =>
        sum +
        transformation.inputs.reduce(
          (inputs, input) =>
            inputs + (input.material === material ? input.quantity : 0),
          0,
        ),
      0,
    );
  const wood =
    state.materials.lots.reduce(
      (sum, lot) => sum + (lot.material === "wood" ? lot.quantity : 0),
      0,
    ) +
    state.materials.embedded.reduce(
      (sum, entry) => sum + (entry.material === "wood" ? entry.quantity : 0),
      0,
    ) +
    state.materials.consumedWood +
    transformed("wood");
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
    ) +
    transformed("mugwort");
  if (mugwort !== state.harvestedHerbs)
    fail(
      `mugwort conservation is ${mugwort}, expected ${state.harvestedHerbs}`,
    );
  const waterProblem = waterConservationProblem(state);
  if (waterProblem) fail(waterProblem);
  const activeDefinitions = FINITE_SOURCE_DEFINITIONS;
  const rationPerCache = activeDefinitions
    .filter((definition) => definition.kind === "reclaimed-timber-cache")
    .flatMap((definition) => definition.initial)
    .reduce(
      (sum, initial) =>
        sum + (initial.material === "ration" ? initial.quantity : 0),
      0,
    );
  const ration =
    state.materials.lots.reduce(
      (sum, lot) => sum + (lot.material === "ration" ? lot.quantity : 0),
      0,
    ) +
    state.materials.sinks.reduce(
      (sum, sink) => sum + (sink.material === "ration" ? sink.quantity : 0),
      0,
    );
  const expectedRations =
    state.sources.filter((source) => source.kind === "reclaimed-timber-cache")
      .length * rationPerCache;
  if (ration !== expectedRations)
    fail(`ration conservation is ${ration}, expected ${expectedRations}`);
  const soil = state.materials.lots.reduce(
    (sum, lot) => sum + (lot.material === "soil" ? lot.quantity : 0),
    0,
  );
  if (soil !== state.terrain.exports.length)
    fail(
      `soil conservation is ${soil}, expected ${state.terrain.exports.length}`,
    );
}

function validateTerrain({ state }: RelationContext): void {
  const facts = terrainFacts(state.terrain);
  if (Math.abs(facts.timeS - state.tick * STEP_SECONDS) > 1e-8)
    fail("terrain and game clocks disagree");
  const navigationProblem = navigationStateProblem(liveState(state));
  if (navigationProblem) fail(navigationProblem);
  validateDigTargets(state);
}

/** An unfinished structure always retains positive remaining build work. */
function validateSiteWork({ state }: RelationContext): void {
  for (const site of state.sites)
    if (site.finishedAt === null && site.work >= BUILDINGS[site.type].ticks)
      fail(`unfinished structure ${site.id} has completed work`);
}

/** Actor-local progress cannot record a physical completion without settlement. */
function validateActorPhysicalWork({ state }: RelationContext): void {
  for (const actor of Object.values(state.actors)) {
    const task = actor.task;
    if (!task) continue;
    if (task.kind === "dig") {
      if (actor.work >= TERRAIN_WORK_TICKS)
        fail(`actor ${actor.id} has completed excavation progress`);
      continue;
    }
    if (task.kind !== "build" && task.kind !== "deconstruct") continue;
    const site = state.sites.find((site) => site.id === task.target);
    if (!site) continue; // The actor/job reference validator owns missing targets.
    const required =
      task.kind === "build"
        ? BUILDINGS[site.type].ticks
        : BUILDINGS[site.type].deconstructTicks;
    if (actor.work >= required)
      fail(`actor ${actor.id} has completed ${task.kind} progress`);
  }
}

/** Identity survives temporary occupancy; only settlement checks removal access. */
function validateDeconstructionTargets({ state }: RelationContext): void {
  for (const job of state.jobs) {
    if (job.kind !== "deconstruct") continue;
    const problem = deconstructionTargetProblem(
      liveState(state),
      job.target,
      job.id,
    );
    if (problem) fail(`deconstruction job ${job.id}: ${problem}`);
  }
}
/** Admitted exact work retains one live target, independently of occupancy. */
function validateDigTargets(state: SavedClearing): void {
  const targets = new Set<string>();
  for (const job of state.jobs) {
    if (job.kind !== "dig") continue;
    const key = job.voxel.join();
    if (targets.has(key)) fail(`duplicate terrain job target ${key}`);
    targets.add(key);
    const problem = terrainDigProblem(state.terrain, job.voxel);
    if (problem) fail(`terrain job ${job.id}: ${problem}`);
    const at = placementFooting(terrainColumn(job.voxel));
    if (!inside(at)) fail(`terrain job ${job.id} is outside the clearing`);
  }
}

function validateRelations(state: SavedClearing): SavedClearing {
  validateMaterialLots(state);
  validateSources(state);
  const context = relationContext(state);
  validateJobScopes(context);
  validateMaterialSinks(context);
  validateHerbEstablishments(context);
  validateOperations(context);
  validateMaterialBindings(context);
  validateTransformations(context);
  validateRecipeConsumptions(context);
  validateBrewProcesses(context);
  validateRecipeOutputJobs(context);
  validateMaterialState(state.materials, [...context.containers.values()]);
  validateTransfers(context);
  validateActorJobRelations(context);
  validateEmbeddings(context);
  validateSiteTopology(context);
  validateTerrain(context);
  validateSiteWork(context);
  validateActorPhysicalWork(context);
  validateDeconstructionTargets(context);
  validateConservation(context);
  return state;
}
export function parseSerializedClearing(value: unknown): SerializedClearing {
  return validateRelations(savedSchema.parse(value));
}

function validateSaveEnvelope(value: unknown): SaveEnvelope {
  const current = envelopeSchema.parse(value);
  return { ...current, savedState: validateRelations(current.savedState) };
}
/** Current physical/game facts only. Browser command diagnostics are not saved intent. */
export function serializeClearing(state: Clearing): SerializedClearing {
  const { commands: _commands, ...savedState } = structuredClone(state);
  return parseSerializedClearing(savedState);
}
/** Current-only reconstruction for an authoritative running world. No Continue policy
 * or predecessor migration applies here; pause/tick/work/custody remain unchanged. */
export function parseLiveClearing(value: unknown): Clearing {
  return liveState(parseSerializedClearing(value));
}
export function snapshotFor(state: Clearing): SaveEnvelope {
  return {
    kind: SAVE_KIND,
    schema: SAVE_SCHEMA,
    revision: 0,
    savedState: serializeClearing(state),
  };
}
export function restoreSnapshot(value: unknown): {
  state: Clearing;
  revision: number;
} {
  const envelope = validateSaveEnvelope(value);
  return {
    state: {
      ...structuredClone(envelope.savedState),
      commands: [],
      paused: true,
    },
    revision: envelope.revision,
  };
}
export function backupJson(state: Clearing, revision: number): string {
  return `${JSON.stringify({ ...snapshotFor(state), revision }, null, 2)}\n`;
}
export function rawBackupJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
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
