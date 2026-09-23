// Pure generated geometry. No live void contents, edit overlay, path or clock.
import { sampleTerrain } from "./height.js";

const freeze = (value) => {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
};
export const CAVE_FEATURE_RECIPE = freeze({
  id: "pit-gallery-capsules-v1",
  regionMetres: 128,
  candidateJitterCells: 20,
  dryMarginLevels: 3,
  radiusMetres: 1.35,
  // Integral cell-centre offsets, rotated together about the entrance column.
  points: [
    [0, 2, 0],
    [0, -5, 0],
    [8, -10, 6],
    [20, -18, 10],
  ],
  chamberRadiiMetres: [3.8, 2.4, 3.4],
  cacheCapRegions: 16,
  sampling: "physical-voxel-centres",
});
const need = (condition, message) => {
  if (!condition) throw new Error(message);
};
const hash = (value) => {
  let result = 2166136261;
  for (let i = 0; i < value.length; i++)
    result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return result >>> 0;
};
const rotated = (x, z, turn) =>
  [
    [x, z],
    [-z, x],
    [-x, -z],
    [z, -x],
  ][turn];

function segmentDistanceSquared(point, start, end) {
  let length2 = 0,
    dot = 0;
  for (let a = 0; a < 3; a++) {
    const delta = end[a] - start[a];
    length2 += delta * delta;
    dot += (point[a] - start[a]) * delta;
  }
  const t = Math.max(0, Math.min(1, dot / length2));
  let distance2 = 0;
  for (let a = 0; a < 3; a++)
    distance2 += (point[a] - start[a] - t * (end[a] - start[a])) ** 2;
  return distance2;
}

function geometryFor({ spec, units, regionX, regionZ, heightAt, bounds }) {
  const recipe = CAVE_FEATURE_RECIPE,
    width = recipe.regionMetres;
  const prefix = `${spec.seed}|${recipe.id}|${regionX},${regionZ}`;
  const jitter = (salt) =>
    (hash(`${prefix}|${salt}`) % (recipe.candidateJitterCells * 2 + 1)) -
    recipe.candidateJitterCells;
  const x = regionX * width + width / 2 + jitter("x");
  const z = regionZ * width + width / 2 + jitter("z");
  const bed = heightAt(x, z),
    turn = hash(`${prefix}|turn`) % 4;
  const identity = `${spec.identity}/feature/${recipe.id}/${regionX},${regionZ}`;
  if (bed <= spec.terrain.seaSurfaceLevel + recipe.dryMarginLevels)
    return freeze({
      id: identity,
      region: [regionX, regionZ],
      present: false,
      reason: "insufficient-dry-elevation",
      bedLevel: bed,
    });
  const pointsMetres = recipe.points.map(([dx, dy, dz]) => {
    const [rx, rz] = rotated(dx, dz, turn);
    return [
      (x + rx + 0.5) * units.horizontalMetres,
      (bed + dy + 0.5) * units.verticalMetres,
      (z + rz + 0.5) * units.horizontalMetres,
    ];
  });
  const chamberRadiiMetres =
    turn % 2
      ? [
          recipe.chamberRadiiMetres[2],
          recipe.chamberRadiiMetres[1],
          recipe.chamberRadiiMetres[0],
        ]
      : [...recipe.chamberRadiiMetres];
  const terminal = pointsMetres.at(-1),
    r = recipe.radiusMetres;
  const min = [0, 1, 2].map((a) =>
    Math.min(
      ...pointsMetres.map((p) => p[a] - r),
      terminal[a] - chamberRadiiMetres[a],
    ),
  );
  const max = [0, 1, 2].map((a) =>
    Math.max(
      ...pointsMetres.map((p) => p[a] + r),
      terminal[a] + chamberRadiiMetres[a],
    ),
  );
  // This is why a column can consult one owner region, not an arbitrary halo.
  need(
    min[0] > regionX * width &&
      max[0] < (regionX + 1) * width &&
      min[2] > regionZ * width &&
      max[2] < (regionZ + 1) * width,
    "feature footprint escaped its owner region",
  );
  need(
    min[1] >= bounds.minY * units.verticalMetres &&
      max[1] <= bounds.maxY * units.verticalMetres,
    "feature vertical extent escaped world bounds",
  );
  return freeze({
    id: identity,
    region: [regionX, regionZ],
    present: true,
    bedLevel: bed,
    entranceCell: { x, y: bed + recipe.points[0][1], z },
    turn,
    pointsMetres,
    radiusMetres: r,
    chamberRadiiMetres,
    boundsMetres: { min, max },
  });
}

/** Bounded derived descriptors; the versioned recipe/seed remains their authority. */
export function createCaveFeatures({ spec, units, bounds }) {
  need(
    spec?.terrain && typeof spec.seed === "string" && spec.seed.length > 0,
    "height recipe and seed required",
  );
  need(
    units?.horizontalMetres === 1 && units?.verticalMetres === 0.54,
    "qualified voxel metric is 1/.54 metres",
  );
  const width = CAVE_FEATURE_RECIPE.regionMetres;
  need(
    bounds &&
      ["minX", "maxX", "minZ", "maxZ"].every(
        (k) => Number.isSafeInteger(bounds[k]) && bounds[k] % width === 0,
      ),
    "feature-region-aligned finite extent required",
  );
  need(
    ["minY", "maxY"].every((k) => Number.isSafeInteger(bounds[k])) &&
      ["X", "Y", "Z"].every((a) => bounds[`min${a}`] < bounds[`max${a}`]),
    "positive finite voxel extent required",
  );
  spec = structuredClone(spec);
  units = structuredClone(units);
  bounds = structuredClone(bounds);
  const checkY = (y) =>
    need(
      Number.isSafeInteger(y) && y >= bounds.minY && y < bounds.maxY,
      "integer vertical voxel within world required",
    );
  const emptyColumn = (y) => {
    checkY(y);
    return false;
  };
  const cache = new Map();
  let descriptors = 0,
    heightSamples = 0,
    membershipQueries = 0,
    segmentTests = 0,
    chamberTests = 0,
    evictions = 0;
  const heightAt = (x, z) => {
    heightSamples++;
    return sampleTerrain(spec, x, z, 1).bedLevel;
  };
  function atRegion(regionX, regionZ) {
    need(
      Number.isSafeInteger(regionX) && Number.isSafeInteger(regionZ),
      "integer feature-region coordinate required",
    );
    need(
      regionX >= bounds.minX / width &&
        regionX < bounds.maxX / width &&
        regionZ >= bounds.minZ / width &&
        regionZ < bounds.maxZ / width,
      "feature region outside world",
    );
    const key = `${regionX},${regionZ}`;
    let found = cache.get(key);
    if (found) cache.delete(key);
    else {
      found = geometryFor({ spec, units, regionX, regionZ, heightAt, bounds });
      descriptors++;
    }
    cache.set(key, found);
    if (cache.size > CAVE_FEATURE_RECIPE.cacheCapRegions) {
      cache.delete(cache.keys().next().value);
      evictions++;
    }
    return found;
  }
  function column(x, z) {
    need(
      Number.isSafeInteger(x) && Number.isSafeInteger(z),
      "integer feature column required",
    );
    const feature = atRegion(Math.floor(x / width), Math.floor(z / width));
    if (!feature.present) return emptyColumn;
    const px = x + 0.5,
      pz = z + 0.5,
      { min, max } = feature.boundsMetres;
    if (px < min[0] || px > max[0] || pz < min[2] || pz > max[2])
      return emptyColumn;
    return (y) => {
      checkY(y);
      membershipQueries++;
      const py = (y + 0.5) * units.verticalMetres;
      if (py < min[1] || py > max[1]) return false;
      const point = [px, py, pz],
        centre = feature.pointsMetres.at(-1);
      for (let i = 1; i < feature.pointsMetres.length; i++) {
        segmentTests++;
        if (
          segmentDistanceSquared(
            point,
            feature.pointsMetres[i - 1],
            feature.pointsMetres[i],
          ) <=
          feature.radiusMetres ** 2
        )
          return true;
      }
      chamberTests++;
      return (
        point.reduce(
          (total, value, a) =>
            total + ((value - centre[a]) / feature.chamberRadiiMetres[a]) ** 2,
          0,
        ) <= 1
      );
    };
  }
  return Object.freeze({
    column,
    atRegion: (x, z) => structuredClone(atRegion(x, z)),
    evictAll() {
      evictions += cache.size;
      cache.clear();
    },
    stats: () => ({
      descriptors,
      heightSamples,
      membershipQueries,
      segmentTests,
      chamberTests,
      evictions,
      residentDescriptors: cache.size,
      residentDescriptorCap: CAVE_FEATURE_RECIPE.cacheCapRegions,
      geometryTestsPerCellAtMost: CAVE_FEATURE_RECIPE.points.length,
    }),
  });
}
