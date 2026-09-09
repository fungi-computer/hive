import { terrainCell } from "./terrain.ts";

// These faces describe the physical terrain, independently of its art or input.
// A cut wall belongs to the solid neighbor; its opening is the backfill target.
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
        vertices: [
          { x: x - 0.5, y, z: z - 0.5 },
          { x: x - 0.5, y, z: z + 0.5 },
          { x: x + 0.5, y, z: z + 0.5 },
          { x: x + 0.5, y, z: z - 0.5 },
        ],
      });
      if (surface.solid) continue;
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
        faces.push({
          kind: "cut-wall",
          cell,
          owner: { x: nx, z: nz, level: 0 },
          vertices: [
            { ...start, y },
            { ...end, y },
            { ...end, y: neighbor.height },
            { ...start, y: neighbor.height },
          ],
        });
      }
    }
  return faces;
}
