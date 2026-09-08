import type {
  BrewProcess,
  Clearing,
  JobId,
  Material,
  OperationId,
  PositiveInt,
  Site,
} from "./model.ts";
import {
  admitRecipePlan,
  checkRecipePlan,
  completeRecipePrepare,
  containerQuantity,
  consumeRecipeServing,
  releaseUnpreparedRecipeBinding,
  settleRecipePlan,
  type ContainerSpec,
  type ResolvedRecipePlan,
  type ResolvedRecipeSettlement,
  type ResolvedRecipeServing,
  type MaterialResult,
} from "./materials.ts";
import { portableContainerInterior } from "./item-containers.ts";
import { HERBAL_ALE_V1, recipeDefinition } from "./recipes.ts";
import { siteMaterialEndpoint } from "./construction.js";

export type BrewSupplyRequirement = {
  role: string;
  material: Material;
  quantity: PositiveInt;
  quantityPolicy: "portion" | "whole-lot";
  slot: string;
  destination: ContainerSpec;
  /** A consumer-owned opaque step retained unchanged by transfer admission. */
  step: string;
};

export type BrewStationReadiness =
  | { kind: "waiting"; reason: string }
  | { kind: "supply"; requirement: BrewSupplyRequirement }
  | {
      kind: "ready";
      binding: ResolvedRecipePlan;
      prepareTicks: PositiveInt;
    };

function processBinding(state: Clearing, process: BrewProcess) {
  return state.materials.bindings.find(
    (
      candidate,
    ): candidate is Extract<
      (typeof state.materials.bindings)[number],
      { kind: "recipe" }
    > => candidate.kind === "recipe" && candidate.id === process.binding,
  );
}

function processDefinition(state: Clearing, process: BrewProcess) {
  const binding = processBinding(state, process);
  if (!binding) throw new Error(`missing recipe binding ${process.binding}`);
  return recipeDefinition(binding.definition);
}

export function brewPrepareRemaining(
  state: Clearing,
  process: BrewProcess,
): PositiveInt {
  return (processDefinition(state, process).timings.prepare -
    process.progress) as PositiveInt;
}

export function brewKegRemaining(
  state: Clearing,
  process: BrewProcess,
): PositiveInt {
  return (processDefinition(state, process).timings.keg -
    process.progress) as PositiveInt;
}

type SettledTap = {
  definition: ReturnType<typeof recipeDefinition>;
  transformation: string;
  serving: ResolvedRecipeServing;
};

function settledTap(
  state: Clearing,
  station: Site,
  transformationId?: string,
  consumptionId = "tap-preview",
): SettledTap | null {
  for (const transformation of state.materials.transformations) {
    if (
      transformation.settlement === null ||
      (transformationId !== undefined && transformation.id !== transformationId)
    )
      continue;
    const tap = settledTapForReceipt(
      state,
      station,
      transformation,
      consumptionId,
    );
    if (tap) return tap;
    // A job owns one exact receipt.  A broken or exhausted one cannot silently
    // take a serving from a later batch.
    if (transformationId !== undefined) return null;
  }
  return null;
}

function settledTapForReceipt(
  state: Clearing,
  station: Site,
  transformation: Clearing["materials"]["transformations"][number],
  consumptionId: string,
): SettledTap | null {
  if (!transformation.settlement) return null;
  const definition = recipeDefinition(transformation.definition);
  const stationContainer = siteMaterialEndpoint(station, definition.stationSlot)
    ?.destination.id;
  if (stationContainer !== transformation.settlement.station) return null;
  const outputDefinition = definition.promises.find(
    (entry) => entry.role === definition.tap.outputRole,
  );
  if (
    !outputDefinition ||
    outputDefinition.material !== definition.tap.material
  )
    return null;
  const outputDestination = outputDefinition.destination;
  if (outputDestination.kind !== "retained-interior") return null;
  const retainedRequirement = definition.retained.find(
    (entry) => entry.role === outputDestination.role,
  );
  const retained = transformation.settlement.retained.find(
    (entry) => entry.role === outputDestination.role,
  );
  const retainedDestination =
    retainedRequirement &&
    siteMaterialEndpoint(station, retainedRequirement.slot);
  const keg =
    retained && state.materials.lots.find((entry) => entry.id === retained.lot);
  const interior = keg && portableContainerInterior(keg);
  const output = transformation.settlement.outputs.find(
    (entry) => entry.role === outputDefinition.role,
  );
  if (
    !retained ||
    !retainedRequirement ||
    !retainedDestination ||
    !keg ||
    keg.material !== retained.material ||
    keg.quantity !== retained.quantity ||
    keg.location.kind !== "container" ||
    keg.location.container !== retainedDestination.destination.id ||
    !interior ||
    !output ||
    output.material !== definition.tap.material ||
    output.destination !== interior.id
  )
    return null;
  const alreadyServed = state.materials.consumptions.reduce(
    (total, entry) =>
      total +
      (entry.transformation === transformation.id &&
      entry.role === outputDefinition.role
        ? entry.quantity
        : 0),
    0,
  );
  if (alreadyServed + definition.tap.quantity > output.quantity) return null;
  const source = state.materials.lots.find(
    (lot) =>
      lot.material === definition.tap.material &&
      lot.location.kind === "container" &&
      lot.location.container === interior.id &&
      lot.quantity >= definition.tap.quantity,
  );
  if (!source) return null;
  return {
    definition,
    transformation: transformation.id,
    serving: {
      id: consumptionId,
      transformation: transformation.id,
      role: definition.tap.outputRole,
      material: definition.tap.material,
      quantity: definition.tap.quantity,
      sourceLot: source.id,
      destination: interior,
    },
  };
}

export type TapReadiness =
  | { kind: "waiting"; reason: string }
  | { kind: "ready"; transformation: string };

/** The station/receipt owner chooses the original keg and one actual serving. */
export function tapStationReadiness(
  state: Clearing,
  station: Site,
  transformation?: string,
): TapReadiness {
  if (station.type !== "brew-station" || station.finishedAt === null)
    return { kind: "waiting", reason: "Waiting for a finished brew station" };
  const tap = settledTap(state, station, transformation);
  return tap
    ? { kind: "ready", transformation: tap.transformation }
    : { kind: "waiting", reason: "Waiting for a settled ale serving" };
}

export function tapRemaining(
  state: Clearing,
  station: Site,
  transformation: string,
  progress: number,
): PositiveInt | null {
  const tap = settledTap(state, station, transformation);
  return tap ? ((tap.definition.timings.tap - progress) as PositiveInt) : null;
}

export function attendTap(
  state: Clearing,
  input: {
    id: string;
    station: Site;
    transformation: string;
    progress: number;
  },
): MaterialResult<"working" | "served"> {
  const tap = settledTap(state, input.station, input.transformation, input.id);
  if (!tap) return { ok: false, reason: "source-insufficient" };
  if (input.progress + 1 < tap.definition.timings.tap)
    return { ok: true, value: "working" };
  const consumed = consumeRecipeServing(state.materials, tap.serving);
  return consumed.ok ? { ok: true, value: "served" } : consumed;
}

const stagedLot = (
  state: Clearing,
  container: ContainerSpec,
  material: Material,
) =>
  state.materials.lots.find(
    (lot) =>
      lot.material === material &&
      lot.location.kind === "container" &&
      lot.location.container === container.id,
  );

function stagedPortions(
  state: Clearing,
  container: ContainerSpec,
  requirement: { role: string; material: Material; quantity: PositiveInt },
): ResolvedRecipePlan["consumed"] | null {
  let remaining = requirement.quantity;
  const portions: Array<ResolvedRecipePlan["consumed"][number]> = [];
  for (const lot of state.materials.lots) {
    if (
      lot.material !== requirement.material ||
      lot.location.kind !== "container" ||
      lot.location.container !== container.id
    )
      continue;
    const quantity = Math.min(remaining, lot.quantity) as PositiveInt;
    portions.push({
      role: requirement.role,
      lot: lot.id,
      material: lot.material,
      quantity,
    });
    remaining = (remaining - quantity) as PositiveInt;
    if (remaining === 0) return portions;
  }
  return null;
}

/**
 * The brew consumer owns its recipe, slot mapping, and whole-vs-portion
 * policy. Scheduling receives one next supply requirement or an admission-ready
 * binding; it never reconstructs either.
 */
export function brewStationReadiness(
  state: Clearing,
  station: Site,
  id: OperationId,
): BrewStationReadiness {
  if (station.type !== "brew-station" || station.finishedAt === null)
    return { kind: "waiting", reason: "Waiting for a finished brew station" };
  const definition = recipeDefinition(HERBAL_ALE_V1.id);
  const endpoint = (slot: string) => siteMaterialEndpoint(station, slot);
  const supply = [...definition.consumed, ...definition.retained].find(
    (requirement) => {
      const destination = endpoint(requirement.slot)?.destination;
      return (
        !destination ||
        containerQuantity(
          state.materials,
          destination.id,
          requirement.material,
        ) < requirement.quantity
      );
    },
  );
  if (supply) {
    if (supply.material === "water")
      return { kind: "waiting", reason: "Waiting for two water in the kettle" };
    const destination = endpoint(supply.slot)?.destination;
    if (!destination)
      return {
        kind: "waiting",
        reason: "Waiting for staged herbal ale inputs",
      };
    const have = containerQuantity(
      state.materials,
      destination.id,
      supply.material,
    );
    return {
      kind: "supply",
      requirement: {
        role: supply.role,
        material: supply.material,
        quantity: (supply.quantityPolicy === "whole-lot"
          ? supply.quantity
          : supply.quantity - have) as PositiveInt,
        quantityPolicy: supply.quantityPolicy,
        slot: supply.slot,
        destination,
        step: `recipe:${definition.id}:${supply.role}`,
      },
    };
  }
  const stationEndpoint = endpoint(definition.stationSlot)?.destination;
  if (!stationEndpoint)
    return { kind: "waiting", reason: "Waiting for staged herbal ale inputs" };
  const consumed = definition.consumed.flatMap((requirement) => {
    const destination = endpoint(requirement.slot)?.destination;
    return destination
      ? (stagedPortions(state, destination, requirement) ?? [])
      : [];
  });
  if (
    consumed.length === 0 ||
    definition.consumed.some(
      (requirement) =>
        !consumed.some((portion) => portion.role === requirement.role),
    )
  )
    return { kind: "waiting", reason: "Waiting for staged herbal ale inputs" };
  const retained = definition.retained.map((requirement) => {
    const destination = endpoint(requirement.slot)?.destination;
    const lot =
      destination && stagedLot(state, destination, requirement.material);
    return lot && lot.quantity === requirement.quantity
      ? {
          role: requirement.role,
          lot: lot.id,
          material: lot.material,
          quantity: lot.quantity,
        }
      : null;
  });
  if (retained.some((entry) => entry === null))
    return { kind: "waiting", reason: "Waiting for staged herbal ale inputs" };
  const retainedEntries = retained.filter(
    (entry): entry is NonNullable<typeof entry> => entry !== null,
  );
  const promises = definition.promises.map((promise) => {
    let destination: ContainerSpec | null | undefined;
    const destinationDefinition = promise.destination;
    if (destinationDefinition.kind === "station-slot")
      destination = endpoint(destinationDefinition.slot)?.destination;
    else {
      const retainedLot = retainedEntries.find(
        (entry) => entry.role === destinationDefinition.role,
      );
      const lot =
        retainedLot &&
        state.materials.lots.find(
          (candidate) => candidate.id === retainedLot.lot,
        );
      destination = lot && portableContainerInterior(lot);
    }
    return destination
      ? {
          role: promise.role,
          material: promise.material,
          quantity: promise.quantity,
          destination,
        }
      : null;
  });
  if (promises.some((entry) => entry === null))
    return { kind: "waiting", reason: "Waiting for staged herbal ale inputs" };
  const promiseEntries = promises.filter(
    (entry): entry is NonNullable<typeof entry> => entry !== null,
  );
  const binding: ResolvedRecipePlan = {
    id,
    definition: definition.id,
    station: stationEndpoint.id,
    consumed,
    retained: retainedEntries,
    promises: promiseEntries,
  };
  const checked = checkRecipePlan(state.materials, binding);
  return checked.ok
    ? { kind: "ready", binding, prepareTicks: definition.timings.prepare }
    : { kind: "waiting", reason: "Waiting for staged herbal ale inputs" };
}

export function brewProcessId(job: JobId): OperationId {
  return `brew:${job}`;
}

export function brewForJob(
  state: Clearing,
  job: JobId,
): BrewProcess | undefined {
  return state.processes.find((process) => process.job === job);
}

export function admitBrew(
  state: Clearing,
  input: {
    id: OperationId;
    job: JobId;
    station: string;
    binding: ResolvedRecipePlan;
  },
): MaterialResult<BrewProcess> {
  if (
    state.processes.some(
      (process) => process.id === input.id || process.station === input.station,
    )
  )
    return { ok: false, reason: "owner-busy" };
  const binding = admitRecipePlan(state.materials, input.binding);
  if (!binding.ok) return binding;
  const process: BrewProcess = {
    id: input.id,
    job: input.job,
    station: input.station,
    binding: binding.value.id,
    phase: "prepare",
    progress: 0,
    enteredAt: state.tick,
  };
  state.processes.push(process);
  return { ok: true, value: process };
}

/** PREPARE alone is cancellable: material stays staged, but no promise survives. */
export function cancelPreparingBrew(
  state: Clearing,
  job: JobId,
): MaterialResult<void> {
  const process = brewForJob(state, job);
  if (!process) return { ok: true, value: undefined };
  if (process.phase !== "prepare") return { ok: false, reason: "wrong-phase" };
  const released = releaseUnpreparedRecipeBinding(
    state.materials,
    process.binding,
  );
  if (!released.ok) return released;
  state.processes = state.processes.filter(
    (candidate) => candidate !== process,
  );
  return { ok: true, value: undefined };
}

/** The definition owner resolves the already-bound output destinations once. */
function brewSettlementPlan(
  state: Clearing,
  process: BrewProcess,
): ResolvedRecipeSettlement | null {
  const binding = processBinding(state, process);
  const station = state.sites.find(
    (site) =>
      site.id === process.station &&
      site.type === "brew-station" &&
      site.finishedAt !== null,
  );
  if (!binding || !station) return null;
  const definition = recipeDefinition(binding.definition);
  const endpoint = (slot: string) => siteMaterialEndpoint(station, slot);
  const outputs = definition.promises.map((promise) => {
    const promised = binding.promises.find(
      (entry) => entry.role === promise.role,
    );
    if (
      !promised ||
      promised.material !== promise.material ||
      promised.quantity !== promise.quantity
    )
      return null;
    let destination: ContainerSpec | null | undefined;
    if (promise.destination.kind === "station-slot")
      destination = endpoint(promise.destination.slot)?.destination;
    else {
      const retainedRole = promise.destination.role;
      const retained = binding.retained.find(
        (entry) => entry.role === retainedRole,
      );
      const lot =
        retained &&
        state.materials.lots.find((entry) => entry.id === retained.lot);
      destination = lot && portableContainerInterior(lot);
    }
    return destination && destination.id === promised.destination
      ? {
          role: promise.role,
          material: promise.material,
          quantity: promise.quantity,
          destination,
        }
      : null;
  });
  return outputs.some((output) => output === null)
    ? null
    : {
        id: binding.id,
        definition: definition.id,
        station: binding.station,
        retained: binding.retained,
        outputs: outputs.filter(
          (output): output is NonNullable<typeof output> => output !== null,
        ),
      };
}

/** The attended boundary: only this owner advances PREPARE or crosses to FERMENT. */
export function attendBrew(
  state: Clearing,
  id: OperationId,
): MaterialResult<"working" | "fermenting" | "settled"> {
  const process = state.processes.find((candidate) => candidate.id === id);
  if (!process || (process.phase !== "prepare" && process.phase !== "keg"))
    return { ok: false, reason: "wrong-phase" };
  const definition = processDefinition(state, process);
  if (process.phase === "prepare") {
    if (process.progress < definition.timings.prepare) process.progress++;
    if (process.progress < definition.timings.prepare)
      return { ok: true, value: "working" };
    const consumed = completeRecipePrepare(state.materials, process.binding);
    if (!consumed.ok) return consumed;
    process.phase = "ferment";
    process.progress = 0;
    process.enteredAt = state.tick;
    state.workDirty = true;
    return { ok: true, value: "fermenting" };
  }
  if (process.progress + 1 < definition.timings.keg) {
    process.progress++;
    return { ok: true, value: "working" };
  }
  const plan = brewSettlementPlan(state, process);
  if (!plan) return { ok: false, reason: "destination-mismatch" };
  const settled = settleRecipePlan(state.materials, plan);
  if (!settled.ok) return settled;
  state.processes = state.processes.filter(
    (candidate) => candidate !== process,
  );
  state.workDirty = true;
  return { ok: true, value: "settled" };
}

/** Unattended authoritative time; a transition tick never earns a ferment tick. */
export function advanceBrewing(state: Clearing): void {
  for (const process of state.processes) {
    if (process.phase === "ferment" && process.enteredAt < state.tick) {
      const definition = processDefinition(state, process);
      if (process.progress < definition.timings.ferment) process.progress++;
      if (process.progress === definition.timings.ferment) {
        process.phase = "keg";
        process.progress = 0;
        process.enteredAt = state.tick;
        state.workDirty = true;
      }
    }
  }
}
