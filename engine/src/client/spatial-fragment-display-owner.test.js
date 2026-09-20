import assert from "node:assert/strict";
import test from "node:test";
import { createSpatialFragmentDisplayOwner } from "./spatial-fragment-display-owner.js";

function setup() {
  const created = [], parent = { addChild(mesh) { mesh.parent = this; } };
  const createDisplay = (shape, texture) => {
    const geometry = { positions: shape.positions, uvs: shape.uvs, indices: shape.indices, uploads: 0,
      destroy(value) { this.destroyed = value; } };
    const mesh = { texture, zIndex: 0, destroy(options) { this.destroyed = true; this.options = options; },
      removeFromParent() { this.parent = null; } };
    created.push({ mesh, geometry });
    return { mesh, geometry };
  };
  return { owner: createSpatialFragmentDisplayOwner({ parent, createDisplay }), created };
}
function source(extra = {}) {
  return { id: "cat", part: "body", display: { zIndex: 0 }, contains: point => point.x < 119,
    picture: { texture: { width: 40, height: 20, source: {} }, anchor: { x: .5, y: 1 }, screen: { x: 100, y: 80 }, sprite: { visible: true, alpha: 1 } }, ...extra };
}
const left = [{x:80,y:60},{x:100,y:60},{x:100,y:80},{x:80,y:80}];
const right = [{x:100,y:60},{x:120,y:60},{x:120,y:80},{x:100,y:80}];
const piece = (sourceRecord, name, clip = left) => ({ id: sourceRecord.id, part: `body.fragment.${name}`, target: sourceRecord.id, fragment: { sourceRecord, clip } });

test("fragment fans retain original frame-local UVs and alpha/clip picking", () => {
  const {owner,created}=setup(), original=source();
  const a=piece(original,"left"), b=piece(original,"right",right);
  const result=owner.update([a,b]);
  assert.equal(result.changed,true);
  assert.deepEqual(created[0].geometry.positions,[80,60,100,60,100,80,80,80]);
  assert.deepEqual(created[0].geometry.uvs,[0,0,.5,0,.5,1,0,1]);
  assert.deepEqual(created[0].geometry.indices,[0,1,2,0,2,3]);
  assert.deepEqual(created[1].geometry.uvs,[.5,0,1,0,1,1,.5,1]);
  assert.equal(created[0].mesh.texture,original.picture.texture);
  assert.equal(result.records[0].target,"cat");
  assert(result.records[0].contains({x:90,y:70}));
  assert(!result.records[0].contains({x:110,y:70}));
  assert(!result.records[1].contains({x:119.5,y:70}));
  assert.equal(original.picture.sprite.visible,false);
  result.records[0].display.zIndex=4; result.records[1].display.zIndex=8;
  owner.syncOverlays(); assert.equal(original.display.zIndex,8.5);
  assert.equal(owner.update([a,b]).changed,false);
  assert.equal(created.length,2);
  owner.dispose(); assert.equal(original.picture.sprite.visible,true);
});

test("whole to split to whole restores borrowed sprite and destroys only owned buffers", () => {
  const {owner,created}=setup(), original=source();
  assert.equal(owner.update([original]).records[0],original);
  owner.update([piece(original,"a"),piece(original,"b",right)]);
  const whole=owner.update([original]);
  assert(whole.changed); assert.equal(whole.records[0],original);
  assert.equal(original.picture.sprite.visible,true); assert.equal(owner.size,0);
  for(const {mesh,geometry} of created){assert(mesh.destroyed);assert(geometry.destroyed);assert.deepEqual(mesh.options,{texture:false,textureSource:false});}
  assert.equal(original.picture.texture.destroyed,undefined);
  assert.equal(owner.update([original]).changed,false);
  owner.dispose(); owner.dispose();
  assert.throws(()=>owner.update([]),/disposed/);
});

test("retained meshes refresh changed geometry, texture and source references", () => {
  const {owner,created}=setup(), first=source();
  owner.update([piece(first,"a")]);
  const next=source({ contains:()=>false });
  next.picture.screen.x=102;
  const clip=left.map(p=>({x:p.x+2,y:p.y}));
  const result=owner.update([piece(next,"a",clip)]);
  assert(result.changed); assert.equal(created.length,1);
  assert.equal(result.records[0].display,created[0].mesh);
  assert.equal(created[0].mesh.texture,next.picture.texture);
  assert.equal(created[0].geometry.positions[0],82);
  assert(!result.records[0].contains({x:90,y:70}));
  assert.equal(first.picture.sprite.visible,true);
  assert.equal(next.picture.sprite.visible,false);
  next.picture.sprite.visible=true; // authoritative actor update runs first
  assert.equal(owner.update([piece(next,"a",clip)]).changed,false);
  assert.equal(next.picture.sprite.visible,false);
  owner.clear(); assert.equal(next.picture.sprite.visible,true); assert.equal(owner.size,0);
});

test("removal/clear tolerates destroyed borrowed sprites and retains no old fragments", () => {
  const {owner,created}=setup(), original=source();
  owner.update([piece(original,"a")]);
  original.picture.sprite.destroyed=true;
  Object.defineProperty(original.picture.sprite,"visible",{set(){throw new Error("destroyed sprite mutated");}});
  assert.equal(owner.update([]).changed,true);
  assert.equal(owner.size,0); assert(created[0].mesh.destroyed);
  owner.clear(); owner.dispose();
});

test("invalid geometry is rejected before hiding a borrowed sprite", () => {
  const {owner}=setup(), original=source();
  assert.throws(()=>owner.update([piece(original,"a",[{x:0,y:0},{x:1,y:0},{x:0,y:1}])]),/escaped/);
  assert.equal(original.picture.sprite.visible,true);
  assert.throws(()=>owner.update([piece(original,"a"),piece(original,"a")]),/duplicate/);
  assert.equal(original.picture.sprite.visible,true);
  owner.dispose();
});
