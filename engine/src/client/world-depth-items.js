function finite(value, name) {
  if (!Number.isFinite(value)) throw new Error(`invalid world depth subject ${name}`);
  return value;
}

function atlasFrame(texture) {
  const frame = texture?.frame;
  const source = texture?.source;
  if (
    !frame || !source ||
    ![frame.x, frame.y, frame.width, frame.height, source.width, source.height]
      .every(Number.isSafeInteger) ||
    frame.x < 0 || frame.y < 0 || frame.width <= 0 || frame.height <= 0 ||
    source.width <= 0 || source.height <= 0 ||
    frame.x + frame.width > source.width || frame.y + frame.height > source.height
  ) throw new Error("invalid world depth color frame");
  return Object.freeze({
    frame: Object.freeze({ x: frame.x, y: frame.y, width: frame.width, height: frame.height }),
    atlasWidth: source.width,
    atlasHeight: source.height,
  });
}

/**
 * Project one resolved original-art frame into the shared opaque world pass.
 * The art bank owns depth pixels; this projection owns no texture lifetime.
 */
export function subjectWorldDepthItem({ subject, texture, anchor, art, scale, physicalRole, visualPartId = "body", placement = null }) {
  if (!subject || typeof subject.id !== "string" || subject.id.length === 0)
    throw new Error("invalid world depth subject identity");
  if (!texture || !art?.depthByTexture)
    throw new Error("world depth art is unavailable");
  const depth = art.depthByTexture.get(texture);
  if (!depth?.texture || !(depth.pixels instanceof Uint8Array))
    throw new Error(`visual depth unavailable for ${subject.id}`);
  if (!anchor || !Number.isFinite(anchor.x) || !Number.isFinite(anchor.y))
    throw new Error("invalid world depth subject anchor");
  if (!["floor", "structure", "actor", "item"].includes(physicalRole))
    throw new Error("invalid world depth subject role");

  const worldOffset = placement?.offset ?? [0, 0];
  if (!Array.isArray(worldOffset) || worldOffset.length !== 2 || !worldOffset.every(Number.isFinite))
    throw new Error("invalid world depth placement offset");
  const screenOffset = placement?.screenOffset ?? [0, 0];
  if (!Array.isArray(screenOffset) || screenOffset.length !== 2 || !screenOffset.every(Number.isFinite))
    throw new Error("invalid world depth placement screen offset");

  return Object.freeze({
    entityId: subject.id,
    visualPartId,
    physicalRole,
    colorTexture: texture,
    colorFrame: atlasFrame(texture),
    depthTexture: depth.texture,
    depthFrame: depth,
    worldOrigin: Object.freeze({
      x: finite(subject.x, "x") + worldOffset[0],
      y: finite(subject.y, "y"),
      z: finite(subject.z, "z") + worldOffset[1],
    }),
    screenTransform: Object.freeze({
      x: finite(subject.screen?.x, "screen x") + screenOffset[0],
      y: finite(subject.screen?.y, "screen y") + screenOffset[1],
      scale: finite(scale, "scale"),
    }),
    anchor: Object.freeze({ x: anchor.x, y: anchor.y }),
    visible: true,
    pickable: subject.pickable !== false,
  });
}
