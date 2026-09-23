// Cold-boundary validation and snapshot ownership for the isolated SWE study.
// Existing water-round2-v1 denotes these SI units; no per-cell unit conversion.
export const SI_UNITS = Object.freeze({ length: 'm', time: 's', volume: 'm3', discharge: 'm2/s', momentum: 'm2/s' });
const ownKeys = (x, keys, label) => {
  if (!x || typeof x !== 'object' || Object.keys(x).some(k => !keys.includes(k)) || keys.some(k => !Object.hasOwn(x, k))) throw Error(`${label}: fields`);
};
const finite = (x, label, min = -Infinity) => {
  if (typeof x !== 'number' || !Number.isFinite(x) || x < min) throw Error(`${label}: finite number >= ${min}`);
};
const integer = (x, label, min = 0) => {
  if (!Number.isSafeInteger(x) || x < min) throw Error(`${label}: integer >= ${min}`);
};
const bool = (x, label) => { if (typeof x !== 'boolean') throw Error(`${label}: boolean`); };
const array = (x, length, label) => {
  if (!(Array.isArray(x) || ArrayBuffer.isView(x)) || x.length !== length) throw Error(`${label}: array length ${length}`);
};
const equalArray = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

export function validateUnits(units) {
  ownKeys(units, Object.keys(SI_UNITS), 'units');
  for (const key of Object.keys(SI_UNITS)) if (units[key] !== SI_UNITS[key]) throw Error(`units.${key}: expected ${SI_UNITS[key]}`);
}

function validateGrid(geom, N, E) {
  ownKeys(geom, ['n', 'length', 'dx', 'area', 'z', 'solid', 'region', 'faces', 'xids', 'yids', 'fixture', 'rotation', 'revision'], 'geometry');
  const { n, length, dx, area } = geom;
  integer(n, 'geometry.n', 2); integer(n * n, 'cell count', 1);
  finite(length, 'geometry.length', Number.MIN_VALUE); finite(dx, 'geometry.dx', Number.MIN_VALUE); finite(area, 'geometry.area', Number.MIN_VALUE);
  if (N !== n * n || E !== 2 * n * (n + 1) || dx !== length / n || area !== dx * dx) throw Error('geometry: shape/spacing/area mismatch');
  integer(geom.revision, 'geometry.revision'); integer(geom.rotation, 'geometry.rotation');
  if (geom.rotation > 3 || !['diversion', 'rest', 'dam', 'radial', 'blank'].includes(geom.fixture)) throw Error('geometry: unsupported fixture/orientation');
  for (const key of ['z', 'solid', 'region']) array(geom[key], N, `geometry.${key}`);
  array(geom.faces, E, 'geometry.faces');
  array(geom.xids, n * (n + 1), 'geometry.xids'); array(geom.yids, n * (n + 1), 'geometry.yids');
  for (let i = 0; i < N; i++) {
    finite(geom.z[i], `bed[${i}]`);
    if (geom.solid[i] !== 0 && geom.solid[i] !== 1) throw Error(`solid[${i}]: bit`);
    integer(geom.region[i], `region[${i}]`);
    if (geom.region[i] > 6) throw Error(`region[${i}]: unsupported diagnostic/demand region`);
  }
  const offset = n * (n + 1);
  for (let i = 0; i < offset; i++) {
    if (geom.xids[i] !== i || geom.yids[i] !== offset + i) throw Error('geometry: noncanonical face lookup');
  }
}

function validateFaces(geom) {
  const { n, faces, xids, yids, solid } = geom, offset = n * (n + 1);
  for (let id = 0; id < faces.length; id++) {
    const f = faces[id], axis = id < offset ? 0 : 1, local = id - (axis ? offset : 0);
    const x = local % (axis ? n : n + 1), y = Math.floor(local / (axis ? n : n + 1));
    const a = axis ? (y ? (y - 1) * n + x : -1) : (x ? y * n + x - 1 : -1);
    const b = axis ? (y < n ? y * n + x : -1) : (x < n ? y * n + x : -1);
    ownKeys(f, ['id', 'a', 'b', 'axis', 'x', 'y', 'open', 'gate', 'collinear', 'transverse'], `face[${id}]`);
    if (f.id !== id || f.axis !== axis || f.x !== x || f.y !== y || f.a !== a || f.b !== b) throw Error(`face[${id}]: noncanonical order/endpoints`);
    bool(f.open, `face[${id}].open`); bool(f.gate, `face[${id}].gate`);
    if (f.open && (a < 0 || b < 0 || solid[a] || solid[b])) throw Error(`face[${id}]: open wall`);
    if (f.gate && (geom.fixture !== 'diversion' || a < 0 || b < 0 || solid[a] || solid[b])) throw Error(`face[${id}]: invalid gate`);
    const collinear = axis === 0 ? [x > 0 ? xids[y * (n + 1) + x - 1] : -1, x < n ? xids[y * (n + 1) + x + 1] : -1]
      : [y > 0 ? yids[(y - 1) * n + x] : -1, y < n ? yids[(y + 1) * n + x] : -1];
    const transverse = axis === 0 ? [x > 0 ? yids[y * n + x - 1] : -1, x < n ? yids[y * n + x] : -1, x > 0 ? yids[(y + 1) * n + x - 1] : -1, x < n ? yids[(y + 1) * n + x] : -1]
      : [y > 0 ? xids[(y - 1) * (n + 1) + x] : -1, y < n ? xids[y * (n + 1) + x] : -1, y > 0 ? xids[(y - 1) * (n + 1) + x + 1] : -1, y < n ? xids[y * (n + 1) + x + 1] : -1];
    array(f.collinear, 2, `face[${id}].collinear`); array(f.transverse, 4, `face[${id}].transverse`);
    if (!equalArray(f.collinear, collinear) || !equalArray(f.transverse, transverse)) throw Error(`face[${id}]: noncanonical stencil`);
  }
}

function validateState(s) {
  ownKeys(s, ['version', 'model', 'theta', 'roughness', 'geom', 'V', 'q', 'mx', 'my', 'time', 'stepCount', 'collected', 'initialVolume', 'events'], 'state');
  if (s.version !== 'water-round2-v1' || s.model !== 'swe') throw Error('state: unsupported version/model');
  finite(s.theta, 'theta', 0); if (s.theta > 1) throw Error('theta: <=1');
  finite(s.roughness, 'roughness', 0); finite(s.time, 'time', 0); integer(s.stepCount, 'stepCount');
  finite(s.collected, 'collected', 0); finite(s.initialVolume, 'initialVolume', 0);
  if ((s.time === 0) !== (s.stepCount === 0)) throw Error('clock/step count mismatch');
  const N = s.V?.length, E = s.q?.length;
  validateGrid(s.geom, N, E); validateFaces(s.geom);
  for (const field of ['V', 'mx', 'my']) array(s[field], N, field);
  array(s.q, E, 'q');
  let volume = 0;
  for (let i = 0; i < N; i++) {
    finite(s.V[i], `V[${i}]`, 0); finite(s.mx[i], `mx[${i}]`); finite(s.my[i], `my[${i}]`);
    if (!Number.isFinite(s.V[i] / s.geom.area)) throw Error(`cell[${i}]: nonfinite depth`);
    if (s.geom.solid[i] && (s.V[i] !== 0 || s.mx[i] !== 0 || s.my[i] !== 0)) throw Error(`solid cell[${i}] carries fluid`);
    if (s.V[i] === 0 && (s.mx[i] !== 0 || s.my[i] !== 0)) throw Error(`dry cell[${i}] carries momentum`);
    volume += s.V[i];
  }
  for (let id = 0; id < E; id++) {
    finite(s.q[id], `q[${id}]`);
    if (!s.geom.faces[id].open && s.q[id] !== 0) throw Error(`closed face[${id}] reports discharge`);
  }
  if (!Number.isFinite(volume) || Math.abs(volume + s.collected - s.initialVolume) > Math.max(1, s.initialVolume) * 1e-10) throw Error('inventory ledger mismatch');
  ownKeys(s.events, ['gate', 'dig'], 'events'); bool(s.events.gate, 'events.gate'); bool(s.events.dig, 'events.dig');
  if (s.geom.revision !== Number(s.events.gate) + Number(s.events.dig)) throw Error('unsupported geometry revision/history');
  if (s.geom.fixture !== 'diversion' && (s.events.gate || s.events.dig)) throw Error('unsupported fixture edit history');
  for (const f of s.geom.faces) if (f.gate && f.open !== s.events.gate) throw Error('gate history/geometry mismatch');
}

function copyGeometry(g) {
  ownKeys(g, ['n', 'length', 'dx', 'area', 'z', 'solid', 'region', 'faces', 'xids', 'yids', 'fixture', 'rotation', 'revision'], 'geometry');
  return { n: g.n, length: g.length, dx: g.dx, area: g.area,
    z: Array.from(g.z), solid: Array.from(g.solid), region: Array.from(g.region),
    faces: g.faces.map(f => {
      ownKeys(f, ['id', 'a', 'b', 'axis', 'x', 'y', 'open', 'gate', 'collinear', 'transverse'], 'face');
      return { id: f.id, a: f.a, b: f.b, axis: f.axis, x: f.x, y: f.y, open: f.open, gate: f.gate,
        collinear: Array.from(f.collinear), transverse: Array.from(f.transverse) };
    }),
    xids: Array.from(g.xids), yids: Array.from(g.yids), fixture: g.fixture, rotation: g.rotation, revision: g.revision };
}

export function retainedCheckpoint(s) {
  // Fixed field order is part of this retained encoding; caller insertion order
  // cannot make numerically identical checkpoints have different JSON bytes.
  // Check unknown keys before canonical copying so it cannot erase corruption.
  ownKeys(s, ['version', 'model', 'theta', 'roughness', 'geom', 'V', 'q', 'mx', 'my', 'time', 'stepCount', 'collected', 'initialVolume', 'events'], 'state');
  ownKeys(s.events, ['gate', 'dig'], 'events');
  return { version: s.version, model: s.model, theta: s.theta, roughness: s.roughness,
    V: Array.from(s.V), q: Array.from(s.q), mx: Array.from(s.mx), my: Array.from(s.my),
    time: s.time, stepCount: s.stepCount, collected: s.collected, initialVolume: s.initialVolume,
    events: { gate: s.events.gate, dig: s.events.dig }, geom: copyGeometry(s.geom) };
}

export function admitState(input) {
  // Copy first: validation and ownership see the same finite snapshot, and no
  // external array/object remains in the admitted state. Ordinary JS callers
  // are supported; adversarial getters/shared concurrent memory are not an API.
  const s = retainedCheckpoint(input);
  validateState(s);
  s.V = Float64Array.from(s.V); s.q = Float64Array.from(s.q);
  s.mx = Float64Array.from(s.mx); s.my = Float64Array.from(s.my);
  s.geom.z = Float64Array.from(s.geom.z); s.geom.solid = Uint8Array.from(s.geom.solid);
  s.geom.region = Uint8Array.from(s.geom.region); s.geom.xids = Int32Array.from(s.geom.xids); s.geom.yids = Int32Array.from(s.geom.yids);
  return s;
}

export function sameGeometry(a, b) {
  for (const key of ['n', 'length', 'dx', 'area', 'fixture', 'rotation', 'revision']) if (a[key] !== b[key]) return false;
  for (const key of ['z', 'solid', 'region', 'xids', 'yids']) if (!equalArray(a[key], b[key])) return false;
  return a.faces.length === b.faces.length && a.faces.every((f, id) => {
    const other = b.faces[id];
    return ['id', 'a', 'b', 'axis', 'x', 'y', 'open', 'gate'].every(k => f[k] === other[k]) &&
      equalArray(f.collinear, other.collinear) && equalArray(f.transverse, other.transverse);
  });
}

export function immutableGeometry(g) {
  const copy = copyGeometry(g);
  for (const f of copy.faces) { Object.freeze(f.collinear); Object.freeze(f.transverse); Object.freeze(f); }
  for (const key of ['z', 'solid', 'region', 'faces', 'xids', 'yids']) Object.freeze(copy[key]);
  return Object.freeze(copy);
}

export function readOnlyField(array) {
  // Narrow numeric read protocol. No ArrayBuffer, mutating typed-array methods,
  // or callback receiving the private backing array escapes this facade.
  let view;
  const target = Object.assign(Object.create(null), {
    length: array.length,
    [Symbol.iterator]: function* () { for (let i = 0; i < array.length; i++) yield array[i]; },
    reduce(fn, initial) {
      let i = 0, value = initial;
      if (arguments.length < 2) { if (!array.length) throw TypeError('empty reduce'); value = array[i++]; }
      for (; i < array.length; i++) value = fn(value, array[i], i, view);
      return value;
    },
  });
  view = new Proxy(Object.freeze(target), {
    get(object, key) {
      if (typeof key === 'string' && /^(0|[1-9]\d*)$/.test(key)) return array[Number(key)];
      return Reflect.get(object, key);
    },
    set: () => false, defineProperty: () => false, deleteProperty: () => false, setPrototypeOf: () => false,
  });
  return view;
}
