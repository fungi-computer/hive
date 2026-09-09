import { assert } from "./data.mjs";
import { admitDefinition, buildGeometry } from "./definition.mjs";
import {
  copyState,
  facts,
  initialState,
  STATE_VERSION,
  validateState,
} from "./state.mjs";
import { advance } from "./advance.mjs";
import { rebind } from "./rebind.mjs";

const identityOf = (definition) =>
  JSON.stringify({
    version: STATE_VERSION,
    definition,
    transport: "muscl-mc-ssprk2-v1",
    momentum: "boussinesq-upwind-project-v1",
    clock: "request-local-compensated-v1",
    openings: "fixed-volume-metric-projection-v1",
  });

/** One private metric/transport/projection owner. No borrowed numerical geometry
 * or scratch escapes. Inputs are current plain data; results are uncommitted. */
export function createAir(input) {
  const definition = admitDefinition(input),
    g = buildGeometry(definition),
    identity = identityOf(definition);
  return Object.freeze({
    definition,
    identity,
    initial: (input) => initialState(g, identity, input),
    read: (state) => facts(g, identity, state),
    advance: (state, intervalS, options = {}) =>
      advance(g, identity, state, intervalS, options),
    rebind: (state, nextDefinition, options = {}) =>
      rebind(g, identity, state, nextDefinition, options, identityOf),
    encode: (state) => {
      validateState(g, identity, state);
      return JSON.stringify(state);
    },
    decode: (raw) => {
      assert(
        typeof raw === "string" && raw.length <= 524288,
        "bounded encoded air state",
      );
      const state = JSON.parse(raw);
      validateState(g, identity, state);
      return copyState(state);
    },
  });
}
