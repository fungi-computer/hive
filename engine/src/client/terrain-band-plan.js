import { affectedTerrainColumns, changedTerrainColumns, terrainColumnMap, terrainChunkKey } from "../../../src/art/terrain-faces.js";

export function planTerrainBandUpdates(previous = [], current = []) {
  const previousLevels = new Set(previous.map((surface) => surface.cell[1]));
  const currentLevels = new Set(current.map((surface) => surface.cell[1]));
  const beforeByColumn = terrainColumnMap(previous);
  const afterByColumn = terrainColumnMap(current);
  const changed = changedTerrainColumns(previous, current);
  const affected = affectedTerrainColumns(changed);
  const rebuildChunks = new Set();
  const rebuildLevels = new Set();
  for (const { x, z } of affected) {
    const key = `${x},${z}`;
    const before = beforeByColumn.get(key);
    const after = afterByColumn.get(key);
    if (before) rebuildLevels.add(before.cell[1]);
    if (after) rebuildLevels.add(after.cell[1]);
    if (before) rebuildChunks.add(`${before.cell[1]}:${terrainChunkKey(x, z)}`);
    if (after) rebuildChunks.add(`${after.cell[1]}:${terrainChunkKey(x, z)}`);
  }
  return {
    rebuildLevels: [...rebuildLevels].sort((a, b) => a - b),
    rebuildChunks: [...rebuildChunks].sort(),
    removedLevels: [...previousLevels].filter((level) => !currentLevels.has(level)).sort((a, b) => a - b),
    levels: [...currentLevels].sort((a, b) => a - b),
  };
}
