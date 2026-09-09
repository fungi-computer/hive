// Ignored-only editor interchange probe. It exports the current original
// Copper Familiar kettle before any canvas bake disposes its geometry.
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { scene, group } from "../../src/art/geometry.js";
import { buildProp } from "../../src/studies/brewhouse/props.js";

const output = new URL("./output/", import.meta.url);
await mkdir(output, { recursive: true });

function summary(root) {
  const result = { nodes: 0, meshes: 0, lights: 0, geometries: 0, materials: 0 };
  const geometries = new Set();
  const materials = new Set();
  root.traverse((node) => {
    result.nodes++;
    if (node.isMesh) {
      result.meshes++;
      geometries.add(node.geometry.uuid);
      for (const material of Array.isArray(node.material)
        ? node.material
        : [node.material]) {
        materials.add(material.uuid);
      }
    }
    if (node.isLight) result.lights++;
  });
  return { ...result, geometries: geometries.size, materials: materials.size };
}

function bounds(root) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  return { min: box.min.toArray(), max: box.max.toArray() };
}

function sameVector(left, right) {
  return left.every((value, index) => Math.abs(value - right[index]) < 1e-12);
}

function vectorDelta(left, right) {
  return left.map((value, index) => value - right[index]);
}

const original = scene();
original.name = "Hive Copper Familiar kettle — editor interchange probe";
const subject = group(original);
subject.name = "brewhouse-prop:kettle";
buildProp("kettle", subject);
// Production render updates these matrices. A standalone export must do it
// explicitly or Object3D.toJSON records default matrices for fresh children.
original.updateMatrixWorld(true);
const json = original.toJSON();
const serialized = `${JSON.stringify(json, null, 2)}\n`;
const restored = new THREE.ObjectLoader().parse(JSON.parse(serialized));
const source = summary(original);
const parsed = summary(restored);
const sourceBounds = bounds(original);
const parsedBounds = bounds(restored);
const sourceSubject = original.getObjectByName("brewhouse-prop:kettle");
const parsedSubject = restored.getObjectByName("brewhouse-prop:kettle");
const verified = {
  metadataType: json.metadata?.type,
  namedSubject: !!parsedSubject,
  summaryEqual: JSON.stringify(source) === JSON.stringify(parsed),
  boundsEqual:
    sameVector(sourceBounds.min, parsedBounds.min) &&
    sameVector(sourceBounds.max, parsedBounds.max),
  subjectTransformEqual:
    !!sourceSubject &&
    !!parsedSubject &&
    sameVector(sourceSubject.position.toArray(), parsedSubject.position.toArray()) &&
    sameVector(sourceSubject.quaternion.toArray(), parsedSubject.quaternion.toArray()) &&
    sameVector(sourceSubject.scale.toArray(), parsedSubject.scale.toArray()),
  boundsDelta: {
    min: vectorDelta(sourceBounds.min, parsedBounds.min),
    max: vectorDelta(sourceBounds.max, parsedBounds.max),
  },
};

const sourcePath = fileURLToPath(import.meta.url);
const artifactPath = fileURLToPath(new URL("./output/brewhouse-kettle.r185.json", import.meta.url));
const report = {
  purpose: "Standard Three ObjectLoader artifact for one current Copper Familiar kettle prop; ignored tool-fit trial only.",
  source: {
    module: sourcePath,
    factory: "src/studies/brewhouse/props.js:buildProp('kettle')",
    lightRig: "src/art/geometry.js:scene",
    productionCamera: "src/art/scale.js:camera (not serialized into this Object scene)",
    bakeBoundary: "src/studies/brewhouse/bake.js:bakeCanvas disposes geometry after render",
    exportPreparation: "scene.updateMatrixWorld(true) before Object3D.toJSON",
  },
  runtime: { threeRevision: THREE.REVISION, threePackageVersion: "0.185.1" },
  artifact: {
    path: artifactPath,
    sha256: createHash("sha256").update(serialized).digest("hex"),
    bytes: Buffer.byteLength(serialized),
  },
  sourceSummary: source,
  parsedSummary: parsed,
  sourceBounds,
  parsedBounds,
  verified,
  preserved: [
    "standard scene hierarchy, named subject, transforms, MeshLambert materials, BufferGeometry, and shared light rig",
  ],
  notPreserved: [
    "the buildProp factory identity and its source parameters",
    "the shared geometry.js material cache identity",
    "the production orthographic camera, renderer settings, outline pass, and Pixi texture",
    "any route back from editor edits into Hive procedural source",
  ],
};
await writeFile(artifactPath, serialized);
await writeFile(
  fileURLToPath(new URL("./output/roundtrip-report.json", import.meta.url)),
  `${JSON.stringify(report, null, 2)}\n`,
);
console.log(JSON.stringify(report, null, 2));
if (
  verified.metadataType !== "Object" ||
  !verified.summaryEqual ||
  !verified.namedSubject ||
  !verified.boundsEqual ||
  !verified.subjectTransformEqual
)
  throw new Error(`ObjectLoader roundtrip mismatch: ${JSON.stringify(verified)}`);
