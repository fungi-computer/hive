import test from "node:test";
import assert from "node:assert/strict";
import { COURT } from "./fixture.js";
import { createTerrainOwner } from "./terrain.js";

test("terrain owner rebuilds and evicts bounded chunks", () => { const owner = createTerrainOwner(COURT); const before = owner.inspect(); assert.ok(before.chunks >= 4); owner.setCut(null); assert.equal(owner.inspect().builds, before.builds); owner.evictAll(); assert.equal(owner.inspect().chunks, 0); owner.rebuild(); assert.equal(owner.inspect().chunks, before.chunks); owner.dispose(); });
test("batched meshes retain distinct triangle targets", () => { const owner = createTerrainOwner(COURT); const ranges = []; owner.root.traverse(item => { if (item.userData.pickRanges) ranges.push(...item.userData.pickRanges); }); assert.ok(ranges.some(range => range.target?.kind === "terrain")); assert.ok(new Set(ranges.filter(range => range.target?.kind === "terrain").map(range => range.target.cell.join(","))).size > 1); owner.dispose(); });
test("cut exposes the lower bank top without cover from the hidden surface", () => {
  const owner = createTerrainOwner(COURT);
  owner.setCut(0);
  const targets = [];
  owner.root.traverse(item => { for (const range of item.userData.pickRanges ?? []) targets.push(range.target); });
  assert(targets.some(target => target?.kind === "terrain" && target.cell.join(",") === "4,0,4" && target.cap));
  assert(!targets.some(target => target?.cell?.join(",") === "4,1,4"));
  assert(!targets.some(target => target?.kind === "cover" && target.cell.join(",") === "4,0,4"));
  owner.dispose();
});
