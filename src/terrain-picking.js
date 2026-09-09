import { Raycaster, Vector2, Vector3 } from "three";
import { worldCamera, WIDTH, HEIGHT } from "./art/scale.js";
import { terrainSurfaces } from "./terrain-surface-geometry.js";

/** The nearest physical face wins. Cached triangles are rebuilt on terrain
 * revision/load, never stored as world truth. Points are baked-canvas pixels. */
export function createTerrainPicker(size) {
  const raycaster = new Raycaster();
  const screen = new Vector2();
  const hit = new Vector3();
  let source = null,
    revision = -1,
    triangles = [];
  function update(terrain) {
    if (source === terrain && revision === terrain.revision) return;
    source = terrain;
    revision = terrain.revision;
    const center = (size - 1) / 2;
    triangles = terrainSurfaces(terrain, size).flatMap((face) => {
      const points = face.vertices.map(
        ({ x, y, z }) => new Vector3(x - center, y, z - center),
      );
      return [
        [0, 1, 2],
        [0, 2, 3],
      ].map((indices) => ({
        face,
        points: indices.map((index) => points[index]),
      }));
    });
  }
  return {
    update,
    pick(point) {
      if (!source) return null;
      screen.set((point.x / WIDTH) * 2 - 1, 1 - (point.y / HEIGHT) * 2);
      raycaster.setFromCamera(screen, worldCamera);
      let nearest = Infinity,
        selected = null;
      for (const { face, points } of triangles) {
        if (!raycaster.ray.intersectTriangle(...points, false, hit)) continue;
        const distance = raycaster.ray.origin.distanceToSquared(hit);
        if (distance < nearest) {
          nearest = distance;
          selected = face;
        }
      }
      return selected;
    },
    clear() {
      source = null;
      revision = -1;
      triangles = [];
    },
  };
}
