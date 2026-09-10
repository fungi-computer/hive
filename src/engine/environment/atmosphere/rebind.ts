import { changeQuantity } from "../arithmetic.mjs";
import { compileAtmosphere, type CompiledAtmosphere } from "./definition.ts";
import { copyState, validateCandidateState, validateState } from "./state.ts";
import type {
  AtmosphereParcel,
  AtmosphereRebindResult,
  AtmosphereState,
} from "./types.ts";

function add(before: number, amount: number) {
  return amount === 0 ? before : changeQuantity(before, amount);
}

function memberVolumes(g: CompiledAtmosphere) {
  return new Map(
    g.volumes.flatMap((volume) =>
      volume.members.map(
        (member) =>
          [
            member.cellId,
            { volumeId: volume.id, amount: member.volumeM3 },
          ] as const,
      ),
    ),
  );
}

function overlaps(old: CompiledAtmosphere, next: CompiledAtmosphere) {
  const oldMembers = memberVolumes(old),
    nextMembers = memberVolumes(next),
    byOld = new Map(
      old.volumes.map((entry) => [entry.id, new Map<string, number>()]),
    );
  for (const [cellId, before] of oldMembers) {
    const after = nextMembers.get(cellId);
    if (!after) continue;
    const amount = Math.min(before.amount, after.amount),
      targets = byOld.get(before.volumeId)!;
    targets.set(after.volumeId, (targets.get(after.volumeId) ?? 0) + amount);
  }
  return byOld;
}

function emptyParcels(g: CompiledAtmosphere) {
  return g.volumes.map((entry) => ({
    volumeId: entry.id,
    carrierKg: 0,
    smokeKg: 0,
    heatJ: 0,
  }));
}

function allocate(
  parcels: ReturnType<typeof emptyParcels>,
  g: CompiledAtmosphere,
  input: Pick<AtmosphereParcel, "carrierKg" | "smokeKg" | "heatJ">,
  weights: ReadonlyMap<string, number>,
) {
  const entries = [...weights].filter(([, weight]) => weight > 0);
  if (!entries.length) throw new Error("atmosphere parcel has no receiver");
  let remainingWeight = entries.reduce(
      (total, [, weight]) => total + weight,
      0,
    ),
    carrierKg = input.carrierKg,
    smokeKg = input.smokeKg,
    heatJ = input.heatJ;
  entries.forEach(([volumeId, weight], index) => {
    const fraction =
        index === entries.length - 1 ? 1 : weight / remainingWeight,
      carrier = carrierKg * fraction,
      smoke = smokeKg * fraction,
      heat = heatJ * fraction,
      target = parcels[g.volumeIndex.get(volumeId)!];
    target.carrierKg = add(target.carrierKg, carrier);
    target.smokeKg = add(target.smokeKg, smoke);
    target.heatJ = add(target.heatJ, heat);
    carrierKg -= carrier;
    smokeKg -= smoke;
    heatJ -= heat;
    remainingWeight -= weight;
  });
}

function graph(g: CompiledAtmosphere) {
  const neighbors = new Map(
      g.volumes.map((entry) => [entry.id, [] as string[]]),
    ),
    ambient = new Set<string>();
  for (const opening of g.openings) {
    if (opening.permeability === 0) continue;
    if (opening.to === null) ambient.add(opening.from);
    else {
      neighbors.get(opening.from)!.push(opening.to);
      neighbors.get(opening.to)!.push(opening.from);
    }
  }
  return { neighbors, ambient };
}

function directDisplacementRoute(
  old: CompiledAtmosphere,
  next: CompiledAtmosphere,
  volumeId: string,
  retainedTargets: ReadonlySet<string>,
) {
  const nextMembers = memberVolumes(next),
    oldVolume = old.volumeById.get(volumeId)!,
    contracted = new Set(
      oldVolume.members
        .filter(
          (member) =>
            (nextMembers.get(member.cellId)?.amount ?? 0) < member.volumeM3,
        )
        .map((member) => member.cellId),
    );
  for (const opening of old.openings) {
    if (opening.permeability === 0) continue;
    const fromLost = contracted.has(opening.fromCellId),
      toLost = opening.toCellId !== null && contracted.has(opening.toCellId);
    if (!fromLost && !toLost) continue;
    const otherCell = fromLost ? opening.toCellId : opening.fromCellId;
    if (otherCell === null) return null;
    const target = nextMembers.get(otherCell)?.volumeId;
    if (target !== undefined && !retainedTargets.has(target)) return target;
  }
  return undefined;
}

function forcedRoute(
  topology: ReturnType<typeof graph>,
  seed: string,
  receivers: ReadonlySet<string>,
) {
  const pending = [seed],
    seen = new Set<string>();
  while (pending.length) {
    const at = pending.shift()!;
    if (seen.has(at)) continue;
    seen.add(at);
    if (at !== seed && receivers.has(at)) return at;
    if (topology.ambient.has(at)) return null;
    pending.push(...(topology.neighbors.get(at) ?? []));
  }
  return undefined;
}

function samePolicy(old: CompiledAtmosphere, next: CompiledAtmosphere) {
  return (
    old.definition.regionId === next.definition.regionId &&
    JSON.stringify(old.definition.ambient) ===
      JSON.stringify(next.definition.ambient) &&
    JSON.stringify(old.definition.model) ===
      JSON.stringify(next.definition.model)
  );
}

/** Rebind only transports stock forced out of removed cells. Added void stays
 * empty until ordinary elapsed-time exchange supplies it through real faces. */
export function rebindAtmosphere(
  old: CompiledAtmosphere,
  input: unknown,
  nextInput: unknown,
): AtmosphereRebindResult {
  const state = validateState(old, input),
    next = compileAtmosphere(nextInput);
  if (
    !samePolicy(old, next) ||
    next.definition.revision <= old.definition.revision
  )
    throw new Error("atmosphere rebind requires newer compatible geometry");
  const byOld = overlaps(old, next),
    receivers = new Set(
      [...byOld].filter(([, targets]) => targets.size).map(([id]) => id),
    ),
    topology = graph(old),
    parcels = emptyParcels(next),
    boundary = { carrierKg: 0, smokeKg: 0, heatJ: 0 },
    routed: { fromVolumeId: string; toVolumeId: string | null }[] = [];

  for (const [index, volume] of old.volumes.entries()) {
    const parcel = state.parcels[index],
      direct = byOld.get(volume.id)!;
    if (direct.size) {
      const retainedM3 = [...direct.values()].reduce(
          (total, amount) => total + amount,
          0,
        ),
        displacedFraction = Math.max(0, 1 - retainedM3 / volume.volumeM3),
        route =
          displacedFraction > 0
            ? directDisplacementRoute(
                old,
                next,
                volume.id,
                new Set(direct.keys()),
              )
            : undefined,
        displaced = {
          carrierKg:
            route !== undefined ? parcel.carrierKg * displacedFraction : 0,
          smokeKg: route !== undefined ? parcel.smokeKg * displacedFraction : 0,
          heatJ: route !== undefined ? parcel.heatJ * displacedFraction : 0,
        },
        retained = {
          carrierKg: parcel.carrierKg - displaced.carrierKg,
          smokeKg: parcel.smokeKg - displaced.smokeKg,
          heatJ: parcel.heatJ - displaced.heatJ,
        };
      allocate(parcels, next, retained, direct);
      if (route === null) {
        boundary.carrierKg = add(boundary.carrierKg, displaced.carrierKg);
        boundary.smokeKg = add(boundary.smokeKg, displaced.smokeKg);
        boundary.heatJ = add(boundary.heatJ, displaced.heatJ);
        routed.push({ fromVolumeId: volume.id, toVolumeId: null });
      } else if (route !== undefined) {
        allocate(parcels, next, displaced, new Map([[route, 1]]));
        routed.push({ fromVolumeId: volume.id, toVolumeId: route });
      }
      continue;
    }
    const route = forcedRoute(topology, volume.id, receivers);
    if (route === undefined)
      return Object.freeze({
        status: "blocked",
        reason: "trapped-volume-removed",
      });
    if (route === null) {
      boundary.carrierKg = add(boundary.carrierKg, parcel.carrierKg);
      boundary.smokeKg = add(boundary.smokeKg, parcel.smokeKg);
      boundary.heatJ = add(boundary.heatJ, parcel.heatJ);
    } else allocate(parcels, next, parcel, byOld.get(route)!);
    routed.push({ fromVolumeId: volume.id, toVolumeId: route });
  }

  const candidate: AtmosphereState = {
    ...state,
    identity: next.identity,
    parcels,
    carrierBoundaryKg: add(state.carrierBoundaryKg, boundary.carrierKg),
    smokeBoundaryKg: add(state.smokeBoundaryKg, boundary.smokeKg),
    heatBoundaryJ: add(state.heatBoundaryJ, boundary.heatJ),
  };
  let checked: AtmosphereState;
  try {
    checked = validateCandidateState(next, candidate);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("exceeds its envelope")
    )
      return Object.freeze({ status: "blocked", reason: "pressure-envelope" });
    throw error;
  }
  const totalVolume = (g: CompiledAtmosphere) =>
    g.volumes.reduce((total, entry) => total + entry.volumeM3, 0);
  return Object.freeze({
    status: "applied",
    definition: next.definition,
    state: copyState(checked),
    receipt: Object.freeze({
      oldIdentity: old.identity,
      newIdentity: next.identity,
      oldVolumeM3: totalVolume(old),
      newVolumeM3: totalVolume(next),
      carrierBoundaryKg: boundary.carrierKg,
      smokeBoundaryKg: boundary.smokeKg,
      heatBoundaryJ: boundary.heatJ,
      routedParcels: Object.freeze(routed.map((entry) => Object.freeze(entry))),
    }),
  });
}
