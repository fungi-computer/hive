/**
 * Choose a presentation focus from facts already published to the client.
 * This has no terrain or simulation access; callers provide the visible facts.
 */
export function terrainCameraFocus(facts, terrain) {
  if (!terrain || !Array.isArray(terrain.surfaces) || !Number.isFinite(terrain.verticalMetres) || terrain.verticalMetres <= 0)
    return null;
  const actors = facts.filter((fact) => {
    const position = fact?.pose?.position;
    return fact?.visual && position && [position.x, position.y, position.z].every(Number.isFinite);
  });
  if (actors.length) {
    const total = actors.reduce((sum, fact) => {
      const position = fact.pose.position;
      return { x: sum.x + position.x, y: sum.y + position.y, z: sum.z + position.z };
    }, { x: 0, y: 0, z: 0 });
    return {
      x: total.x / actors.length,
      y: total.y / actors.length,
      z: total.z / actors.length,
    };
  }
  if (!terrain.surfaces.length) return null;
  const valid = terrain.surfaces.filter((surface) =>
    Array.isArray(surface?.cell) && surface.cell.length === 3 &&
    surface.cell.every(Number.isSafeInteger),
  );
  if (!valid.length) return null;
  const total = valid.reduce((sum, surface) => ({
    x: sum.x + surface.cell[0],
    y: sum.y + (surface.cell[1] + 0.5) * terrain.verticalMetres,
    z: sum.z + surface.cell[2],
  }), { x: 0, y: 0, z: 0 });
  return {
    x: total.x / valid.length,
    y: total.y / valid.length,
    z: total.z / valid.length,
  };
}
