const SPAN_SIZE = 256;

function sameRecords(left, right) {
  return left.length === right.length && left.every((record, index) => record === right[index]);
}

function retainLeaf(records, previous, work) {
  work.paintRecordsInspected += records.length;
  const found = previous?.find(leaf => sameRecords(leaf.records, records));
  if (found) { work.paintLeafReuses++; return found; }
  work.paintLeafBuilds++;
  return Object.freeze({ records: Object.freeze(records) });
}

function planBands(base, bands) {
  if (base.length !== bands.length) throw new Error("paint bands must cover every fixed picture");
  if (!base.length) return Object.freeze([{ key: "empty:0", start: 0, end: 0 }]);
  const plan = [];
  const ordinals = new Map();
  for (let start = 0; start < base.length;) {
    const band = bands[start];
    let end = start + 1;
    while (end < base.length && end - start < SPAN_SIZE && bands[end] === band) end++;
    const ordinal = ordinals.get(band) ?? 0;
    ordinals.set(band, ordinal + 1);
    plan.push(Object.freeze({ key: `${band}:${ordinal}`, start, end }));
    start = end;
  }
  return Object.freeze(plan);
}

function chunkForBoundary(plan, boundary, baseLength) {
  if (boundary === baseLength) return plan.length - 1;
  let low = 0, high = plan.length - 1;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (plan[mid].end <= boundary) low = mid + 1;
    else high = mid;
  }
  return low;
}

/** A depth band is the stable paint home. Local insertions split its leaves;
 * a new region cannot renumber all the bands in front of it. */
export function retainPaintOrder(base, movers, previous, work, bands = []) {
  const plan = previous?.base === base ? previous.plan : planBands(base, bands);
  const buckets = new Map();
  for (const mover of movers) {
    if (!Number.isSafeInteger(mover.boundary) || mover.boundary < 0 || mover.boundary > base.length)
      throw new Error("moving picture has an invalid paint boundary");
    const index = chunkForBoundary(plan, mover.boundary, base.length);
    const bucket = buckets.get(index) ?? [];
    bucket.push(mover);
    buckets.set(index, bucket);
  }
  const chunks = [];
  const priorByKey = new Map(previous?.chunks.map(chunk => [chunk.key, chunk]) ?? []);
  for (let index = 0; index < plan.length; index++) {
    work.paintChunksVisited++;
    const { key, start, end } = plan[index];
    const moving = buckets.get(index) ?? [];
    const prior = priorByKey.get(key);
    const sameBase = prior && end - start === prior.end - prior.start &&
      (prior.base === base && prior.start === start ||
        base.slice(start, end).every((record, at) => record === prior.base[prior.start + at]));
    if (sameBase && moving.length === prior.moving.length &&
        moving.every((entry, at) => entry.boundary - start === prior.moving[at].boundary - prior.start &&
          entry.record === prior.moving[at].record)) {
      chunks.push(prior.base === base && prior.start === start ? prior : Object.freeze({
        key, start, end, base, moving: Object.freeze(moving.map(entry => Object.freeze({
          boundary: entry.boundary, record: entry.record,
        }))), leaves: prior.leaves,
      }));
      work.paintLeafReuses += prior.leaves.length;
      continue;
    }
    const leaves = [];
    let cursor = start, at = 0;
    while (at < moving.length) {
      const boundary = moving[at].boundary;
      if (boundary < cursor || boundary > end) throw new Error("moving picture has an invalid paint boundary");
      if (cursor < boundary) leaves.push(retainLeaf(base.slice(cursor, boundary), prior?.leaves, work));
      const group = [];
      while (at < moving.length && moving[at].boundary === boundary) group.push(moving[at++].record);
      for (let offset = 0; offset < group.length; offset += SPAN_SIZE)
        leaves.push(retainLeaf(group.slice(offset, offset + SPAN_SIZE), prior?.leaves, work));
      cursor = boundary;
    }
    if (cursor < end) leaves.push(retainLeaf(base.slice(cursor, end), prior?.leaves, work));
    chunks.push(Object.freeze({ key, start, end, base, moving: Object.freeze(moving.map(entry => Object.freeze({
      boundary: entry.boundary, record: entry.record,
    }))), leaves: Object.freeze(leaves) }));
  }
  return Object.freeze({ base, plan, chunks: Object.freeze(chunks),
    leaves: Object.freeze(chunks.flatMap(chunk => chunk.leaves)),
    count: base.length + movers.length, length: base.length + movers.length });
}

export function* reversePaintRecords(order) {
  for (let leaf = order.leaves.length - 1; leaf >= 0; leaf--)
    for (let index = order.leaves[leaf].records.length - 1; index >= 0; index--)
      yield order.leaves[leaf].records[index];
}

export function flattenPaintOrder(order) {
  return Object.freeze(order.leaves.flatMap(leaf => leaf.records));
}

export function* reverseOrderedRecords(order) {
  if (Array.isArray(order)) {
    for (let index = order.length - 1; index >= 0; index--) yield order[index];
  } else if (order?.leaves) yield* reversePaintRecords(order);
}
