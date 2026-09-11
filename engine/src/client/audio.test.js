import test from "node:test";
import assert from "node:assert/strict";
import { createAudioOwner } from "./audio.js";

class FakeContext {
  state = "suspended";
  currentTime = 0;
  resume() { this.state = "running"; }
  suspend() { this.state = "suspended"; }
  close() { this.state = "closed"; }
}

test("audio stays locked until unlock and uses named ZzFX recipes", async () => {
  const calls = [];
  const source = { addEventListener() {}, stop() {} };
  const owner = createAudioOwner({ AudioContextCtor: FakeContext, loadZzfx: async () => ({ ZZFX: { audioContext: null, play: (...recipe) => { calls.push(recipe); return source; } } }) });
  assert.equal(owner.play("launch"), false);
  await owner.unlock();
  assert.equal(owner.play("launch"), true);
  assert.equal(calls.length, 1);
  assert.ok(calls[0].length > 2);
  owner.dispose();
});

test("mute and voice cap prevent additional ZzFX voices", async () => {
  const sources = [];
  const owner = createAudioOwner({ AudioContextCtor: FakeContext, maxVoices: 1, loadZzfx: async () => ({ ZZFX: { play: () => { const source = { addEventListener() {}, stop() {} }; sources.push(source); return source; } } }) });
  await owner.unlock();
  assert.equal(owner.play("impact"), true);
  assert.equal(owner.play("impact"), false);
  owner.setMuted(true);
  assert.equal(owner.play("impact"), false);
  owner.dispose();
});
