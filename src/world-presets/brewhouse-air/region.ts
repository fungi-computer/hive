import { z } from "zod";
import { createAir } from "../../engine/environment/air/index.js";
import {
  createFiniteRelease,
  type ReleaseSegment,
} from "../../engine/environment/finite-release.ts";
import type { Json, RegionProgram } from "../../engine/region/index.ts";
import type { MaterialsState } from "../../engine/materials/index.ts";
import type { Material } from "../../model.ts";
import {
  excavateTerrain,
  initialTerrain,
  parseTerrain,
  terrainEnvironment,
  terrainDigProblem,
  type GeneratedTerrain,
  voxelSchema,
} from "../goblin-terrain.ts";
import { generatedBrewhouseRoom } from "./generated-room.ts";
import { BREWHOUSE_ROOM, ROOM_MIN_FIELD_INTERVAL_S } from "./room.ts";
import {
  roomMaterials,
  roomHearth,
  initialRoomMaterials,
  prepareRoomFuel,
  validateRoomFuel,
} from "./fuel.ts";
import { ROOM_FUEL } from "./fuel-definition.ts";

import {
  initialWaterEnvironment,
  parseWaterEnvironment,
  prepareWaterEnvironmentGeometry,
  advanceWaterEnvironment,
  waterEnvironmentFacts,
  type WaterEnvironment,
} from "../goblin-environment/water-state.ts";
import {
  initialTerrainRemovals,
  parseTerrainRemovals,
  prepareTerrainRemoval,
  removedWaterKg,
  type TerrainRemoval,
} from "../../terrain-removals.ts";

const stateSchema = z.strictObject({
  version: z.literal("goblin-generated-dry-room-v2"),
  opening: z.strictObject({
    open: z.boolean(),
    revision: z.number().int().nonnegative(),
  }),
  burn: z.strictObject({ startS: z.number().nonnegative() }).nullable(),
  materials: z.unknown(),
  terrain: z.unknown(),
  water: z.unknown(),
  removals: z.unknown(),
  air: z.unknown(),
});
const commandSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("ignite") }),
  z.strictObject({ kind: z.literal("vent"), open: z.boolean() }),
  z.strictObject({ kind: z.literal("excavate"), at: voxelSchema }),
  z.strictObject({
    kind: z.literal("advance"),
    seconds: z.number().min(ROOM_MIN_FIELD_INTERVAL_S).max(6),
  }),
]);
type AirState = ReturnType<ReturnType<typeof createAir>["initial"]>;
type State = Omit<
  z.infer<typeof stateSchema>,
  "materials" | "terrain" | "air" | "water" | "removals"
> & {
  materials: MaterialsState<Material>;
  terrain: GeneratedTerrain;
  air: AirState;
  water: WaterEnvironment;
  removals: readonly TerrainRemoval[];
};
type Command = z.infer<typeof commandSchema>;
const roomFor = (state: Pick<State, "terrain" | "opening">) =>
  generatedBrewhouseRoom(state.terrain, state.opening);
const airOwner = (state: Pick<State, "terrain" | "opening">) =>
  createAir(roomFor(state).definition);
const dose = createFiniteRelease({
  durationS: ROOM_FUEL.durationS,
  totals: { smokeKg: ROOM_FUEL.smokeKg, heatJ: ROOM_FUEL.heatJ },
});
const waterSource = (terrain: GeneratedTerrain) => ({
  terrain: terrainEnvironment(terrain),
  sites: BREWHOUSE_ROOM.sites,
});
export function roomWaterFacts(state: Pick<State, "terrain" | "water">) {
  return waterEnvironmentFacts(state.water, waterSource(state.terrain));
}
/** This retained study has fixed gas volume; wet receivers require the main
 * paired atmosphere consumer, not a silent displacement here. */
function dryRoomProblem(state: Pick<State, "terrain" | "water" | "opening">) {
  const definition = roomFor(state).definition,
    solid = new Set(definition.solidCells);
  return roomWaterFacts(state).cells.some(
    (cell) =>
      cell.kind === "void" &&
      cell.massKg > 0 &&
      !solid.has(cell.id) &&
      cell.at.every(
        (n, axis) =>
          n >= definition.origin[axis] &&
          n < definition.origin[axis] + definition.size[axis],
      ),
  );
}
function initialRoomWater(terrain: GeneratedTerrain) {
  const before = { terrain: terrainEnvironment(terrain), sites: [] };
  const initial = initialWaterEnvironment(before);
  const result = prepareWaterEnvironmentGeometry(
    initial,
    before,
    waterSource(terrain),
  );
  if (result.status === "blocked")
    throw new Error(`room water initialization: ${result.reason}`);
  if (result.receipt.removedPoreWater.length || result.receipt.boundaryKg !== 0)
    throw new Error("authored room cannot export initial pore water");
  return result.state;
}
function validateSourceJoin(state: State) {
  const water = roomWaterFacts(state),
    exported = removedWaterKg(state.removals);
  const tolerance = 1e-9 + 64 * Number.EPSILON * water.initialTotalKg;
  if (Math.abs(water.boundaryKg + exported) > tolerance)
    throw new Error("room water has an unpaired external exchange");
  if (
    Math.abs(water.totalKg - water.initialTotalKg - water.boundaryKg) >
    tolerance
  )
    throw new Error("room water budget disagrees");
  if (dryRoomProblem(state))
    throw new Error("fixed-room-air-volume-must-stay-dry");
  if (state.burn !== null && state.burn.startS > state.air.timeS)
    throw new Error("room fuel starts after the physical clock");
  const { remainingS, released } = dose.read(
    state.burn?.startS ?? null,
    state.air.timeS,
  );
  if (remainingS > 0 && remainingS < ROOM_MIN_FIELD_INTERVAL_S)
    throw new Error("room fuel remainder is below the shared field interval");
  validateRoomFuel(state.materials, state.burn !== null);
  if (
    state.air.initialHeatJ !== 0 ||
    state.air.initialSmokeKg !== 0 ||
    Math.abs(state.air.heatSourceJ - released.heatJ) > 1e-5 ||
    Math.abs(state.air.smokeSourceKg - released.smokeKg) > 1e-10
  )
    throw new Error(
      "air sources disagree with finite fuel transformation and clock",
    );
}
function parseState(value: unknown): State {
  const parsed = stateSchema.parse(value),
    terrain = parseTerrain(parsed.terrain),
    registered = generatedBrewhouseRoom(terrain, parsed.opening),
    owner = createAir(registered.definition);
  const state: State = {
    ...parsed,
    terrain,
    water: parseWaterEnvironment(parsed.water, waterSource(terrain)),
    removals: parseTerrainRemovals(parsed.removals, terrain),
    materials: roomMaterials.restore({ schema: 2, state: parsed.materials }, [
      roomHearth,
    ]),
    air: owner.decode(JSON.stringify(parsed.air)),
  };
  validateSourceJoin(state);
  return state;
}

function changeVent(candidate: State, open: boolean) {
  if (candidate.opening.open === open)
    return {
      status: "rejected" as const,
      result: { reason: "opening-unchanged" },
    };
  const oldGeometryRevision = candidate.opening.revision,
    opening = {
      open,
      revision: oldGeometryRevision + 1,
    },
    registered = generatedBrewhouseRoom(candidate.terrain, opening),
    rebound = airOwner(candidate).rebind(candidate.air, registered.definition);
  if (rebound.status === "blocked")
    return { status: "rejected" as const, result: { reason: rebound.reason } };
  const openedFaceCount = rebound.receipt.newFaces.length,
    closedFaceCount = rebound.receipt.closedFaces.length,
    changedFaceCount = registered.shutterFaces.length;
  if (
    (open && (openedFaceCount !== changedFaceCount || closedFaceCount !== 0)) ||
    (!open && (openedFaceCount !== 0 || closedFaceCount !== changedFaceCount))
  )
    throw new Error("brewhouse shutter changed unexpected air faces");
  candidate.air = rebound.state;
  candidate.opening = opening;
  return {
    status: "applied" as const,
    result: roomResult(candidate),
    events: [
      {
        kind: "vent",
        open,
        oldGeometryRevision,
        newGeometryRevision: opening.revision,
        timeS: rebound.receipt.timeS,
        openedFaceCount,
        closedFaceCount,
        oldKineticJ: rebound.receipt.oldKineticJ,
        mappedKineticJ: rebound.receipt.mappedKineticJ,
        newKineticJ: rebound.receipt.newKineticJ,
        kineticChangeJ: rebound.receipt.kineticChangeJ,
        boundaryDissipationJ: rebound.receipt.boundaryDissipationJ,
        divergenceM3S: rebound.receipt.divergenceM3S,
        thermalTransferJ: rebound.receipt.thermalTransferJ,
        smokeTransferKg: rebound.receipt.smokeTransferKg,
      },
    ],
  };
}

function excavateRoom(
  candidate: State,
  at: Extract<Command, { kind: "excavate" }>,
) {
  const problem = terrainDigProblem(candidate.terrain, at.at);
  if (problem) return problem;
  const terrain = excavateTerrain(candidate.terrain, at.at);
  try {
    const registered = generatedBrewhouseRoom(terrain, candidate.opening);
    if (
      JSON.stringify(registered.definition) !==
      JSON.stringify(roomFor(candidate).definition)
    )
      return "fixed-room-air-geometry-required";
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.startsWith("brewhouse support changed at")
    )
      return "brewhouse-support-required";
    throw error;
  }
  const water = prepareWaterEnvironmentGeometry(
    candidate.water,
    waterSource(candidate.terrain),
    waterSource(terrain),
  );
  if (water.status === "blocked") return water.reason;
  const removals = prepareTerrainRemoval(
    candidate.removals,
    candidate.terrain,
    terrain,
    at.at,
    water.receipt.removedPoreWater,
  );
  const next = { ...candidate, terrain, water: water.state, removals };
  if (dryRoomProblem(next)) return "fixed-room-air-volume-must-stay-dry";
  validateSourceJoin(next);
  candidate.terrain = terrain;
  candidate.water = water.state;
  candidate.removals = removals;
  return null;
}

function applied(candidate: State, kind: Command["kind"]) {
  const result = roomResult(candidate);
  return {
    status: "applied" as const,
    result,
    events: [{ kind, ...result }],
  };
}

/** Fixed-volume room consumer: topology comes from generated terrain plus actual
 * building definitions, heat/tracer supply from one finite transformation, and
 * commitment/replay from the existing region transaction. Air and water receive
 * the same host interval; no timer, fuel counter or mutable committed RAM exists.
 */
export function createBrewhouseAirProgram(): RegionProgram<State, Command> {
  return {
    id: "goblin-generated-dry-room-v2",
    initial() {
      const opening = { open: false, revision: 0 },
        terrain = initialTerrain(),
        registered = generatedBrewhouseRoom(terrain, opening);
      return parseState({
        version: "goblin-generated-dry-room-v2",
        opening,
        burn: null,
        materials: initialRoomMaterials(),
        terrain,
        water: initialRoomWater(terrain),
        removals: initialTerrainRemovals(terrain),
        air: createAir(registered.definition).initial(registered.initialAir),
      });
    },
    parseState,
    parseCommand: (value) => commandSchema.parse(value),
    authorize: (principal, command) =>
      command.kind === "advance"
        ? principal === "room-host"
        : principal === "room-player",
    execute(candidate, command) {
      if (dryRoomProblem(candidate))
        return {
          status: "rejected",
          result: { reason: "fixed-room-air-volume-must-stay-dry" },
        };
      switch (command.kind) {
        case "ignite":
          if (candidate.burn !== null)
            return {
              status: "rejected",
              result: { reason: "fuel-already-used" },
            };
          prepareRoomFuel(candidate.materials);
          candidate.burn = { startS: candidate.air.timeS };
          break;
        case "vent": {
          // Geometry edits exchange no heat/smoke. Projection's kinetic loss is
          // reported explicitly; it is not silently converted into room heat.
          return changeVent(candidate, command.open);
        }
        case "excavate": {
          const problem = excavateRoom(candidate, command);
          if (problem)
            return { status: "rejected", result: { reason: problem } };
          break;
        }
        case "advance": {
          const plan = dose.plan(
            candidate.burn?.startS ?? null,
            candidate.air.timeS,
            command.seconds,
            ROOM_MIN_FIELD_INTERVAL_S,
          );
          if (plan.status === "blocked")
            return {
              status: "rejected",
              result: { reason: "fuel-boundary-below-field-interval" },
            };
          const problem = advanceRoom(candidate, plan.segments);
          if (problem)
            return { status: "rejected", result: { reason: problem } };
          break;
        }
      }
      return applied(candidate, command.kind);
    },
  };
}

function advanceRoom(
  candidate: State,
  segments: readonly ReleaseSegment<"heatJ" | "smokeKg">[],
) {
  const registered = roomFor(candidate),
    owner = createAir(registered.definition);
  let next = candidate.air,
    water = candidate.water;
  for (const segment of segments) {
    next = owner.advance(next, segment.seconds, {
      sources: segment.rates
        ? [
            {
              cellId: registered.sourceCell,
              smokeKgS: segment.rates.smokeKg,
              heatJS: segment.rates.heatJ,
            },
          ]
        : [],
    }).state;
    water = advanceWaterEnvironment(
      water,
      waterSource(candidate.terrain),
      segment.seconds,
    ).state;
    if (dryRoomProblem({ ...candidate, water }))
      return "fixed-room-air-volume-must-stay-dry";
  }
  validateSourceJoin({ ...candidate, air: next, water });
  candidate.air = next;
  candidate.water = water;
  return null;
}

export function roomResult(state: State): Record<string, Json> {
  const registered = roomFor(state),
    facts = createAir(registered.definition).read(state.air);
  const upstairs = facts.cells.find(
    (cell) => cell.cellId === registered.upstairsBreathingCell,
  )!;
  const downstairs = facts.cells.find(
    (cell) => cell.cellId === registered.downstairsBreathingCell,
  )!;
  return {
    timeS: state.air.timeS,
    fuelUnits: state.materials.lots.reduce((n, lot) => n + lot.quantity, 0),
    ventOpen: state.opening.open,
    emittedSmokeKg: state.air.smokeSourceKg,
    emittedHeatJ: state.air.heatSourceJ,
    remainingDoseFraction:
      1 - dose.read(state.burn?.startS ?? null, state.air.timeS).fraction,
    terrainRevision: state.terrain.world.revision,
    excavatedVoxels: state.removals.length,
    exportedWaterKg: removedWaterKg(state.removals),
    waterKg: roomWaterFacts(state).totalKg,
    upstairs: {
      smokeKgM3: upstairs.smokeKgM3,
      temperatureK: upstairs.temperatureK,
    },
    downstairs: {
      smokeKgM3: downstairs.smokeKgM3,
      temperatureK: downstairs.temperatureK,
    },
  };
}
