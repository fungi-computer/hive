import assert from 'node:assert/strict';
import { test } from 'node:test';
import { entity } from '../sdk/authoring';
import { appendPresentationCues, checkedCueList, checkedCueSnapshot } from './presentation-cues';
import type { Impact } from '../contracts';
const at = { x: 1, y: 2, z: 0 };
const velocity = { x: 8, y: 1, z: 0 };
const launcher = entity('cannon');
const impact = (sequence: number, time = 1): Impact => ({
  id: `impact.${sequence}`, sequence, projectileId: entity('ball'), sourceId: launcher,
  targetId: entity(`soldier.${sequence}`), time, point: at, normal: {x: -1,y: 0,z: 0}, velocity,
});
test('committed launch and three impacts retain ordered feedback independently of physical delivery', () => {
  const before = {sequence: 0, recent: []};
  const after = appendPresentationCues(before, 1, [{action: {kind:'launch', launcher, ammunition:entity('round'), velocity}, result:{accepted:true, revision:1, projectileId:entity('ball'), launchPoint:at}}], [impact(1), impact(2), impact(3)]);
  assert.deepEqual(after.recent.map(cue => cue.kind), ['launch','impact','impact','impact']);
  assert.deepEqual(after.recent.map(cue => cue.sequence), [1,2,3,4]);
  assert.deepEqual(before, {sequence:0,recent:[]});
  assert.deepEqual(checkedCueSnapshot(after,1),after);
});
test('cue retention is finite while sequence survives pruning and save reload', () => {
  const first = appendPresentationCues({sequence:0,recent:[]},1,[],Array.from({length:80},(_,i)=>impact(i+1)));
  assert.equal(first.recent.length,64);
  assert.equal(first.sequence,80);
  const expired = appendPresentationCues(checkedCueSnapshot(first,1),5,[],[]);
  assert.equal(expired.recent.length,0);
  assert.equal(appendPresentationCues(expired,6,[],[impact(81,6)]).recent[0].sequence,81);
});
test('wire rejects repeated, reversed, future and expired cues', () => {
  const one = appendPresentationCues({sequence:0,recent:[]},1,[],[impact(1),impact(2)]);
  assert.throws(()=>checkedCueList([...one.recent].reverse(),1));
  assert.throws(()=>checkedCueList([one.recent[0],one.recent[0]],1));
  assert.throws(()=>checkedCueList(one.recent,0));
  assert.throws(()=>checkedCueList(one.recent,5));
  assert.throws(()=>appendPresentationCues(one,1,[],[impact(3,2)]));
});
