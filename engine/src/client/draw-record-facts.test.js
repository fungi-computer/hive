import test from "node:test";
import assert from "node:assert/strict";
import { stableKey, surfaceSubjectFromOrdered, storeyBandFor, subjectSortFootprint } from "./draw-record-facts.js";

test("storey conversion requires canonical vertical metres", () => {
  assert.equal(storeyBandFor({ y: 4 }, 2), 2);
  assert.equal(storeyBandFor({ y: 99, support: { level: 3 } }), 3);
  assert.throws(() => storeyBandFor({ y: 4 }), /positive vertical metres/);
});

test("canonical compact, bed, wall, and stair placement records become lawful footprints", () => {
  const subject = { x: 10, y: 4, z: 7 };
  assert.deepEqual(subjectSortFootprint(subject), [{ x: 10, y: 4, z: 7 }]);
  assert.deepEqual(subjectSortFootprint(subject, { kind: "footprint", alignedFootprint: [[0, 0], [1, 0]] }), [
    { x: 10, y: 4, z: 7 },
    { x: 11, y: 4, z: 7 },
  ]);
  assert.deepEqual(subjectSortFootprint(subject, { kind: "stair", entrance: [0, 0, 0], landing: [0, 2, -2] }), [
    { x: 10, y: 4, z: 7 },
    { x: 10, y: 6, z: 5 },
  ]);
  assert.deepEqual(subjectSortFootprint(subject, { kind: "edge", axis: "x", endpoints: [[0, -0.5], [0, 0.5]] }), [
    { x: 10, y: 4, z: 6.5 },
    { x: 10, y: 4, z: 7.5 },
  ]);
  assert.deepEqual(subjectSortFootprint(subject, { kind: "edge", axis: "z", endpoints: [[-0.5, 0], [0.5, 0]] }), [
    { x: 9.5, y: 4, z: 7 },
    { x: 10.5, y: 4, z: 7 },
  ]);
});

test("record identity includes part and retains the ordinary body default",()=>{
  assert.equal(stableKey({id:7}), stableKey({id:"7",part:"body"}));
  assert.notEqual(stableKey({id:"stair",part:"left"}),stableKey({id:"stair",part:"right"}));
});

test("support queries use existing order and logical multipart targets without reranking",()=>{
  const rear={id:"rear",surface:{height:0}}, front={id:"front",surface:{height:1}};
  const left={id:"left-piece",target:"front",part:"left"}, right={id:"right-piece",target:"front",part:"right"};
  const order=[rear,left,right], subjects=[rear,front], point={x:2,y:3};
  const calls=[];
  const resolve=(x,y,subject)=>{calls.push(subject.id);return {frame:subject.id,x,y};};
  assert.deepEqual(surfaceSubjectFromOrdered(order,subjects,point,resolve),
    {node:right,subject:front,surface:{frame:"front",x:2,y:3}});
  assert.deepEqual(calls,["front"]);
  assert.equal(surfaceSubjectFromOrdered([...order].reverse(),subjects,point,resolve).subject,rear);
  assert.equal(surfaceSubjectFromOrdered([rear,{...right,pickable:false}],subjects,point,resolve).subject,rear);
  assert.equal(surfaceSubjectFromOrdered([rear,{...right,visible:false}],subjects,point,resolve).subject,rear);
  assert.equal(surfaceSubjectFromOrdered(order,[rear,{...front,pickable:false}],point,resolve).subject,rear);
  assert.equal(surfaceSubjectFromOrdered(order,subjects,point,()=>null),null);
});
