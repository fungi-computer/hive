const EPSILON = 1e-7;
const PASSES = Object.freeze(["opaque", "transparent"]);
const SLOT_ORDER = Object.freeze({
  "far-boundary": 0,
  "supporting-surface": 10,
  "surface-mark": 20,
  "rooted-object": 25,
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
  return cell;
}

function recordKey(record) {
  return `${String(record.id)}\u0000${String(record.part ?? "")}`;
}

function compareKeys(a, b) {
  for (let index = 0; index < Math.max(a.length, b.length); index++) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (Math.abs(difference) > EPSILON) return difference;
  }
  return 0;
}

function checkedDirection(direction) {
  if (!direction || !Number.isFinite(direction.x) || !Number.isFinite(direction.y) || !Number.isFinite(direction.z) ||
      Math.abs(direction.x) < EPSILON || Math.abs(direction.y) < EPSILON || Math.abs(direction.z) < EPSILON)
    throw new Error("voxel draw requires a fixed diagonal camera direction");
  return direction;
}

/** A canonical XYZ contact's place in the fixed-camera far-to-near traversal. */
function traversalKey(point, direction) {
  finitePoint(point, "contact");
  const front = -(direction.x * point.x + direction.y * point.y + direction.z * point.z);
  const lane = direction.z * point.x - direction.x * point.z;
  return Object.freeze([front, lane, point.y, point.x, point.z]);
}

function horizontalKey(point, direction) {
  finitePoint(point, "boundary");
  return Object.freeze([
    -(direction.x * point.x + direction.z * point.z),
    direction.z * point.x - direction.x * point.z,
    point.x,
    point.z,
  ]);
}

function pointAtCellSurface(cell, verticalMetres) {
  checkedCell(cell, "attachment");
  return Object.freeze({ x: cell[0], y: (cell[1] + 0.5) * verticalMetres, z: cell[2] });
}

function traversalId(key) {
  return key.map(value => value.toFixed(7)).join(",");
}

function uniqueContacts(points, direction) {
  const contacts = new Map();
  for (const point of points) {
    finitePoint(point, "attachment");
    const key = traversalKey(point, direction), id = traversalId(key);
    if (!contacts.has(id)) contacts.set(id, Object.freeze({ id, key, point }));
  }
  if (!contacts.size) throw new Error("voxel draw attachment has no contacts");
  return Object.freeze([...contacts.values()].sort((a, b) => compareKeys(a.key, b.key)));
}

function horizontalSignature(points, direction) {
  const unique = new Map();
  for (const point of points) {
    const key = horizontalKey(point, direction);
    unique.set(traversalId(key), key);
  }
  if (!unique.size) throw new Error("voxel draw boundary has no geometry");
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

function validateSupports(supports, recordsByKey) {
  if (!Array.isArray(supports)) throw new Error("voxel draw surface root requires supports");
  const dependencies = [];
  for (const support of supports) {
    if (Array.isArray(support)) {
      checkedCell(support, "surface support");
      continue;
    }
    const record = recordsByKey.get(String(support));
    if (record?.attachment?.kind !== "cell-face")
      throw new Error(`voxel draw surface root references unknown support ${String(support)}`);
    dependencies.push(record);
  }
  return dependencies;
}

function entry(record, points, direction, slot, { sourcePoints = points, supportRefs = [], dependencies = [] } = {}) {
  return Object.freeze({
    record,
    contacts: uniqueContacts(points, direction),
    sourcePoints: Object.freeze([...sourcePoints]),
    supportRefs: Object.freeze([...supportRefs]),
    dependencies: Object.freeze([...dependencies]),
    slot,
    tie: recordKey(record),
    pass: record.renderPass,
  });
}

function ordinaryEntry(record, recordsByKey, direction, verticalMetres) {
  const attachment = record.attachment;
  switch (attachment.kind) {
    case "cell-face": {
      const point = pointAtCellSurface(attachment.cell, verticalMetres);
      const slot = attachment.face === "top" ? "supporting-surface" :
        attachment.face === "bottom" ? "far-boundary" : "near-boundary";
      return entry(record, [point], direction, slot);
    }
    case "surface-mark":
      return entry(record, [pointAtCellSurface(attachment.cell, verticalMetres)], direction, "surface-mark");
    case "supported":
      return entry(record, [finitePoint(attachment.feet, "supported feet")], direction, "supported-actor");
    case "surface-root": {
      const dependencies = validateSupports(attachment.supports, recordsByKey);
      return entry(record, [finitePoint(attachment.point, "surface root")], direction, "surface-root",
        { supportRefs: attachment.supports, dependencies });
    }
    case "footprint":
      return entry(record, attachment.points.map(point => finitePoint(point, "footprint")), direction, "rooted-object");
    case "part":
      return entry(record, attachment.geometry.map(point => finitePoint(point, "part geometry")), direction, "rooted-object");
    default:
      throw new Error(`unsupported voxel draw attachment ${String(attachment.kind)}`);
  }
}

/**
 * A multipart support is a traversal span, not an object collapsed to one cell.
 * Its far boundary and surface open at the first support contact; occupants
 * enter at their own feet; its near boundary closes at the final contact.
 */
function multipartEntries(records, direction) {
  const partGroups = new Map(), supported = new Map();
  for (const record of records) {
    if (record.attachment.kind === "part") {
      const owner = String(record.attachment.owner), group = partGroups.get(owner) ?? [];
      group.push(record); partGroups.set(owner, group);
    } else if (record.attachment.kind === "supported" && record.attachment.support != null) {
      const owner = String(record.attachment.support), group = supported.get(owner) ?? [];
      group.push(record); supported.set(owner, group);
    }
  }

  const entries = [], consumed = new Set();
  for (const [owner, parts] of partGroups) {
    const surfaces = parts.filter(record => record.attachment.role === "supporting-surface");
    const boundaries = parts.filter(record => record.attachment.role === "upright-boundary");
    if (!surfaces.length && !boundaries.length) continue;
    if (surfaces.length !== 1 || boundaries.length !== 2 || parts.length !== 3)
      throw new Error(`multipart support ${owner} requires one supporting surface and two upright boundaries`);
    const actors = supported.get(owner) ?? [], members = [...parts, ...actors];
    if (new Set(members.map(record => record.renderPass)).size !== 1)
      throw new Error(`multipart support ${owner} cannot cross render passes`);

    const orderedBoundaries = [...boundaries].sort((a, b) =>
      compareSignatures(horizontalSignature(a.attachment.geometry, direction), horizontalSignature(b.attachment.geometry, direction)) ||
      recordKey(a).localeCompare(recordKey(b)));
    const surface = surfaces[0], surfacePoints = surface.attachment.geometry.map(point => finitePoint(point, "supporting surface geometry"));
    const span = uniqueContacts(surfacePoints, direction), opening = span[0], closing = span.at(-1);
    entries.push(entry(orderedBoundaries[0], [opening.point], direction, "far-boundary",
      { sourcePoints: orderedBoundaries[0].attachment.geometry }));
    entries.push(entry(surface, [opening.point], direction, "supporting-surface", { sourcePoints: surfacePoints }));
    for (const actor of actors) {
      const actorEntry = entry(actor, [finitePoint(actor.attachment.feet, "supported feet")], direction, "supported-actor");
      const actorKey = actorEntry.contacts[0].key;
      if (compareKeys(actorKey, opening.key) < 0 || compareKeys(actorKey, closing.key) > 0)
        throw new Error(`multipart support ${owner} actor lies outside its traversal span`);
      entries.push(actorEntry);
    }
    entries.push(entry(orderedBoundaries[1], [closing.point], direction, "near-boundary",
      { sourcePoints: orderedBoundaries[1].attachment.geometry }));
    members.forEach(record => consumed.add(record));
  }
  return Object.freeze({ entries: Object.freeze(entries), consumed });
}

/** Visit factual contacts. An extended record becomes ready only at the event
 * that completes every one of its registered contacts. */
function compilePass(entries, pass, previouslyEmitted = new Set()) {
  const active = entries.filter(candidate => candidate.pass === pass);
  const events = new Map(), pending = new Map(), dependents = new Map();
  for (const candidate of active) {
    pending.set(candidate, new Set(candidate.contacts.map(contact => contact.id)));
    for (const contact of candidate.contacts) {
      const event = events.get(contact.id) ?? { key: contact.key, arrivals: [] };
      event.arrivals.push(candidate); events.set(contact.id, event);
    }
    for (const dependency of candidate.dependencies) {
      const waiting = dependents.get(dependency) ?? [];
      waiting.push(candidate); dependents.set(dependency, waiting);
    }
  }

  const records = [], trace = [], emitted = new Set(previouslyEmitted);
  for (const event of [...events.values()].sort((a, b) => compareKeys(a.key, b.key))) {
    const ready = [], queued = new Set();
    const enqueue = candidate => {
      if (emitted.has(candidate.record) || queued.has(candidate) || pending.get(candidate).size ||
          !candidate.dependencies.every(dependency => emitted.has(dependency))) return;
      ready.push(candidate); queued.add(candidate);
    };
    for (const candidate of event.arrivals) {
      const remaining = pending.get(candidate);
      remaining.delete(traversalId(event.key));
      enqueue(candidate);
    }
    while (ready.length) {
      ready.sort((a, b) => SLOT_ORDER[a.slot] - SLOT_ORDER[b.slot] || a.tie.localeCompare(b.tie));
      const candidate = ready.shift(); queued.delete(candidate);
      records.push(candidate.record); emitted.add(candidate.record);
      trace.push(Object.freeze({
        record: recordKey(candidate.record), pass, insertion: event.key, anchor: candidate.contacts[0].key, slot: candidate.slot,
        sourcePoints: candidate.sourcePoints,
        crossedContacts: Object.freeze(candidate.contacts.map(contact => contact.point)),
        supportRefs: candidate.supportRefs,
      }));
      for (const dependent of dependents.get(candidate.record) ?? []) enqueue(dependent);
    }
  }
  if (records.length !== active.length) throw new Error(`voxel draw ${pass} traversal did not complete`);
  return Object.freeze({ records: Object.freeze(records), trace: Object.freeze(trace), emitted });
}

/** Pure Stage 1B compiler installed beside the production pairwise sorter. */
export function compileVoxelDrawStream(records, { direction, verticalMetres } = {}) {
  if (!Array.isArray(records)) throw new Error("voxel draw records required");
  if (!Number.isFinite(verticalMetres) || verticalMetres <= 0)
    throw new Error("voxel draw requires positive vertical metres");
  const cameraDirection = checkedDirection(direction), recordsByKey = new Map();
  for (const record of records) {
    if (!PASSES.includes(record?.renderPass) || !record?.attachment?.kind)
      throw new Error("voxel draw record requires renderPass and attachment");
    const key = recordKey(record);
    if (recordsByKey.has(key)) throw new Error(`duplicate voxel draw record ${key}`);
    recordsByKey.set(key, record);
  }

  const multipart = multipartEntries(records, cameraDirection), entries = [...multipart.entries];
  for (const record of records)
    if (!multipart.consumed.has(record)) entries.push(ordinaryEntry(record, recordsByKey, cameraDirection, verticalMetres));
  const opaque = compilePass(entries, "opaque"), transparent = compilePass(entries, "transparent", opaque.emitted);
  const output = Object.freeze([...opaque.records, ...transparent.records]);
  if (output.length !== records.length || new Set(output).size !== records.length)
    throw new Error("voxel draw compiler lost or duplicated records");
  return Object.freeze({
    records: output,
    opaque: opaque.records,
    transparent: transparent.records,
    trace: Object.freeze([...opaque.trace, ...transparent.trace]),
  });
}

export { recordKey as voxelDrawRecordKey };
