import type { CardinalOrientation, EntityId, Pose, RenderFact, VisualPlacement } from "../contracts";

/** Read-only art projection for a real entity whose display origin differs from its work contact. */
export interface EntityVisualProjection {
  readonly id: EntityId;
  readonly pose: Pose;
  readonly visual: string;
  readonly label: string;
  readonly pickable: boolean;
  readonly cutawayTop?: number;
  readonly placement?: VisualPlacement;
}

const orientations = new Set<CardinalOrientation>(["north", "east", "south", "west"]);
const finiteBounded = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= 64;
const cell = (value: unknown): value is readonly [number, number] =>
  Array.isArray(value) && value.length === 2 && value.every(item => Number.isSafeInteger(item) && Math.abs(item) <= 8);
const point = (value: unknown): value is readonly [number, number, number] =>
  Array.isArray(value) && value.length === 3 && value.every(finiteBounded);

export function validVisualPlacement(value: unknown): value is VisualPlacement {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const placement = value as Record<string, unknown>;
  if (placement.kind === "edge") {
    if (Object.keys(placement).some(key => !["kind", "edge"].includes(key)) || !placement.edge || typeof placement.edge !== "object" || Array.isArray(placement.edge)) return false;
    const edge = placement.edge as Record<string, unknown>;
    return Object.keys(edge).every(key => ["cell", "axis"].includes(key)) && Object.keys(edge).length === 2 &&
      Array.isArray(edge.cell) && edge.cell.length === 3 && edge.cell.every(item => Number.isSafeInteger(item) && Math.abs(item) <= 1_000_000) &&
      (edge.axis === "x" || edge.axis === "z");
  }
  if (!orientations.has(placement.orientation as CardinalOrientation)) return false;
  if (placement.kind === "footprint") {
    if (Object.keys(placement).some(key => !["kind", "footprint", "orientation"].includes(key)) ||
      !Array.isArray(placement.footprint) || placement.footprint.length < 1 || placement.footprint.length > 16 ||
      !placement.footprint.every(cell)) return false;
    return new Set(placement.footprint.map(([x, z]) => `${x},${z}`)).size === placement.footprint.length;
  }
  return placement.kind === "stair" && Object.keys(placement).every(key => ["kind", "entrance", "landing", "orientation"].includes(key)) &&
    point(placement.entrance) && point(placement.landing);
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
      throw new Error(`visual projection ${projection.id} cannot replace an existing visual or dynamic body`);
    if (projection.cutawayTop !== undefined && !Number.isSafeInteger(projection.cutawayTop)) throw new Error("invalid visual cutaway level");
    if (typeof projection.pickable !== "boolean") throw new Error("invalid visual pickability");
    if (projection.placement !== undefined && !validVisualPlacement(projection.placement)) throw new Error("invalid visual placement");
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
    pose: { position: { ...item.pose.position }, facing: item.pose.facing },
    ...(item.placement === undefined ? {} : { placement: structuredClone(item.placement) }),
    view: { pickable: item.pickable, ...(item.cutawayTop === undefined ? {} : { cutawayTop: item.cutawayTop }) } });
  return [...existing.values()];
}
