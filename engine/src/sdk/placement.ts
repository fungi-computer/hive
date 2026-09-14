import type { CardinalOrientation } from "../contracts";
import type { EnvironmentStructureShape } from "./environment";
import type { EntityId, FloorOperation, StructureSurface } from "../contracts";

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

export function resolveFloorOperation(
  cell: PlacementCell,
  desiredCatalog: string,
  sites: readonly { readonly id: EntityId; readonly state: { readonly phase: string; readonly x: number; readonly y: number; readonly z: number; readonly catalog: string; readonly replacementTarget?: EntityId | null } }[],
  surfaces: readonly StructureSurface[],
): FloorOperation {
  if (!desiredCatalog || cell.some(value => !Number.isSafeInteger(value))) return { kind: "invalid", reason: "invalid floor request" };
  const floor = sites.find(site => site.state.phase === "finished" && site.state.x === cell[0] && site.state.y === cell[1] && site.state.z === cell[2]);
  if (floor) {
    if (floor.state.catalog === desiredCatalog) return { kind: "unchanged", floor: floor.id };
    if (sites.some(site => site.state.replacementTarget === floor.id)) return { kind: "conflict", floor: floor.id };
    return { kind: "replace", floor: floor.id };
  }
  if (!surfaces.some(surface => surface.cell[0] === cell[0] && surface.cell[1] === cell[1] && surface.cell[2] === cell[2])) return { kind: "waiting-for-support" };
  return { kind: "build" };
}
