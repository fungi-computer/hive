/**
 * Reconcile keyed water visuals while keeping ownership of their lifetime in
 * one place. The caller owns the map and supplies the Pixi-specific actions.
 */
export function reconcileWaterSprites(previous, cells, { key, create, update, dispose }) {
  const next = new Map();
  for (const cell of cells) {
    if (cell.liquidVolumeM3 <= 0) continue;
    const id = key(cell);
    const existing = previous.get(id);
    const entry = existing ?? { sprite: create(cell) };
    update(entry.sprite, cell, existing);
    next.set(id, entry);
  }
  for (const [id, entry] of previous) {
    if (!next.has(id)) dispose(entry.sprite);
  }
  return next;
}

export function waterCellKey(cell) {
  return cell.at.join(":");
}
