import { assertWorldRecord } from "../../world/data-contract.mjs";

/** Admission/workload bounds, never a physical material or map permission. */
export const DEFAULT_WATER_LIMITS = Object.freeze({
  cells: 2048,
  faces: 6144,
  wireBytes: 2 * 1024 * 1024,
  dataNodes: 65_536,
});
const maximum = Object.freeze({
  cells: 65_536,
  faces: 196_608,
  wireBytes: 32 * 1024 * 1024,
  dataNodes: 4_194_304,
});

export function waterLimits(input = DEFAULT_WATER_LIMITS) {
  assertWorldRecord(input, Object.keys(maximum), "water admission limits");
  for (const [key, bound] of Object.entries(maximum)) {
    if (
      !Number.isSafeInteger(input[key]) ||
      input[key] < 1 ||
      input[key] > bound
    )
      throw new TypeError(`invalid water ${key} admission limit`);
  }
  return Object.freeze({ ...input });
}
