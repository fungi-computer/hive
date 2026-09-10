import { encode, decode } from "../../region/codec.ts";
import { assertWorldRecord as record } from "../../world/data-contract.mjs";
import { changeQuantity, compensatedSum } from "../arithmetic.mjs";
import {
  compileWater,
  copyData,
  check,
  freeze,
  WIRE_BYTES,
} from "./geometry.mjs";
import { initial, stateAdmission, waterFacts } from "./state.mjs";
import { transferStep } from "./transport.mjs";

/** Finite game-scale water. The host supplies the interval and owns its clock,
 * physical completion and durable receipt; this module owns only water stocks.
 * Pressure through full roofed channels and gas displacement join before this
 * new owner can replace the current game's excavation consumer. */
export function createWater(definition) {
  const g = compileWater(definition),
    admission = stateAdmission(g);
  return Object.freeze({
    definition: g.definition,
    identity: g.identity,
    initial: (input) => admission.remember(initial(g, input)),
    parse: admission.parse,
    read: (input) => waterFacts(g, admission.parse(input)),
    advance(input, seconds) {
      const state = admission.parse(input);
      check(
        Number.isFinite(seconds) && seconds >= 0 && seconds <= 60,
        "bounded host water interval0..60s",
      );
      if (seconds === 0)
        return {
          state,
          receipt: freeze({ seconds, substeps: [], flows: [] }),
          work: { faces: 0, requests: 0, unresolved: 0 },
        };
      const steps = Math.ceil(seconds / 0.2),
        dtS = seconds / steps;
      check(
        steps * g.faces.length <= 262144,
        "bounded face work for one requested interval",
      );
      let massKg = state.massKg;
      const flows = new Map(),
        substeps = [],
        work = { faces: 0, requests: 0, unresolved: 0 };
      for (let step = 0; step < steps; step++) {
        const result = transferStep(g, massKg, dtS);
        massKg = result.massKg;
        substeps.push(dtS);
        for (const flow of result.flows) {
          const key = `${flow.faceId}:${flow.from}`;
          const prior = flows.get(key);
          if (prior) prior.parts.push(flow.massKg);
          else flows.set(key, { ...flow, parts: [flow.massKg] });
        }
        for (const key of Object.keys(work)) work[key] += result.work[key];
      }
      const next = admission.remember({ ...state, massKg });
      return {
        state: next,
        receipt: freeze({
          seconds,
          substeps,
          // These are summed observations, not a second physical stock.
          // The face-work bound also bounds the temporary component arrays.
          flows: [...flows.values()].map(({ parts, ...flow }) => ({
            ...flow,
            massKg: compensatedSum(parts),
          })),
        }),
        work,
      };
    },
    exchange(input, raw) {
      const state = admission.parse(input),
        command = copyData(raw);
      record(command, ["id", "direction", "massKg"], "finite water transfer");
      const i = g.index.get(command.id),
        amount = command.massKg;
      check(
        i !== undefined && g.nodes[i].kind === "void",
        "vessels transfer actual free water, not pore stock",
      );
      check(
        (command.direction === "withdraw" || command.direction === "deposit") &&
          Number.isFinite(amount) &&
          amount > 0,
        "finite transfer direction and amount",
      );
      const delta = command.direction === "withdraw" ? -amount : amount;
      check(
        delta < 0
          ? amount <= state.massKg[i]
          : amount <= g.nodes[i].capacityKg - state.massKg[i],
        "finite available water and receiving space",
      );
      const massKg = [...state.massKg];
      massKg[i] = changeQuantity(massKg[i], delta);
      const next = admission.remember({
        ...state,
        massKg,
        boundaryKg: changeQuantity(state.boundaryKg, delta),
      });
      return {
        state: next,
        receipt: freeze({
          ...command,
          beforeKg: state.massKg[i],
          afterKg: massKg[i],
          boundaryKg: delta,
        }),
      };
    },
    encode: (input) => encode(admission.parse(input), WIRE_BYTES),
    decode: (wire) => admission.parse(decode(wire, WIRE_BYTES)),
  });
}
