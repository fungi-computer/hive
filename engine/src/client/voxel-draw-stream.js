const EPSILON = 1e-7;
const PASSES = Object.freeze(["opaque", "transparent"]);
const SLOT_ORDER = Object.freeze({
  "far-boundary": 0,
  "supporting-surface": 10,
  "surface-mark": 20,
  "rooted-object": 25,
  "support-compound": 25,
  "supported-actor": 30,
  "surface-root": 40,
  "near-boundary": 50,
});

function finitePoint(point, label) {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y) || !Number.isFinite(point.z))
    throw new Error(`voxel draw ${label} requires a finite world point`);
  return point;
}

function checkedCell(cell, label) {
  if (!Array.isArray(cell) || cell.length !== 3 || !cell.every(Number.isFinite))
    throw new Error(`voxel draw ${label} requires a finite cell`);
  return Object.freeze({ x: cell[0], y: cell[1], z: cell[2] });
}

function recordKey(record) {
  return `${String(record.id)}\u0000${String(record.part ?? "")}`;
}

function compareNumbers(a, b) {
  for (let index = 0; index < Math.max(a.length, b.length); index++) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (Math.abs(difference) > EPSILON) return difference;
  }
  return 0;
}

function compareKeys(a, b) {
  return compareNumbers(a, b);
}

function directionSigns(direction) {
  if (!direction || !Number.isFinite(direction.x) || !Number.isFinite(direction.z) ||
      Math.abs(direction.x) < EPSILON || Math.abs(direction.z) < EPSILON)
    throw new Error("voxel draw requires a fixed diagonal camera direction");
  // Camera direction points into the world. The opposite signs therefore walk
  // the horizontal voxel diagonals from far to near.
  return Object.freeze({ x: -Math.sign(direction.x), z: -Math.sign(direction.z) });
}

function logicalLayer(y, verticalMetres) {
  return Math.round(y / verticalMetres - 0.5);
}

function traversalKey(point, signs, verticalMetres) {
  finitePoint(point, "insertion");
  const layer = logicalLayer(point.y, verticalMetres);
  // This is a discrete voxel traversal coordinate, not sprite depth. `wave`
  // names the x/z diagonal being visited and `lane` gives its deterministic
  // order. No sprite origin, bounds, centroid or art dimensions participate.
  const wave = signs.x * point.x + signs.z * point.z;
  const lane = signs.x * point.x - signs.z * point.z;
  return Object.freeze([layer, wave, lane, point.x, point.z]);
}

function horizontalKey(point, signs) {
  finitePoint(point, "boundary");
  return Object.freeze([
    signs.x * point.x + signs.z * point.z,
    signs.x * point.x - signs.z * point.z,
    point.x,
    point.z,
  ]);
}

function maximum(points, signs, verticalMetres) {
  if (!points.length) throw new Error("voxel draw attachment has no insertion points");
  return points.map(point => traversalKey(point, signs, verticalMetres)).sort(compareKeys).at(-1);
}

function minimumHorizontalSignature(points, signs) {
  if (!points.length) throw new Error("voxel draw boundary has no geometry");
  const unique = new Map();
  for (const point of points) {
    const key = horizontalKey(point, signs);
    unique.set(key.map(value => value.toFixed(7)).join(","), key);
  }
  return [...unique.values()].sort(compareKeys);
}

function compareSignatures(a, b) {
  for (let index = 0; index < Math.max(a.length, b.length); index++) {
    if (!a[index]) return -1;
    if (!b[index]) return 1;
    const compared = compareKeys(a[index], b[index]);
    if (compared) return compared;
  }
  return 0;
}

function cellPoint(cell, verticalMetres) {
  const checked = checkedCell(cell, "attachment");
  return Object.freeze({ x: checked.x, y: (checked.y + 0.5) * verticalMetres, z: checked.z });
}

function supportPoints(supports, recordsByKey, verticalMetres) {
  if (!Array.isArray(supports)) throw new Error("voxel draw surface root requires supports");
  return supports.map(support => {
    if (Array.isArray(support)) return cellPoint(support, verticalMetres);
    const owner = recordsByKey.get(String(support));
    if (owner?.attachment?.kind !== "cell-face")
      throw new Error(`voxel draw surface root references unknown support ${String(support)}`);
    return cellPoint(owner.attachment.cell, verticalMetres);
  });
}

function ordinaryPlacement(record, recordsByKey, signs, verticalMetres) {
  const attachment = record.attachment;
  switch (attachment.kind) {
    case "cell-face": {
      const point = cellPoint(attachment.cell, verticalMetres);
      const slot = attachment.face === "top" ? "supporting-surface" :
        attachment.face === "bottom" ? "far-boundary" : "near-boundary";
      return { key: traversalKey(point, signs, verticalMetres), slot, points: [point] };
    }
    case "surface-mark": {
      const point = cellPoint(attachment.cell, verticalMetres);
      return { key: traversalKey(point, signs, verticalMetres), slot: "surface-mark", points: [point] };
    }
    case "supported": {
      const point = finitePoint(attachment.feet, "supported feet");
      return { key: traversalKey(point, signs, verticalMetres), slot: "supported-actor", points: [point] };
    }
    case "surface-root": {
      const points = supportPoints(attachment.supports, recordsByKey, verticalMetres);
      if (!points.length) points.push(finitePoint(attachment.point, "surface root"));
      return { key: maximum(points, signs, verticalMetres), slot: "surface-root", points };
    }
    case "footprint": {
      const points = attachment.points.map(point => finitePoint(point, "footprint"));
      return { key: maximum(points, signs, verticalMetres), slot: "rooted-object", points };
    }
    case "part": {
      const points = attachment.geometry.map(point => finitePoint(point, "part geometry"));
      return { key: maximum(points, signs, verticalMetres), slot: "rooted-object", points };
    }
    default:
      throw new Error(`unsupported voxel draw attachment ${String(attachment.kind)}`);
  }
}

function multipartCompounds(records, signs, verticalMetres) {
  const partGroups = new Map();
  const supported = new Map();
  for (const record of records) {
    if (record.attachment.kind === "part") {
      const owner = String(record.attachment.owner);
      const group = partGroups.get(owner) ?? [];
      group.push(record);
      partGroups.set(owner, group);
    } else if (record.attachment.kind === "supported" && record.attachment.support != null) {
      const owner = String(record.attachment.support);
      const group = supported.get(owner) ?? [];
      group.push(record);
      supported.set(owner, group);
    }
  }

  const compounds = [];
  for (const [owner, parts] of partGroups) {
    const surfaces = parts.filter(record => record.attachment.role === "supporting-surface");
    const boundaries = parts.filter(record => record.attachment.role === "upright-boundary");
    if (!surfaces.length && !boundaries.length) continue;
    if (surfaces.length !== 1 || boundaries.length !== 2 || parts.length !== 3)
      throw new Error(`multipart support ${owner} requires one supporting surface and two upright boundaries`);
    const actors = supported.get(owner) ?? [];
    const passes = new Set([...parts, ...actors].map(record => record.renderPass));
    if (passes.size !== 1)
      throw new Error(`multipart support ${owner} cannot cross render passes`);
    const orderedBoundaries = [...boundaries].sort((a, b) =>
      compareSignatures(
        minimumHorizontalSignature(a.attachment.geometry, signs),
        minimumHorizontalSignature(b.attachment.geometry, signs),
      ) || recordKey(a).localeCompare(recordKey(b)));
    const orderedActors = [...actors].sort((a, b) =>
      compareKeys(horizontalKey(a.attachment.feet, signs), horizontalKey(b.attachment.feet, signs)) ||
      a.attachment.feet.y - b.attachment.feet.y || recordKey(a).localeCompare(recordKey(b)));
    const surface = surfaces[0];
    const points = surface.attachment.geometry.map(point => finitePoint(point, "supporting surface geometry"));
    compounds.push(Object.freeze({
      owner,
      key: maximum(points, signs, verticalMetres),
      records: Object.freeze([orderedBoundaries[0], surface, ...orderedActors, orderedBoundaries[1]]),
      consumed: Object.freeze(new Set([...parts, ...actors])),
      points: Object.freeze(points),
    }));
  }
  return compounds;
}

function bucketKey(key) {
  return key.map(value => value.toFixed(7)).join(",");
}

/**
 * Compile authoritative world attachments into a deterministic painter stream.
 *
 * This is intentionally installed beside the old sorter. It owns no Pixi
 * objects and does not cut production over; Stage 1C does that only after the
 * mixed fixture and live movement proofs pass.
 */
export function compileVoxelDrawStream(records, { direction, verticalMetres } = {}) {
  if (!Array.isArray(records)) throw new Error("voxel draw records required");
  if (!Number.isFinite(verticalMetres) || verticalMetres <= 0)
    throw new Error("voxel draw requires positive vertical metres");
  const signs = directionSigns(direction);
  const seen = new Set(), recordsByKey = new Map();
  for (const record of records) {
    if (!PASSES.includes(record?.renderPass) || !record?.attachment?.kind)
      throw new Error("voxel draw record requires renderPass and attachment");
    const key = recordKey(record);
    if (seen.has(key)) throw new Error(`duplicate voxel draw record ${key}`);
    seen.add(key);
    recordsByKey.set(key, record);
  }

  const compounds = multipartCompounds(records, signs, verticalMetres);
  const consumed = new Set(compounds.flatMap(compound => [...compound.consumed]));
  const emissions = [];
  for (const compound of compounds) emissions.push({
    key: compound.key, slot: "support-compound", tie: `compound\u0000${compound.owner}`,
    pass: compound.records[0].renderPass, records: compound.records, points: compound.points,
  });
  for (const record of records) {
    if (consumed.has(record)) continue;
    const placement = ordinaryPlacement(record, recordsByKey, signs, verticalMetres);
    emissions.push({ key: placement.key, slot: placement.slot, tie: recordKey(record),
      pass: record.renderPass, records: [record], points: placement.points });
  }

  const output = [], trace = [], partitions = { opaque: [], transparent: [] };
  for (const pass of PASSES) {
    const buckets = new Map();
    for (const emission of emissions.filter(candidate => candidate.pass === pass)) {
      const id = bucketKey(emission.key);
      const bucket = buckets.get(id) ?? { key: emission.key, emissions: [] };
      bucket.emissions.push(emission);
      buckets.set(id, bucket);
    }
    for (const bucket of [...buckets.values()].sort((a, b) => compareKeys(a.key, b.key))) {
      bucket.emissions.sort((a, b) => SLOT_ORDER[a.slot] - SLOT_ORDER[b.slot] || a.tie.localeCompare(b.tie));
      for (const emission of bucket.emissions) for (const record of emission.records) {
        output.push(record);
        partitions[pass].push(record);
        trace.push(Object.freeze({ record: recordKey(record), pass, insertion: emission.key,
          slot: emission.slot, sourcePoints: Object.freeze([...emission.points]) }));
      }
    }
  }
  if (output.length !== records.length) throw new Error("voxel draw compiler lost or duplicated records");
  return Object.freeze({
    records: Object.freeze(output),
    opaque: Object.freeze(partitions.opaque),
    transparent: Object.freeze(partitions.transparent),
    trace: Object.freeze(trace),
  });
}

export { recordKey as voxelDrawRecordKey };
