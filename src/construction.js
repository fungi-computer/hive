// The one shelter type: a 2×2 timber lean-to, bought with six chopped wood.
// Placement and reachability are shared by the preview and command admission.
import { approach, cellKey } from "./movement.js";
export const SHELTER_COST = 6;
export const BUILD_TICKS = 100;
export function footprint(at) {
  return [
    { x: at.x, z: at.z },
    { x: at.x + 1, z: at.z },
    { x: at.x, z: at.z + 1 },
    { x: at.x + 1, z: at.z + 1 },
  ];
}
export function buildRoute(pawn, at, blocked) {
  const occupied = new Set([...blocked, ...footprint(at).map(cellKey)]);
  return (
    footprint(at)
      .map((cell) => approach(pawn, cell, occupied))
      .filter((path) => path !== null)
      .sort((a, b) => a.length - b.length)[0] ?? null
  );
}
export function placementProblem(state, at, blocked) {
  if (
    !at ||
    !Number.isInteger(at.x) ||
    !Number.isInteger(at.z) ||
    at.x < 0 ||
    at.z < 0 ||
    at.x > 5 ||
    at.z > 5
  )
    return "Keep the whole shelter inside the clearing.";
  if (
    footprint(at).some(
      (cell) =>
        blocked.has(cellKey(cell)) || cellKey(cell) === cellKey(state.pawn),
    )
  )
    return "That footprint is occupied. Choose clear ground.";
  if (state.wood < SHELTER_COST)
    return `Needs ${SHELTER_COST} wood. Chop an oak first.`;
  if (!buildRoute(state.pawn, at, blocked))
    return "Rowan cannot reach this building site.";
  return "";
}
