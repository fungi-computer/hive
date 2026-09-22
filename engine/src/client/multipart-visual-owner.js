function finite(value, name) {
  if (!Number.isFinite(value)) throw new Error(`invalid multipart ${name}`);
  return value;
}
const identityPoint = point => point;
const noHitArea = () => undefined;

/** Same positive-Y rotation as the original Three authoring group. */
export function transformBakedPartPoint(point, facing, origin, offset = [0, 0]) {
  const angle = facing * Math.PI / 2;
  return {
    x: origin.x + point.x * Math.cos(angle) + point.z * Math.sin(angle) + offset[0],
    y: origin.y + point.y,
    z: origin.z - point.x * Math.sin(angle) + point.z * Math.cos(angle) + offset[1],
  };
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
  let sprites = new Map(), disposed = false, pending;
  const destroy = sprite => sprite.destroy({ children: true, texture: false, textureSource: false });

  // Art, textures and part definitions are immutable inputs for the task's lifetime.
  // preparePart is actor-owned geometry preparation, called once per bounded part.
  function prepare({ entityId, parts = [], anchor = { x: 0.5, y: 1 }, screen = { x: 0, y: 0 },
    scale = 1, transform = identityPoint, pickable = true, hitAreaFor = noHitArea,
    target = entityId, preparePart = part => part } = {}) {
    if (disposed) throw new Error("multipart visual owner is disposed");
    if (entityId === undefined || entityId === null) throw new Error("multipart entity id required");
    if (!Array.isArray(parts) || !(Number.isFinite(scale) && scale > 0)) throw new Error("invalid multipart frame");
    const pinnedAnchor = Object.freeze({ x: finite(anchor.x, "anchor.x"), y: finite(anchor.y, "anchor.y") });
    const pinnedScreen = Object.freeze({ x: finite(screen.x, "screen.x"), y: finite(screen.y, "screen.y") });
    const inputStamp = JSON.stringify([String(entityId), pinnedAnchor, pinnedScreen, scale, pickable]);
    pending?.cancel();
    let next = new Map(), records = [], oldEntries = sprites.entries();
    const created = new Set(), writes = [], removals = [];
    let index = 0, status = "preparing", readyRecords;

    function release() {
      next = records = oldEntries = undefined;
      created.clear(); writes.length = removals.length = 0;
      parts = anchor = screen = transform = hitAreaFor = target = preparePart = undefined;
    }

    function prepareOne() {
      if (index < parts.length) {
        const part = preparePart(parts[index], index++);
        if (part.id === undefined || part.id === null || String(part.id) === "") throw new Error("multipart part id required");
        const id = String(part.id);
        if (next.has(id)) throw new Error(`duplicate multipart part ${id}`);
        const inputRefs = [part, transform, hitAreaFor, target], prior = sprites.get(id);
        if (prior?.inputStamp === inputStamp && inputRefs.every((ref, i) => ref === prior.inputRefs[i])) {
          next.set(id, prior); records.push(prior.record);
          return;
        }
        const footprint = Object.freeze(transformedPartGeometry(part, transform).map(point => Object.freeze(point)));
        const screenBounds = Object.freeze({ ...(part.screenBounds ?? {
          left: pinnedScreen.x, right: pinnedScreen.x, top: pinnedScreen.y, bottom: pinnedScreen.y }) });
        const contactSurface = part.contactSurface && Object.freeze(part.contactSurface.map(point => Object.freeze({ ...point })));
        const hitArea = hitAreaFor(part.texture, pinnedAnchor), visible = part.visible !== false;
        const storeyBand = Number.isFinite(part.storeyBand) ? part.storeyBand : 0;
        const role = part.role ?? "footprint-object", texture = part.texture ?? emptyTexture;
        const stamp = JSON.stringify([String(entityId), pinnedAnchor, pinnedScreen, scale, footprint,
          screenBounds, storeyBand, pickable, visible, role, part.supportY, part.compositePartition, contactSurface]);
        const refs = [texture, hitArea, target, part.orderGeometry];
        if (prior?.stamp === stamp && refs.every((ref, i) => ref === prior.refs[i])) {
          next.set(id, { ...prior, inputStamp, inputRefs }); records.push(prior.record);
          return;
        }
        const sprite = prior?.sprite ?? createSprite();
        if (!prior) created.add(sprite);
        const record = Object.freeze({ id: String(entityId), part: id, role, target, display: sprite,
          footprint, storeyBand, screenBounds, screen: pinnedScreen, scale, pickable, hitArea, visible,
          orderGeometry: part.orderGeometry, supportY: part.supportY, compositePartition: part.compositePartition,
          ...(contactSurface ? { contactSurface } : {}) });
        next.set(id, { sprite, stamp, refs, record, inputStamp, inputRefs }); records.push(record);
        writes.push({ sprite, texture, visible });
        return;
      }
      const old = oldEntries.next();
      if (!old.done) {
        if (!next.has(old.value[0])) removals.push(old.value[1].sprite);
        return;
      }
      readyRecords = Object.freeze(records);
      status = "ready";
    }

    const task = Object.freeze({
      get ready() { return status === "ready" || status === "published"; },
      get records() { return readyRecords; },
      advance({ maxParts = 1 } = {}) {
        if (!Number.isSafeInteger(maxParts) || maxParts < 1) throw new Error("multipart work budget must be positive");
        if (status === "cancelled") throw new Error("multipart frame is cancelled");
        try {
          for (let work = 0; work < maxParts && status === "preparing"; work++) prepareOne();
        } catch (error) { task.cancel(); throw error; }
        return task.ready;
      },
      publish() {
        if (status === "published") return readyRecords;
        if (status !== "ready") throw new Error(`multipart frame is ${status}`);
        for (const { sprite, texture, visible } of writes) {
          sprite.texture = texture;
          sprite.anchor?.set(pinnedAnchor.x, pinnedAnchor.y);
          sprite.position?.set(pinnedScreen.x, pinnedScreen.y);
          sprite.scale?.set(scale); sprite.visible = visible;
        }
        for (const sprite of created) parent.addChild(sprite);
        for (const sprite of removals) destroy(sprite);
        sprites = next;
        status = "published"; pending = undefined;
        release();
        return readyRecords;
      },
      cancel() {
        if (status !== "preparing" && status !== "ready") return;
        status = "cancelled";
        for (const sprite of created) destroy(sprite);
        readyRecords = undefined;
        release();
        if (pending === task) pending = undefined;
      },
    });
    pending = task;
    return task;
  }

  function sync(input) {
    const task = prepare(input);
    while (!task.advance({ maxParts: 1024 })) { /* synchronous reference path */ }
    return task.publish();
  }
  function dispose() {
    if (disposed) return;
    pending?.cancel(); disposed = true;
    for (const { sprite } of sprites.values()) destroy(sprite);
    sprites.clear();
  }
  return Object.freeze({ prepare, sync, dispose, get sprites() { return sprites; } });
}
