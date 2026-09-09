import * as THREE from "three";
import { checkHistory } from "./history-admission.js";
import { decode, UPSTREAM_COMMIT } from "./protocol.js";
import {
  isolateOriginalMaterials,
  ownOriginalLightTargets,
  releaseScene,
} from "./scene-resources.js";

function rendererSettings(value) {
  if (
    !value ||
    !["WebGLRenderer", "WebGPURenderer"].includes(value.renderer) ||
    typeof value.shadows !== "boolean" ||
    ![0, 1, 3].includes(value.shadowType) ||
    ![0, 1, 2, 3, 4, 6, 7].includes(value.toneMapping) ||
    !Number.isFinite(value.toneMappingExposure) ||
    value.toneMappingExposure < 0 ||
    value.toneMappingExposure > 10 ||
    typeof value.antialias !== "boolean"
  )
    throw new Error("Invalid renderer project settings");
  return { ...value };
}
function checkView(project) {
  if (
    !project.controls ||
    !Array.isArray(project.controls.center) ||
    project.controls.center.length !== 3 ||
    !project.controls.center.every(Number.isFinite)
  )
    throw new Error("Invalid project camera controls");
  if (
    !["Default", "Color", "Texture", "Equirectangular"].includes(
      project.backgroundType,
    )
  )
    throw new Error("Invalid project background");
  if (!["Default", "None", "Equirectangular"].includes(project.environmentType))
    throw new Error("Invalid project environment");
}
function admitProjectData(input, original) {
  if (
    !original &&
    (input.format !== "hive-editor-project" ||
      input.version !== 1 ||
      input.upstream !== UPSTREAM_COMMIT)
  )
    throw new Error("Expected a project from this pinned Hive editor");
  const project = original
    ? { scene: input.scene, history: { undos: [], redos: [] }, scripts: {} }
    : input.project;
  if (project?.scene?.object?.type !== "Scene")
    throw new Error("Expected a Three scene");
  checkHistory(project.history);
  if (!original) {
    checkView(project);
    if (!project.camera?.object) throw new Error("Missing project camera");
    if (
      !["PerspectiveCamera", "OrthographicCamera"].includes(
        project.camera.object.type,
      )
    )
      throw new Error("Invalid project camera");
  }
  const settings = original ? null : rendererSettings(project.project);
  const provenance = JSON.stringify(
    original
      ? { document: input.document, metadata: input.metadata }
      : (input.provenance ?? null),
  );
  return { project, settings, provenance };
}

export async function admitEditorProject(bytes, original) {
  const { project, settings, provenance } = admitProjectData(
    decode(bytes),
    original,
  );
  const loader = new THREE.ObjectLoader();
  const scene = await loader.parseAsync(project.scene);
  let camera = null;
  try {
    camera = project.camera ? await loader.parseAsync(project.camera) : null;
    if (camera && !camera.isPerspectiveCamera && !camera.isOrthographicCamera)
      throw new Error("Invalid project camera");
    if (original) {
      isolateOriginalMaterials(scene);
      ownOriginalLightTargets(scene);
    }
    return { scene, camera, project, settings, provenance };
  } catch (error) {
    releaseScene(scene);
    if (camera) releaseScene(camera);
    throw error;
  }
}
