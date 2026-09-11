import { terrainPlaneCell } from "./geometry.js";

function sameCell(a, b) { return a[0] === b[0] && a[1] === b[1] && a[2] === b[2]; }
export function structureAnchor(frame, cell) {
  if (!frame || !Array.isArray(frame.structureSurfaces) || !Array.isArray(cell) || cell.length !== 3) return null;
  const surface = frame.structureSurfaces.find(candidate => candidate.cell.every((value, index) => value === cell[index]));
  return surface ? [...surface.cell] : null;
}
export function upperPlacementCandidates(frame, anchor) {
  if (!frame || !anchor) return [];
  if (!structureAnchor(frame, anchor)) return [];
  return [[-1, 0], [1, 0], [0, -1], [0, 1]]
    .map(([dx, dz]) => [anchor[0] + dx, anchor[1], anchor[2] + dz])
    .filter(cell => !(frame.surfaces ?? []).some(surface => sameCell(surface.cell, cell)) &&
      !(frame.structureSurfaces ?? []).some(surface => sameCell(surface.cell, cell)));
}
export function upperPlacementAt(point, frame, anchor) {
  if (!frame || !anchor || !Number.isFinite(frame.verticalMetres)) return null;
  const cell = terrainPlaneCell(point.x, point.y, anchor?.[1], frame.verticalMetres);
  return upperPlacementCandidates(frame, anchor).find(candidate => sameCell(candidate, cell)) ?? null;
}

/** Per-client bounded cache; water-only frames retain the published arrays. */
export function createUpperPlacementCache() {
  let last;
  const candidates = (frame, anchor) => {
    const earth = frame?.surfaces;
    const structures = frame?.structureSurfaces;
    const anchorKey = anchor?.join(",");
    if (last && last.earth === earth && last.structures === structures && last.anchorKey === anchorKey)
      return last.result;
    const result = upperPlacementCandidates(frame, anchor);
    last = { earth, structures, anchorKey, result };
    return result;
  };
  return {
    candidates,
    at(point, frame, anchor) {
      if (!frame || !anchor || !Number.isFinite(frame.verticalMetres)) return null;
      const cell = terrainPlaneCell(point.x, point.y, anchor[1], frame.verticalMetres);
      return candidates(frame, anchor).find(candidate => sameCell(candidate, cell)) ?? null;
    },
  };
}
