import test from "node:test";
import assert from "node:assert/strict";
import { createTerrainFaceAppearance, terrainArtFace, terrainArtMask } from "./terrain-face-appearance.js";
import { createOrderingProjection } from "./ordering-projection.js";
import { createVisibleHitArea, createVisibleSilhouette } from "../../../src/visual-hit-geometry.js";

const projection = { project: ({ x, y, z }) => ({ x: x * 32 - z * 32, y: (x + z) * 16 - y * 32 }) };

test("terrain appearance delegates body and cover selection to one checked art pack", () => {
  const calls = [];
  const pack = {
    body: input => { calls.push(["body", input]); return { texture: { source: {} }, uvs: [0,0,0,1,1,1,1,0] }; },
    cover: input => { calls.push(["cover", input]); return { texture: { source: {} }, uvs: [0,0,0,1,1,1,1,0] }; },
  };
  const owner = createTerrainFaceAppearance({ pack });
  const body = owner.body({ cell: [2, 3, 4], face: "south", art: "earth", seed: 7, projection, verticalMetres: 0.54 });
  const cover = owner.cover({ cover: { kind: "grass", condition: "dead", height: "short" }, mask: 9,
    root: [2, 4], seed: 7, projection, surfaceY: 1.89 });
  assert.deepEqual(calls.map(([kind]) => kind), ["body", "cover"]);
  assert.deepEqual(calls[0][1], { art: "earth", face: "south", cell: [2,3,4], seed: 7 });
  assert.deepEqual(calls[1][1], { kind: "grass", condition: "dead", height: "short", mask: 9, root: [2,4], seed: 7 });
  assert.equal(body.projected.length, 4);
  assert.equal(cover.projected.length, 4);
  assert.notDeepEqual(body.projected, cover.projected);
  assert.throws(() => owner.body({ cell: [0,0,0], face: "top", projection, verticalMetres: .54 }), /no art definition/);
});

test("four camera views choose the baked visible face and rotate cover corner masks", () => {
  assert.deepEqual(["east", "west", "west", "east"].map((face, turn) => terrainArtFace(face, turn)),
    ["east", "south", "east", "south"]);
  assert.deepEqual(["south", "south", "north", "north"].map((face, turn) => terrainArtFace(face, turn)),
    ["south", "east", "south", "east"]);
  assert.deepEqual([0,1,2,3].map(turn => terrainArtMask(1, turn)), [1,8,4,2]);
  assert.deepEqual([0,1,2,3].map(turn => terrainArtMask(15, turn)), [15,15,15,15]);
});

test("upright cover preserves all baked pixels and UVs instead of clipping to its four support cells", () => {
  const silhouette = { width: 64, height: 64, rows: Array.from({ length: 65 }, (_, y) => y),
    spans: Array.from({ length: 64 }, () => [24, 39]).flat() };
  const style = { texture: { source: {} }, uvs: [.1,.2,.1,.4,.3,.4,.3,.2],
    hitArea: createVisibleHitArea(silhouette, { x: .5, y: .5 }) };
  const owner = createTerrainFaceAppearance({ pack: { body: () => style, cover: () => style } });
  const projection = createOrderingProjection();
  const picture = owner.cover({ cover: { kind: "grass", condition: "green", height: "full" },
    mask: 15, root: [0,0], projection, surfaceY: .27 });
  assert.strictEqual(picture.terrainBatch.hitArea, style.hitArea);
  assert.strictEqual(picture.terrainBatch.texture, style.texture);
  assert.equal(picture.projected[2].x - picture.projected[0].x, 16, "only transparent horizontal padding is removed");
  assert.equal(picture.projected[2].y - picture.projected[0].y, 64, "the complete image quad survives");
  assert.equal(picture.supportY, .27);
  assert.equal(picture.orderGeometry.kind, "card");
  const center = projection.project({ x: .5, y: .27, z: .5 });
  assert(picture.orderGeometry.shape.points.some(point => point.y + picture.orderGeometry.offset.y < center.y), "blades extend above the support");
  assert(picture.orderGeometry.shape.points.some(point => point.y + picture.orderGeometry.offset.y > center.y), "contact ink remains below the support");
  assert(picture.contains({ x: center.x, y: center.y - 30 }), "ink above the ground diamond survives");
});

test("body and cover trim transparent padding together with UVs while preserving every ink pixel", () => {
  const rgba = new Uint8Array(64*64*4);
  const ink = [[7,3,1],[51,54,12],[14,29,255],[15,29,255],[8,4,2]];
  for (const [x,y,alpha] of ink) rgba[(y*64+x)*4+3] = alpha;
  const silhouette = createVisibleSilhouette(rgba,64,64);
  const style = Object.freeze({texture:{source:{}},uvs:[.2,.1,.2,.5,.8,.5,.8,.1],
    hitArea:createVisibleHitArea(silhouette,{x:.5,y:.5})});
  const owner = createTerrainFaceAppearance({pack:{body:()=>style,cover:()=>style}});
  const projection = createOrderingProjection();
  const at = projection.project({x:.5,y:.27,z:.5});
  const coverInput = {cover:{kind:'grass',condition:'green',height:'full'},mask:15,root:[0,0],projection,surfaceY:.27};
  const cover = owner.cover(coverInput);
  const body = owner.body({cell:[.5,0,.5],face:'top',art:'earth',projection,verticalMetres:.54});
  assert.strictEqual(body.terrainBatch,cover.terrainBatch,'shared source style owns one retained crop');
  assert.strictEqual(owner.cover(coverInput).terrainBatch,cover.terrainBatch);
  assert.deepEqual(body.projected,cover.projected);
  const [tl,,br] = cover.projected;
  assert.deepEqual(tl,{x:at.x-32+7,y:at.y-32+3});
  assert.deepEqual(br,{x:at.x-32+52,y:at.y-32+55});
  for (const [x,y] of ink) {
    const sx = at.x-32+x+.5, sy = at.y-32+y+.5;
    const u=(sx-tl.x)/(br.x-tl.x),v=(sy-tl.y)/(br.y-tl.y);
    const uv=cover.terrainBatch.uvs;
    const actual=[uv[0]+u*(uv[6]-uv[0]),uv[1]+v*(uv[3]-uv[1])];
    const expected=[.2+(x+.5)/64*.6,.1+(y+.5)/64*.4];
    assert(Math.abs(actual[0]-expected[0])<1e-12 && Math.abs(actual[1]-expected[1])<1e-12);
    assert(cover.contains({x:sx,y:sy}),'even alpha=1 shadow/blade ink remains hittable');
  }
  assert.strictEqual(cover.terrainBatch.hitArea,style.hitArea,'silhouette anchor stays original');
  assert.deepEqual(style.uvs,[.2,.1,.2,.5,.8,.5,.8,.1],'shared source style is unmodified');
});

test("empty checked frames are explicitly invisible and full frames retain their style", () => {
  for(const alpha of [0,255]) {
    const rgba = new Uint8Array(64*64*4).fill(alpha);
    const style = {texture:{source:{}},uvs:[0,0,0,1,1,1,1,0],
      hitArea:createVisibleHitArea(createVisibleSilhouette(rgba,64,64),{x:.5,y:.5})};
    const owner = createTerrainFaceAppearance({pack:{body:()=>style,cover:()=>style}});
    const result = owner.body({cell:[0,0,0],face:'top',art:'earth',projection,verticalMetres:.54});
    if(alpha===0) {
      assert.equal(result.visible,false);
      assert.deepEqual(result.projected[0],result.projected[2]);
      assert(result.terrainBatch.uvs.every(Number.isFinite));
    } else assert.strictEqual(result.terrainBatch,style);
  }
});

test("all 210 checked atlas frames preserve the screen position and UV of every nonzero-alpha pixel", async () => {
  const {readFile} = await import('node:fs/promises');
  const {parseLivingTerrainRuntimeManifest} = await import('../../../src/art/living-terrain-pack.js');
  const manifest = parseLivingTerrainRuntimeManifest(JSON.parse(await readFile(new URL('../../../artifacts/living-terrain/manifest.json',import.meta.url),'utf8')));
  let tested=0;
  for(const entry of manifest.entries.values()) {
    const l=entry.x/manifest.width,r=(entry.x+64)/manifest.width;
    const t=entry.y/manifest.height,b=(entry.y+64)/manifest.height;
    const style={texture:{source:{}},uvs:[l,t,l,b,r,b,r,t],hitArea:createVisibleHitArea(entry.silhouette,{x:.5,y:.5})};
    const owner=createTerrainFaceAppearance({pack:{body:()=>style,cover:()=>style}});
    const result=owner.body({cell:[0,0,0],face:'top',art:'earth',projection,verticalMetres:.54});
    const at=projection.project({x:0,y:.27,z:0}),[tl,,br]=result.projected,uv=result.terrainBatch.uvs;
    let pixels=0;
    for(let y=0;y<64;y++) for(let pair=entry.silhouette.rows[y];pair<entry.silhouette.rows[y+1];pair++)
      for(let x=entry.silhouette.spans[2*pair];x<=entry.silhouette.spans[2*pair+1];x++) {
        const sx=at.x-32+x+.5,sy=at.y-32+y+.5;
        assert(sx>=tl.x&&sx<br.x&&sy>=tl.y&&sy<br.y,entry.id);
        const u=uv[0]+(sx-tl.x)/(br.x-tl.x)*(uv[6]-uv[0]);
        const v=uv[1]+(sy-tl.y)/(br.y-tl.y)*(uv[3]-uv[1]);
        assert(Math.abs(u-(entry.x+x+.5)/manifest.width)<1e-12,entry.id);
        assert(Math.abs(v-(entry.y+y+.5)/manifest.height)<1e-12,entry.id);
        pixels++;
      }
    assert.equal(pixels,entry.visiblePixels,entry.id);
    if(!pixels) assert.equal(result.visible,false,entry.id);
    tested++;
  }
  assert.equal(tested,210);
});
