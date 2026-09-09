import { terrainCell, TERRAIN_VOXEL_METRIC, TERRAIN_FRAME } from "./terrain.ts";

// These faces describe the physical terrain, independently of its art or input.
// Every selected face names its actual world voxel, independent of logical storey.
export function terrainSurfaces(terrain, size) {
  const faces = [];
  for (let z = 0; z < size; z++)
    for (let x = 0; x < size; x++) {
      const cell = { x, z, level: 0 };
      const surface = terrainCell(terrain, x, z);
      const y = surface.height;
      faces.push({
        kind: surface.solid ? "ground" : "pit-floor",
        cell,
        owner: cell,
        ownerVoxel: surface.voxel,
        vertices: [
          { x: x - 0.5, y, z: z - 0.5 },
          { x: x - 0.5, y, z: z + 0.5 },
          { x: x + 0.5, y, z: z + 0.5 },
          { x: x + 0.5, y, z: z - 0.5 },
        ],
      });
      if (surface.solid) continue;
      appendCutWalls(faces, terrain, size, cell, y);
    }
  return faces;
}

function appendCutWalls(faces, terrain, size, cell, y) {
  const { x, z } = cell;
  for (const [dx, dz] of [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ]) {
    const nx = x + dx,
      nz = z + dz;
    if (nx < 0 || nz < 0 || nx >= size || nz >= size) continue;
    const neighbor = terrainCell(terrain, nx, nz);
    if (neighbor.height <= y) continue;
    const start = {
      x: x + dx * 0.5 - dz * 0.5,
      z: z + dz * 0.5 + dx * 0.5,
    };
    const end = { x: x + dx * 0.5 + dz * 0.5, z: z + dz * 0.5 - dx * 0.5 };
    for (
      let low = y;
      low < neighbor.height - 1e-9;
      low += TERRAIN_VOXEL_METRIC.verticalM
    ) {
      const high = Math.min(
        neighbor.height,
        low + TERRAIN_VOXEL_METRIC.verticalM,
      );
      faces.push({
        kind: "cut-wall",
        cell,
        owner: { x: nx, z: nz, level: 0 },
        ownerVoxel: [
          nx + TERRAIN_FRAME.x,
          Math.round(low / TERRAIN_VOXEL_METRIC.verticalM) + TERRAIN_FRAME.y,
          nz + TERRAIN_FRAME.z,
        ],
        vertices: [
          { ...start, y: low },
          { ...end, y: low },
          { ...end, y: high },
          { ...start, y: high },
        ],
      });
    }
  }
}
