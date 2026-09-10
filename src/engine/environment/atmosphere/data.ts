import { decode, encode, type Json } from "../../region/codec.ts";
import { ATMOSPHERE_LIMITS } from "./limits.ts";

/** Reject executable/accessor inputs and detach repeated plain references. */
export function copyAtmosphereData(input: unknown): Json {
  return decode(
    encode(
      input,
      ATMOSPHERE_LIMITS.encodedStateBytes,
      ATMOSPHERE_LIMITS.dataNodes,
    ),
    ATMOSPHERE_LIMITS.encodedStateBytes,
    ATMOSPHERE_LIMITS.dataNodes,
  );
}
