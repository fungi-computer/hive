import { z } from "zod";
import { changeQuantity } from "../arithmetic.mjs";
import { copyAtmosphereData } from "./data.ts";
import { ATMOSPHERE_LIMITS } from "./limits.ts";
import type {
  AtmosphereDefinition,
  AtmosphereGeometryMetricUpdate,
} from "./types.ts";

export { ATMOSPHERE_LIMITS } from "./limits.ts";

const id = z.string().min(1).max(160);
const finite = z.number().finite();
const positive = finite.positive();
const member = z.strictObject({
  cellId: id,
  volumeM3: positive.max(1_000_000),
  elevationM: finite.min(-1_000_000).max(1_000_000),
});
const volume = z.strictObject({
  id,
  members: z.array(member).min(1).max(ATMOSPHERE_LIMITS.members),
});
const opening = z.strictObject({
  id,
  from: id,
  fromCellId: id,
  to: id.nullable(),
  toCellId: id.nullable(),
  areaM2: positive.max(1_000_000),
  distanceM: positive.max(1_000_000),
  elevationM: finite.min(-1_000_000).max(1_000_000),
  permeability: finite.min(0).max(1),
});
const model = z.strictObject({
  specificGasConstantJKgK: positive.max(100_000),
  heatCapacityJKgK: positive.max(100_000),
  mixingVelocityMPS: finite.nonnegative().max(100),
  buoyancyVelocityMPSK: finite.nonnegative().max(100),
  pressureVelocityMPSPa: finite.nonnegative().max(100),
  maxStepS: positive.max(ATMOSPHERE_LIMITS.intervalS),
  maxExchangeFraction: positive.max(0.5),
  maxPressureRatio: finite.min(1).max(10),
  maxTemperatureDeltaK: positive.max(1_000),
  maxSmokeMassFraction: positive.max(0.1),
});
const schema = z.strictObject({
  version: z.literal("connected-atmosphere-definition-v1"),
  regionId: id,
  geometryIdentity: z.string().min(1).max(16_384),
  revision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  ambient: z.strictObject({
    pressurePa: positive.max(10_000_000),
    temperatureK: positive.max(10_000),
  }),
  model,
  volumes: z.array(volume).min(1).max(ATMOSPHERE_LIMITS.volumes),
  openings: z.array(opening).max(ATMOSPHERE_LIMITS.openings),
});
const compare = (left: string, right: string) =>
  left < right ? -1 : left > right ? 1 : 0;

export type CompiledVolume = AtmosphereDefinition["volumes"][number] & {
  readonly volumeM3: number;
  readonly elevationM: number;
};

export type CompiledAtmosphere = {
  readonly definition: AtmosphereDefinition;
  readonly identity: string;
  readonly volumes: readonly CompiledVolume[];
  readonly volumeById: ReadonlyMap<string, CompiledVolume>;
  readonly volumeIndex: ReadonlyMap<string, number>;
  readonly cellOwner: ReadonlyMap<string, string>;
  readonly openings: AtmosphereDefinition["openings"];
  readonly ambientDensityKgM3: number;
};

function unique(values: readonly string[], label: string) {
  if (new Set(values).size !== values.length)
    throw new Error(`atmosphere ${label} must be unique`);
}

function sameTopology(
  left: AtmosphereDefinition,
  right: AtmosphereDefinition,
) {
  if (
    left.volumes.length !== right.volumes.length ||
    left.openings.length !== right.openings.length
  )
    return false;
  const leftVolumes = new Map(left.volumes.map((volume) => [volume.id, volume]));
  for (const volume of right.volumes) {
    const before = leftVolumes.get(volume.id);
    if (
      !before ||
      before.members.length !== volume.members.length ||
      before.members.some(
        (member, index) => member.cellId !== volume.members[index].cellId,
      )
    )
      return false;
  }
  const leftOpenings = new Map(left.openings.map((opening) => [opening.id, opening]));
  return right.openings.every((opening) => {
    const before = leftOpenings.get(opening.id);
    return (
      before !== undefined &&
      before.from === opening.from &&
      before.fromCellId === opening.fromCellId &&
      before.to === opening.to &&
      before.toCellId === opening.toCellId &&
      before.distanceM === opening.distanceM &&
      before.elevationM === opening.elevationM &&
      before.permeability === opening.permeability
    );
  });
}

function aggregateVolume(
  input: AtmosphereDefinition["volumes"][number],
): CompiledVolume {
  unique(
    input.members.map((entry) => entry.cellId),
    `members in ${input.id}`,
  );
  let volumeM3 = 0,
    elevationMomentM4 = 0;
  for (const entry of input.members) {
    volumeM3 = changeQuantity(volumeM3, entry.volumeM3);
    elevationMomentM4 = changeQuantity(
      elevationMomentM4,
      entry.elevationM * entry.volumeM3,
    );
  }
  const elevationM = elevationMomentM4 / volumeM3;
  if (!Number.isFinite(volumeM3) || !Number.isFinite(elevationM))
    throw new Error("atmosphere volume aggregate is not representable");
  return Object.freeze({ ...input, volumeM3, elevationM });
}

export function compileAtmosphere(input: unknown): CompiledAtmosphere {
  const parsed = schema.parse(copyAtmosphereData(input));
  unique(
    parsed.volumes.map((entry) => entry.id),
    "volume ids",
  );
  unique(
    parsed.openings.map((entry) => entry.id),
    "opening ids",
  );
  const members = parsed.volumes.flatMap((entry) =>
    entry.members.map((item) => item.cellId),
  );
  if (members.length > ATMOSPHERE_LIMITS.members)
    throw new Error("atmosphere member budget exceeded");
  unique(members, "cell ownership");

  const volumes = parsed.volumes
      .map(aggregateVolume)
      .sort((left, right) => compare(left.id, right.id)),
    volumeById = new Map(volumes.map((entry) => [entry.id, entry])),
    volumeIndex = new Map(volumes.map((entry, index) => [entry.id, index]));
  for (const entry of parsed.openings) {
    if (
      !volumeById.has(entry.from) ||
      !volumeById
        .get(entry.from)!
        .members.some((member) => member.cellId === entry.fromCellId) ||
      (entry.to !== null &&
        (!volumeById.has(entry.to) ||
          entry.to === entry.from ||
          entry.toCellId === null ||
          !volumeById
            .get(entry.to)!
            .members.some((member) => member.cellId === entry.toCellId))) ||
      (entry.to === null && entry.toCellId !== null)
    )
      throw new Error(`atmosphere opening ${entry.id} has invalid endpoints`);
  }
  const definition = Object.freeze({
    ...parsed,
    ambient: Object.freeze({ ...parsed.ambient }),
    model: Object.freeze({ ...parsed.model }),
    volumes: Object.freeze(
      volumes.map(({ volumeM3: _volume, elevationM: _elevation, ...entry }) =>
        Object.freeze({
          ...entry,
          members: Object.freeze(
            [...entry.members]
              .sort((left, right) => compare(left.cellId, right.cellId))
              .map((member) => Object.freeze({ ...member })),
          ),
        }),
      ),
    ),
    openings: Object.freeze(
      [...parsed.openings]
        .sort((left, right) => compare(left.id, right.id))
        .map((entry) => Object.freeze({ ...entry })),
    ),
  }) satisfies AtmosphereDefinition;
  const identity = JSON.stringify({
    state: "connected-atmosphere-state-v1",
    transport: "bounded-room-exchange-v1",
    definition,
  });
  if (
    new TextEncoder().encode(identity).byteLength >
    ATMOSPHERE_LIMITS.encodedStateBytes / 2
  )
    throw new Error("atmosphere definition identity exceeds its byte budget");
  // A finite JavaScript number serializes in fewer than 32 ASCII bytes. The
  // longer string placeholders make this a conservative complete-wire bound.
  const widest = "0".repeat(32),
    signedWidest = `-${widest}`,
    canonicalStateEnvelope = JSON.stringify({
      version: "connected-atmosphere-state-v1",
      identity,
      parcels: volumes.map((entry) => ({
        volumeId: entry.id,
        carrierKg: widest,
        smokeKg: widest,
        heatJ: signedWidest,
      })),
      initialCarrierKg: widest,
      initialSmokeKg: widest,
      initialHeatJ: signedWidest,
      smokeSourceKg: widest,
      heatSourceJ: signedWidest,
      carrierBoundaryKg: signedWidest,
      smokeBoundaryKg: signedWidest,
      heatBoundaryJ: signedWidest,
    });
  if (
    new TextEncoder().encode(canonicalStateEnvelope).byteLength >
    ATMOSPHERE_LIMITS.encodedStateBytes
  )
    throw new Error("atmosphere canonical state exceeds its byte budget");
  const ambientDensityKgM3 =
    definition.ambient.pressurePa /
    (definition.model.specificGasConstantJKgK *
      definition.ambient.temperatureK);
  if (!Number.isFinite(ambientDensityKgM3) || ambientDensityKgM3 <= 0)
    throw new Error("atmosphere ambient density is not representable");
  return Object.freeze({
    definition,
    identity,
    volumes: Object.freeze(
      definition.volumes.map((entry) => aggregateVolume(entry)),
    ),
    volumeById,
    volumeIndex,
    cellOwner: new Map(
      definition.volumes.flatMap((entry) =>
        entry.members.map((member) => [member.cellId, entry.id] as const),
      ),
    ),
    openings: definition.openings,
    ambientDensityKgM3,
  });
}

/** Apply bounded stock-dependent geometry metrics to one admitted owner. The
 * topology and indexes are retained only after the complete definition has
 * been checked against the prior owner. */
export function updateAtmosphereGeometry(
  previous: CompiledAtmosphere,
  input: unknown,
): CompiledAtmosphere {
  const update = z
    .strictObject({
      geometryIdentity: z.string().min(1).max(16_384),
      revision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
      memberVolumes: z
        .array(
          z.strictObject({
            volumeId: id,
            cellId: id,
            volumeM3: positive.max(1_000_000),
          }),
        )
        .max(ATMOSPHERE_LIMITS.members),
      openingAreas: z
        .array(
          z.strictObject({ openingId: id, areaM2: positive.max(1_000_000) }),
        )
        .max(ATMOSPHERE_LIMITS.openings),
    })
    .parse(copyAtmosphereData(input)) satisfies AtmosphereGeometryMetricUpdate;
  if (update.revision <= previous.definition.revision)
    throw new Error("atmosphere geometry update requires newer revision");
  const memberUpdates = new Map(
    update.memberVolumes.map((entry) => [
      `${entry.volumeId}\u0000${entry.cellId}`,
      entry.volumeM3,
    ]),
  );
  if (memberUpdates.size !== update.memberVolumes.length)
    throw new Error("duplicate atmosphere member metric");
  const openingUpdates = new Map(
    update.openingAreas.map((entry) => [entry.openingId, entry.areaM2]),
  );
  if (openingUpdates.size !== update.openingAreas.length)
    throw new Error("duplicate atmosphere opening metric");
  const volumes = previous.definition.volumes.map((volume) => ({
      ...volume,
      members: volume.members.map((member) => {
        const value = memberUpdates.get(`${volume.id}\u0000${member.cellId}`);
        if (value === undefined) return member;
        return value === member.volumeM3
          ? member
          : Object.freeze({ ...member, volumeM3: value });
      }),
    })),
    openings = previous.definition.openings.map((opening) => {
      const area = openingUpdates.get(opening.id);
      return area === undefined || area === opening.areaM2
        ? opening
        : Object.freeze({ ...opening, areaM2: area });
    });
  for (const entry of update.memberVolumes) {
    if (!previous.cellOwner.has(entry.cellId))
      throw new Error(`unknown atmosphere member ${entry.cellId}`);
    const volume = previous.definition.volumes.find(
      (candidate) => candidate.id === entry.volumeId,
    );
    if (!volume || !volume.members.some((member) => member.cellId === entry.cellId))
      throw new Error(`atmosphere member belongs to another volume`);
  }
  for (const entry of update.openingAreas)
    if (!previous.openings.some((opening) => opening.id === entry.openingId))
      throw new Error(`unknown atmosphere opening ${entry.openingId}`);
  const nextDefinition = Object.freeze({
    ...previous.definition,
    geometryIdentity: update.geometryIdentity,
    revision: update.revision,
    volumes: Object.freeze(volumes),
    openings: Object.freeze(openings),
  });
  const next = compileAtmosphere(nextDefinition);
  if (!sameTopology(previous.definition, next.definition))
    throw new Error("atmosphere geometry metrics changed topology");
  const retainedVolumes = next.volumes.map((volume) => {
    const before = previous.volumeById.get(volume.id)!;
    return volume.members.every((member, index) => {
      const old = before.members[index];
      return old === member;
    })
      ? before
      : volume;
  });
  const retainedDefinition = Object.freeze({
    ...next.definition,
    volumes: Object.freeze(
      retainedVolumes.map(({ volumeM3: _volume, elevationM: _elevation, ...volume }) =>
        Object.freeze(volume),
      ),
    ),
    openings: Object.freeze(
      next.definition.openings.map((opening) =>
        previous.definition.openings.find((before) => before.id === opening.id &&
          before.areaM2 === opening.areaM2 &&
          before.from === opening.from && before.to === opening.to &&
          before.fromCellId === opening.fromCellId &&
          before.toCellId === opening.toCellId &&
          before.distanceM === opening.distanceM &&
          before.elevationM === opening.elevationM &&
          before.permeability === opening.permeability) ?? opening,
      ),
    ),
  });
  return Object.freeze({
    ...next,
    definition: retainedDefinition,
    volumes: Object.freeze(retainedVolumes),
    volumeIndex: previous.volumeIndex,
    cellOwner: previous.cellOwner,
  });
}
