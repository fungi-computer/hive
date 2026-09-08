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
  releaseUnpreparedRecipeBinding,
  type ContainerSpec,
  type ResolvedRecipePlan,
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

function processDefinition(state: Clearing, process: BrewProcess) {
  const binding = state.materials.bindings.find(
    (
      candidate,
    ): candidate is Extract<
      (typeof state.materials.bindings)[number],
      { kind: "recipe" }
    > => candidate.kind === "recipe" && candidate.id === process.binding,
  );
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

/** The attended boundary: only this owner advances PREPARE or crosses to FERMENT. */
export function attendBrew(
  state: Clearing,
  id: OperationId,
): MaterialResult<"working" | "fermenting"> {
  const process = state.processes.find((candidate) => candidate.id === id);
  if (!process || process.phase !== "prepare")
    return { ok: false, reason: "wrong-phase" };
  const definition = processDefinition(state, process);
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

/** Unattended authoritative time; a transition tick never earns a ferment tick. */
export function advanceBrewing(state: Clearing): void {
  for (const process of state.processes) {
    if (
      process.phase === "ferment" &&
      process.enteredAt < state.tick &&
      process.progress < processDefinition(state, process).timings.ferment
    )
      process.progress++;
  }
}
