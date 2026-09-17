const spriteQuad = ({ x, y }, width = 64, height = 64) => [
  { x: x - width / 2, y: y - height / 2 },
  { x: x - width / 2, y: y + height / 2 },
  { x: x + width / 2, y: y + height / 2 },
  { x: x + width / 2, y: y - height / 2 },
];

/** Selects checked baked frames. Geometry and ordering remain owned by the
 * terrain records; transparent atlas padding never becomes ordering geometry.
 */
export function createTerrainFaceAppearance({ pack } = {}) {
  if (!pack?.body || !pack?.cover) throw new Error("terrain appearance requires a living terrain pack");
  function body({ cell, face, art, seed, projection, verticalMetres }) {
    if (!art) throw new Error(`terrain material ${cell.join(",")} has no art definition`);
    const root = projection.project({ x: cell[0], y: (cell[1] + 0.5) * verticalMetres, z: cell[2] });
    return { terrainBatch: pack.body({ art, face, cell, seed }), projected: spriteQuad(root) };
  }
  function cover({ cover, mask, root, seed, projection, surfaceY }) {
    const at = projection.project({ x: root[0] + 0.5, y: surfaceY, z: root[1] + 0.5 });
    return { terrainBatch: pack.cover({ ...cover, mask, root, seed }), projected: spriteQuad(at) };
  }
  return Object.freeze({ body, cover });
}
