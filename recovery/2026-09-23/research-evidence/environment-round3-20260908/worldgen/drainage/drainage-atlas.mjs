// Derived fixed-grid drainage metadata. It never mutates terrain or creates water.
import { sampleCell } from '../reference/terrain.js';

export const DRAINAGE_CONTRACT = Object.freeze({
  id: 'priority-flood-drainage-atlas-v1',
  bounds: Object.freeze({ minX: -2048, maxXExclusive: 2048, minZ: -2048, maxZExclusive: 2048 }),
  stride: 32,
  width: 128,
  height: 128,
  seaSurfaceLevel: 12,
  connectivity: 'D8',
  // All perimeter cells discharge. Only explicitly tagged, datum-below perimeter
  // samples are marine roots; other perimeter discharge remains ordinary "edge".
  outletPolicy: 'marine-boundary-below-datum-plus-bounded-edge-v1',
});

const OFFSETS = Object.freeze([
  [-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1],
]);
const total = DRAINAGE_CONTRACT.width * DRAINAGE_CONTRACT.height;
const keyOf = (column, row) => row * DRAINAGE_CONTRACT.width + column;
const inGrid = (column, row) => column >= 0 && column < DRAINAGE_CONTRACT.width && row >= 0 && row < DRAINAGE_CONTRACT.height;
const boundary = (column, row) => column === 0 || row === 0 || column === DRAINAGE_CONTRACT.width - 1 || row === DRAINAGE_CONTRACT.height - 1;
const coordinates = (column, row) => ({
  x: DRAINAGE_CONTRACT.bounds.minX + column * DRAINAGE_CONTRACT.stride,
  z: DRAINAGE_CONTRACT.bounds.minZ + row * DRAINAGE_CONTRACT.stride,
});

class MinHeap {
  #items = [];
  #less(a, b) { return a.height < b.height || (a.height === b.height && (a.row < b.row || (a.row === b.row && a.column < b.column))); }
  push(value) {
    const items = this.#items; items.push(value);
    for (let child = items.length - 1; child > 0;) {
      const parent = (child - 1) >> 1;
      if (!this.#less(items[child], items[parent])) break;
      [items[child], items[parent]] = [items[parent], items[child]]; child = parent;
    }
  }
  pop() {
    const items = this.#items, first = items[0], tail = items.pop();
    if (items.length && tail) {
      items[0] = tail;
      for (let parent = 0;;) {
        const left = parent * 2 + 1, right = left + 1;
        let next = parent;
        if (left < items.length && this.#less(items[left], items[next])) next = left;
        if (right < items.length && this.#less(items[right], items[next])) next = right;
        if (next === parent) break;
        [items[parent], items[next]] = [items[next], items[parent]]; parent = next;
      }
    }
    return first;
  }
  get size() { return this.#items.length; }
}

function checkHeight(value, label) {
  if (!Number.isFinite(value)) throw new TypeError(`${label} requires a finite height`);
  return value;
}
function computeMarineConnectivity(rawHeight, marineRoot) {
  const connected = new Uint8Array(total), queue = [];
  for (let index = 0; index < total; index++)
    if (marineRoot[index]) { connected[index] = 1; queue.push(index); }
  for (let head = 0; head < queue.length; head++) {
    const index = queue[head], column = index % DRAINAGE_CONTRACT.width, row = Math.floor(index / DRAINAGE_CONTRACT.width);
    for (const [dx, dz] of OFFSETS) {
      const nextColumn = column + dx, nextRow = row + dz;
      if (!inGrid(nextColumn, nextRow)) continue;
      const next = keyOf(nextColumn, nextRow);
      if (!connected[next] && rawHeight[next] <= DRAINAGE_CONTRACT.seaSurfaceLevel) {
        connected[next] = 1; queue.push(next);
      }
    }
  }
  return connected;
}
function recordDepressions(rawHeight, filledHeight) {
  const component = new Int32Array(total); component.fill(-1);
  const records = [];
  for (let start = 0; start < total; start++) {
    if (component[start] !== -1 || filledHeight[start] <= rawHeight[start]) continue;
    const id = records.length, queue = [start]; component[start] = id;
    let count = 0, minBed = Infinity, maxFillDepth = 0, spillHeight = Infinity;
    for (let head = 0; head < queue.length; head++) {
      const index = queue[head], column = index % DRAINAGE_CONTRACT.width, row = Math.floor(index / DRAINAGE_CONTRACT.width);
      count++; minBed = Math.min(minBed, rawHeight[index]);
      maxFillDepth = Math.max(maxFillDepth, filledHeight[index] - rawHeight[index]);
      spillHeight = Math.min(spillHeight, filledHeight[index]);
      for (const [dx, dz] of OFFSETS) {
        const nextColumn = column + dx, nextRow = row + dz;
        if (!inGrid(nextColumn, nextRow)) continue;
        const next = keyOf(nextColumn, nextRow);
        if (component[next] === -1 && filledHeight[next] > rawHeight[next]) {
          component[next] = id; queue.push(next);
        }
      }
    }
    records.push(Object.freeze({ id: `depression-${id}`, cells: count, minBed, maxFillDepth, spillHeight }));
  }
  return { component, records: Object.freeze(records) };
}

/**
 * Builds one complete bounded routing surface. `bedAt` is queried once per cell;
 * `marineAt` is an explicit external-boundary tag, never a water-stock source.
 */
export function buildDrainageAtlas({ bedAt, marineAt = () => false, sampleAt = null, identity = 'synthetic' }) {
  if ((typeof bedAt !== 'function' || typeof marineAt !== 'function') && typeof sampleAt !== 'function') throw new TypeError('bedAt/marineAt or sampleAt must be functions');
  const rawHeight = new Float64Array(total), marineRoot = new Uint8Array(total);
  for (let row = 0; row < DRAINAGE_CONTRACT.height; row++) for (let column = 0; column < DRAINAGE_CONTRACT.width; column++) {
    const index = keyOf(column, row), at = coordinates(column, row);
    const sample = sampleAt
      ? sampleAt({ ...at, column, row })
      : { bedHeight: bedAt({ ...at, column, row }), marine: marineAt({ ...at, column, row }) };
    rawHeight[index] = checkHeight(sample?.bedHeight, 'bedAt');
    marineRoot[index] = boundary(column, row) && rawHeight[index] <= DRAINAGE_CONTRACT.seaSurfaceLevel && sample.marine ? 1 : 0;
  }
  const oceanConnected = computeMarineConnectivity(rawHeight, marineRoot);
  const filledHeight = new Float64Array(total), parent = new Int32Array(total), settlementRank = new Int32Array(total), outletRoot = new Int32Array(total);
  parent.fill(-2); settlementRank.fill(-1); outletRoot.fill(-1);
  const heap = new MinHeap();
  for (let row = 0; row < DRAINAGE_CONTRACT.height; row++) for (let column = 0; column < DRAINAGE_CONTRACT.width; column++) {
    if (!boundary(column, row)) continue;
    const index = keyOf(column, row);
    parent[index] = -1; filledHeight[index] = rawHeight[index]; outletRoot[index] = index;
    heap.push({ index, column, row, height: filledHeight[index] });
  }
  let rank = 0, queuePops = 0;
  while (heap.size) {
    const current = heap.pop(); queuePops++; settlementRank[current.index] = rank++;
    for (const [dx, dz] of OFFSETS) {
      const column = current.column + dx, row = current.row + dz;
      if (!inGrid(column, row)) continue;
      const index = keyOf(column, row);
      if (parent[index] !== -2) continue;
      filledHeight[index] = Math.max(rawHeight[index], current.height);
      parent[index] = current.index; outletRoot[index] = outletRoot[current.index];
      heap.push({ index, column, row, height: filledHeight[index] });
    }
  }
  for (let index = 0; index < total; index++) {
    if (settlementRank[index] < 0) throw new Error('drainage surface failed to settle every cell');
    if (parent[index] >= 0 && settlementRank[parent[index]] >= settlementRank[index])
      throw new Error('drainage parent must precede child settlement');
  }
  const accumulation = new Uint32Array(total); accumulation.fill(1);
  const byRank = new Int32Array(total);
  for (let index = 0; index < total; index++) byRank[settlementRank[index]] = index;
  for (let position = total - 1; position >= 0; position--) {
    const index = byRank[position], upstream = parent[index];
    if (upstream >= 0) accumulation[upstream] += accumulation[index];
  }
  let outletContribution = 0, marineOutlets = 0, edgeOutlets = 0;
  for (let index = 0; index < total; index++) if (parent[index] === -1) {
    outletContribution += accumulation[index];
    if (marineRoot[index]) marineOutlets++; else edgeOutlets++;
  }
  if (outletContribution !== total) throw new Error('contributing-area conservation failed');
  const { component, records } = recordDepressions(rawHeight, filledHeight);
  const cell = index => {
    const column = index % DRAINAGE_CONTRACT.width, row = Math.floor(index / DRAINAGE_CONTRACT.width);
    const root = outletRoot[index], rootColumn = root % DRAINAGE_CONTRACT.width, rootRow = Math.floor(root / DRAINAGE_CONTRACT.width);
    const outlet = Object.freeze({ id: `${marineRoot[root] ? 'marine' : 'edge'}:${rootColumn},${rootRow}`, kind: marineRoot[root] ? 'marine' : 'edge', ...coordinates(rootColumn, rootRow) });
    return Object.freeze({ ...coordinates(column, row), column, row, bedHeight: rawHeight[index], filledHeight: filledHeight[index],
      fillDepth: filledHeight[index] - rawHeight[index], parent: parent[index] < 0 ? null : coordinates(parent[index] % DRAINAGE_CONTRACT.width, Math.floor(parent[index] / DRAINAGE_CONTRACT.width)),
      settlementRank: settlementRank[index], outlet, catchment: `catchment:${outlet.id}`,
      oceanConnected: Boolean(oceanConnected[index]), accumulation: accumulation[index], depression: component[index] < 0 ? null : records[component[index]].id });
  };
  return Object.freeze({
    identity: Object.freeze({ source: identity, ...DRAINAGE_CONTRACT }),
    at({ x, z }) {
      if (!Number.isSafeInteger(x) || !Number.isSafeInteger(z) || x < DRAINAGE_CONTRACT.bounds.minX || x >= DRAINAGE_CONTRACT.bounds.maxXExclusive || z < DRAINAGE_CONTRACT.bounds.minZ || z >= DRAINAGE_CONTRACT.bounds.maxZExclusive) throw new RangeError('query outside fixed drainage bounds');
      return cell(keyOf(Math.floor((x - DRAINAGE_CONTRACT.bounds.minX) / DRAINAGE_CONTRACT.stride), Math.floor((z - DRAINAGE_CONTRACT.bounds.minZ) / DRAINAGE_CONTRACT.stride)));
    },
    atGrid({ column, row }) {
      if (!Number.isInteger(column) || !Number.isInteger(row) || !inGrid(column, row)) throw new RangeError('grid query outside fixed drainage atlas');
      return cell(keyOf(column, row));
    },
    depressions: () => records.map(record => ({ ...record })),
    stats: () => Object.freeze({ cells: total, sampledBeds: total, queuePops, outlets: marineOutlets + edgeOutlets, marineOutlets, edgeOutlets, outletContribution, depressions: records.length, seaSurfaceLevel: DRAINAGE_CONTRACT.seaSurfaceLevel, stride: DRAINAGE_CONTRACT.stride, connectivity: DRAINAGE_CONTRACT.connectivity }),
  });
}

/** Uses the pinned sampler once per fixed atlas cell; no source or voxel mutation. */
export function createDrainageAtlas(spec) {
  return buildDrainageAtlas({
    identity: spec.identity,
    // The current coastal label supplies only an explicit experimental external
    // marine boundary tag. It does not create water and inland labels never seed.
    sampleAt: ({ x, z }) => {
      const sample = sampleCell(spec, x, z);
      return { bedHeight: sample.surfaceLevel, marine: sample.terrain === 'water' };
    },
  });
}
