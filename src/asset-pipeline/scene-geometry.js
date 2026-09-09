import * as THREE from "three";
import { scene } from "../art/geometry.js";
import { buildOriginal } from "./original-builders.ts";
import { inspectScene } from "./scene-inspection.js";
import { originalDefinitions } from "./original-pack.ts";
import { parseSceneDocument } from "./scene-document.ts";

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
    root.traverse((object) => {
      if (object.geometry) geometries.add(object.geometry);
    });
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
        const shape =
          geometry.kind === "box"
            ? new THREE.BoxGeometry(...geometry.size)
            : new THREE.CylinderGeometry(
                geometry.radiusTop,
                geometry.radiusBottom,
                geometry.height,
                geometry.segments,
              );
        const material = new THREE.MeshLambertMaterial({
          color: node.material?.color ?? "#ffffff",
          flatShading: true,
        });
        ownedMaterials.add(material);
        const mesh = new THREE.Mesh(shape, material);
        mesh.castShadow = mesh.receiveShadow = true;
        subject.add(mesh);
      }
      if (geometry.kind === "original" && node.material) {
        subject.traverse((object) => {
          if (!object.isMesh) return;
          const clone = (source) => {
            const material = source.clone();
            material.color.set(node.material.color);
            ownedMaterials.add(material);
            return material;
          };
          object.material = Array.isArray(object.material)
            ? object.material.map(clone)
            : clone(object.material);
        });
      }
      inspectScene(root); // Validate actual output after each bounded builder.
    }
    for (const node of document.nodes)
      if (node.parentId !== null)
        subjects.get(node.parentId).add(subjects.get(node.id));
    root.updateMatrixWorld(true);
    const inspection = inspectScene(root);
    return { document, root, ...inspection, dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}

// Immutable Three JSON bytes; Three-generated UUIDs are artifact IDs, not node IDs.
export async function exportSceneDocument(input) {
  const compiled = compileSceneDocument(input);
  try {
    const scene = compiled.root.toJSON();
    const encoded = new TextEncoder().encode(JSON.stringify(scene));
    const hash = await crypto.subtle.digest("SHA-256", encoded);
    return {
      document: compiled.document,
      scene,
      metadata: {
        format: "three-object-json",
        threeRevision: THREE.REVISION,
        sha256: [...new Uint8Array(hash)]
          .map((value) => value.toString(16).padStart(2, "0"))
          .join(""),
        bytes: encoded.byteLength,
        bounds: compiled.bounds,
        stats: compiled.stats,
        builders: [
          ...new Set(
            compiled.document.nodes
              .filter((node) => node.geometry.kind === "original")
              .map(
                (node) =>
                  originalDefinitions[node.geometry.asset.builder].source,
              ),
          ),
        ],
      },
    };
  } finally {
    compiled.dispose();
  }
}
