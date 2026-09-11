import test from 'node:test';
import assert from 'node:assert/strict';
import { createAudioOwner } from './audio.js';
class FakeContext {
  static all = [];
  state = 'suspended'; currentTime = 0; destination = {}; sources = [];
  constructor() { FakeContext.all.push(this); }
  async resume() { this.state = 'running'; }
  async suspend() { this.state = 'suspended'; }
  async close() { this.state = 'closed'; }
  createBuffer(_, length) { const data = new Float32Array(length); return { getChannelData: () => data }; }
  createBufferSource() { const node = { connect: n => n, start() {}, stop() {}, disconnect() {}, buffer: null }; this.sources.push(node); return node; }
  createOscillator() { const node = this.createBufferSource(); node.frequency = { values: [], setValueAtTime(v) { this.values.push(v); }, exponentialRampToValueAtTime(v) { this.values.push(v); } }; return node; }
  createGain() { return { gain: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect: n => n, disconnect() {} }; }
}
const fakeModule = () => ({ ZZFX: { audioContext: new FakeContext(), buildSamples: () => [0, .1, 0] } });
test('approved cannon pitches, voice cleanup and mute remain under one owner', async () => {
  const owner = createAudioOwner({ AudioContextCtor: FakeContext, loadZzfx: async () => fakeModule(), maxVoices: 1 });
  assert.equal(owner.play('launch'), false);
  await owner.unlock();
  const active = FakeContext.all.findLast(c => c.state === 'running');
  assert.equal(owner.play('launch'), true);
  assert.deepEqual(active.sources[0].frequency.values, [82, 42]);
  assert.equal(owner.play('impact'), false);
  active.sources[0].onended();
  assert.equal(owner.play('impact'), true);
  assert.deepEqual(active.sources[1].frequency.values, [145, 72]);
  owner.setMuted(true);
  assert.equal(owner.play('launch'), false);
  owner.dispose();
  assert.equal(owner.voiceCount, 0);
  assert.equal(active.state, 'closed');
});
test('late imports close upstream context after disposal and failures stay handled', async () => {
  let resolve;
  const owner = createAudioOwner({ AudioContextCtor: FakeContext, loadZzfx: () => new Promise(r => { resolve = r; }) });
  const pending = owner.unlock();
  while (!resolve) await Promise.resolve();
  owner.dispose();
  const module = fakeModule();
  resolve(module);
  assert.equal(await pending, false);
  assert.equal(module.ZZFX.audioContext.state, 'closed');
  assert.equal(owner.play('footOnDirt'), false);
  const failed = createAudioOwner({ AudioContextCtor: FakeContext, loadZzfx: () => { throw Error('offline'); } });
  assert.equal(await failed.unlock(), false);
  assert.equal(failed.play('launch'), true); // Existing cannon does not depend on lazy synth loading.
  failed.dispose();
});
test('actual maintained ZzFX generates samples without retaining its eager context', async () => {
  const previous = globalThis.AudioContext;
  globalThis.AudioContext = FakeContext;
  const owner = createAudioOwner({ AudioContextCtor: FakeContext });
  try {
    assert.equal(await owner.unlock(), true);
    assert.equal(owner.play('footOnDirt'), true);
    const active = FakeContext.all.findLast(c => c.state === 'running');
    assert.ok(active.sources.at(-1).buffer.getChannelData(0).some(n => n !== 0));
    assert.equal((await import('zzfx')).ZZFX.audioContext.state, 'closed');
  } finally { owner.dispose(); globalThis.AudioContext = previous; }
});
