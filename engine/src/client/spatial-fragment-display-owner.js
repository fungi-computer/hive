import { Mesh, MeshGeometry } from "pixi.js";

const keyOf = record => JSON.stringify([record.id, record.part ?? "body"]);
const finitePoint = point => point && Number.isFinite(point.x) && Number.isFinite(point.y);

function clippedPicture(record) {
  const { sourceRecord, clip } = record.fragment;
  const picture = sourceRecord?.picture;
  if (!picture?.texture || !picture.sprite || !sourceRecord.display ||
      !finitePoint(picture.anchor) || !finitePoint(picture.screen) ||
      !(picture.texture.width > 0 && picture.texture.height > 0) ||
      !Number.isFinite(picture.texture.width + picture.texture.height) ||
      !Array.isArray(clip) || clip.length < 3 || clip.length > 4096 || !clip.every(finitePoint))
    throw new Error("fragment display requires a checked picture and convex screen clip");
  const { width, height } = picture.texture;
  const left = picture.screen.x - picture.anchor.x * width;
  const top = picture.screen.y - picture.anchor.y * height;
  const positions = [], uvs = [], indices = [];
  let orientation = 0;
  for (let i = 0; i < clip.length; i++) {
    const a = clip[i], b = clip[(i + 1) % clip.length], c = clip[(i + 2) % clip.length];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cross) > 1e-8) {
      if (orientation && Math.sign(cross) !== orientation) throw new Error("fragment display clip must be convex");
      orientation = Math.sign(cross);
    }
    const u = (a.x - left) / width, v = (a.y - top) / height;
    if (u < -1e-7 || u > 1 + 1e-7 || v < -1e-7 || v > 1 + 1e-7)
      throw new Error("fragment display clip escaped original picture");
    positions.push(a.x, a.y); uvs.push(u, v);
    if (i >= 2) indices.push(0, i - 1, i);
  }
  if (!orientation) throw new Error("fragment display clip is degenerate");
  return { sourceRecord, picture, clip, orientation, positions, uvs, indices,
    stamp: JSON.stringify([positions, uvs, indices]) };
}

function buffers(shape) {
  return { positions: new Float32Array(shape.positions), uvs: new Float32Array(shape.uvs), indices: new Uint16Array(shape.indices) };
}

function defaultDisplay(shape, texture) {
  const geometry = new MeshGeometry(buffers(shape));
  const mesh = new Mesh({ geometry, texture });
  mesh.eventMode = "none";
  return { mesh, geometry };
}

function inClip(point, clip, orientation) {
  return finitePoint(point) && clip.every((a, i) => {
    const b = clip[(i + 1) % clip.length];
    return orientation * ((b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x)) >= -1e-7;
  });
}

/** Materialize an already ordered fragment list using original atlas pixels.
 * Owns only retained meshes/buffers. Borrowed sprites, textures and adornment
 * containers remain with their presentation owner. No sorting happens here.
 */
export function createSpatialFragmentDisplayOwner({ parent, createDisplay = defaultDisplay, maxFragments = 512 } = {}) {
  if (!parent?.addChild || typeof createDisplay !== "function" || !Number.isSafeInteger(maxFragments) || maxFragments < 1)
    throw new Error("fragment display owner requires parent, factory and positive budget");
  let entries = new Map(), borrowed = new Map(), overlays = new Map(), priorOrder = [], disposed = false;

  function release(entry) {
    entry.mesh.removeFromParent?.();
    entry.mesh.destroy({ texture: false, textureSource: false });
    entry.geometry.destroy(true);
  }
  function restore(sprite, state) {
    if (!sprite.destroyed) sprite.visible = state.visible;
  }

  function update(orderedRecords) {
    if (disposed) throw new Error("fragment display owner is disposed");
    if (!Array.isArray(orderedRecords)) throw new Error("fragment display requires ordered records");
    // Validate all external geometry before changing display ownership.
    const shapes = new Map();
    for (const record of orderedRecords) if (record.fragment) {
      const key = keyOf(record);
      if (shapes.has(key)) throw new Error("duplicate fragment display identity");
      shapes.set(key, clippedPicture(record));
    }
    if (shapes.size > maxFragments) throw new Error("fragment display budget exceeded");
    const next = new Map(), nextBorrowed = new Map(), nextOverlays = new Map(), records = [];
    let changed = false;
    for (const record of orderedRecords) {
      if (!record.fragment) { records.push(record); continue; }
      const key = keyOf(record), shape = shapes.get(key), { picture, sourceRecord } = shape;
      let entry = entries.get(key);
      if (!entry) {
        const { mesh, geometry } = createDisplay(shape, picture.texture);
        parent.addChild(mesh);
        entry = { mesh, geometry, stamp: shape.stamp, texture: picture.texture };
        changed = true;
      } else if (entry.stamp !== shape.stamp) {
        const values = buffers(shape);
        entry.geometry.positions = values.positions;
        entry.geometry.uvs = values.uvs;
        entry.geometry.indices = values.indices;
        entry.stamp = shape.stamp;
        changed = true;
      }
      if (entry.texture !== picture.texture) { entry.texture = picture.texture; changed = true; }
      entry.mesh.texture = picture.texture;
      entry.mesh.visible = record.visible !== false;
      // The source sprite owns appearance. These values do not alter its atlas.
      entry.mesh.alpha = picture.sprite.alpha ?? 1;
      entry.mesh.tint = picture.sprite.tint ?? 0xffffff;
      entry.mesh.blendMode = picture.sprite.blendMode ?? "normal";
      const state = nextBorrowed.get(picture.sprite) ?? borrowed.get(picture.sprite) ?? { visible: picture.sprite.visible };
      nextBorrowed.set(picture.sprite, state);
      picture.sprite.visible = false;
      const siblings = nextOverlays.get(sourceRecord.display) ?? [];
      siblings.push(entry.mesh); nextOverlays.set(sourceRecord.display, siblings);
      const contains = point => inClip(point, shape.clip, shape.orientation) && sourceRecord.contains?.(point) === true;
      records.push({ ...record, display: entry.mesh, contains });
      next.set(key, entry);
    }
    for (const [key, entry] of entries) if (!next.has(key)) { release(entry); changed = true; }
    for (const [sprite, state] of borrowed) if (!nextBorrowed.has(sprite)) { restore(sprite, state); changed = true; }
    const order = records.map(record => ({ key: keyOf(record), display: record.display }));
    if (order.length !== priorOrder.length || order.some((record, index) => record.key !== priorOrder[index]?.key || record.display !== priorOrder[index]?.display)) changed = true;
    entries = next; borrowed = nextBorrowed; overlays = nextOverlays; priorOrder = order;
    return Object.freeze({ records: Object.freeze(records), changed });
  }

  function syncOverlays() {
    for (const [container, meshes] of overlays) if (!container.destroyed)
      container.zIndex = Math.max(...meshes.map(mesh => mesh.zIndex)) + 0.5;
  }
  function clear() {
    for (const entry of entries.values()) release(entry);
    for (const [sprite, state] of borrowed) restore(sprite, state);
    entries.clear(); borrowed.clear(); overlays.clear(); priorOrder = [];
  }
  return Object.freeze({ update, syncOverlays, clear,
    get size() { return entries.size; },
    dispose() { if (!disposed) { clear(); disposed = true; } },
  });
}
