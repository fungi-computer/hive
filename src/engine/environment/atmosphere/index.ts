import { advanceAtmosphere } from "./advance.ts";
import { ATMOSPHERE_LIMITS, compileAtmosphere } from "./definition.ts";
import { rebindAtmosphere } from "./rebind.ts";
import { atmosphereFacts, initialState, validateState } from "./state.ts";

export type {
  AtmosphereAdvanceReceipt,
  AtmosphereDefinition,
  AtmosphereFacts,
  AtmosphereMember,
  AtmosphereModel,
  AtmosphereOpeningDefinition,
  AtmosphereParcel,
  AtmosphereRebindReceipt,
  AtmosphereRebindResult,
  AtmosphereSource,
  AtmosphereState,
  AtmosphereVolumeDefinition,
  AtmosphereVolumeFacts,
} from "./types.ts";
export { ATMOSPHERE_LIMITS };

/**
 * Finite carrier gas, smoke tracer, sensible heat and bounded exchange over a
 * caller-defined room graph. This owner stores no clock, fuel, release cursor,
 * world cells or durable receipt. All results are detached candidates.
 */
export function createAtmosphere(input: unknown) {
  const compiled = compileAtmosphere(input);
  return Object.freeze({
    definition: compiled.definition,
    identity: compiled.identity,
    initial: (parcels: unknown) => initialState(compiled, parcels),
    read: (state: unknown) => atmosphereFacts(compiled, state),
    advance: (
      state: unknown,
      seconds: number,
      options: Parameters<typeof advanceAtmosphere>[3] = {},
    ) => advanceAtmosphere(compiled, state, seconds, options),
    rebind: (state: unknown, nextDefinition: unknown) =>
      rebindAtmosphere(compiled, state, nextDefinition),
    encode: (state: unknown) => {
      const encoded = JSON.stringify(validateState(compiled, state));
      if (
        new TextEncoder().encode(encoded).byteLength >
        ATMOSPHERE_LIMITS.encodedStateBytes
      )
        throw new Error("encoded atmosphere state exceeds its byte budget");
      return encoded;
    },
    decode: (raw: string) => {
      if (
        typeof raw !== "string" ||
        new TextEncoder().encode(raw).byteLength >
          ATMOSPHERE_LIMITS.encodedStateBytes
      )
        throw new TypeError("bounded encoded atmosphere state required");
      return validateState(compiled, JSON.parse(raw));
    },
  });
}
