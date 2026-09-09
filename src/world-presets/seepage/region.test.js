import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { openRegion } from '../../engine/region/index.ts';
import { sqliteTestOwner } from '../../engine/region/sqlite-test-owner.mjs';
import { createWetRegionProgram } from './region.ts';

function fixture(t) {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  let fail = false;
  const owner = sqliteTestOwner(db, statement => {
    if (fail && statement.startsWith('INSERT INTO hive_region_receipts')) throw new Error('injected-receipt-write');
  });
  return { db, setFailure: value => { fail = value; },
    open: () => openRegion({ owner, region: 'wet-world', program: createWetRegionProgram() }) };
}
const dig = (id, revision, x = 0, y = 14) => ({ id, expectedRevision: revision,
  command: { kind: 'excavate', at: [x, y, 128] } });
const advance = (id, revision) => ({ id, expectedRevision: revision, command: { kind: 'advance', seconds: 6 } });

test('same region transaction owns real terrain, finite spoil, water clock and replay', t => {
  const f = fixture(t), region = f.open();
  const first = region.dispatch('wet-world-player', dig('first', 0));
  assert.equal(first.status, 'applied');
  region.dispatch('wet-world-host', advance('wait', 1));
  const before = region.readCommitted();
  const second = region.dispatch('wet-world-player', dig('second', 2, 1));
  const next = region.readCommitted();
  assert.equal(next.state.environment.world.revision, 2);
  assert.equal(next.state.environment.exports.length, 2);
  assert.equal(next.state.environment.soilState.timeS, 6);
  assert.ok(before.state.environment.soilState.massKg.at(-1) > 0);
  const reopened = f.open();
  assert.deepEqual(reopened.readCommitted(), next);
  assert.deepEqual(reopened.dispatch('wet-world-player', dig('second', 2, 1)), second);
  assert.equal(reopened.readEvents(0).length, 3);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM hive_region_receipts').get().n, 3);
  assert.throws(() => reopened.dispatch('wet-world-player', dig('second', 2, 0)), /conflict/);
  const stale = reopened.dispatch('wet-world-player', dig('stale', 0, 1));
  assert.equal(stale.status, 'rejected');
  assert.deepEqual(reopened.readCommitted(), next);
});

test('failure after state/event/receipt writes rolls back the complete water world', t => {
  const f = fixture(t), region = f.open(), before = region.readCommitted();
  f.setFailure(true);
  assert.throws(() => region.dispatch('wet-world-player', dig('first', 0)), /injected-receipt-write/);
  assert.deepEqual(region.readCommitted(), before);
  assert.deepEqual(f.open().readCommitted(), before);
  assert.equal(region.readEvents(0).length, 0);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM hive_region_receipts').get().n, 0);
  f.setFailure(false);
  assert.equal(region.dispatch('wet-world-player', dig('first', 0)).revision, 1);
});

test('host time and player excavation grants are distinct; unsupported geometry stays uncommitted', t => {
  const f = fixture(t), region = f.open();
  assert.throws(() => region.dispatch('wet-world-player', advance('wrong', 0)), /forbidden/);
  assert.throws(() => region.dispatch('wet-world-host', dig('wrong', 0)), /forbidden/);
  region.dispatch('wet-world-player', dig('first', 0));
  const before = region.readCommitted();
  assert.throws(() => region.dispatch('wet-world-player', dig('unowned-stone', 1, 0, 12)), /remaining owned/);
  assert.deepEqual(region.readCommitted(), before);
  assert.equal(region.readEvents(0).length, 1);
});
