import type { Clearing } from "./model.ts";
export function looseWood(state: Clearing): number {
  return state.materials.lots.reduce(
    (n, lot) =>
      n +
      (lot.material === "wood" && lot.location.kind === "ground"
        ? lot.quantity
        : 0),
    0,
  );
}
