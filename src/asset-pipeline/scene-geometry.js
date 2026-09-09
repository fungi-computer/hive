import * as THREE from "three";
import { scene } from "../art/geometry.js";
import { bench, bottle, kettle, bookcase } from "../studies/brewhouse/props.js";
import { parseSceneDocument } from "./scene-document.ts";

function buildOriginal(parent, asset) {
  switch (asset.builder) {
    case "bench": bench(parent, asset.parameters); break;
    case "bottle": bottle(parent, asset.parameters.color, asset.parameters.size); break;
    case "kettle": kettle(parent); break;
    case "bookcase": bookcase(parent); break;
    default: throw new Error("Unsupported original builder");
  }
}

// The only new scene compiler. No retained scene store; callers own this result
// until dispose(). Shared original palette materials are never edited/disposed.
export function compileSceneDocument(input) {
  const document = parseSceneDocument(input);
  const root = scene();
  root.name = document.name;
  const ownedMaterials = new Set();
  const subjects = new Map();
  let disposed = false;
  function dispose() {
    if (disposed) return;
    disposed = true;
    const geometries = new Set();
    root.traverse(object => { if (object.geometry) geometries.add(object.geometry); });
    for (const geometry of geometries) geometry.dispose();
    for (const material of ownedMaterials) material.dispose();
    root.clear();
  }
  try {
    for (const node of document.nodes) {
      const subject = new THREE.Group();
      root.add(subject); // Attach immediately so partial construction is disposed.
      subject.name = node.id;
      subject.userData.sceneNodeId = node.id;
      subject.position.fromArray(node.transform.position);
      subject.rotation.set(...node.transform.rotation, "XYZ");
      subject.scale.fromArray(node.transform.scale);
      subjects.set(node.id, subject);
      const geometry = node.geometry;
      if (geometry.kind === "original") buildOriginal(subject, geometry.asset);
      else if (geometry.kind !== "group") {
        const shape = geometry.kind === "box"
          ? new THREE.BoxGeometry(...geometry.size)
          : new THREE.CylinderGeometry(geometry.radiusTop, geometry.radiusBottom, geometry.height, geometry.segments);
        const material = new THREE.MeshLambertMaterial({ color: node.material?.color ?? "#ffffff", flatShading: true });
        ownedMaterials.add(material);
        const mesh = new THREE.Mesh(shape, material);
        mesh.castShadow = mesh.receiveShadow = true;
        subject.add(mesh);
      }
      if (geometry.kind === "original" && node.material) {
        subject.traverse(object => {
          if (!object.isMesh) return;
          const clone = source => {
            const material = source.clone();
            material.color.set(node.material.color);
            ownedMaterials.add(material);
            return material;
          };
          object.material = Array.isArray(object.material) ? object.material.map(clone) : clone(object.material);
        });
      }
    }
    for (const node of document.nodes)
      if (node.parentId !== null) subjects.get(node.parentId).add(subjects.get(node.id));
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    const bounds = box.isEmpty() ? null : { min: box.min.toArray(), max: box.max.toArray() };
    if (bounds && ![...bounds.min, ...bounds.max].every(Number.isFinite)) throw new Error("Nonfinite scene bounds");
    return { document, root, bounds, dispose };
  } catch (error) { dispose(); throw error; }
}

// Immutable Three JSON bytes; Three-generated UUIDs are artifact IDs, not node IDs.
export function exportSceneDocument(input) {
  const compiled = compileSceneDocument(input);
  try {
    const scene = compiled.root.toJSON();
    return { document: compiled.document, scene, bounds: compiled.bounds };
  } finally { compiled.dispose(); }
}
