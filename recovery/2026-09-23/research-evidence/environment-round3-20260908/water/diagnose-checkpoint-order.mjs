import assert from 'node:assert/strict';
import { createStepper } from './candidate.mjs';
import { makeFixture, step, serialize } from './reference/solver.mjs';
import { writeFileSync } from 'node:fs';
const raw = makeFixture({ n: 8, length: 8, fixture: 'dam', model: 'swe', roughness: 0 });
const owner = createStepper(raw); owner.step(.01);
const actual = owner.checkpoint(), expected = serialize(step(raw, .01).state);
assert.deepEqual(actual, expected);
const result = { allValuesDeepEqual: true, serializedBytesEqual: JSON.stringify(actual) === JSON.stringify(expected),
  actualKeys: Object.keys(actual), expectedKeys: Object.keys(expected) };
writeFileSync(new URL('runs/radial-rest-first-radial-rest/checkpoint-order-diagnosis.json', import.meta.url), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result));
