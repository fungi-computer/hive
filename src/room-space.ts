import type { Footing } from "./engine/world/footing.ts";
import type { createStructureGeometry } from "./structure-environment.ts";
import {
  placementFooting,
  placementKey,
  placementNeighbors,
  insidePlacement,
} from "./game-space.ts";

/** Shelter classification on one physical floor plane. Doorways count as the
 * game's shelter boundary; air permeability remains a separate physical fact.
 * Natural walls and built walls/floors come from the same geometry query. */
export function roomInterior(
  geometry: ReturnType<typeof createStructureGeometry>,
  level: number,
  doors: ReadonlySet<string>,
  landings: ReadonlySet<string>,
): Set<string> {
  const supported = new Set<string>(),
    boundary = new Set<string>();
  const cells: { x: number; z: number; level: number }[] = [];
  const coordinate = (at: Footing): [number, number, number] => [
    at.x,
    at.y,
    at.z,
  ];
  for (let x = 0; x < 15; x++)
    for (let z = 0; z < 15; z++) {
      const cell = { x, z, level },
        key = placementKey(cell),
        at = placementFooting(cell);
      const point = geometry.point(coordinate(at));
      if (point === "unresolved") continue;
      cells.push(cell);
      if (point === "solid" || doors.has(key)) boundary.add(key);
      if (
        point === "empty" &&
        (geometry.point([at.x, at.y - 1, at.z]) === "solid" ||
          geometry.face("y", coordinate(at)) === "closed" ||
          landings.has(key))
      )
        supported.add(key);
    }
  const outside = new Set<string>();
  const queue = cells.filter(
    (cell) =>
      supported.has(placementKey(cell)) &&
      placementNeighbors(cell).some(
        (next) =>
          !insidePlacement(next) ||
          (!supported.has(placementKey(next)) &&
            !boundary.has(placementKey(next))),
      ),
  );
  for (let i = 0; i < queue.length; i++) {
    const cell = queue[i],
      key = placementKey(cell);
    if (outside.has(key) || boundary.has(key)) continue;
    outside.add(key);
    for (const next of placementNeighbors(cell))
      if (supported.has(placementKey(next))) queue.push(next);
  }
  return new Set(
    [...supported].filter((key) => !outside.has(key) && !boundary.has(key)),
  );
}
