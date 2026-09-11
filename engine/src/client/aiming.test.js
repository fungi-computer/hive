import test from "node:test";
import assert from "node:assert/strict";
import { aimVelocity, createPreviewCache, fireInput } from "./aiming.js";

test("aim velocity is reusable as the fire payload", () => {
  const input = fireInput({ launcherId: "formations.cannon", origin: { x: 0, y: 0, z: 0 }, target: { x: 4, y: 0, z: 0 }, elevation: 0.2, speed: 8 });
  assert.equal(input.command, "fire");
  assert.deepEqual(input.velocity, aimVelocity({ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }, 0.2, 8));
});

test("preview cache throttles changed hover points and reuses identical inputs", () => {
  let time = 0, calls = 0;
  const cache = createPreviewCache({ now: () => time, minInterval: 50, preview: json => { calls++; return JSON.parse(json); } });
  cache.get({ velocity: { x: 1 } });
  cache.get({ velocity: { x: 2 } });
  assert.equal(calls, 1);
  time = 50;
  cache.get({ velocity: { x: 2 } });
  assert.equal(calls, 2);
  cache.get({ velocity: { x: 2 } });
  assert.equal(calls, 2);
});

test("every aim heading stays inside the native speed cap", () => {
  for (let i = 0; i < 360; i++) {
    const angle = i * Math.PI / 180;
    const v = aimVelocity({x:0,y:0,z:0}, {x:Math.cos(angle),y:0,z:Math.sin(angle)}, 0.37, 8);
    assert(Math.hypot(v.x,v.y,v.z) <= 8);
  }
});
