// The editor owns imported resources. These helpers close the candidate/session
// lifetime; shared original-builder materials never cross this JSON boundary.
export function releaseScene(root) {
  const geometries = new Set(),
    materials = new Set(),
    textures = new Set();
  for (const value of [root.background, root.environment])
    if (value?.isTexture) textures.add(value);
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
export function isolateOriginalMaterials(scene) {
  const originals = new Set();
  function clone(material) {
    originals.add(material);
    return material.clone();
  }
  scene.traverse((object) => {
    if (object.material)
      object.material = Array.isArray(object.material)
        ? object.material.map(clone)
        : clone(object.material);
  });
  originals.forEach((material) => material.dispose());
}

// Normalize the original artifact's detached default light targets into the
// native scene graph so ObjectLoader can resolve their serialized UUID links.
export function ownOriginalLightTargets(scene) {
  const members = new Set(),
    targets = new Set();
  scene.traverse((object) => {
    members.add(object);
    if (object.isDirectionalLight || object.isSpotLight)
      targets.add(object.target);
  });
  for (const target of targets) {
    if (members.has(target)) continue;
    target.name ||= "Light target";
    target.userData.serializationNormalization =
      "original-detached-light-target-v1";
    scene.attach(target);
  }
}
