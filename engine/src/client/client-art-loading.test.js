import test from "node:test";
import assert from "node:assert/strict";
import { createClientArtLoading } from "./client-art-loading.js";

function deferred() {
  return Promise.withResolvers();
}
function fixture() {
  const terrain = deferred(), statics = deferred(), calls = [];
  const pack = name => ({ name, disposed: 0, dispose() { this.disposed++; } });
  const terrainPack = pack("terrain"), staticPack = pack("static");
  const owner = createClientArtLoading({
    loadTerrain() { calls.push("terrain"); return terrain.promise; },
    loadStatic() { calls.push("static"); return statics.promise; },
  });
  return { owner, terrain, statics, terrainPack, staticPack, calls };
}

test("both loaders start independently and ownership transfers only when both are ready", async () => {
  const f = fixture();
  let accepted;
  const installed = f.owner.install((terrain, statics) => { accepted = [terrain, statics]; });
  await Promise.resolve();
  assert.deepEqual(f.calls, ["terrain", "static"]);
  f.statics.resolve(f.staticPack);
  await Promise.resolve();
  assert.equal(accepted, undefined);
  f.terrain.resolve(f.terrainPack);
  assert.equal(await installed, true);
  assert.deepEqual(accepted, [f.terrainPack, f.staticPack]);
  await assert.rejects(f.owner.install(() => {}), /already installed/);
  f.owner.dispose();
  assert.equal(f.terrainPack.disposed, 0, "installed packs belong to their scene owners");
  assert.equal(f.staticPack.disposed, 0);
});

for (const failed of ["terrain", "statics"]) test(`${failed} failure disposes its already-loaded sibling`, async () => {
  const f = fixture(), sibling = failed === "terrain" ? "statics" : "terrain";
  const good = sibling === "terrain" ? f.terrainPack : f.staticPack;
  const installed = f.owner.install(() => assert.fail("incomplete art cannot install"));
  f[sibling].resolve(good);
  await Promise.resolve();
  f[failed].reject(new Error("load failed"));
  await assert.rejects(installed, /load failed/);
  assert.equal(good.disposed, 1);
  f.owner.dispose();
  assert.equal(good.disposed, 1);
});

test("failure disposes a sibling that finishes after rejection", async () => {
  const f = fixture();
  const installed = f.owner.install(() => assert.fail("failed art cannot install"));
  f.terrain.reject(new Error("terrain failed"));
  await assert.rejects(installed, /terrain failed/);
  f.statics.resolve(f.staticPack);
  await f.statics.promise;
  await Promise.resolve();
  assert.equal(f.staticPack.disposed, 1);
});

test("closing before either loader finishes releases late packs without installing", async () => {
  const f = fixture();
  const installed = f.owner.install(() => assert.fail("closed client cannot install"));
  f.owner.dispose();
  f.terrain.resolve(f.terrainPack);
  f.statics.resolve(f.staticPack);
  assert.equal(await installed, false);
  assert.equal(f.terrainPack.disposed, 1);
  assert.equal(f.staticPack.disposed, 1);
});

test("closing after partial load releases both current and late resources", async () => {
  const f = fixture();
  f.terrain.resolve(f.terrainPack);
  await f.terrain.promise;
  await Promise.resolve();
  f.owner.dispose();
  f.statics.resolve(f.staticPack);
  assert.equal(await f.owner.install(() => assert.fail("closed client cannot install")), false);
  assert.equal(f.terrainPack.disposed, 1);
  assert.equal(f.staticPack.disposed, 1);
});

test("installation failure releases both packs and preserves the failure", async () => {
  const f = fixture();
  f.terrain.resolve(f.terrainPack);
  f.statics.resolve(f.staticPack);
  await assert.rejects(f.owner.install(() => { throw new Error("bad atlas"); }), /bad atlas/);
  assert.equal(f.terrainPack.disposed, 1);
  assert.equal(f.staticPack.disposed, 1);
});

test("synchronous loader failure still starts and cleans the independent sibling", async () => {
  let started = false, disposed = 0;
  const owner = createClientArtLoading({
    loadTerrain() { throw new Error("bad terrain input"); },
    loadStatic() { started = true; return { dispose() { disposed++; } }; },
  });
  await assert.rejects(owner.install(() => assert.fail("failed load cannot install")), /bad terrain input/);
  assert.equal(started, true);
  assert.equal(disposed, 1);
});
