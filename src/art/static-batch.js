import { Mesh } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/** Static scene geometry is baked once per terrain revision. Grouping by its
 * existing material preserves light/pixels while avoiding hundreds of draws. */
export function batchStaticScene(scene) {
  scene.updateMatrixWorld(true);
  const groups = new Map();
  const originals = [];
  scene.traverse((object) => {
    if (!object.isMesh || Array.isArray(object.material)) return;
    const geometry = object.geometry.clone();
    geometry.applyMatrix4(object.matrixWorld);
    const flat = geometry.index ? geometry.toNonIndexed() : geometry;
    for (const name of Object.keys(flat.attributes))
      if (name !== "position" && name !== "normal") flat.deleteAttribute(name);
    if (!groups.has(object.material)) groups.set(object.material, []);
    groups.get(object.material).push(flat);
    if (flat !== geometry) geometry.dispose();
    originals.push(object);
  });
  for (const object of originals) {
    object.removeFromParent();
    object.geometry.dispose();
  }
  for (const [material, geometries] of groups) {
    const merged = mergeGeometries(geometries);
    for (const geometry of geometries) geometry.dispose();
    const mesh = new Mesh(merged, material);
    mesh.castShadow = mesh.receiveShadow = true;
    scene.add(mesh);
  }
  return scene;
}
