/** Region wire values are data. Executable program/host capabilities are never saved. */
export type Json =
  null | boolean | number | string | Json[] | { [key: string]: Json };

/** Hosts may declare a larger structural budget for a bounded dense field.
 * Byte and structural limits remain separate; ordinary callers keep 65,536. */
export function encode(
  value: unknown,
  maxBytes: number,
  maxNodes = 65_536,
): string {
  if (!Number.isSafeInteger(maxNodes) || maxNodes < 1 || maxNodes > 4_194_304)
    throw new Error("region-structural-budget-invalid");
  let nodes = 0;
  function visit(input: unknown, depth: number): Json {
    if (++nodes > maxNodes || depth > 64) throw new Error("region-data-budget");
    if (
      input === null ||
      typeof input === "boolean" ||
      typeof input === "string"
    )
      return input;
    if (typeof input === "number" && Number.isFinite(input)) return input;
    if (typeof input !== "object" || input === null)
      throw new Error("region-data-invalid");
    if (Array.isArray(input)) {
      if (
        Object.getPrototypeOf(input) !== Array.prototype ||
        Reflect.ownKeys(input).length !== input.length + 1
      )
        throw new Error("region-array-invalid");
      return Array.from({ length: input.length }, (_, i) => {
        const property = Object.getOwnPropertyDescriptor(input, String(i));
        if (!property || !("value" in property))
          throw new Error("region-array-invalid");
        return visit(property.value, depth + 1);
      });
    }
    const prototype = Object.getPrototypeOf(input);
    if (prototype !== Object.prototype && prototype !== null)
      throw new Error("region-record-invalid");
    const result: { [key: string]: Json } = Object.create(null);
    for (const key of Reflect.ownKeys(input).sort((a, b) =>
      String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0,
    )) {
      if (typeof key !== "string") throw new Error("region-record-invalid");
      const property = Object.getOwnPropertyDescriptor(input, key)!;
      if (!("value" in property) || !property.enumerable)
        throw new Error("region-record-invalid");
      result[key] = visit(property.value, depth + 1);
    }
    return result;
  }
  const wire = JSON.stringify(visit(value, 0));
  if (new TextEncoder().encode(wire).byteLength > maxBytes)
    throw new Error("region-byte-budget");
  return wire;
}

export function decode(
  wire: string,
  maxBytes: number,
  maxNodes = 65_536,
): Json {
  if (new TextEncoder().encode(wire).byteLength > maxBytes)
    throw new Error("region-byte-budget");
  const value = JSON.parse(wire);
  // Validate old storage, including data shape/depth, before the program sees it.
  encode(value, maxBytes, maxNodes);
  return value;
}
