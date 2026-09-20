import { Container, Graphics, Sprite } from "pixi.js";
import { createWaterSurfaceTexture } from "./cut-terrain-layer.js";
import { createMixedRenderFixture } from "./mixed-render-fixture.js";
import { drawPlacementGuideTile } from "./placement-preview.js";
import { createTerrainBatchMeshes } from "./terrain-face-batches.js";
import { compileSpatialDrawOrder } from "./spatial-draw-order.js";

function spriteRecord(record, parent, owned) {
  const sprite = new Sprite(record.texture);
  sprite.anchor.set(record.anchor.x, record.anchor.y);
  sprite.position.set(record.displayPoint.x, record.displayPoint.y);
  sprite.eventMode = "none";
  parent.addChild(sprite);
  owned.push(sprite);
  return Object.freeze({
    ...record,
    display: sprite,
    contains: (point) => record.hitArea?.contains(point.x - sprite.x, point.y - sprite.y) === true,
  });
}

/**
 * Browser review owner for the Stage 1 fixture. It assembles the same checked
 * art, records, compiler, Sprite/Graphics displays and terrain Mesh batches as
 * the game. It owns no alternate projection, ordering rule or world state.
 */
export function createMixedRenderReviewOwner({ art, terrainPack, cameraOrientation = "north", objectOrientation = "north" } = {}) {
  if (!art || !terrainPack) throw new Error("mixed render review requires checked art packs");
  const container = new Container();
  container.sortableChildren = true;
  container.eventMode = "none";
  const owned = [],
    waterTexture = createWaterSurfaceTexture();
  const fixture = createMixedRenderFixture(cameraOrientation, objectOrientation, { art, terrainPack });
  const records = fixture.input.map((record) => {
    if (record.terrainBatch) return record;
    if (record.texture && record.anchor && record.displayPoint) return spriteRecord(record, container, owned);
    if (record.role === "water") {
      const sprite = new Sprite(waterTexture);
      sprite.anchor.set(0.5);
      const point = fixture.projection.project(record.attachment.point);
      sprite.position.set(point.x, point.y);
      sprite.eventMode = "none";
      container.addChild(sprite);
      owned.push(sprite);
      return Object.freeze({ ...record, display: sprite });
    }
    if (record.role === "build-guide") {
      const graphic = drawPlacementGuideTile(new Graphics(), record);
      graphic.eventMode = "none";
      container.addChild(graphic);
      owned.push(graphic);
      return Object.freeze({ ...record, display: graphic });
    }
    throw new Error(`mixed render review record has no display: ${record.id}:${record.part}`);
  });
  const compiled = compileSpatialDrawOrder(records, { projection: fixture.projection });
  const batches = createTerrainBatchMeshes({ parent: container });
  batches.update(compiled.records);
  return Object.freeze({
    container,
    fixture,
    compiled,
    dispose() {
      batches.dispose();
      for (const display of owned) display.destroy({ children: true, texture: false, textureSource: false });
      waterTexture.destroy(true);
      container.destroy({ children: false });
    },
  });
}
