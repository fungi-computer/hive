const MAX_DEPTH_24 = 0xffffff;
const THREE_UNPACK = Object.freeze([
  255 / 256,
  (255 / 256) / 256,
  (255 / 256) / 65536,
  1 / 16777216,
]);

export function decodeThreePackedDepth(data, offset) {
  return (
    (data[offset] / 255) * THREE_UNPACK[0] +
    (data[offset + 1] / 255) * THREE_UNPACK[1] +
    (data[offset + 2] / 255) * THREE_UNPACK[2] +
    (data[offset + 3] / 255) * THREE_UNPACK[3]
  );
}

export function writeDepth24(data, offset, value) {
  const encoded = Math.round(Math.max(0, Math.min(1, value)) * MAX_DEPTH_24);
  data[offset] = encoded >>> 16;
  data[offset + 1] = (encoded >>> 8) & 0xff;
  data[offset + 2] = encoded & 0xff;
  data[offset + 3] = 255;
}

export function decodeDepth24(data, offset) {
  return (
    (data[offset] * 65536 + data[offset + 1] * 256 + data[offset + 2]) /
    MAX_DEPTH_24
  );
}

/** Convert Three's packed orthographic depth into a raw linear local-depth
 * image. The final color alpha is authoritative coverage. New ink-outline
 * pixels inherit the nearest source pixel's depth in a fixed neighbor order. */
export function makeLinearDepthImage({
  sourceColor,
  finalColor,
  packedDepth,
  width,
  height,
  cameraNear,
  cameraFar,
  cameraDepth,
  minDepth,
  maxDepth,
}) {
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    sourceColor.length !== width * height * 4 ||
    finalColor.length !== sourceColor.length ||
    packedDepth.length !== sourceColor.length
  )
    throw new Error("depth-image-invalid-dimensions");
  if (
    ![cameraNear, cameraFar, cameraDepth, minDepth, maxDepth].every(Number.isFinite) ||
    cameraFar <= cameraNear ||
    maxDepth <= minDepth
  )
    throw new Error("depth-image-invalid-range");

  const count = width * height;
  const localDepth = new Float64Array(count);
  localDepth.fill(Number.NaN);
  for (let pixel = 0; pixel < count; pixel++) {
    const offset = pixel * 4;
    if (sourceColor[offset + 3] <= 128) continue;
    const cameraDistance =
      cameraNear +
      decodeThreePackedDepth(packedDepth, offset) * (cameraFar - cameraNear);
    localDepth[pixel] = cameraDepth - cameraDistance;
  }

  const output = new Uint8ClampedArray(sourceColor.length);
  const neighbors = Object.freeze([
    Object.freeze([-1, 0]),
    Object.freeze([1, 0]),
    Object.freeze([0, -1]),
    Object.freeze([0, 1]),
  ]);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixel = y * width + x;
      const offset = pixel * 4;
      if (finalColor[offset + 3] <= 128) continue;
      let depth = localDepth[pixel];
      if (!Number.isFinite(depth)) {
        for (const [dx, dy] of neighbors) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          const candidate = localDepth[ny * width + nx];
          if (Number.isFinite(candidate)) {
            depth = candidate;
            break;
          }
        }
      }
      if (!Number.isFinite(depth))
        throw new Error(`depth-image-coverage-mismatch:${x}:${y}`);
      writeDepth24(output, offset, (depth - minDepth) / (maxDepth - minDepth));
    }
  }
  return output;
}
