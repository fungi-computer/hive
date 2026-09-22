import assert from "node:assert/strict";
import test from "node:test";
import { createMultipartVisualOwner, multipartOverlayZIndex, transformedPartGeometry, transformBakedPartPoint } from "./multipart-visual-owner.js";
import { Vector3 } from "three";
import { building } from "../../../src/art/home.js";

function sprite() {
  return { visible: false, anchor: { set() {} }, position: { set() {} }, scale: { set() {} }, destroy() { this.destroyed = true; } };
}

test("part geometry follows the real authored Three group in all baked facings", () => {
  for (const facing of [0, 1, 2, 3]) {
    const source = building("stair", "finished", facing);
    source.updateMatrixWorld(true);
    for (const part of source.userData.staticParts) {
      for (const [x, y, z] of part.geometry.footprint) {
        const actual = part.group.localToWorld(new Vector3(x, y, z));
        const resolved = transformBakedPartPoint({ x, y, z }, facing, { x: 7, y: 3, z: -5 }, [0.25, -0.5]);
        assert(Math.abs(resolved.x - actual.x - 7.25) < 1e-9);
        assert(Math.abs(resolved.y - actual.y - 3) < 1e-9);
        assert(Math.abs(resolved.z - actual.z + 5.5) < 1e-9);
      }
    }
    source.traverse(object => object.geometry?.dispose());
  }
});

test("multipart owner keeps sibling identities while resolving one entity target", () => {
  const children = [];
  const owner = createMultipartVisualOwner({ parent: { addChild(value) { children.push(value); } }, createSprite: sprite, emptyTexture: {} });
  const parts = [
    { id: "rail.left", role: "upright-boundary", texture: {}, geometry: { footprint: [[-1, 0, 0]], minY: 0, maxY: 2 } },
    { id: "rail.right", role: "upright-boundary", texture: {}, geometry: { footprint: [[1, 0, 0]], minY: 0, maxY: 2 } },
  ];
  const records = owner.sync({ entityId: "stair-1", parts, target: "stair-1", transform: (point) => point });
  assert.deepEqual(records.map(({ id, part, target }) => [id, part, target]), [["stair-1", "rail.left", "stair-1"], ["stair-1", "rail.right", "stair-1"]]);
  assert.equal(children.length, 2);
  assert.equal(transformedPartGeometry(parts[0], (point) => point).length, 2);
  assert.equal(transformedPartGeometry({ geometry: { footprint: [[0, 0, 0], [0, 2, 1]], minY: 0, maxY: 2 } }, (point) => point).length, 2);
  assert.equal(transformedPartGeometry({ geometry: { footprint: [[0, 0, 0]], minY: -1, maxY: 2 } }, (point) => point).length, 3);
  records[0].display.zIndex = 4;
  records[1].display.zIndex = 9;
  assert.equal(multipartOverlayZIndex(records), 9.5);
  owner.sync({ entityId: "stair-1", parts: [parts[1]], transform: (point) => point });
  assert.equal(children[0].destroyed, true);
  owner.dispose();
  assert.equal(children[1].destroyed, true);
  assert.throws(() => owner.sync({ entityId: "stair-1", parts: [] }), /disposed/);
});

test('multipart preparation retains old resources, stages new siblings and retires on publish', () => {
  const children = [], made = [];
  const createSprite = () => {
    const value = {x:0,y:0,visible:false,anchor:{set(){}},scale:{set(){}},destroy(){this.destroyed=true;}};
    value.position = {set(x,y){value.x=x;value.y=y;}}; made.push(value); return value;
  };
  const owner = createMultipartVisualOwner({parent:{addChild(value){children.push(value);}},createSprite});
  const a = {id:'a',texture:{},geometry:{footprint:[[0,0,0]]}}, b = {...a,id:'b'};
  const original = owner.sync({entityId:'entity',parts:[a,b],screen:{x:10,y:20}});
  const unchanged = owner.sync({entityId:'entity',parts:[a,b],screen:{x:10,y:20}});
  assert.equal(unchanged[0],original[0]); assert.equal(unchanged[1],original[1]);
  const task = owner.prepare({entityId:'entity',parts:[a,{...b,id:'new'}],screen:{x:50,y:60}});
  task.advance(); assert.equal(made.length,2); assert.equal(original[0].display.x,10);
  task.advance(); assert.equal(made.length,3); assert.equal(children.length,2);
  while(!task.ready) task.advance();
  assert.equal(task.records[1].display,made[2]); assert.equal(original[1].display.destroyed,undefined);
  task.cancel(); assert.equal(made[2].destroyed,true); assert.equal(original[0].display.destroyed,undefined);
  assert.equal(original[1].display.destroyed,undefined); assert.equal(task.records,undefined);
  const next = owner.prepare({entityId:'entity',parts:[a],screen:{x:50,y:60}});
  while(!next.ready) next.advance(); next.publish();
  assert.equal(original[0].display.x,50); assert.equal(original[1].display.destroyed,true);
  assert.equal(next.records[0].screen.x,50); assert(Object.isFrozen(next.records[0].footprint[0]));
  owner.dispose(); assert.equal(original[0].display.destroyed,true);
});

test('unchanged immutable part inputs retain geometry without repeating transforms', () => {
  const owner = createMultipartVisualOwner({parent:{addChild(){}},createSprite:sprite});
  const part = Object.freeze({id:'body',texture:{},geometry:{footprint:[[0,0,0],[1,0,0],[1,0,1]]}});
  let transforms = 0;
  const transform = point => { transforms++; return point; };
  const first = owner.sync({entityId:'entity',parts:[part],transform});
  assert.equal(transforms,3);
  const second = owner.sync({entityId:'entity',parts:[part],transform});
  assert.equal(second[0],first[0]); assert.equal(transforms,3);
  const third = owner.sync({entityId:'entity',parts:[part],transform:point=>({...point,x:point.x+2})});
  assert.notEqual(third[0],first[0]); assert.equal(third[0].footprint[0].x,2);
  owner.dispose();
});
