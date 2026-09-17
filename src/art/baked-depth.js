// Raster export contract, independent of Three, Pixi and live simulation state.
// Distances are projections onto the unit axis toward the camera, relative to
// the authoring scene origin. Larger values are nearer. Arrays use top-left rows.
export function decodeBakedDepth(rgba, color, width, height, camera) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 ||
      rgba?.length !== width * height * 4 || color?.length !== width * height * 4)
    throw new Error('Invalid baked depth buffers');
  if (!Number.isFinite(camera?.near) || !Number.isFinite(camera?.far) || camera.far <= camera.near ||
      !Number.isFinite(camera?.originProjection))
    throw new Error('Invalid baked depth camera');
  const axisLength = Math.hypot(camera?.axis?.x, camera?.axis?.y, camera?.axis?.z);
  if (!Number.isFinite(axisLength) || Math.abs(axisLength - 1) > 1e-6)
    throw new Error('Baked depth axis must be normalized');
  const values = new Float32Array(width * height);
  const coverage = new Uint8Array(width * height);
  values.fill(NaN);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const p = ((height - 1 - y) * width + x) * 4;
      const colorAlpha = color[i * 4 + 3], depthAlpha = rgba[p + 3];
      if (colorAlpha !== 0 && colorAlpha !== 255)
        throw new Error('Depth bake requires binary color coverage');
      if ((colorAlpha === 255) !== (depthAlpha === 255))
        throw new Error('Color/depth coverage mismatch');
      if (!colorAlpha) continue;
      // Three RGBDepthPacking: unpack RGB normalized bytes with 255/256 scale.
      const normalized = rgba[p] / 256 + rgba[p + 1] / 65536 + rgba[p + 2] / (255 * 65536);
      values[i] = camera.originProjection - camera.near - normalized * (camera.far - camera.near);
      coverage[i] = 1;
    }
  }
  return {
    schema: 'hive.baked-depth/1', width, height,
    coordinates: 'scene-origin-projection-toward-camera',
    rowOrder: 'top-left', units: 'authoring-world-units',
    axis: camera.axis, near: camera.near, far: camera.far,
    cameraOriginProjection: camera.originProjection,
    maxQuantizationError: (camera.far - camera.near) / 16777215,
    coverageEncoding: '0=empty,1=surface,2=outline',
    outlinePolicy: 'first-surface-left-right-up-down;interior-only;alpha>128',
    values, coverage,
  };
}

// Read only the original alpha so the one-pixel outline never grows recursively.
export function outlineBakedPixels(source, width, height, depth) {
  const output = new Uint8ClampedArray(source);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      if (source[i * 4 + 3] > 128) continue;
      const neighbor = [-1, 1, -width, width].map(d => i + d)
        .find(n => source[n * 4 + 3] > 128);
      if (neighbor === undefined) continue;
      output.set([43, 48, 38, 255], i * 4);
      if (depth) {
        depth.values[i] = depth.values[neighbor];
        depth.coverage[i] = 2;
      }
    }
  }
  return output;
}
