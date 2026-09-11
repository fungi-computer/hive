import test from "node:test";
import assert from "node:assert/strict";
import { createAudioOwner } from "./audio.js";

class FakeContext {
  state = "suspended";
  currentTime = 0;
  resume() { this.state = "running"; }
  suspend() { this.state = "suspended"; }
  close() { this.state = "closed"; }
  createBuffer(_channels, length) { return { getChannelData: () => new Float32Array(length) }; }
  createBufferSource() { return { connect: node => node, addEventListener() {}, start() {}, stop() {}, disconnect() {}, buffer: null }; }
  createGain() { return { gain: { value: 0 }, connect: node => node, disconnect() {} }; }
  destination = {};
}

test("audio stays locked until unlock and uses named ZzFX recipes", async () => {
  const calls = [];
  const eager = { close() {} };
  const owner = createAudioOwner({ AudioContextCtor: FakeContext, loadZzfx: async () => ({ ZZFX: { audioContext: eager, buildSamples: (...recipe) => { calls.push(recipe); return [0, 0, 0]; } } }) });
  assert.equal(owner.play("launch"), false);
  await owner.unlock();
  assert.equal(owner.play("launch"), true);
  assert.equal(calls.length, 1);
  assert.ok(calls[0].length > 2);
  owner.dispose();
});

test("mute and voice cap prevent additional ZzFX voices", async () => {
  const sources = [];
  const owner = createAudioOwner({ AudioContextCtor: FakeContext, maxVoices: 1, loadZzfx: async () => ({ ZZFX: { buildSamples: () => { sources.push(true); return [0, 0]; } } }) });
  await owner.unlock();
  assert.equal(owner.play("impact"), true);
  assert.equal(owner.play("impact"), false);
  owner.setMuted(true);
  assert.equal(owner.play("impact"), false);
  owner.dispose();
});

test("late loader failure and disposal do not revive the owner", async () => {
  let resolve;
  const owner = createAudioOwner({ AudioContextCtor: FakeContext, loadZzfx: () => new Promise(done => { resolve = done; }) });
  const pending = owner.unlock();
  await Promise.resolve();
  owner.dispose();
  resolve({ ZZFX: { buildSamples: () => [0] } });
  assert.equal(await pending, false);
  assert.equal(owner.play("launch"), false);
});
