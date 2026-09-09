import * as THREE from "three";
import { checkHistory } from "./history-admission.js";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { decode, encode, UPSTREAM_COMMIT } from "./protocol.js";

function release(root) {
  const geometries = new Set(),
    materials = new Set(),
    textures = new Set();
  root.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
    for (const material of Array.isArray(object.material)
      ? object.material
      : object.material
        ? [object.material]
        : []) {
      materials.add(material);
      for (const value of Object.values(material))
        if (value?.isTexture) textures.add(value);
    }
  });
  for (const resource of [...geometries, ...materials, ...textures])
    resource.dispose();
}
// Editor and its native History are the sole session mutation owner. Provenance
// is detached immutable JSON text, never an editable parallel recipe.
export function createEditorSession(editor, renderer) {
  let provenance = "null";
  const nativeClear = editor.clear.bind(editor);
  editor.clear = () => {
    release(editor.scene);
    nativeClear();
    provenance = "null";
  };
  async function load(bytes, original) {
    const input = decode(bytes);
    const project = original
      ? { scene: input.scene, history: { undos: [], redos: [] }, scripts: {} }
      : input.project;
    if (
      !original &&
      (input.format !== "hive-editor-project" ||
        input.version !== 1 ||
        input.upstream !== UPSTREAM_COMMIT)
    )
      throw new Error("Expected a project from this pinned Hive editor");
    if (!project?.scene || project.scene.object?.type !== "Scene")
      throw new Error("Expected a Three scene");
    checkHistory(project.history);
    if (
      project.controls &&
      (!Array.isArray(project.controls.center) ||
        project.controls.center.length !== 3 ||
        !project.controls.center.every(Number.isFinite))
    )
      throw new Error("Invalid project camera controls");
    // Parse and admit before scene replacement. Native signals after clear are
    // not transactional; host/runtime failure at that stage can interrupt load.
    const loader = new THREE.ObjectLoader();
    const scene = await loader.parseAsync(project.scene);
    let camera;
    try {
      if (project.camera) {
        camera = await loader.parseAsync(project.camera);
        if (!camera.isCamera) throw new Error("Invalid project camera");
      }
      const originalMaterials = new Set();
      if (original)
        scene.traverse((object) => {
          if (object.material) {
            for (const material of Array.isArray(object.material)
              ? object.material
              : [object.material])
              originalMaterials.add(material);
            object.material = Array.isArray(object.material)
              ? object.material.map((material) => material.clone())
              : object.material.clone();
          }
        });
      for (const material of originalMaterials) material.dispose();
      editor.clear();
      editor.backgroundType =
        project.backgroundType ??
        (scene.background?.isColor ? "Color" : "Default");
      editor.environmentType = project.environmentType ?? "None";
      // setScene dispatches environment setup using the owner fields above.
      editor.setScene(scene);
      editor.scene.position.copy(scene.position);
      editor.scene.quaternion.copy(scene.quaternion);
      editor.scene.scale.copy(scene.scale);
      if (camera) {
        editor.setCameraType(
          camera.isOrthographicCamera ? "orthographic" : "perspective",
        );
        const priorUuid = editor.camera.uuid;
        editor.camera.copy(camera);
        editor.camera.uuid = camera.uuid;
        delete editor.cameras[priorUuid];
        editor.cameras[camera.uuid] = editor.camera;
        if (project.controls) editor.controls.fromJSON(project.controls);
      } else {
        const bounds = new THREE.Box3().setFromObject(editor.scene);
        const center = bounds.getCenter(new THREE.Vector3());
        const size = Math.max(bounds.getSize(new THREE.Vector3()).length(), 1);
        editor.camera.position
          .copy(center)
          .add(new THREE.Vector3(size, size * 0.7, size));
        editor.camera.lookAt(center);
        editor.controls.center.copy(center);
      }
      editor.scripts = {};
      editor.history.fromJSON(project.history);
      provenance = JSON.stringify(
        original
          ? { document: input.document, metadata: input.metadata }
          : input.provenance,
      );
      editor.signals.cameraResetted.dispatch();
      editor.signals.sceneGraphChanged.dispatch();
      editor.signals.sceneBackgroundChanged.dispatch(
        editor.backgroundType,
        editor.scene.background?.getHex?.(),
      );
      editor.signals.windowResize.dispatch();
      return encode({
        name: editor.scene.name,
        objects: editor.scene.children.length,
        warnings: original
          ? []
          : [
              "Renderer/project display settings are not restored in this checkpoint.",
            ],
      });
    } catch (error) {
      release(scene);
      throw error;
    }
  }
  async function execute(operation, bytes) {
    if (operation === "load-asset") return load(bytes, true);
    if (operation === "load-project") return load(bytes, false);
    if (operation === "export-project") {
      const project = editor.toJSON();
      // Use the public project export admission too: imported script data cannot
      // be hidden in history and later revived on reopening.
      const bytes = encode({
        format: "hive-editor-project",
        version: 1,
        upstream: UPSTREAM_COMMIT,
        provenance: JSON.parse(provenance),
        limitations: [
          "Renderer/project display settings are saved but not restored in this checkpoint.",
        ],
        project,
      });
      decode(bytes);
      return bytes;
    }
    if (operation === "export-three") return encode(editor.scene.toJSON());
    if (operation === "export-glb") {
      const asset = editor.scene.clone(true);
      const previews = [];
      asset.traverse((node) => {
        if (node.isCamera || node.isLight) previews.push(node);
      });
      previews.forEach((node) => node.removeFromParent());
      return new GLTFExporter().parseAsync(asset, {
        binary: true,
        onlyVisible: false,
      });
    }
    if (operation === "dispose") {
      renderer()?.setAnimationLoop(null);
      editor.mixer.stopAllAction();
      editor.controls.disconnect();
      release(editor.scene);
      release(editor.sceneHelpers);
      renderer()?.dispose();
      renderer()?.forceContextLoss?.();
      return encode({ disposed: true });
    }
    throw new Error("Unsupported editor operation");
  }
  return { execute };
}
