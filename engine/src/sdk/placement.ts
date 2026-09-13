import type { CardinalOrientation } from "../contracts";

export type PlacementCell = readonly [number, number, number];
export type PlacementArea = { readonly start: PlacementCell; readonly end: PlacementCell };
export type PlacementAlignment = "fixed" | "stroke";

/** Shared presentation/command geometry; this grants no physical admission. */
export function placementOrientation(
  alignment: PlacementAlignment,
  area: PlacementArea | undefined,
  explicit: CardinalOrientation | undefined,
): CardinalOrientation {
  if (explicit) return explicit;
  if (alignment !== "stroke" || !area) return "north";
  const dx = Math.abs(area.end[0] - area.start[0]);
  const dz = Math.abs(area.end[2] - area.start[2]);
  return dx >= dz ? "east" : "south";
}
