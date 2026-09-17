import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseLivingTerrainRuntimeManifest } from "./living-terrain-pack.js";

test("runtime terrain atlas is complete and retains the accepted study atlas", () => {
  const manifest = JSON.parse(readFileSync("artifacts/living-terrain/manifest.json", "utf8"));
  const runtime = parseLivingTerrainRuntimeManifest(manifest);
  assert.equal(runtime.entries.size, 210);
  assert.equal(manifest.hashes["living-terrain-atlas.png"], "f974a6e7019dafcb6d9d6c8b9ae4ad87a148821f37032cd632e5e2f040dc8f35");
  assert(runtime.entries.has("body/earth/2/south"));
  assert(runtime.entries.has("body/stone/0/top"));
  assert(runtime.entries.has("cover/grass/green/full/2/15"));
  assert(runtime.entries.has("cover/grass/dead/short/0/0"));
});

test("runtime terrain manifest rejects duplicate or incomplete frames", () => {
  const manifest = JSON.parse(readFileSync("artifacts/living-terrain/manifest.json", "utf8"));
  const broken = structuredClone(manifest);
  broken.runtime.entries[1].id = broken.runtime.entries[0].id;
  assert.throws(() => parseLivingTerrainRuntimeManifest(broken), /Invalid living terrain runtime frame/);
});
