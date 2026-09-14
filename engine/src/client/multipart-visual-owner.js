function finite(value, name) {
  if (!Number.isFinite(value)) throw new Error(`invalid multipart ${name}`);
  return value;
}

export function transformedPartGeometry(part, transform = (point) => point) {
  const geometry = part.geometry;
  const points = geometry?.footprint ?? [{ 0: 0, 1: 0, 2: 0 }];
  const yValues = points.map((point) => point[1]);
  const expanded = geometry && Number.isFinite(geometry.minY) && Number.isFinite(geometry.maxY)
    ? [
        ...points,
        ...(geometry.minY < Math.min(...yValues) ? points.map((point) => [point[0], geometry.minY, point[2]]) : []),
        ...(geometry.maxY > Math.max(...yValues) ? points.map((point) => [point[0], geometry.maxY, point[2]]) : []),
      ]
    : points;
  return expanded.map((point) => {
    const value = transform({ x: point[0], y: point[1], z: point[2] });
    return { x: finite(value.x, "geometry.x"), y: finite(value.y, "geometry.y"), z: finite(value.z, "geometry.z") };
  });
}

/** Place one entity adornment with the foremost of its already-sorted parts. */
export function multipartOverlayZIndex(records) {
  if (!Array.isArray(records) || !records.length) return 0;
  return Math.max(...records.map((record) => Number.isFinite(record?.display?.zIndex) ? record.display.zIndex : 0)) + 0.5;
}

/**
 * Owns the visual lifetime of one physical entity's part sprites.  Sprites
 * are direct children of the sortable world container, so an actor can
 * interleave between a stair's surface and rails.  Selection/labels stay
 * with the caller's entity owner and are never duplicated per part.
 */
export function createMultipartVisualOwner({ parent, createSprite, emptyTexture = null } = {}) {
  if (!parent?.addChild) throw new Error("multipart visual parent required");
  if (!createSprite) throw new Error("multipart visual sprite factory required");
  const sprites = new Map();
  let disposed = false;

  function sync({ entityId, parts = [], anchor = { x: 0.5, y: 1 }, screen = { x: 0, y: 0 }, scale = 1, transform = (point) => point, pickable = true, hitAreaFor = () => undefined, target = entityId } = {}) {
    if (disposed) throw new Error("multipart visual owner is disposed");
    if (entityId === undefined || entityId === null) throw new Error("multipart entity id required");
    const live = new Set(parts.map((part) => String(part.id)));
    for (const [id, entry] of sprites) {
      if (live.has(id)) continue;
      entry.sprite.destroy({ children: true, texture: false, textureSource: false });
      sprites.delete(id);
    }
    const records = [];
    for (const part of parts) {
      const id = String(part.id);
      if (!id) throw new Error("multipart part id required");
      const sprite = sprites.get(id)?.sprite ?? createSprite();
      if (!sprites.has(id)) {
        parent.addChild(sprite);
        sprites.set(id, { sprite });
      }
      sprite.texture = part.texture ?? emptyTexture;
      sprite.anchor?.set(anchor.x, anchor.y);
      sprite.position?.set(screen.x, screen.y);
      sprite.scale?.set(scale);
      sprite.visible = part.visible !== false;
      const geometry = transformedPartGeometry(part, transform);
      records.push({
        id: String(entityId),
        part: id,
        role: part.role ?? "footprint-object",
        target,
        display: sprite,
        footprint: geometry,
        storeyBand: Number.isFinite(part.storeyBand) ? part.storeyBand : 0,
        screenBounds: part.screenBounds ?? { left: screen.x, right: screen.x, top: screen.y, bottom: screen.y },
        pickable,
        hitArea: hitAreaFor(part.texture, anchor),
        visible: sprite.visible,
      });
    }
    return Object.freeze(records);
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const { sprite } of sprites.values()) sprite.destroy({ children: true, texture: false, textureSource: false });
    sprites.clear();
  }

  return Object.freeze({ sync, dispose, sprites });
}
