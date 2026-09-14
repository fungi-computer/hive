import { affectedTerrainColumns, changedTerrainColumns } from "../../../src/art/terrain-faces.js";

export function planTerrainBandUpdates(previous = [], current = []) {
  const previousLevels = new Set(previous.map((surface) => surface.cell[1]));
  const currentLevels = new Set(current.map((surface) => surface.cell[1]));
  const changed = changedTerrainColumns(previous, current);
  const affected = affectedTerrainColumns(changed);
  const rebuildLevels = new Set();
  for (const { x, z } of affected) {
    const before = previous.find((surface) => surface.cell[0] === x && surface.cell[2] === z);
    const after = current.find((surface) => surface.cell[0] === x && surface.cell[2] === z);
    if (before) rebuildLevels.add(before.cell[1]);
    if (after) rebuildLevels.add(after.cell[1]);
  }
  return {
    rebuildLevels: [...rebuildLevels].sort((a, b) => a - b),
    removedLevels: [...previousLevels].filter((level) => !currentLevels.has(level)).sort((a, b) => a - b),
    levels: [...currentLevels].sort((a, b) => a - b),
  };
}
