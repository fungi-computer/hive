import type { CardinalOrientation } from "../contracts";
import type { EnvironmentStructureShape } from "./environment";

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

/** Convert a selected supporting surface into the canonical structure origin. */
export function structureOriginCell(shape: EnvironmentStructureShape, support: PlacementCell): PlacementCell {
  const [x, y, z] = support;
  switch (shape.kind) {
    case "wall": case "aperture": case "fixture": return [x, y + 1, z];
    case "floor": case "cover": case "stair": return support;
  }
}
