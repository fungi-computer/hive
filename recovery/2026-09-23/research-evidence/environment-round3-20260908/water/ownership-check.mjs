// Bounded lifecycle/allocation instrumentation; no browser or game runtime.
import assert from 'node:assert/strict';
import { createStepper } from './candidate.mjs';
import { step, serialize, makeFixture, sum } from './reference/solver.mjs';
import { dynamicChannel } from './fixtures.mjs';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const dir = new URL(`runs/${process.argv[2] ?? 'ownership'}-ownership/`, import.meta.url);
mkdirSync(dir, { recursive: true });
const hashes = {};
for (const name of ['candidate.mjs', 'admission.mjs', 'ownership-check.mjs', 'fixtures.mjs', 'PREDECLARED.md']) {
  const bytes = readFileSync(new URL(name, import.meta.url));
  hashes[name] = createHash('sha256').update(bytes).digest('hex');
  writeFileSync(new URL(name, dir), bytes);
}
const initial = dynamicChannel(32), solver = createStepper(initial);
function allocations(fn) {
  const originals = new Map(), result = { arrays: 0, bytes: 0, kinds: {} };
  for (const name of ['Float64Array', 'Float32Array', 'Int32Array', 'Uint32Array', 'Int16Array', 'Uint16Array', 'Int8Array', 'Uint8Array']) {
    const Type = globalThis[name]; originals.set(name, Type);
    globalThis[name] = new Proxy(Type, {
      construct(target, args) {
        const a = Reflect.construct(target, args);
        result.arrays++; result.bytes += a.byteLength;
        result.kinds[name] = (result.kinds[name] ?? 0) + 1;
        return a;
      },
    });
  }
  try { fn(); } finally { for (const [name, Type] of originals) globalThis[name] = Type; }
  return result;
}
const reference = allocations(() => step(initial, .025));
const candidate = allocations(() => solver.step(.025));
assert.deepEqual(reference, { arrays: 15, bytes: (8 * initial.V.length + 7 * initial.geom.faces.length) * 8, kinds: { Float64Array: 15 } });
assert.deepEqual(candidate, { arrays: 0, bytes: 0, kinds: {} });
const retained = solver.checkpoint(), retainedBytes = JSON.stringify(retained), inputBytes = JSON.stringify(serialize(initial));
for (let i = 0; i < 4; i++) solver.step(.025);
assert.equal(JSON.stringify(retained), retainedBytes);
assert.equal(JSON.stringify(serialize(initial)), inputBytes);
const film = makeFixture({ n: 16, length: 16, fixture: 'blank', model: 'swe', roughness: 0 });
film.V[120] = 1e-15; film.initialVolume = sum(film.V);
const filmSolver = createStepper(film), filmReference = step(film, .025);
const actual = filmSolver.step(.025);
assert.equal(JSON.stringify(filmSolver.checkpoint()), JSON.stringify(serialize(filmReference.state)));
assert.ok(sum(actual.state.V) > 0, 'thin film cannot vanish');
const result = { status: 'passed', hashes, reference, candidate, retainedCheckpointUnchanged: true,
  constructorInputUnchanged: true, positiveFilmRetained: sum(actual.state.V),
  note: 'Instrumented JavaScript typed-array constructor allocations only. O(1) JS objects, initialization, checkpoint/replace and V8 internal allocations are outside this per-step measurement.' };
writeFileSync(new URL('result.json', dir), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result));
