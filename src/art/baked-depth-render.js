import * as THREE from 'three';
import { decodeBakedDepth } from './baked-depth.js';

// Deliberately bounded to the opaque mesh primitives used by original art.
// Fail unsupported visual semantics rather than silently exporting false depth.
export function validateDepthBake(renderer, scene, camera) {
  if (!camera.isOrthographicCamera || !Number.isFinite(camera.near) ||
      !Number.isFinite(camera.far) || camera.far <= camera.near)
    throw new Error('Depth bake requires a finite orthographic camera');
  if (renderer.getPixelRatio() !== 1 || renderer.getRenderTarget() ||
      renderer.capabilities.reversedDepthBuffer || renderer.capabilities.logarithmicDepthBuffer)
    throw new Error('Depth bake requires pixel ratio 1, default target and standard depth');
  if (renderer.getContext().getContextAttributes()?.antialias)
    throw new Error('Depth bake requires an antialias-free renderer');
  if (scene.background || scene.overrideMaterial || renderer.getClearAlpha() !== 0 ||
      !renderer.autoClear || !renderer.autoClearColor || !renderer.autoClearDepth)
    throw new Error('Depth bake requires a transparent, automatically cleared scene');
  scene.traverseVisible(object => {
    if (!object.material) return;
    if (!object.isMesh) throw new Error('Depth bake supports opaque meshes only');
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (material.transparent || material.opacity !== 1 || material.alphaTest || material.alphaHash ||
          material.isShaderMaterial || material.isShadowMaterial || material.displacementMap ||
          material.clippingPlanes?.length || material.polygonOffset || !material.depthWrite ||
          !material.depthTest || !material.colorWrite || material.depthFunc !== THREE.LessEqualDepth ||
          material.blending !== THREE.NormalBlending || material.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile ||
          material.wireframe || material.stencilWrite || material.alphaToCoverage ||
          (material.transmission ?? 0) !== 0)
        throw new Error('Depth bake does not support this material coverage/depth behavior');
    }
  });
}

export function renderBakedDepth(renderer, scene, camera, width, height, color) {
  const materials = new Map(), originals = [];
  const target = new THREE.WebGLRenderTarget(width, height, {
    minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
    format: THREE.RGBAFormat, type: THREE.UnsignedByteType,
    colorSpace: THREE.NoColorSpace, depthBuffer: true, stencilBuffer: false,
  });
  const oldTarget = renderer.getRenderTarget();
  const clearColor = renderer.getClearColor(new THREE.Color());
  const clearAlpha = renderer.getClearAlpha();
  const shadowAutoUpdate = renderer.shadowMap.autoUpdate;
  const shadowNeedsUpdate = renderer.shadowMap.needsUpdate;
  try {
    scene.traverseVisible(object => {
      if (!object.isMesh) return;
      originals.push([object, object.material]);
      const replace = material => {
        if (!materials.has(material)) materials.set(material, new THREE.MeshDepthMaterial({
          depthPacking: THREE.RGBDepthPacking, side: material.side, visible: material.visible,
        }));
        return materials.get(material);
      };
      object.material = Array.isArray(object.material) ? object.material.map(replace) : replace(object.material);
    });
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = false;
    renderer.setRenderTarget(target);
    renderer.setClearColor(0, 0);
    renderer.clear();
    renderer.render(scene, camera);
    const rgba = new Uint8Array(width * height * 4);
    renderer.readRenderTargetPixels(target, 0, 0, width, height, rgba);
    const axis = camera.getWorldDirection(new THREE.Vector3()).negate();
    return decodeBakedDepth(rgba, color, width, height, {
      axis: { x: axis.x, y: axis.y, z: axis.z },
      originProjection: camera.getWorldPosition(new THREE.Vector3()).dot(axis),
      near: camera.near, far: camera.far,
    });
  } finally {
    for (const [object, material] of originals) object.material = material;
    renderer.setRenderTarget(oldTarget);
    renderer.setClearColor(clearColor, clearAlpha);
    renderer.shadowMap.autoUpdate = shadowAutoUpdate;
    renderer.shadowMap.needsUpdate = shadowNeedsUpdate;
    target.dispose();
    for (const material of materials.values()) material.dispose();
  }
}
