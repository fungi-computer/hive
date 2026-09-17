import { placementOrientation } from "../sdk/placement.ts";
import { evaluateDesignation } from "./spatial-designation.js";
import { rotatePlacementPoint } from "./art-placement.js";

/** Own one advisory preview generation so an older async reply cannot repaint a newer gesture. */
export function createPlacementAdvisory(decide, publish) {
  let generation = 0;
  let currentKey = null;
  return {
    clear() { generation++; currentKey = null; publish(null); },
    request(key, query, count) {
      if (currentKey === key) return;
      currentKey = key;
      const requestGeneration = ++generation;
      publish({ key, status: "checking", count });
      Promise.resolve(decide(query)).then((result) => {
        if (requestGeneration !== generation || currentKey !== key) return;
        const rejected = result.decisions.find((decision) => decision.status === "rejected");
        publish(rejected
          ? { key, status: "rejected", reason: rejected.reason, count, revision: result.observationRevision, placementRevision: result.placementRevision }
          : { key, status: "ready", count, revision: result.observationRevision, placementRevision: result.placementRevision });
      }, (error) => {
        if (requestGeneration !== generation || currentKey !== key) return;
        publish({ key, status: "rejected", reason: error instanceof Error ? error.message : String(error), count });
      });
    },
  };
}


/** Build the exact cells a placement gesture owns. No admission is inferred. */
export function placementCells({ area, target }) {
  if (area?.start && area.current) {
    const result = evaluateDesignation(area.mode, area.start, area.current, 256);
    return result.accepted ? result.designation.cells : [];
  }
  return target ? [target] : [];
}

/** Expand one object origin for display without creating extra construction targets. */
export function placementFootprintCells(control, origin) {
  if (!origin) return [];
  const footprint = control?.footprint;
  if (!Array.isArray(footprint) || footprint.length === 0) return [origin];
  const orientation = control?.input?.orientation ?? "north";
  return footprint.map(point => {
    const [dx, dz] = rotatePlacementPoint(point, orientation);
    return [origin[0] + dx, origin[1], origin[2] + dz];
  });
}

/**
 * Resolve ordinary cell-placement art. Edge placement owns a different
 * acquisition shape and never reconstructs physical edges from visual names.
 */
export function placementVisualSpec(control, cells, placementVisuals, area) {
  const catalog = control?.input?.catalog;
  const definition = catalog === undefined ? undefined : placementVisuals?.[catalog];
  const orientation = placementOrientation(definition?.alignment ?? "fixed", area, control?.input?.orientation);
  const facing = definition?.facing[orientation] ?? 0;
  return { visual: definition?.visual, facing, cells };
}

/** Reuse bounded sprites and destroy only the sprites owned by this pool. */
export function syncPlacementGhosts(pool, specs, { art, bindings, resolve, project, zoom, verticalMetres, status }) {
  const { visual, facing = 0, cells = [], items = cells.map((cell, index) => ({
    visual: Array.isArray(visual) ? visual[index] : visual,
    facing,
    point: [cell[0], (cell[1] + 0.5) * verticalMetres, cell[2]],
  })) } = specs;
  for (const entry of pool.entries) entry.sprite.visible = false;
  if (!items.length) return;
  while (pool.entries.length < items.length) pool.entries.push({ sprite: pool.factory(), owned: true });
  items.forEach((item, index) => {
    const entry = pool.entries[index];
    const binding = item.visual ? bindings[item.visual] : undefined;
    const resolved = binding && art ? resolve(art, binding, item.facing ?? facing) : undefined;
    if (!resolved?.texture) return;
    const point = project(...item.point);
    entry.sprite.texture = resolved.texture;
    entry.sprite.anchor.set(resolved.anchor?.x ?? 0.5, resolved.anchor?.y ?? 1);
    entry.sprite.position.set(point.x * zoom.x + zoom.offsetX, point.y * zoom.y + zoom.offsetY);
    entry.sprite.scale.set(zoom.scale);
    entry.sprite.tint = status === "rejected" ? 0xe47c72 : status === "ready" ? 0xbde6a3 : 0xffffff;
    entry.sprite.alpha = status === "rejected" ? 0.62 : 0.45;
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
