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

/** A remembered underground slice reads only saved observations. It never
 * samples unseen live terrain, including changes outside current sight. The
 * same returned faces feed the existing earth bake and nearest-face picker. */
export function observedTerrainSurfaces(exploration, level) {
  const base = TERRAIN_FRAME.y + level * TERRAIN_FRAME.storeyVoxels;
  const top = base + TERRAIN_FRAME.storeyVoxels;
  const records = new Map(
    exploration.observed.map((fact) => [
      `${fact.at.x},${fact.at.y},${fact.at.z}`,
      fact,
    ]),
  );
  const faces = [];
  for (const fact of exploration.observed) {
    const at = fact.at;
    if (fact.solid || at.y < base || at.y >= top) continue;
    const x = at.x - TERRAIN_FRAME.x,
      z = at.z - TERRAIN_FRAME.z;
    const cell = { x, z, level };
    const low = (at.y - TERRAIN_FRAME.y) * TERRAIN_VOXEL_METRIC.verticalM;
    const below = records.get(`${at.x},${at.y - 1},${at.z}`);
    if (below?.terrainSolid)
      faces.push({
        kind: "pit-floor",
        cell,
        owner: cell,
        ownerVoxel: [at.x, at.y - 1, at.z],
        vertices: [
          { x: x - 0.5, y: low, z: z - 0.5 },
          { x: x - 0.5, y: low, z: z + 0.5 },
          { x: x + 0.5, y: low, z: z + 0.5 },
          { x: x + 0.5, y: low, z: z - 0.5 },
        ],
      });
    for (const [dx, dz] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ]) {
      const neighbor = records.get(`${at.x + dx},${at.y},${at.z + dz}`);
      if (!neighbor?.terrainSolid) continue;
      const start = { x: x + dx * 0.5 - dz * 0.5, z: z + dz * 0.5 + dx * 0.5 };
      const end = { x: x + dx * 0.5 + dz * 0.5, z: z + dz * 0.5 - dx * 0.5 };
      faces.push({
        kind: "cut-wall",
        cell,
        owner: { x: x + dx, z: z + dz, level },
        ownerVoxel: [at.x + dx, at.y, at.z + dz],
        vertices: [
          { ...start, y: low },
          { ...end, y: low },
          { ...end, y: low + TERRAIN_VOXEL_METRIC.verticalM },
          { ...start, y: low + TERRAIN_VOXEL_METRIC.verticalM },
        ],
      });
    }
  }
  return faces;
}
