import { placementOrientation } from "../sdk/placement.ts";
import { evaluateDesignation } from "./spatial-designation.js";

const FACING = Object.freeze({ north: 0, east: 1, south: 2, west: 3 });

/** Build the exact cells a placement gesture owns. No admission is inferred. */
export function placementCells({ area, target, anchor, upperCandidates = [] }) {
  if (area?.start && area.current) {
    const result = evaluateDesignation(area.mode, area.start, area.current, 256);
    return result.accepted ? result.designation.cells : [];
  }
  if (anchor) return upperCandidates;
  return target ? [target] : [];
}

export function placementVisualSpec(control, cells, placementVisuals, area) {
  const catalog = control?.input?.catalog;
  const definition = catalog === undefined ? undefined : placementVisuals?.[catalog];
  const orientation = placementOrientation(definition?.alignment ?? "fixed", area, control?.input?.orientation);
  return { visual: definition?.visual, facing: FACING[orientation], cells };
}

/** Reuse bounded sprites and destroy only the sprites owned by this pool. */
export function syncPlacementGhosts(pool, specs, { art, bindings, resolve, project, zoom, verticalMetres }) {
  const { visual, facing, cells } = specs;
  const binding = visual ? bindings[visual] : undefined;
  const resolved = binding && art ? resolve(art, binding, facing) : undefined;
  for (const entry of pool.entries) entry.sprite.visible = false;
  if (!resolved?.texture) return;
  while (pool.entries.length < cells.length) pool.entries.push({ sprite: pool.factory(), owned: true });
  cells.forEach((cell, index) => {
    const entry = pool.entries[index];
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
