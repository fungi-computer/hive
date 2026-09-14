// Pure placement datum shared by the retained original-art projection and
// its physical footprint. Physical cells remain authoritative; this helper
// only translates the baked visual into that existing footprint.

const ORIENTATIONS = Object.freeze({ north: 0, east: 1, south: 2, west: 3 });

function finite(value, at) {
  if (!Number.isFinite(value)) throw new Error(`invalid art placement ${at}`);
  return value;
}

function point(value, at) {
  if (!Array.isArray(value) || value.length !== 2)
    throw new Error(`invalid art placement ${at}`);
  return Object.freeze([finite(value[0], `${at}[0]`), finite(value[1], `${at}[1]`)]);
}

function cells(value, at) {
  if (!Array.isArray(value) || value.length === 0)
    throw new Error(`invalid art placement ${at}`);
  const result = value.map((entry, index) => point(entry, `${at}[${index}]`));
  const keys = new Set(result.map(([x, z]) => `${x},${z}`));
  if (keys.size !== result.length) throw new Error(`duplicate art placement ${at}`);
  return result;
}

export function cardinalQuarterTurns(value) {
  if (Number.isSafeInteger(value) && value >= 0 && value <= 3) return value;
  if (typeof value === "string" && Object.hasOwn(ORIENTATIONS, value))
    return ORIENTATIONS[value];
  throw new Error("invalid art placement orientation");
}

/** Native fixture directions: N=(x,z), E=(-z,x), S=(-x,-z), W=(z,-x). */
export function rotatePlacementPoint(value, orientation, pivot = [0, 0]) {
  const [x, z] = point(value, "point");
  const [pivotX, pivotZ] = point(pivot, "pivot");
  const turns = cardinalQuarterTurns(orientation);
  const localX = x - pivotX;
  const localZ = z - pivotZ;
  const rotated = turns === 0 ? [localX, localZ]
    : turns === 1 ? [-localZ, localX]
    : turns === 2 ? [-localX, -localZ]
    : [localZ, -localX];
  return Object.freeze([rotated[0] + pivotX, rotated[1] + pivotZ]);
}

function centroid(points) {
  const sum = points.reduce((result, [x, z]) => [result[0] + x, result[1] + z], [0, 0]);
  return Object.freeze([sum[0] / points.length, sum[1] / points.length]);
}

function translated(points, offset) {
  return points.map(([x, z]) => Object.freeze([x + offset[0], z + offset[1]]));
}

function samePoint(left, right, epsilon) {
  return Math.abs(left[0] - right[0]) <= epsilon && Math.abs(left[1] - right[1]) <= epsilon;
}

function samePointSet(left, right, epsilon) {
  return left.length === right.length && left.every(point => right.some(candidate => samePoint(point, candidate, epsilon)));
}

/**
 * Align one original baked facing to the native footprint. The returned
 * translation is in world x/z metres/cells and applies to the color quad.
 */
export function resolvePlacementArtTransform({ physicalFootprint, bakedFootprint, orientation, rotationPivot = [0, 0], epsilon = 1e-9 }) {
  const physical = cells(physicalFootprint, "physical footprint");
  const baked = cells(bakedFootprint, "baked footprint").map(cell => rotatePlacementPoint(cell, orientation, rotationPivot));
  if (!Number.isFinite(epsilon) || epsilon < 0) throw new Error("invalid art placement epsilon");
  const physicalCenter = centroid(physical);
  const bakedCenter = centroid(baked);
  const offset = Object.freeze([physicalCenter[0] - bakedCenter[0], physicalCenter[1] - bakedCenter[1]]);
  const aligned = translated(baked, offset);
  if (!samePointSet(aligned, physical, epsilon))
    throw new Error("original art footprint does not match physical footprint");
  return Object.freeze({
    orientation: cardinalQuarterTurns(orientation),
    rotationPivot: Object.freeze([...point(rotationPivot, "pivot")]),
    physicalFootprint: Object.freeze(physical),
    bakedFootprint: Object.freeze(baked),
    offset,
    alignedFootprint: Object.freeze(aligned),
    physicalCentroid: physicalCenter,
    bakedCentroid: bakedCenter,
  });
}

/** Validate the retained four-facing stair entrance and landing datum. */
export function resolveStairArtEndpoints({ entrance, landing, physicalEntrance, physicalLanding, orientation, rotationPivot = [0, 0], epsilon = 1e-9 }) {
  const actualEntrance = rotatePlacementPoint(entrance, orientation, rotationPivot);
  const actualLanding = rotatePlacementPoint(landing, orientation, rotationPivot);
  if (!samePoint(actualEntrance, physicalEntrance, epsilon) || !samePoint(actualLanding, physicalLanding, epsilon))
    throw new Error("original stair endpoints do not match native geometry");
  return Object.freeze({ entrance: actualEntrance, landing: actualLanding, orientation: cardinalQuarterTurns(orientation) });
}

function point3(value, at) {
  if (!Array.isArray(value) || value.length !== 3)
    throw new Error(`invalid art placement ${at}`);
  return Object.freeze([finite(value[0], `${at}[0]`), finite(value[1], `${at}[1]`), finite(value[2], `${at}[2]`)]);
}

function rotatePoint3(value, orientation, pivot = [0, 0, 0]) {
  const source = point3(value, "endpoint");
  const pivot3 = point3(pivot, "endpoint pivot");
  const rotated = rotatePlacementPoint([source[0], source[2]], orientation, [pivot3[0], pivot3[2]]);
  return Object.freeze([rotated[0], source[1], rotated[1]]);
}

function samePoint3(left, right, epsilon) {
  return left.every((value, index) => Math.abs(value - right[index]) <= epsilon);
}

export function resolveStairArtEndpoints3d({ entrance, landing, physicalEntrance, physicalLanding, orientation, rotationPivot = [0, 0, 0], epsilon = 1e-9 }) {
  const actualEntrance = rotatePoint3(entrance, orientation, rotationPivot);
  const actualLanding = rotatePoint3(landing, orientation, rotationPivot);
  if (!samePoint3(actualEntrance, point3(physicalEntrance, "physical entrance"), epsilon) ||
      !samePoint3(actualLanding, point3(physicalLanding, "physical landing"), epsilon))
    throw new Error("original stair endpoints do not match native geometry");
  return Object.freeze({ entrance: actualEntrance, landing: actualLanding, orientation: cardinalQuarterTurns(orientation) });
}

/** Resolve content supplied native datum against the original art frame. */
export function resolveWorldArtPlacement({ subjectPlacement, artPlacement, orientation }) {
  if (!subjectPlacement || !artPlacement)
    throw new Error("original art placement metadata is unavailable");
  const turns = cardinalQuarterTurns(orientation);
  if (subjectPlacement.kind === "footprint" && artPlacement.kind === "footprint") {
    const physical = subjectPlacement.footprint.map(cell => rotatePlacementPoint(cell, turns));
    const transform = resolvePlacementArtTransform({
      physicalFootprint: physical,
      bakedFootprint: artPlacement.bakedFootprint,
      orientation: turns,
      rotationPivot: artPlacement.rotationPivot,
    });
    return Object.freeze({ kind: "footprint", ...transform });
  }
  if (subjectPlacement.kind === "stair" && artPlacement.kind === "stair") {
    const endpoints = resolveStairArtEndpoints3d({
      entrance: artPlacement.entrance,
      landing: artPlacement.landing,
      physicalEntrance: [
        rotatePlacementPoint([subjectPlacement.entrance[0], subjectPlacement.entrance[2]], turns)[0],
        subjectPlacement.entrance[1],
        rotatePlacementPoint([subjectPlacement.entrance[0], subjectPlacement.entrance[2]], turns)[1],
      ],
      physicalLanding: [
        rotatePlacementPoint([subjectPlacement.landing[0], subjectPlacement.landing[2]], turns)[0],
        subjectPlacement.landing[1],
        rotatePlacementPoint([subjectPlacement.landing[0], subjectPlacement.landing[2]], turns)[1],
      ],
      orientation: turns,
      rotationPivot: artPlacement.rotationPivot,
    });
    return Object.freeze({ kind: "stair", ...endpoints, offset: Object.freeze([0, 0]) });
  }
  throw new Error("original art placement metadata kinds differ");
}
