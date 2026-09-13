import { placementOrientation } from "../sdk/placement.ts";
import { gridConnectionMasks } from "../sdk/grid-connections.ts";
import { evaluateDesignation } from "./spatial-designation.js";


/** Build the exact cells a placement gesture owns. No admission is inferred. */
export function placementCells({ area, target, anchor, upperCandidates = [] }) {
  if (area?.start && area.current) {
    const result = evaluateDesignation(area.mode, area.start, area.current, 256);
    return result.accepted ? result.designation.cells : [];
  }
  if (anchor) return upperCandidates;
  return target ? [target] : [];
}

function observedWallCells(facts, verticalMetres) {
  if (!Array.isArray(facts) || !Number.isFinite(verticalMetres) || verticalMetres <= 0) return [];
  return facts.flatMap((fact) => {
    if (typeof fact?.visual !== "string" || !fact.visual.startsWith("colony.wall.")) return [];
    const position = fact.pose?.position;
    if (!position || ![position.x, position.y, position.z].every(Number.isFinite)) return [];
    return [[Math.round(position.x), Math.round(position.y / verticalMetres + 0.5), Math.round(position.z)]];
  });
}

/**
 * Resolve placement art from the proposed cells and ordinary observed facts.
 * Wall masks are presentation-only: the construction command remains the sole
 * owner of admission, support and site identity.
 */
export function placementVisualSpec(control, cells, placementVisuals, area, observedFacts = [], verticalMetres = 1) {
  const catalog = control?.input?.catalog;
  const definition = catalog === undefined ? undefined : placementVisuals?.[catalog];
  const orientation = placementOrientation(definition?.alignment ?? "fixed", area, control?.input?.orientation);
  const facing = definition?.facing[orientation] ?? 0;
  if (definition?.visual !== "colony.wall.finished" || !cells.length)
    return { visual: definition?.visual, facing, cells };
  const proposed = cells.map(([x, y, z], index) => ({ id: `placement-${index}`, cell: [x, y + 1, z] }));
  const neighbors = observedWallCells(observedFacts, verticalMetres)
    .map((cell, index) => ({ id: `observed-${index}`, cell }));
  const masks = gridConnectionMasks([...proposed, ...neighbors]);
  return {
    visual: cells.map((_, index) => `colony.wall.finished.joint-${masks.get(`placement-${index}`) ?? 0}`),
    facing,
    cells,
  };
}

/** Reuse bounded sprites and destroy only the sprites owned by this pool. */
export function syncPlacementGhosts(pool, specs, { art, bindings, resolve, project, zoom, verticalMetres }) {
  const { visual, facing, cells } = specs;
  for (const entry of pool.entries) entry.sprite.visible = false;
  if (!visual || !cells.length) return;
  while (pool.entries.length < cells.length) pool.entries.push({ sprite: pool.factory(), owned: true });
  cells.forEach((cell, index) => {
    const entry = pool.entries[index];
    const cellVisual = Array.isArray(visual) ? visual[index] : visual;
    const binding = cellVisual ? bindings[cellVisual] : undefined;
    const resolved = binding && art ? resolve(art, binding, facing) : undefined;
    if (!resolved?.texture) return;
    const point = project(cell[0], (cell[1] + 0.5) * verticalMetres, cell[2]);
    entry.sprite.texture = resolved.texture;
    entry.sprite.anchor.set(resolved.anchor?.x ?? 0.5, resolved.anchor?.y ?? 1);
    entry.sprite.position.set(point.x * zoom.x + zoom.offsetX, point.y * zoom.y + zoom.offsetY);
    entry.sprite.scale.set(zoom.scale);
    entry.sprite.alpha = 0.45;
    entry.sprite.visible = true;
  });
}

export function disposePlacementGhosts(pool) {
  for (const entry of pool.entries) if (entry.owned) entry.sprite.destroy({ children: true, texture: false, textureSource: false });
  pool.entries.length = 0;
}

export function clearPlacementGhosts(pool) {
  for (const entry of pool.entries) entry.sprite.visible = false;
}
