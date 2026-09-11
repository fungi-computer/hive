import { terrainPlaneCell } from "./geometry.js";

function sameCell(a, b) { return a[0] === b[0] && a[1] === b[1] && a[2] === b[2]; }
const candidateCache = new WeakMap();
export function structureAnchor(frame, cell) {
  if (!frame || !Array.isArray(frame.structureSurfaces) || !Array.isArray(cell) || cell.length !== 3) return null;
  const surface = frame.structureSurfaces.find(candidate => candidate.cell.every((value, index) => value === cell[index]));
  return surface ? [...surface.cell] : null;
}
export function upperPlacementCandidates(frame, anchor) {
  if (!frame || !anchor) return [];
  let byAnchor = candidateCache.get(frame);
  if (!byAnchor) { byAnchor = new Map(); candidateCache.set(frame, byAnchor); }
  const cacheKey = anchor.join(",");
  const cached = byAnchor.get(cacheKey);
  if (cached) return cached;
  if (!structureAnchor(frame, anchor)) return [];
  const result = [[-1, 0], [1, 0], [0, -1], [0, 1]]
    .map(([dx, dz]) => [anchor[0] + dx, anchor[1], anchor[2] + dz])
    .filter(cell => !(frame.surfaces ?? []).some(surface => sameCell(surface.cell, cell)) &&
      !(frame.structureSurfaces ?? []).some(surface => sameCell(surface.cell, cell)));
  byAnchor.set(cacheKey, result);
  return result;
}
export function upperPlacementAt(point, frame, anchor) {
  if (!frame || !anchor || !Number.isFinite(frame.verticalMetres)) return null;
  const cell = terrainPlaneCell(point.x, point.y, anchor?.[1], frame.verticalMetres);
  return upperPlacementCandidates(frame, anchor).find(candidate => sameCell(candidate, cell)) ?? null;
}
