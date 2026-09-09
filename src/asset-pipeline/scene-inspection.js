import * as THREE from "three";

// Safety ceilings above 24 of every supported original prop. These bound actual
// compiler output in addition to document node/dimension/segment input limits.
export const GEOMETRY_LIMITS = Object.freeze({
  nodes: 4096,
  geometries: 3072,
  triangles: 200000,
});
export function inspectScene(root) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const bounds = box.isEmpty()
    ? null
    : { min: box.min.toArray(), max: box.max.toArray() };
  if (bounds && ![...bounds.min, ...bounds.max].every(Number.isFinite))
    throw new Error("Nonfinite scene bounds");
  const geometries = new Set(),
    materials = new Set();
  let nodes = 0,
    meshes = 0,
    triangles = 0;
  root.traverse((node) => {
    nodes++;
    if (!node.isMesh) return;
    meshes++;
    geometries.add(node.geometry);
    const positions = node.geometry.attributes.position;
    if (!positions || ![...positions.array].every(Number.isFinite))
      throw new Error("Invalid geometry positions");
    triangles += (node.geometry.index?.count ?? positions.count) / 3;
    for (const material of Array.isArray(node.material)
      ? node.material
      : [node.material])
      materials.add(material);
  });
  if (
    nodes > GEOMETRY_LIMITS.nodes ||
    geometries.size > GEOMETRY_LIMITS.geometries ||
    triangles > GEOMETRY_LIMITS.triangles ||
    !Number.isFinite(triangles)
  )
    throw new Error("Scene geometry budget exceeded");
  return {
    bounds,
    stats: {
      nodes,
      meshes,
      triangles,
      geometries: geometries.size,
      materials: materials.size,
    },
  };
}
