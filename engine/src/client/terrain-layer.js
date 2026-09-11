import { WebGLRenderer } from "three";
import { Container, Graphics, Sprite } from "pixi.js";
import { bake } from "../../../src/art/bake.js";
import { camera as artCamera } from "../../../src/art/prop-camera.js";
import { terrainColumnsScene } from "../../../src/art/terrain-columns.js";
import { project } from "./geometry.js";

/** Client-only cached image of the host's exterior projection. */
export function createTerrainLayer() {
  const container = new Container();
  container.eventMode = "none";
  const water = new Graphics();
  water.eventMode = "none";
  let renderer, sprite, revision, epoch, projectionKey;
  const width = 2304, height = 1536;
  function clear() {
    sprite?.texture.destroy(true);
    sprite?.destroy();
    sprite = undefined;
    revision = undefined;
    water.clear();
    projectionKey = undefined;
  }
  return {
    container,
    update(frame, nextEpoch, nextProjectionKey = "full") {
      if (epoch !== nextEpoch) { clear(); epoch = nextEpoch; }
      if (!frame) { clear(); container.visible = false; return; }
      container.visible = true;
      if (revision !== frame.revision || projectionKey !== nextProjectionKey) {
        renderer ??= new WebGLRenderer({ alpha: true, antialias: false });
        const texture = bake(renderer, terrainColumnsScene(frame.surfaces, frame), artCamera(width, height, 1.03, 256), width, height, false);
        sprite?.texture.destroy(true);
        sprite?.destroy();
        sprite = new Sprite(texture);
        sprite.position.set((640-width)/2, (400-height)/2);
        sprite.eventMode = "none";
        container.addChildAt(sprite, 0);
        revision = frame.revision;
        projectionKey = nextProjectionKey;
      }
      if (!water.parent) container.addChild(water);
      water.clear();
      for (const cell of frame.water) {
        if (cell.liquidVolumeM3 <= 0) continue;
        const [x,y,z] = cell.at;
        const top = (y-0.5)*frame.verticalMetres + Math.min(frame.verticalMetres,cell.liquidVolumeM3);
        const corners = [[x-.5,z-.5],[x+.5,z-.5],[x+.5,z+.5],[x-.5,z+.5]].map(([a,b])=>project(a,top,b));
        water.poly(corners.flatMap(p=>[p.x,p.y])).fill({color:0x497d88,alpha:0.7});
      }
    },
    position(camera) {
      container.position.set(camera.x,camera.y);
      container.scale.set(camera.zoom);
    },
    dispose() {
      clear();
      renderer?.dispose();
      renderer?.forceContextLoss();
      container.destroy({children:true});
    },
  };
}
