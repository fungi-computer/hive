import type { EntityId, Pose, RenderFact } from "../contracts";

/** Read-only art projection for a real entity whose display origin differs from its work contact. */
export interface EntityVisualProjection {
  readonly id: EntityId;
  readonly pose: Pose;
  readonly visual: string;
  readonly label: string;
}

export function appendVisualProjections(
  physical: readonly RenderFact[],
  projections: readonly EntityVisualProjection[],
  exists: (ids: readonly EntityId[]) => readonly boolean[],
  limit: number,
): readonly RenderFact[] {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 512 || !Array.isArray(projections) || projections.length > limit)
    throw new Error("visual projection exceeds bound");
  const existing = new Map(physical.map(fact => [fact.id, fact]));
  const ids = new Set<EntityId>();
  for (const projection of projections) {
    if (!projection || typeof projection.id !== "string" || !projection.id || projection.id.length > 128 || ids.has(projection.id))
      throw new Error("duplicate or invalid projected entity");
    ids.add(projection.id);
    const original = existing.get(projection.id);
    if (original && (original.visual || original.collision || original.direct || original.aim || original.support))
      throw new Error("visual projection cannot replace an existing visual or dynamic body");
    const point = projection.pose?.position;
    if (!point || ![point.x, point.y, point.z, projection.pose.facing].every(Number.isFinite) ||
      typeof projection.visual !== "string" || !projection.visual || projection.visual.length > 128 ||
      typeof projection.label !== "string" || projection.label.length > 256)
      throw new Error("invalid entity visual projection");
  }
  for (let offset = 0; offset < projections.length; offset += 128) {
    const batch = projections.slice(offset, offset + 128).map(item => item.id);
    const membership = exists(batch);
    if (membership.length !== batch.length || membership.some(value => value !== true))
      throw new Error("visual projection references missing entity");
  }
  if (physical.length + projections.filter(item => !existing.has(item.id)).length > limit) throw new Error("combined visual projection exceeds bound");
  for (const item of projections) existing.set(item.id, { ...existing.get(item.id), id: item.id, visual: item.visual, label: item.label,
    pose: { position: { ...item.pose.position }, facing: item.pose.facing } });
  return [...existing.values()];
}
