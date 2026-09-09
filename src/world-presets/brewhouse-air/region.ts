import { z } from "zod";
import { createAir } from "../../engine/environment/air/index.js";
import type { Json, RegionProgram } from "../../engine/region/index.ts";
import type { MaterialsState } from "../../engine/materials/index.ts";
import type { Material } from "../../model.ts";
import { BREWHOUSE_ROOM, roomAirDefinition, roomInitialAir } from "./room.ts";
import {
  ROOM_FUEL,
  roomMaterials,
  roomHearth,
  initialRoomMaterials,
  prepareRoomFuel,
  validateRoomFuel,
} from "./fuel.ts";

const stateSchema = z.strictObject({
  version: z.literal("goblin-warm-room-v1"),
  opening: z.strictObject({
    open: z.boolean(),
    revision: z.number().int().nonnegative(),
  }),
  burn: z.strictObject({ startS: z.number().nonnegative() }).nullable(),
  materials: z.unknown(),
  air: z.unknown(),
});
const commandSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("ignite") }),
  z.strictObject({ kind: z.literal("vent"), open: z.boolean() }),
  z.strictObject({
    kind: z.literal("advance"),
    seconds: z.number().positive().max(6),
  }),
]);
type AirState = ReturnType<ReturnType<typeof createAir>["initial"]>;
type State = Omit<z.infer<typeof stateSchema>, "materials" | "air"> & {
  materials: MaterialsState<Material>;
  air: AirState;
};
type Command = z.infer<typeof commandSchema>;
const airOwner = (opening: State["opening"]) =>
  createAir(roomAirDefinition(opening.open, opening.revision));

function emittedFraction(state: State) {
  return state.burn === null
    ? 0
    : Math.min(1, (state.air.timeS - state.burn.startS) / ROOM_FUEL.durationS);
}
function validateSourceJoin(state: State) {
  if (state.burn !== null && state.burn.startS > state.air.timeS)
    throw new Error("room fuel starts after the physical clock");
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
    owner = airOwner(parsed.opening);
  const state: State = {
    ...parsed,
    materials: roomMaterials.restore({ schema: 1, state: parsed.materials }, [
      roomHearth,
    ]),
    air: owner.decode(JSON.stringify(parsed.air)),
  };
  validateSourceJoin(state);
  return state;
}

/** Fixed-volume room consumer: topology comes from actual building definitions,
 * heat/tracer supply from an ordinary finite recipe transformation, time from
 * the air owner, and commitment/replay from the existing region transaction.
 * No timer, callback source, fuel counter or mutable committed RAM is introduced.
 */
export function createBrewhouseAirProgram(): RegionProgram<State, Command> {
  return {
    id: "goblin-warm-room-v1",
    initial() {
      const opening = { open: false, revision: 0 };
      return parseState({
        version: "goblin-warm-room-v1",
        opening,
        burn: null,
        materials: initialRoomMaterials(),
        air: airOwner(opening).initial(roomInitialAir()),
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
          if (candidate.opening.open === command.open)
            return {
              status: "rejected",
              result: { reason: "opening-unchanged" },
            };
          const opening = {
            open: command.open,
            revision: candidate.opening.revision + 1,
          };
          const rebound = airOwner(candidate.opening).rebind(
            candidate.air,
            roomAirDefinition(opening.open, opening.revision),
          );
          candidate.air = rebound.state;
          candidate.opening = opening;
          // Geometry edits exchange no heat/smoke. Projection's kinetic loss is
          // reported explicitly; it is not silently converted into room heat.
          return {
            status: "applied",
            result: roomResult(candidate),
            events: [
              {
                kind: "vent",
                ...rebound.receipt,
                newFaces: [...rebound.receipt.newFaces],
                closedFaces: [...rebound.receipt.closedFaces],
              },
            ],
          };
        }
        case "advance":
          advanceRoom(candidate, command.seconds);
          break;
      }
      const result = roomResult(candidate);
      return {
        status: "applied",
        result,
        events: [{ kind: command.kind, ...result }],
      };
    },
  };
}

function advanceRoom(candidate: State, seconds: number) {
  const owner = airOwner(candidate.opening);
  const fuelLeftS =
    candidate.burn === null
      ? 0
      : Math.max(
          0,
          candidate.burn.startS + ROOM_FUEL.durationS - candidate.air.timeS,
        );
  const firingS = Math.min(seconds, fuelLeftS);
  let next = candidate.air;
  if (firingS > 0)
    next = owner.advance(next, firingS, {
      sources: [
        {
          cellId: BREWHOUSE_ROOM.sourceCell,
          smokeKgS: ROOM_FUEL.smokeKg / ROOM_FUEL.durationS,
          heatJS: ROOM_FUEL.heatJ / ROOM_FUEL.durationS,
        },
      ],
    }).state;
  if (seconds > firingS) next = owner.advance(next, seconds - firingS).state;
  candidate.air = next;
}

export function roomResult(state: State): Record<string, Json> {
  const facts = airOwner(state.opening).read(state.air);
  const upstairs = facts.cells.find(
    (cell) => cell.cellId === BREWHOUSE_ROOM.upstairsBreathingCell,
  )!;
  const downstairs = facts.cells.find(
    (cell) => cell.cellId === BREWHOUSE_ROOM.downstairsBreathingCell,
  )!;
  return {
    timeS: state.air.timeS,
    fuelUnits: state.materials.lots.reduce((n, lot) => n + lot.quantity, 0),
    ventOpen: state.opening.open,
    emittedSmokeKg: state.air.smokeSourceKg,
    emittedHeatJ: state.air.heatSourceJ,
    remainingDoseFraction: state.burn === null ? 1 : 1 - emittedFraction(state),
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
