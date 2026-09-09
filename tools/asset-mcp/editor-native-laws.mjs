// Lightweight laws over the same pinned Three import boundary as frame.html.
// No browser, renderer, mocked Editor, or claim of UI/history replay coverage.
import { registerHooks } from "node:module";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import test from "node:test";
const vendor = new URL("./editor/vendor/", import.meta.url);
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "three")
      return {
        url: new URL("build/three.module.js", vendor).href,
        shortCircuit: true,
      };
    if (specifier.startsWith("three/addons/"))
      return {
        url: new URL(
          "examples/jsm/" + specifier.slice("three/addons/".length),
          vendor,
        ).href,
        shortCircuit: true,
      };
    return next(specifier, context);
  },
});
const THREE = await import("three");
const { admitEditorProject } = await import("./editor/project-admission.js");
const { encode, UPSTREAM_COMMIT } = await import("./editor/protocol.js");
const { checkHistory } = await import("./editor/history-admission.js");
const { ownOriginalLightTargets, releaseScene } =
  await import("./editor/scene-resources.js");
const { patchUpstream } = await import("./editor/upstream-patches.mjs");
const baseline = JSON.parse(
  await readFile(
    new URL("./examples/exports/baseline.three.json", import.meta.url),
    "utf8",
  ),
);
const settings = {
  renderer: "WebGLRenderer",
  antialias: false,
  shadows: true,
  shadowType: 0,
  toneMapping: 4,
  toneMappingExposure: 1.25,
};
function packet(scene = baseline) {
  return {
    format: "hive-editor-project",
    version: 1,
    upstream: UPSTREAM_COMMIT,
    provenance: { source: "native-law" },
    project: {
      project: { ...settings },
      camera: new THREE.PerspectiveCamera().toJSON(),
      controls: { center: [0, 0, 0] },
      scene,
      scripts: {},
      history: { undos: [], redos: [] },
      backgroundType: "Default",
      environmentType: "None",
    },
  };
}

test("current settings are mandatory; native scene/camera round-trip preserves data", async () => {
  assert.equal(THREE.REVISION, "186");
  const input = packet(),
    bytes = encode(input),
    copy = bytes.slice(0);
  const candidate = await admitEditorProject(bytes, false);
  assert.deepEqual(candidate.settings, settings);
  assert.equal(candidate.camera.uuid, input.project.camera.object.uuid);
  const reopened = await admitEditorProject(
    encode(packet(candidate.scene.toJSON())),
    false,
  );
  assert.equal(reopened.scene.uuid, candidate.scene.uuid);
  assert.deepEqual(bytes, copy);
  releaseScene(candidate.scene);
  releaseScene(reopened.scene);
  for (const field of [
    "camera",
    "controls",
    "backgroundType",
    "environmentType",
  ]) {
    const missing = packet();
    delete missing.project[field];
    await assert.rejects(admitEditorProject(encode(missing), false));
  }
  delete input.project.project.antialias;
  await assert.rejects(
    admitEditorProject(encode(input), false),
    /renderer project settings/,
  );
  for (const [key, value] of [
    ["shadowType", 2],
    ["toneMapping", 5],
    ["toneMappingExposure", 11],
  ]) {
    const bad = packet();
    bad.project.project[key] = value;
    await assert.rejects(
      admitEditorProject(encode(bad), false),
      /renderer project settings/,
    );
  }
});

test("original import keeps real defaults and isolates shared materials", async () => {
  const candidate = await admitEditorProject(
    encode({ scene: baseline, document: { name: "fixture" }, metadata: {} }),
    true,
  );
  assert.equal(candidate.settings, null);
  const meshes = [];
  candidate.scene.traverse((node) => {
    if (node.isMesh) meshes.push(node);
  });
  assert(meshes.length > 1);
  const materials = meshes.flatMap((node) =>
    Array.isArray(node.material) ? node.material : [node.material],
  );
  assert.equal(new Set(materials).size, materials.length);
  const sibling = materials[1].color.clone();
  materials[0].color.set(0xff0000);
  assert(materials[1].color.equals(sibling));
  releaseScene(candidate.scene);
});

test("native attach preserves detached light target world transform and serialized identity", async () => {
  const scene = new THREE.Scene();
  scene.position.set(2, 1, -3);
  scene.rotation.y = 0.4;
  scene.scale.setScalar(2);
  const light = new THREE.DirectionalLight();
  const spot = new THREE.SpotLight();
  light.target.position.set(3, 4, 5);
  spot.target.position.set(-1, 2, 3);
  scene.add(light, spot);
  const targets = [light.target, spot.target],
    before = targets.map((target) =>
      target.getWorldPosition(new THREE.Vector3()),
    );
  ownOriginalLightTargets(scene);
  ownOriginalLightTargets(scene);
  assert.equal(scene.children.length, 4);
  targets.forEach((target, i) =>
    assert(
      target.getWorldPosition(new THREE.Vector3()).distanceTo(before[i]) <
        1e-10,
    ),
  );
  const restored = await new THREE.ObjectLoader().parseAsync(scene.toJSON());
  for (const source of [light, spot]) {
    const loaded = restored.getObjectByProperty("uuid", source.uuid);
    assert.equal(loaded.target.uuid, source.target.uuid);
    assert.equal(
      loaded.target,
      restored.getObjectByProperty("uuid", source.target.uuid),
    );
    assert(
      loaded.target
        .getWorldPosition(new THREE.Vector3())
        .distanceTo(source.target.getWorldPosition(new THREE.Vector3())) <
        1e-10,
    );
  }
  releaseScene(scene);
  releaseScene(restored);
});

test("failed camera admission disposes actually parsed native resources", async () => {
  const input = packet();
  input.project.camera = new THREE.Object3D().toJSON();
  const originalGeometry = THREE.BufferGeometry.prototype.dispose,
    originalMaterial = THREE.Material.prototype.dispose;
  let geometries = 0,
    materials = 0;
  THREE.BufferGeometry.prototype.dispose = function () {
    geometries++;
    return originalGeometry.call(this);
  };
  THREE.Material.prototype.dispose = function () {
    materials++;
    return originalMaterial.call(this);
  };
  try {
    await assert.rejects(
      admitEditorProject(encode(input), false),
      /Invalid project camera/,
    );
  } finally {
    THREE.BufferGeometry.prototype.dispose = originalGeometry;
    THREE.Material.prototype.dispose = originalMaterial;
  }
  assert(geometries > 0 && materials > 0);
});

test("native history admission rejects malformed transforms, duplicate IDs and executable records", () => {
  const command = {
    type: "SetPositionCommand",
    id: 1,
    name: "Move",
    objectUuid: "object",
    oldPosition: [0, 0, 0],
    newPosition: [1, 0, 0],
  };
  checkHistory({ undos: [command], redos: [] });
  assert.throws(
    () => checkHistory({ undos: [command], redos: [command] }),
    /Duplicate/,
  );
  assert.throws(
    () =>
      checkHistory({ undos: [{ ...command, newPosition: [1, 2] }], redos: [] }),
    /transform/,
  );
  assert.throws(
    () =>
      checkHistory({
        undos: [{ ...command, type: "AddScriptCommand" }],
        redos: [],
      }),
    /Unsupported/,
  );
});

test("owner patches retain pristine pin and include current serialization contract", async () => {
  const path = "vendor/editor/js/Editor.js";
  const original = await readFile(new URL("./editor/" + path, import.meta.url));
  const result = patchUpstream(path, original);
  assert.match(result.bytes.toString(), /antialias: this.config.getKey/);
  assert.match(result.bytes.toString(), /environmentRotation.copy/);
  assert.notEqual(result.record.pristineSha256, result.record.resultSha256);
  const broken = Buffer.from(original);
  broken[0] ^= 1;
  assert.throws(
    () => patchUpstream(path, broken),
    /Pristine upstream hash mismatch/,
  );
});
