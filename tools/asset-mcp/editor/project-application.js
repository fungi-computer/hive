import * as THREE from "three";

function applyCamera(editor, camera, controls) {
  if (camera) {
    editor.setCameraType(
      camera.isOrthographicCamera ? "orthographic" : "perspective",
    );
    const priorUuid = editor.camera.uuid;
    editor.camera.copy(camera);
    editor.camera.uuid = camera.uuid;
    delete editor.cameras[priorUuid];
    editor.cameras[camera.uuid] = editor.camera;
    if (controls) editor.controls.fromJSON(controls);
    return;
  }
  const bounds = new THREE.Box3().setFromObject(editor.scene);
  const center = bounds.getCenter(new THREE.Vector3());
  const size = Math.max(bounds.getSize(new THREE.Vector3()).length(), 1);
  editor.camera.position
    .copy(center)
    .add(new THREE.Vector3(size, size * 0.7, size));
  editor.camera.lookAt(center);
  editor.controls.center.copy(center);
}
// The native owner applies a fully parsed candidate. Native UI/render failures
// after clear remain nontransactional; admission has no mutation side effects.
export async function applyEditorProject(editor, candidate) {
  const { scene, camera, project, settings } = candidate;
  // Resolve renderer recovery before destroying the current scene. Native clear
  // resets renderer settings, so restore them again through the same owner below.
  if (settings) await editor.restoreProjectRenderer(settings);
  else await editor.rendererReady;
  editor.clear();
  if (settings) await editor.restoreProjectRenderer(settings);
  editor.backgroundType = settings
    ? project.backgroundType
    : scene.background?.isColor
      ? "Color"
      : "Default";
  editor.environmentType = settings ? project.environmentType : "None";
  editor.setScene(scene);
  editor.scene.position.copy(scene.position);
  editor.scene.quaternion.copy(scene.quaternion);
  editor.scene.scale.copy(scene.scale);
  applyCamera(editor, camera, project.controls);
  editor.scripts = {};
  editor.history.fromJSON(project.history);
  editor.signals.cameraResetted.dispatch();
  editor.signals.sceneGraphChanged.dispatch();
  // setScene already supplied full background/environment textures to the native
  // owner. A color-only background notification would erase a texture on import.
  editor.signals.windowResize.dispatch();
}
