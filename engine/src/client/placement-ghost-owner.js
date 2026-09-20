import { Sprite } from "pixi.js";
import { resolveWorldArtPlacement } from "./art-placement.js";

/** Owns preview sprites in the scene's dedicated world-overlay container.
 * All validity states are UI overlays: previews may overlap occupied space,
 * have no physical ordering geometry, and never enter the world picker.
 * The scene owns overlay pass placement and its shared camera transform. */
export function createPlacementGhostOwner({ parent, project, bindings, resolve, createSprite = () => new Sprite() } = {}) {
  if (!parent?.addChild || typeof project !== "function" || !bindings || typeof resolve !== "function")
    throw new Error("placement ghost owner requires an overlay parent, projection, bindings and resolver");
  const entries = new Map();
  let disposed = false;

  function update(specs, { art, verticalMetres, status, cameraTurn = 0 } = {}) {
    if (disposed) throw new Error("placement ghost owner is disposed");
    if (!Number.isFinite(verticalMetres) || verticalMetres <= 0) throw new Error("placement ghost owner requires terrain scale");
    const { visual, facing = 0, placement, cells = [], items = cells.map((cell, index) => ({
      visual: Array.isArray(visual) ? visual[index] : visual,
      facing,
      point: [cell[0], (cell[1] + 0.5) * verticalMetres, cell[2]],
    })) } = specs ?? {};
    for (const entry of entries.values()) entry.sprite.visible = false;
    const records = [];
    for (let index = 0; index < items.length; index++) {
      const item = items[index];
      const binding = item.visual ? bindings[item.visual] : undefined;
      const resolved = binding && art ? resolve(art, binding, ((item.facing ?? facing) + cameraTurn) % 4, 0, cameraTurn) : undefined;
      if (!resolved?.texture) continue;
      const feet = { x: item.point[0], y: item.point[1], z: item.point[2] };
      if (!Object.values(feet).every(Number.isFinite)) throw new Error("placement ghost requires a finite world point");
      const datum = item.placement ?? placement;
      const offset = datum ? resolveWorldArtPlacement({ subjectPlacement: datum,
        artPlacement: art.placementByTexture?.get(resolved.texture), orientation: datum.orientation,
        physicalFacing: item.facing ?? facing, cameraTurn }).offset : [0,0];
      const visualOrigin = { x: feet.x + offset[0], y: feet.y, z: feet.z + offset[1] };
      const projected = project(visualOrigin.x, visualOrigin.y, visualOrigin.z);
      let entry = entries.get(index);
      if (!entry) {
        const sprite = createSprite();
        sprite.eventMode = "none";
        parent.addChild(sprite);
        entry = { sprite };
        entries.set(index, entry);
      }
      entry.sprite.texture = resolved.texture;
      entry.sprite.anchor.set(resolved.anchor?.x ?? 0.5, resolved.anchor?.y ?? 1);
      entry.sprite.position.set(projected.x, projected.y);
      entry.sprite.scale.set(1);
      entry.sprite.tint = status === "rejected" ? 0xe47c72 : status === "ready" ? 0xbde6a3 : 0xffffff;
      entry.sprite.alpha = status === "rejected" ? 0.62 : 0.45;
      entry.sprite.visible = true;
      records.push(Object.freeze({
        id: `placement-ghost:${index}`, part: "preview", role: "preview", presentation: "overlay",
        visible: true, pickable: false, contains: () => false,
        display: entry.sprite,
      }));
    }
    return Object.freeze(records);
  }

  function clear() { for (const entry of entries.values()) entry.sprite.visible = false; }
  function dispose() {
    if (disposed) return;
    clear();
    for (const entry of entries.values()) entry.sprite.destroy({ children: true, texture: false, textureSource: false });
    entries.clear();
    disposed = true;
  }
  return Object.freeze({ update, clear, dispose });
}
