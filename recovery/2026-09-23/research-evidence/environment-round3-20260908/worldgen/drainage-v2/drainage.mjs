// One bounded D4 priority-flood owner for coarse metadata and exact local beds.
// It computes escape elevations/ancestry, not liquid stock or flux. Array inputs
// are copied; only immutable scalar query results leave the owner.
const METHOD = 'height-authoritative-d4-spill-v2';
const need = (ok, message) => { if (!ok) throw new Error(message); };

function marineConnectivity({ count, bed, seaMetres, marineRoots, boundary, neighbors, queue }) {
  const marine = new Uint8Array(count), ocean = new Uint8Array(count);
  let tail = 0;
  for (const i of marineRoots) {
    need(boundary(i) && bed[i] < seaMetres, 'marine roots must be boundary beds strictly below sea');
    if (!marine[i]) { marine[i] = 1; ocean[i] = 1; queue[tail++] = i; }
  }
  for (let head = 0; head < tail; head++) neighbors(queue[head], i => {
    if (!ocean[i] && bed[i] < seaMetres) { ocean[i] = 1; queue[tail++] = i; }
  });
  return { marine, ocean };
}

function spillForest({ count, bed, boundary, neighbors, queue }) {
  const spill = new Float64Array(count), parent = new Int32Array(count).fill(-2), rank = new Int32Array(count).fill(-1);
  const root = new Int32Array(count).fill(-1), accumulation = new Uint32Array(count).fill(1);
  const heap = new Uint32Array(count); let heapSize = 0, queuePops = 0;
  const less = (a, b) => spill[a] < spill[b] || (spill[a] === spill[b] && a < b);
  const push = i => {
    let child = heapSize++;
    while (child > 0) {
      const p = (child - 1) >> 1;
      if (!less(i, heap[p])) break;
      heap[child] = heap[p]; child = p;
    }
    heap[child] = i;
  };
  const pop = () => {
    const first = heap[0], last = heap[--heapSize];
    let p = 0;
    while (p * 2 + 1 < heapSize) {
      let c = p * 2 + 1;
      if (c + 1 < heapSize && less(heap[c + 1], heap[c])) c++;
      if (!less(heap[c], last)) break;
      heap[p] = heap[c]; p = c;
    }
    if (heapSize) heap[p] = last;
    return first;
  };
  // Perimeter discharge is an explicit analysis boundary, not a source of water.
  for (let i = 0; i < count; i++) if (boundary(i)) {
    parent[i] = -1; root[i] = i; spill[i] = bed[i]; push(i);
  }
  while (heapSize) {
    const i = pop(); rank[i] = queuePops; queue[queuePops++] = i;
    neighbors(i, j => {
      if (parent[j] !== -2) return;
      parent[j] = i; root[j] = root[i]; spill[j] = Math.max(bed[j], spill[i]); push(j);
    });
  }
  need(queuePops === count, 'every bounded bed must settle');
  for (let n = count - 1; n >= 0; n--) {
    const i = queue[n], p = parent[i];
    if (p >= 0) {
      need(rank[p] < rank[i], 'acyclic ancestry');
      accumulation[p] += accumulation[i];
    }
  }
  let outletContribution = 0;
  for (let i = 0; i < count; i++) if (parent[i] === -1) outletContribution += accumulation[i];
  need(outletContribution === count, 'contributing samples conserved');
  return { spill, parent, rank, root, accumulation, queuePops, outletContribution, heapBytes: heap.byteLength };
}

function fillComponents({ count, bed, spill, stride, neighbors, queue }) {
  const component = new Int32Array(count).fill(-1);
  const components = [];
  for (let start = 0; start < count; start++) {
    if (component[start] !== -1 || spill[start] <= bed[start]) continue;
    const id = components.length, level = spill[start];
    let cells = 0, depthSum = 0, maximumDepth = 0;
    queue[0] = start; component[start] = id; let tail = 1;
    for (let head = 0; head < tail; head++) {
      const i = queue[head], depth = level - bed[i];
      cells++; depthSum += depth; maximumDepth = Math.max(maximumDepth, depth);
      neighbors(i, j => {
        if (component[j] === -1 && spill[j] === level && spill[j] > bed[j]) {
          component[j] = id; queue[tail++] = j;
        }
      });
    }
    components.push(Object.freeze({ id, cells, escapeElevationMetres: level, maximumDepthMetres: maximumDepth,
      rectangularPrismCapacityM3: depthSum * stride * stride }));
  }
  return { component, components };
}

export function drainage({ origin, size, stride, seaMetres, bedMetres, marineRoots = [], sourceIdentity }) {
  need(Array.isArray(origin) && origin.length === 2 && origin.every(Number.isSafeInteger), 'signed x/z origin');
  need(Array.isArray(size) && size.length === 2 && size.every(n => Number.isSafeInteger(n) && n >= 2), 'bounded 2-D size');
  const [width, height] = size, count = width * height;
  need(Number.isSafeInteger(count) && count <= 65536, '65536-cell analysis budget');
  need(Number.isSafeInteger(stride) && stride >= 1, 'positive integer sample stride');
  need(origin.every((v, i) => Number.isSafeInteger(v + size[i] * stride)), 'safe grid extent');
  need(Number.isFinite(seaMetres) && typeof sourceIdentity === 'string' && sourceIdentity.length > 0, 'physical datum and source identity');
  need(bedMetres?.length === count && Array.from(bedMetres).every(Number.isFinite), 'one finite metre bed per cell');
  need(Array.isArray(marineRoots) && marineRoots.length <= count && marineRoots.every(i => Number.isSafeInteger(i) && i >= 0 && i < count), 'explicit marine root indices');
  origin = [...origin]; size = [...size];
  const bed = Float64Array.from(bedMetres);
  let minBed = Infinity, maxBed = -Infinity;
  for (const value of bed) { minBed = Math.min(minBed, value); maxBed = Math.max(maxBed, value); }
  need(Number.isFinite(maxBed - minBed) && Number.isFinite((maxBed - minBed) * count * stride * stride), "representable depth and total prism capacity");
  const queue = new Uint32Array(count);
  const boundary = i => i < width || i >= count - width || i % width === 0 || i % width === width - 1;
  // All algorithms use positive-area faces; diagonal point contact is not a port.
  const neighbors = (i, visit) => {
    if (i % width > 0) visit(i - 1);
    if (i >= width) visit(i - width);
    if (i % width < width - 1) visit(i + 1);
    if (i < count - width) visit(i + width);
  };
  const shared = { count, bed, boundary, neighbors, queue };
  const { marine, ocean } = marineConnectivity({ ...shared, seaMetres, marineRoots });
  const { spill, parent, rank, root, accumulation, queuePops, outletContribution, heapBytes } = spillForest(shared);
  const { component, components } = fillComponents({ ...shared, spill, stride });
  const point = i => ({ x: origin[0] + (i % width) * stride, z: origin[1] + Math.floor(i / width) * stride });
  const atIndex = i => {
    need(Number.isSafeInteger(i) && i >= 0 && i < count, 'valid cell index');
    return Object.freeze({ index: i, ...point(i), bedMetres: bed[i], escapeElevationMetres: spill[i],
      parent: parent[i] < 0 ? null : Object.freeze(point(parent[i])), parentIndex: parent[i], rank: rank[i],
      outletIndex: root[i], outletKind: marine[root[i]] ? 'marine' : 'edge', oceanConnected: Boolean(ocean[i]),
      contributingSamples: accumulation[i], component: component[i] < 0 ? null : component[i] });
  };
  const arrayBytes = [bed, spill, parent, rank, root, accumulation, marine, ocean, component, queue].reduce((n, a) => n + a.byteLength, 0) + heapBytes;
  return Object.freeze({
    atIndex,
    atGrid(column, row) {
      need(Number.isSafeInteger(column) && Number.isSafeInteger(row) && column >= 0 && column < width && row >= 0 && row < height, 'valid grid coordinate');
      return atIndex(row * width + column);
    },
    components: () => components.map(c => ({ ...c })),
    describe: () => ({ method: METHOD, sourceIdentity, origin: [...origin], size: [...size], stride, seaMetres,
      connectivity: 'D4', sampleMeaning: stride === 1 ? 'exact one-metre column bed' : 'coarse point samples; intervening beds unresolved',
      capacityMeaning: 'geometric rectangular-prism fill capacity, not water stock; coarse capacity is approximate',
      boundary: 'all perimeter beds discharge; only explicit below-datum roots are marine',
      cells: count, queuePops, outletContribution, typedArrayAllocationBytes: arrayBytes,
      includedScratchBytes: heapBytes + queue.byteLength, arrayAccounting: 'includes all construction scratch; no GC credit; excludes JS objects' }),
  });
}
