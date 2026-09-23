import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { decode, encode, UPSTREAM_COMMIT } from "./protocol.js";
import { admitEditorProject } from "./project-admission.js";
import { applyEditorProject } from "./project-application.js";
import { releaseScene } from "./scene-resources.js";

// Editor and its native History are the sole session mutation owner. Provenance
// is detached immutable JSON text, never an editable parallel recipe.
export function createEditorSession(editor, renderer) {
  let provenance = "null";
  const nativeClear = editor.clear.bind(editor);
  editor.clear = () => {
    releaseScene(editor.scene);
    nativeClear();
    provenance = "null";
  };
  async function load(bytes, original) {
    const candidate = await admitEditorProject(bytes, original);
    try {
      await applyEditorProject(editor, candidate);
      provenance = candidate.provenance;
      return encode({
        name: editor.scene.name,
        objects: editor.scene.children.length,
        warnings: [],
      });
    } catch (error) {
      releaseScene(candidate.scene);
      throw error;
    }
  }
  async function execute(operation, bytes) {
    if (operation.startsWith("export-")) await editor.rendererReady;
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
        limitations: [],
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
      releaseScene(editor.scene);
      releaseScene(editor.sceneHelpers);
      renderer()?.dispose();
      renderer()?.forceContextLoss?.();
      return encode({ disposed: true });
    }
    throw new Error("Unsupported editor operation");
  }
  return { execute };
}
