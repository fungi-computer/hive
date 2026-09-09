import type {
  Clearing,
  PositiveInt,
  Site,
  WaterDeliveryOperation,
  WaterDeliveryTarget,
} from "./model.ts";
import { brewKettle, brewStationAccessCells } from "./construction.js";
import {
  establishMugwort,
  MUGWORT_ESTABLISHMENT_WATER,
  mugwortNeedsWater,
} from "./herbs.ts";
import {
  pourPailWater,
  sinkHeldPortion,
  type ContainerSpec,
} from "./materials.ts";
import { brewStationWaterRequirement } from "./recipes.ts";
import { neighbors } from "./world.js";
import { settleCareConsumption } from "./needs.ts";

export type ResolvedWaterDelivery = {
  target: WaterDeliveryTarget;
  access: readonly { x: number; z: number; level: number }[];
  destination: ContainerSpec | null;
  quantity: PositiveInt;
};

/** The two current consumers share one pail phase machine, not one inventory. */
export function waterDeliveryQuantity(
  target: WaterDeliveryTarget,
): PositiveInt | null {
  if (target.kind === "mugwort") return MUGWORT_ESTABLISHMENT_WATER;
  if (target.kind === "hydration") return 1 as PositiveInt;
  return brewStationWaterRequirement();
}

export function resolveWaterDelivery(
  state: Clearing,
  target: WaterDeliveryTarget,
): ResolvedWaterDelivery | null {
  if (target.kind === "kettle") {
    const station = state.sites.find(
      (site): site is Site =>
        site.id === target.station &&
        site.type === "brew-station" &&
        site.finishedAt !== null,
    );
    const quantity = waterDeliveryQuantity(target);
    return station && quantity
      ? {
          target,
          access: brewStationAccessCells(station),
          destination: brewKettle(station),
          quantity,
        }
      : null;
  }
  if (target.kind === "hydration") {
    const actor = state.actors[target.actor];
    const quantity = waterDeliveryQuantity(target);
    return actor && quantity
      ? {
          target,
          access: [{ x: actor.x, z: actor.z, level: actor.level }],
          destination: null,
          quantity,
        }
      : null;
  }
  const herb = state.herbs.find((entry) => entry.id === target.herb);
  const quantity = waterDeliveryQuantity(target);
  return herb && quantity && mugwortNeedsWater(herb)
    ? { target, access: neighbors(herb), destination: null, quantity }
    : null;
}

export function waterDeliveryTargetForJob(
  state: Clearing,
  job: Clearing["jobs"][number],
): WaterDeliveryTarget | null {
  if (job.kind === "fill-kettle")
    return { kind: "kettle", station: job.target };
  if (job.kind === "water-mugwort")
    return { kind: "mugwort", herb: job.target };
  if (job.kind === "care" && job.need === "hydration")
    return { kind: "hydration", actor: job.target };
  return null;
}

/** Destination semantics settle after the materials owner has preflighted custody. */
export function settleWaterDelivery(
  state: Clearing,
  operation: WaterDeliveryOperation,
): { ok: true } | { ok: false; reason: string } {
  const resolved = resolveWaterDelivery(state, operation.target);
  if (
    !resolved ||
    resolved.quantity !== operation.quantity ||
    operation.phase !== "pour" ||
    operation.water === null
  )
    return { ok: false, reason: "destination-unavailable" };
  if (resolved.destination) {
    const poured = pourPailWater(state.materials, {
      operation: operation.id,
      destination: resolved.destination,
      sourceLot: operation.water,
      quantity: operation.quantity,
      access: {
        sourceReachable: true,
        destinationReachableWithPayload: true,
      },
    });
    return poured.ok ? { ok: true } : poured;
  }
  const target = operation.target;
  if (target.kind === "hydration") {
    return settleCareConsumption(state, {
      actor: target.actor,
      operation,
      lot: operation.water,
    })
      ? { ok: true }
      : { ok: false, reason: "destination-unavailable" };
  }
  if (target.kind !== "mugwort")
    return { ok: false, reason: "destination-unavailable" };
  const herb = state.herbs.find((entry) => entry.id === target.herb);
  if (!herb || !mugwortNeedsWater(herb))
    return { ok: false, reason: "destination-unavailable" };
  const consumed = sinkHeldPortion(state.materials, {
    id: `water-delivery-sink:${operation.id}`,
    operation: operation.id,
    sourceLot: operation.water,
    material: "water",
    quantity: operation.quantity,
  });
  if (!consumed.ok) return consumed;
  // No later operation can replay this because establishment is the herb fact.
  if (!establishMugwort(herb, state.tick, consumed.value.id))
    throw new Error("water delivery lost its unwatered herb target");
  return { ok: true };
}
