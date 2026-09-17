/**
 * Front-to-back interaction view of the accepted back-to-front draw stream.
 *
 * This owner does not derive another spatial order. The compiler's records are
 * the order: painting consumes them forward and picking consumes the very same
 * record references backward.
 */
export function frontToBackVoxelDrawRecords(records) {
  if (!Array.isArray(records)) throw new Error("voxel draw records required for picking");
  return Object.freeze([...records].reverse());
}

/** Return the first visible, pickable record whose authored hit geometry wins. */
export function pickVoxelDrawRecord(records, point, contains = (record, value) => record.contains?.(value) === true) {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y))
    throw new Error("voxel draw picking requires a finite screen point");
  if (typeof contains !== "function") throw new Error("voxel draw picking requires a hit predicate");
  for (const record of frontToBackVoxelDrawRecords(records)) {
    if (record.visible === false || record.pickable === false) continue;
    if (contains(record, point)) return record;
  }
  return null;
}
