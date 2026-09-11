import type { PhysicalContact } from "../contracts";

/** Validate the whole read before crossing into the native geometry owner. */
export function physicalContactQuery(
  read: (json: string) => string,
  cells: readonly [number, number, number][],
): readonly PhysicalContact[] {
  if (!Array.isArray(cells) || cells.length < 1 || cells.length > 64 ||
    cells.some(cell => !Array.isArray(cell) || cell.length !== 3 ||
      cell.some((value, axis) => !Number.isSafeInteger(value) ||
        (axis === 1 && (value < -2147483648 || value > 2147483647)))))
    throw new Error("physical contact query requires 1..64 valid cells");
  const result: unknown = JSON.parse(read(JSON.stringify(cells)));
  if (!Array.isArray(result) || result.length !== cells.length || result.some(value =>
    !value || typeof value !== "object" || Array.isArray(value) ||
    typeof value.solid !== "boolean" || typeof value.sealedTop !== "boolean" || typeof value.outside !== "boolean" ||
    (value.outside && (value.solid || value.sealedTop))))
    throw new Error("invalid physical contact result");
  return result.map(value => Object.freeze({ solid: value.solid, sealedTop: value.sealedTop, outside: value.outside }));
}
