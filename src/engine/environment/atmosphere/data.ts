import { decode, encode, type Json } from "../../region/codec.ts";

export const ATMOSPHERE_DATA_BYTES = 1024 * 1024;

/** Reject executable, accessor and aliased inputs before physical parsing. */
export function copyAtmosphereData(input: unknown): Json {
  return decode(encode(input, ATMOSPHERE_DATA_BYTES), ATMOSPHERE_DATA_BYTES);
}
