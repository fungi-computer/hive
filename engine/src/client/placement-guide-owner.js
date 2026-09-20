import { Graphics } from "pixi.js";
import { drawPlacementGuideTile, placementGuideTiles } from "./placement-preview.js";

/** Own selected-plane UI guides and their Pixi lifetime. A selected plane may
 * cross occupied space, so these displays belong to the preview overlay and
 * never advertise physical ordering geometry or participate in picking. */
export function createPlacementGuideOwner({ parent, project, createGraphic = () => new Graphics() } = {}) {
  if (!parent?.addChild || typeof project !== "function")
    throw new Error("placement guide owner requires an overlay parent and projection");
  let entries = new Map(), records = Object.freeze([]), identity, disposed = false;

  function clear() {
    for (const entry of entries.values()) entry.display.destroy({ children: true, texture: false, textureSource: false });
    entries.clear(); records = Object.freeze([]); identity = undefined;
  }

  function update({ hoveredCell, planeY, footprintCells = [], verticalMetres, status } = {}) {
    if (disposed) throw new Error("placement guide owner is disposed");
    if (!hoveredCell || !Number.isSafeInteger(planeY)) { clear(); return records; }
    const nextIdentity = JSON.stringify([hoveredCell, planeY, footprintCells, verticalMetres, status]);
    if (identity === nextIdentity) return records;
    const tiles = placementGuideTiles({ hoveredCell, planeY, footprintCells, verticalMetres, project });
    const nextEntries = new Map();
    records = Object.freeze(tiles.map(tile => {
      let entry = entries.get(tile.id);
      if (!entry) {
        const display = createGraphic();
        display.eventMode = "none";
        parent.addChild(display);
        entry = { display };
      }
      entry.display.clear();
      drawPlacementGuideTile(entry.display, tile, { status });
      nextEntries.set(tile.id, entry);
      entry.display.visible = true;
      return Object.freeze({ id: tile.id, part: tile.part, role: "build-guide", presentation: "overlay",
        cell: tile.cell, hovered: tile.hovered, isFootprint: tile.isFootprint,
        visible: true, pickable: false, contains: () => false, display: entry.display });
    }));
    for (const [id, entry] of entries) if (!nextEntries.has(id))
      entry.display.destroy({ children: true, texture: false, textureSource: false });
    entries = nextEntries; identity = nextIdentity;
    return records;
  }

  return Object.freeze({ update, clear, dispose() { if (!disposed) { clear(); disposed = true; } } });
}
