function key(cell) { return `${cell[0]},${cell[1]},${cell[2]}`; }
export function structureAnchor(frame, cell) {
  if (!frame || !Array.isArray(frame.structureSurfaces) || !Array.isArray(cell) || cell.length !== 3) return null;
  const surface = frame.structureSurfaces.find(candidate => candidate.cell.every((value, index) => value === cell[index]));
  return surface ? [...surface.cell] : null;
}
export function upperPlacementCandidates(frame, anchor) {
  if (!frame || !anchor || !structureAnchor(frame, anchor)) return [];
  const occupied = new Set([...(frame.surfaces ?? []).map(surface => key(surface.cell)), ...(frame.structureSurfaces ?? []).map(surface => key(surface.cell))]);
  return [[-1, 0], [1, 0], [0, -1], [0, 1]].map(([dx, dz]) => [anchor[0] + dx, anchor[1], anchor[2] + dz]).filter(cell => !occupied.has(key(cell)));
}
function inside(point, polygon) {
  let result = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const a = polygon[index], b = polygon[previous];
    if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) result = !result;
  }
  return result;
}
export function upperPlacementAt(point, frame, anchor, project) {
  if (!frame || !Number.isFinite(frame.verticalMetres) || typeof project !== "function") return null;
  for (const cell of upperPlacementCandidates(frame, anchor)) {
    const height = (cell[1] + 0.5) * frame.verticalMetres;
    const polygon = [[cell[0] - 0.5, cell[2] - 0.5], [cell[0] + 0.5, cell[2] - 0.5], [cell[0] + 0.5, cell[2] + 0.5], [cell[0] - 0.5, cell[2] + 0.5]].map(([x, z]) => { const projected = project(x, height, z); return { x: projected.x, y: projected.y }; });
    if (inside(point, polygon)) return cell;
  }
  return null;
}
