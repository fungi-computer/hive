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
  admitHerbalAleBinding,
  checkHerbalAleBinding,
  completeHerbalAlePrepare,
  containerQuantity,
  kegInterior,
  releaseUnpreparedBrewBinding,
  type ContainerSpec,
  type HerbalAleBindingInput,
  type MaterialResult,
} from "./materials.ts";
import { HERBAL_ALE_V1 } from "./recipes.ts";
import {
  brewBarmSlot,
  brewHearth,
  brewKegSlot,
  brewKettle,
} from "./construction.js";
import { herbalAleTray } from "./recipes.ts";

export type BrewSupplyRequirement = {
  material: Exclude<Material, "water">;
  quantity: PositiveInt;
  quantityPolicy: "portion" | "whole-lot";
  destination: ContainerSpec;
  /** A consumer-owned opaque step retained unchanged by transfer admission. */
  step: string;
};

export type BrewStationReadiness =
  | { kind: "waiting"; reason: string }
  | { kind: "supply"; requirement: BrewSupplyRequirement }
  | {
      kind: "ready";
      binding: HerbalAleBindingInput;
      prepareTicks: PositiveInt;
    };

export function brewPrepareRemaining(process: BrewProcess): PositiveInt {
  return (HERBAL_ALE_V1.timings.prepare - process.progress) as PositiveInt;
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
  const kettle = brewKettle(station);
  if (
    containerQuantity(state.materials, kettle.id, "water") !==
    HERBAL_ALE_V1.inputs.water
  )
    return { kind: "waiting", reason: "Waiting for two water in the kettle" };
  const requirements: readonly BrewSupplyRequirement[] = [
    {
      material: "malt",
      quantity: HERBAL_ALE_V1.inputs.malt,
      quantityPolicy: "portion",
      destination: kettle,
      step: "brew-malt",
    },
    {
      material: "mugwort",
      quantity: HERBAL_ALE_V1.inputs.mugwort,
      quantityPolicy: "whole-lot",
      destination: kettle,
      step: "brew-mugwort",
    },
    {
      material: "wood",
      quantity: HERBAL_ALE_V1.inputs.wood,
      quantityPolicy: "portion",
      destination: brewHearth(station),
      step: "brew-fuel",
    },
    {
      material: "barm",
      quantity: 1 as PositiveInt,
      quantityPolicy: "whole-lot",
      destination: brewBarmSlot(station),
      step: "brew-barm",
    },
    {
      material: "keg",
      quantity: 1 as PositiveInt,
      quantityPolicy: "whole-lot",
      destination: brewKegSlot(station),
      step: "brew-keg",
    },
  ];
  for (const requirement of requirements)
    if (
      containerQuantity(
        state.materials,
        requirement.destination.id,
        requirement.material,
      ) < requirement.quantity
    )
      return { kind: "supply", requirement };
  const malt = stagedLot(state, kettle, "malt");
  const water = stagedLot(state, kettle, "water");
  const mugwort = stagedLot(state, kettle, "mugwort");
  const wood = stagedLot(state, brewHearth(station), "wood");
  const barm = stagedLot(state, brewBarmSlot(station), "barm");
  const keg = stagedLot(state, brewKegSlot(station), "keg");
  const output = keg && kegInterior(keg);
  if (!malt || !water || !mugwort || !wood || !barm || !keg || !output)
    return { kind: "waiting", reason: "Waiting for staged herbal ale inputs" };
  const binding: HerbalAleBindingInput = {
    id,
    station: kettle.id,
    portions: [
      { lot: malt.id, material: "malt", quantity: HERBAL_ALE_V1.inputs.malt },
      {
        lot: water.id,
        material: "water",
        quantity: HERBAL_ALE_V1.inputs.water,
      },
      {
        lot: mugwort.id,
        material: "mugwort",
        quantity: HERBAL_ALE_V1.inputs.mugwort,
      },
      { lot: wood.id, material: "wood", quantity: HERBAL_ALE_V1.inputs.wood },
    ],
    barm: barm.id,
    keg: keg.id,
    output,
    tray: herbalAleTray(station.id),
  };
  const checked = checkHerbalAleBinding(state.materials, binding);
  return checked.ok
    ? { kind: "ready", binding, prepareTicks: HERBAL_ALE_V1.timings.prepare }
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
    binding: {
      station: string;
      portions: readonly {
        lot: string;
        material: "malt" | "water" | "mugwort" | "wood";
        quantity: PositiveInt;
      }[];
      barm: string;
      keg: string;
      output: ContainerSpec;
      tray: ContainerSpec;
    };
  },
): MaterialResult<BrewProcess> {
  if (
    state.processes.some(
      (process) => process.id === input.id || process.station === input.station,
    )
  )
    return { ok: false, reason: "owner-busy" };
  const binding = admitHerbalAleBinding(state.materials, {
    id: input.id,
    ...input.binding,
  });
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
  const released = releaseUnpreparedBrewBinding(
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
  if (process.progress < HERBAL_ALE_V1.timings.prepare) process.progress++;
  if (process.progress < HERBAL_ALE_V1.timings.prepare)
    return { ok: true, value: "working" };
  const consumed = completeHerbalAlePrepare(state.materials, process.binding);
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
      process.progress < HERBAL_ALE_V1.timings.ferment
    )
      process.progress++;
  }
}
