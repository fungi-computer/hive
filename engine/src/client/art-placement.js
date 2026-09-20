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

/** Transform a canonical authored datum exactly as the selected bake does,
 * then undo only its camera rotation. Three's positive-Y rotation has the
 * opposite sign to the native cardinal placement transform above. */
function bakedWorldPoint(value, physicalFacing, cameraTurn, pivot = [0, 0]) {
  const facing = cardinalQuarterTurns(physicalFacing);
  const turn = cardinalQuarterTurns(cameraTurn);
  const baked = rotatePlacementPoint(value, (4 - (facing + turn) % 4) % 4, pivot);
  return rotatePlacementPoint(baked, turn);
}

/** Align actual selected art coordinates with authoritative physical cells.
 * Callers supply physicalFacing and cameraTurn explicitly; neither is the
 * native placement orientation. The returned offset moves both pixels and
 * their ordering geometry, without changing occupancy or support. */
export function resolveWorldArtPlacement({ subjectPlacement, artPlacement, orientation, physicalFacing, cameraTurn }) {
  if (!subjectPlacement)
    throw new Error("original art placement metadata is unavailable");
  if (subjectPlacement.kind === "edge") {
    const axis = subjectPlacement.edge?.axis;
    if (axis !== "x" && axis !== "z") throw new Error("invalid edge art placement axis");
    const endpoints = axis === "x" ? [[0, -0.5], [0, 0.5]] : [[-0.5, 0], [0.5, 0]];
    return Object.freeze({ kind: "edge", axis,
      endpoints: Object.freeze(endpoints.map(endpoint => Object.freeze(endpoint))),
      offset: Object.freeze([0, 0]),
    });
  }
  if (!artPlacement)
    throw new Error("original art placement metadata is unavailable");
  const turns = cardinalQuarterTurns(orientation);
  cardinalQuarterTurns(physicalFacing);
  cardinalQuarterTurns(cameraTurn);
  if (subjectPlacement.kind === "footprint" && artPlacement.kind === "footprint") {
    const physical = cells(subjectPlacement.footprint, "physical footprint").map(cell => rotatePlacementPoint(cell, turns));
    const pivot = point(artPlacement.rotationPivot, "rotation pivot");
    const baked = cells(artPlacement.bakedFootprint, "baked footprint").map(cell => bakedWorldPoint(cell, physicalFacing, cameraTurn, pivot));
    const physicalCenter = centroid(physical), bakedCenter = centroid(baked);
    const offset = Object.freeze([physicalCenter[0] - bakedCenter[0], physicalCenter[1] - bakedCenter[1]]);
    const aligned = translated(baked, offset);
    if (!samePointSet(aligned, physical, 1e-9))
      throw new Error("original art footprint does not match physical footprint");
    return Object.freeze({ kind: "footprint", orientation: turns, rotationPivot: pivot,
      physicalFootprint: Object.freeze(physical), bakedFootprint: Object.freeze(baked), offset,
      alignedFootprint: Object.freeze(aligned), physicalCentroid: physicalCenter, bakedCentroid: bakedCenter });
  }
  if (subjectPlacement.kind === "stair" && artPlacement.kind === "stair") {
    const pivot = point3(artPlacement.rotationPivot, "stair pivot");
    const authored = value => {
      const p = point3(value, "stair endpoint");
      const xz = bakedWorldPoint([p[0], p[2]], physicalFacing, cameraTurn, [pivot[0], pivot[2]]);
      return [xz[0], p[1], xz[1]];
    };
    const entrance = authored(artPlacement.entrance), landing = authored(artPlacement.landing);
    const physicalEntrance = rotatePoint3(subjectPlacement.entrance, turns);
    const physicalLanding = rotatePoint3(subjectPlacement.landing, turns);
    const offset = Object.freeze([physicalEntrance[0] - entrance[0], physicalEntrance[2] - entrance[2]]);
    const aligned = p => Object.freeze([p[0] + offset[0], p[1], p[2] + offset[1]]);
    const alignedEntrance = aligned(entrance), alignedLanding = aligned(landing);
    if (!samePoint3(alignedEntrance, physicalEntrance, 1e-9) || !samePoint3(alignedLanding, physicalLanding, 1e-9))
      throw new Error("original stair endpoints do not match native geometry");
    return Object.freeze({ kind: "stair", entrance: alignedEntrance, landing: alignedLanding, orientation: turns, offset });
  }
  throw new Error("original art placement metadata kinds differ");
}
