import { sampleCell } from "./terrain.js";

export const SECTION_LIMITS = Object.freeze({
  maxWidth: 24,
  maxDepth: 16,
  halo: 1,
});

function integer(value, label) {
  if (!Number.isInteger(value))
    throw new TypeError(`${label} must be an integer`);
  return value;
}

function sectionOptions(options) {
  const focusX = integer(options.focusX, "section focus x");
  const focusZ = integer(options.focusZ, "section focus z");
  const width = integer(options.width ?? 24, "section width");
  const depth = integer(options.depth ?? 16, "section depth");
  const halo = integer(options.halo ?? 1, "section halo");
  if (width <= 0 || width > SECTION_LIMITS.maxWidth)
    throw new RangeError(`section width must be 1-${SECTION_LIMITS.maxWidth}`);
  if (depth <= 0 || depth > SECTION_LIMITS.maxDepth)
    throw new RangeError(`section depth must be 1-${SECTION_LIMITS.maxDepth}`);
  if (halo !== SECTION_LIMITS.halo)
    throw new RangeError(
      `section requires exactly ${SECTION_LIMITS.halo} cell of neighbor halo`,
    );
  const minX = focusX - Math.floor(width / 2);
  const minZ = focusZ - Math.floor(depth / 2);
  return {
    focusX,
    focusZ,
    width,
    depth,
    halo,
    minX,
    minZ,
    maxXExclusive: minX + width,
    maxZExclusive: minZ + depth,
  };
}

export function sampleSectionCells(spec, options) {
  const bounds = sectionOptions(options);
  const sampleMinX = bounds.minX - bounds.halo;
  const sampleMinZ = bounds.minZ - bounds.halo;
  const sampleWidth = bounds.width + bounds.halo * 2;
  const sampleDepth = bounds.depth + bounds.halo * 2;
  const samples = [];
  for (let localZ = 0; localZ < sampleDepth; localZ += 1) {
    for (let localX = 0; localX < sampleWidth; localX += 1) {
      samples.push(sampleCell(spec, sampleMinX + localX, sampleMinZ + localZ));
    }
  }
  return {
    ...bounds,
    sampleMinX,
    sampleMinZ,
    sampleWidth,
    sampleDepth,
    sampleCount: samples.length,
    samples,
    source: "sampleCell(spec, signed global x, signed global z)",
  };
}

export function assembleSurfaceSection(sampled) {
  const byCoordinate = new Map(
    sampled.samples.map((cell) => [`${cell.x},${cell.z}`, cell]),
  );
  const cells = [];
  const requireCell = (x, z) => {
    const cell = byCoordinate.get(`${x},${z}`);
    if (!cell) throw new Error(`section is missing sampled cell ${x},${z}`);
    return cell;
  };
  for (let z = sampled.minZ; z < sampled.maxZExclusive; z += 1) {
    for (let x = sampled.minX; x < sampled.maxXExclusive; x += 1) {
      const cell = requireCell(x, z);
      cells.push({
        ...cell,
        localX: x - sampled.minX,
        localZ: z - sampled.minZ,
        eastElevation: requireCell(x + 1, z).elevation,
        southElevation: requireCell(x, z + 1).elevation,
        focused: x === sampled.focusX && z === sampled.focusZ,
      });
    }
  }
  return {
    bounds: {
      minX: sampled.minX,
      minZ: sampled.minZ,
      maxXExclusive: sampled.maxXExclusive,
      maxZExclusive: sampled.maxZExclusive,
    },
    width: sampled.width,
    depth: sampled.depth,
    halo: sampled.halo,
    sampleCount: sampled.sampleCount,
    visibleCellCount: cells.length,
    focus: { x: sampled.focusX, z: sampled.focusZ },
    cells,
    surfaceOnly: true,
  };
}

export function prepareIsometricSection(section, options = {}) {
  const tileWidth = options.tileWidth ?? 18;
  const tileHeight = options.tileHeight ?? 9;
  const elevationPixels = options.elevationPixels ?? 76;
  if (!(tileWidth > 0 && tileHeight > 0 && elevationPixels > 0))
    throw new RangeError("section drawing dimensions must be positive");
  const halfWidth = tileWidth / 2;
  const halfHeight = tileHeight / 2;
  const rawTiles = section.cells.map((cell) => {
    const centerX = (cell.localX - cell.localZ) * halfWidth;
    const groundY = (cell.localX + cell.localZ) * halfHeight;
    const centerY = groundY - cell.elevation * elevationPixels;
    const eastDrop = Math.max(
      0,
      (cell.elevation - cell.eastElevation) * elevationPixels,
    );
    const southDrop = Math.max(
      0,
      (cell.elevation - cell.southElevation) * elevationPixels,
    );
    const top = [
      { x: centerX, y: centerY - halfHeight },
      { x: centerX + halfWidth, y: centerY },
      { x: centerX, y: centerY + halfHeight },
      { x: centerX - halfWidth, y: centerY },
    ];
    return {
      cell,
      top,
      eastFace:
        eastDrop > 0
          ? [
              top[1],
              top[2],
              { x: top[2].x, y: top[2].y + eastDrop },
              { x: top[1].x, y: top[1].y + eastDrop },
            ]
          : null,
      southFace:
        southDrop > 0
          ? [
              top[2],
              top[3],
              { x: top[3].x, y: top[3].y + southDrop },
              { x: top[2].x, y: top[2].y + southDrop },
            ]
          : null,
    };
  });
  const points = rawTiles.flatMap((tile) => [
    ...tile.top,
    ...(tile.eastFace ?? []),
    ...(tile.southFace ?? []),
  ]);
  const minX = Math.min(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxX = Math.max(...points.map((point) => point.x));
  const maxY = Math.max(...points.map((point) => point.y));
  const padding = 8;
  const offsetX = padding - minX;
  const offsetY = padding - minY;
  const translate = (polygon) =>
    polygon?.map((point) => ({
      x: point.x + offsetX,
      y: point.y + offsetY,
    })) ?? null;
  return {
    width: Math.ceil(maxX - minX + padding * 2),
    height: Math.ceil(maxY - minY + padding * 2),
    tileWidth,
    tileHeight,
    elevationPixels,
    tiles: rawTiles
      .sort(
        (left, right) =>
          left.cell.localX +
          left.cell.localZ -
          (right.cell.localX + right.cell.localZ),
      )
      .map((tile) => ({
        ...tile,
        top: translate(tile.top),
        eastFace: translate(tile.eastFace),
        southFace: translate(tile.southFace),
      })),
    surfaceOnly: true,
  };
}
