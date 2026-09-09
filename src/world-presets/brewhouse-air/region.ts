import { z } from "zod";
import { createAir } from "../../engine/environment/air/index.js";
import type { Json, RegionProgram } from "../../engine/region/index.ts";
import type { MaterialsState } from "../../engine/materials/index.ts";
import type { Material } from "../../model.ts";
import {
  advanceTerrain,
  excavateTerrain,
  initialTerrain,
  parseClosedTerrain,
  terrainDigProblem,
  terrainFacts,
  type GeneratedTerrain,
  voxelSchema,
} from "../goblin-terrain.ts";
import { generatedBrewhouseRoom } from "./generated-room.ts";
import { ROOM_MIN_FIELD_INTERVAL_S } from "./room.ts";
import {
  ROOM_FUEL,
  roomMaterials,
  roomHearth,
  initialRoomMaterials,
  prepareRoomFuel,
  validateRoomFuel,
} from "./fuel.ts";

const stateSchema = z.strictObject({
  version: z.literal("goblin-generated-warm-room-v1"),
  opening: z.strictObject({
    open: z.boolean(),
    revision: z.number().int().nonnegative(),
  }),
  burn: z.strictObject({ startS: z.number().nonnegative() }).nullable(),
  materials: z.unknown(),
  terrain: z.unknown(),
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
  "materials" | "terrain" | "air"
> & {
  materials: MaterialsState<Material>;
  terrain: GeneratedTerrain;
  air: AirState;
};
type Command = z.infer<typeof commandSchema>;
const roomFor = (state: Pick<State, "terrain" | "opening">) =>
  generatedBrewhouseRoom(state.terrain, state.opening);
const airOwner = (state: Pick<State, "terrain" | "opening">) =>
  createAir(roomFor(state).definition);

function emittedFraction(state: State) {
  return state.burn === null
    ? 0
    : Math.min(1, (state.air.timeS - state.burn.startS) / ROOM_FUEL.durationS);
}
function fuelRemainingS(state: State) {
  return state.burn === null
    ? 0
    : Math.max(0, state.burn.startS + ROOM_FUEL.durationS - state.air.timeS);
}
function advanceProblem(state: State, seconds: number) {
  const before = fuelRemainingS(state),
    firing = Math.min(seconds, before),
    coast = seconds - firing,
    after = Math.max(0, before - firing);
  return [firing, coast, after].some(
    (interval) => interval > 0 && interval < ROOM_MIN_FIELD_INTERVAL_S,
  )
    ? "fuel-boundary-below-field-interval"
    : null;
}
function validateSourceJoin(state: State) {
  if (state.air.timeS !== terrainFacts(state.terrain).timeS)
    throw new Error("room field clocks disagree");
  if (state.burn !== null && state.burn.startS > state.air.timeS)
    throw new Error("room fuel starts after the physical clock");
  const remainingS = fuelRemainingS(state);
  if (remainingS > 0 && remainingS < ROOM_MIN_FIELD_INTERVAL_S)
    throw new Error("room fuel remainder is below the shared field interval");
  validateRoomFuel(state.materials, state.burn !== null);
  const fraction = emittedFraction(state);
  if (
    state.air.initialHeatJ !== 0 ||
    state.air.initialSmokeKg !== 0 ||
    Math.abs(state.air.heatSourceJ - ROOM_FUEL.heatJ * fraction) > 1e-5 ||
    Math.abs(state.air.smokeSourceKg - ROOM_FUEL.smokeKg * fraction) > 1e-10
  )
    throw new Error(
      "air sources disagree with finite fuel transformation and clock",
    );
}
function parseState(value: unknown): State {
  const parsed = stateSchema.parse(value),
    terrain = parseClosedTerrain(parsed.terrain),
    registered = generatedBrewhouseRoom(terrain, parsed.opening),
    owner = createAir(registered.definition);
  const state: State = {
    ...parsed,
    terrain,
    materials: roomMaterials.restore({ schema: 1, state: parsed.materials }, [
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
    rebound = airOwner(candidate).rebind(
      candidate.air,
      registered.definition,
    );
  const openedFaceCount = rebound.receipt.newFaces.length,
    closedFaceCount = rebound.receipt.closedFaces.length,
    changedFaceCount = registered.shutterFaces.length;
  if (
    (open &&
      (openedFaceCount !== changedFaceCount || closedFaceCount !== 0)) ||
    (!open &&
      (openedFaceCount !== 0 || closedFaceCount !== changedFaceCount))
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
    generatedBrewhouseRoom(terrain, candidate.opening);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.startsWith("brewhouse support changed at")
    )
      return "brewhouse-support-required";
    throw error;
  }
  candidate.terrain = terrain;
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
 * commitment/replay from the existing region transaction. Air and soil receive
 * the same host interval; no timer, fuel counter or mutable committed RAM exists.
 */
export function createBrewhouseAirProgram(): RegionProgram<State, Command> {
  return {
    id: "goblin-generated-warm-room-v1",
    initial() {
      const opening = { open: false, revision: 0 },
        terrain = initialTerrain(),
        registered = generatedBrewhouseRoom(terrain, opening);
      return parseState({
        version: "goblin-generated-warm-room-v1",
        opening,
        burn: null,
        materials: initialRoomMaterials(),
        terrain,
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
          const problem = advanceProblem(candidate, command.seconds);
          if (problem)
            return { status: "rejected", result: { reason: problem } };
          advanceRoom(candidate, command.seconds);
          break;
        }
      }
      return applied(candidate, command.kind);
    },
  };
}

function advanceRoom(candidate: State, seconds: number) {
  const registered = roomFor(candidate),
    owner = createAir(registered.definition);
  const fuelLeftS = fuelRemainingS(candidate);
  const firingS = Math.min(seconds, fuelLeftS);
  let next = candidate.air,
    terrain = candidate.terrain;
  if (firingS > 0) {
    next = owner.advance(next, firingS, {
      sources: [
        {
          cellId: registered.sourceCell,
          smokeKgS: ROOM_FUEL.smokeKg / ROOM_FUEL.durationS,
          heatJS: ROOM_FUEL.heatJ / ROOM_FUEL.durationS,
        },
      ],
    }).state;
    terrain = advanceTerrain(terrain, firingS);
  }
  if (seconds > firingS) {
    next = owner.advance(next, seconds - firingS).state;
    terrain = advanceTerrain(terrain, seconds - firingS);
  }
  if (next.timeS !== terrainFacts(terrain).timeS)
    throw new Error("room field clocks disagree after advance");
  candidate.air = next;
  candidate.terrain = terrain;
}

export function roomResult(state: State): Record<string, Json> {
  const registered = roomFor(state),
    facts = createAir(registered.definition).read(state.air),
    terrain = terrainFacts(state.terrain);
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
    remainingDoseFraction: state.burn === null ? 1 : 1 - emittedFraction(state),
    terrainRevision: state.terrain.world.revision,
    excavatedVoxels: state.terrain.exports.length,
    exportedWaterKg: state.terrain.exports.reduce(
      (sum, source) => sum + source.waterKg,
      0,
    ),
    fieldTimeS: terrain.timeS,
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
