import assert from "node:assert/strict";
import test from "node:test";
import { camera } from "../../../src/art/prop-camera.js";
import { createOrderingProjection } from "./ordering-projection.js";
import { compileSpatialDrawOrder } from "./spatial-draw-order.js";
import { createSpatialRenderFixture } from "./spatial-render-fixture.js";
import { createSpatialSceneOwner } from "./spatial-scene-owner.js";

const face = (id, x = 0, z = 0) => ({ id, orderGeometry: { kind: "face", points:
  [[x-.5,0,z-.5],[x+.5,0,z-.5],[x+.5,0,z+.5],[x-.5,0,z+.5]].map(([x,y,z]) => ({x,y,z})) } });
const actor = (x, z = 0) => ({ id: "actor", orderGeometry: { kind: "volume",
  min: {x:x-.2,y:0,z:z-.2}, max: {x:x+.2,y:1,z:z+.2} }, supportY:0 });
function projection(turn = 0) {
  const view = camera(320, 240, 0), [x,z] = [[1,1],[-1,1],[-1,-1],[1,-1]][turn];
  view.position.x *= x; view.position.z *= z; view.lookAt(0,0,0);
  return createOrderingProjection(view,320,240);
}

test("retained graph matches full rebuild through camera, membership and actor changes", () => {
  for (let turn=0; turn<4; turn++) {
    const view=projection(turn), owner=createSpatialSceneOwner({projection:view});
    let supplies=0;
    for (let revision=0; revision<3; revision++) {
      const statics=Array.from({length:12-revision},(_,i)=>face(`ground:${i}`,i-5));
      for (const x of [-5,-2,0,2,5]) {
        const moving=actor(x), input={revision,staticRecords:()=>{supplies++;return statics;},dynamicRecords:[moving]};
        const result=owner.update(input), oracle=compileSpatialDrawOrder([...statics,moving],{projection:view});
        assert.deepEqual(result.records,oracle.records);
        if (x!==-5) assert.equal(result.metrics.staticFaceComparisons,0);
      }
    }
    assert.equal(supplies,3);
    assert.equal(owner.metrics().counts.staticRebuild,3);
  }
});

test("refreshes preserve current painting/picking references and reject stale geometry", () => {
  const owner=createSpatialSceneOwner({projection:projection()}), ground=face("ground"), display={};
  const update={revision:1,staticRecords:()=>[ground]};
  owner.update(update);
  const refreshed={...ground,display,contains:()=>true,target:"current"};
  const result=owner.update({...update,currentStaticRecords:[refreshed]});
  assert.equal(result.records[0],refreshed); assert.equal(result.applyOrderRequired,true);
  assert.equal(owner.pick({x:0,y:0}).record,refreshed);
  assert.equal(owner.update(update).applyOrderRequired,false);
  const changed={...face("ground",2),contains:()=>true};
  assert.throws(()=>owner.update({...update,currentStaticRecords:[changed]}),/without a revision/);
  assert.equal(owner.pick({x:0,y:0}).record,refreshed);
  const accepted=owner.update({revision:2,staticRecords:()=>[changed]});
  assert.equal(accepted.staticRebuilt,true); assert.equal(owner.pick({x:0,y:0}).record,changed);
  owner.reset(); assert.equal(owner.pick({x:0,y:0}).record,null);
  assert.equal(owner.update(update).staticRebuilt,true);
});

test("retained ordering checks dynamic contacts, cycles, duplicate identities and failed revisions", () => {
  const owner=createSpatialSceneOwner({projection:projection()}), ground=face("ground");
  ground.contactSurface=ground.orderGeometry.points;
  const moving={...actor(0),support:{id:"ground",point:{x:0,y:0,z:0}}};
  const update={revision:1,staticRecords:()=>[ground],dynamicRecords:[moving]};
  assert.deepEqual(owner.update(update).records,[ground,moving]);
  assert.throws(()=>owner.update({...update,dynamicRecords:[{...moving,support:{id:"actor",point:{x:0,y:0,z:0}}}]}),/self-support/);
  assert.throws(()=>owner.update({...update,dynamicRecords:[{...moving,support:{id:"ground",point:{x:2,y:0,z:0}}}]}),/outside/);
  assert.throws(()=>owner.update({...update,dynamicRecords:[ground]}),/duplicate/);
  const a=face("a"),b=face("b");
  for (const record of [a,b]) record.contactSurface=record.orderGeometry.points;
  a.support={id:"b",point:{x:0,y:0,z:0}};b.support={id:"a",point:{x:0,y:0,z:0}};
  assert.throws(()=>owner.update({...update,dynamicRecords:[a,b]}),/cycle/);
  assert.throws(()=>owner.update({...update,revision:2,staticRecords:()=>[a,b]}),/cycle/);
  assert.equal(owner.update(update).staticRebuilt,false);
});

test("moving records update hit state without reapplying unchanged display order", () => {
  const owner=createSpatialSceneOwner({projection:projection()}), ground=face("ground"), display={};
  const update={revision:1,staticRecords:()=>[ground]};
  owner.update({...update,dynamicRecords:[{...actor(0),display,contains:()=>true,target:"old"}]});
  const current={...actor(.01),display,contains:()=>true,target:"new",pickable:false};
  const result=owner.update({...update,dynamicRecords:[current]});
  assert.equal(result.applyOrderRequired,false);
  assert.equal(owner.pick({x:0,y:0}).record,current);
  assert.equal(owner.pick({x:0,y:0}).occluded,true);
  assert.equal(owner.update(update).applyOrderRequired,true);
});

test("ordinary frames retain static comparisons and bounded timing history", () => {
  let clock=0;
  const owner=createSpatialSceneOwner({projection:projection(),clock:()=>clock++});
  const statics=Array.from({length:120},(_,i)=>face(`ground:${i}`,i*20));
  let supplies=0;
  const update={revision:1,staticRecords:()=>{supplies++;return statics;},dynamicRecords:[actor(0)]};
  owner.update(update);
  for(let i=0;i<520;i++) {
    const result=owner.update(update);
    assert.equal(result.metrics.staticFaceComparisons,0);
    assert(result.metrics.candidateVisits<10);
    assert(result.metrics.faceComparisons<10);
  }
  assert.equal(supplies,1);
  assert.equal(owner.measureApplyOrder(()=>42),42);
  const metrics=owner.metrics();
  assert.equal(metrics.samples.dynamicInsertMs.length,512);
  assert.equal(metrics.counts.applyOrder,1);
  assert(metrics.times.applyOrderMs>0);
});


test("retained original grass, bank, bed, wall and stair scene agrees with full compiler", () => {
  for (let turn=0;turn<4;turn++) {
    const first=createSpatialRenderFixture({turn}), owner=createSpatialSceneOwner({projection:first.projection});
    const statics=first.records.filter(record=>record!==first.actor);
    let supplied=0;
    const update={revision:1,staticRecords:()=>{supplied++;return statics;}};
    const poses=[...Array.from({length:20},(_,i)=>({walk:i/2})),
      ...[0,.25,.5,.75,1].map(t=>({actorAt:{x:0,y:.27+2.16*t,z:3+2*t},supportPart:{id:"stair",part:"surface"}}))];
    for(const pose of poses) {
      const scene=createSpatialRenderFixture({turn,...pose});
      const result=owner.update({...update,dynamicRecords:[scene.actor]});
      const oracle=compileSpatialDrawOrder([...statics,scene.actor],{projection:first.projection});
      assert.deepEqual(result.records,oracle.records);
      assert(result.metrics.faceComparisons < oracle.metrics.faceComparisons);
      assert(result.metrics.candidateVisits < oracle.metrics.candidateVisits);
      if(!result.staticRebuilt) assert.equal(result.metrics.staticFaceComparisons,0);
    }
    assert.equal(supplied,1);
    const mown=createSpatialRenderFixture({turn,mown:true});
    const nextStatics=mown.records.filter(record=>record!==mown.actor);
    const result=owner.update({revision:2,staticRecords:()=>nextStatics,dynamicRecords:[mown.actor]});
    assert.deepEqual(result.records,compileSpatialDrawOrder(mown.records,{projection:first.projection}).records);
    assert.equal(result.staticRebuilt,true);
  }
});

test("unchanged geometry reuses topology and only refreshes current record slots", () => {
  const view=projection(); let projections=0;
  const observed={...view,project(point){projections++;return view.project(point);},ray(point){projections++;return view.ray(point);}};
  const owner=createSpatialSceneOwner({projection:observed});
  const ground=face("ground"), display={};
  const update={revision:1,staticRecords:()=>[ground]};
  const first=owner.update({...update,dynamicRecords:[{...actor(0),display}]});
  const before=owner.metrics().counts.topologyBuilds;
  projections=0;
  const current={...actor(0),display,contains:()=>true,target:"new animation frame"};
  const result=owner.update({...update,dynamicRecords:[current]});
  assert.equal(projections,0,"reuse must not prepare/project/check planes");
  assert.equal(result.records,first.records,"borrowed ordered view is retained");
  assert.equal(result.metrics.topologyReuses,1);
  assert.equal(result.metrics.topologyBuilds,0);
  assert.equal(owner.metrics().counts.topologyBuilds,before);
  assert.equal(result.applyOrderRequired,false);
  assert.equal(owner.pick({x:0,y:0}).record,current);
  const newDisplay={...current,display:{}};
  assert.equal(owner.update({...update,dynamicRecords:[newDisplay]}).applyOrderRequired,true);
  const animated={...actor(0),display,orderGeometry:{...actor(0).orderGeometry,max:{x:.2,y:1.1,z:.2}}};
  const changed=owner.update({...update,dynamicRecords:[animated]});
  assert.equal(changed.metrics.topologyBuilds,1);
  assert(projections>0);
  assert.throws(()=>owner.update({...update,dynamicRecords:[animated],currentStaticRecords:[face("ground",3)]}),/without a revision/);
  const empty=owner.update(update);
  assert.equal(empty.metrics.topologyBuilds,1);
  const emptyReuse=owner.update(update);
  assert.equal(emptyReuse.metrics.topologyReuses,1);
  assert.equal(empty.records,emptyReuse.records);
  const revision=owner.update({...update,revision:2});
  assert.equal(revision.staticRebuilt,true);
  assert.equal(revision.metrics.staticWork.topologyBuilds,1);
  assert(owner.metrics().times.orderReuseMs>=0);
});

test("zero-dynamic reuse refreshes static display and hit references without topology", () => {
  const owner=createSpatialSceneOwner({projection:projection()}), ground=face("ground");
  const update={revision:1,staticRecords:()=>[ground]};
  const first=owner.update(update);
  const refreshed={...ground,display:{},contains:()=>true,target:"refreshed ground"};
  const next=owner.update({...update,currentStaticRecords:[refreshed]});
  assert.equal(next.records,first.records);
  assert.equal(next.metrics.topologyReuses,1);
  assert.equal(next.applyOrderRequired,true);
  assert.equal(owner.pick({x:0,y:0}).record,refreshed);
  assert.equal(owner.update(update).applyOrderRequired,false);
});

test("reuse preserves strict composite token identity rather than serialized similarity", () => {
  const owner=createSpatialSceneOwner({projection:projection()}), token={};
  const a={id:"a",compositePartition:token,orderGeometry:{kind:"volume",min:{x:0,y:0,z:0},max:{x:2,y:1,z:1}}};
  const b={id:"b",compositePartition:token,orderGeometry:{kind:"volume",min:{x:1,y:.2,z:-1},max:{x:1.5,y:2,z:2}}};
  const update={revision:1,staticRecords:()=>[],dynamicRecords:[a,b]};
  owner.update(update);
  assert.throws(()=>owner.update({...update,dynamicRecords:[a,{...b,compositePartition:{}}]}),/interleave/);
  assert.equal(owner.update(update).metrics.topologyReuses,1);
});

test("membership revisions reuse unchanged geometry and relations with full-compiler parity", () => {
  for(let turn=0;turn<4;turn++) {
    const view=projection(turn), owner=createSpatialSceneOwner({projection:view});
    const tiles=Array.from({length:24},(_,i)=>face(`tile:${i}`,i-12));
    const cover=tiles.map(tile=>({...tile,id:`cover:${tile.id}`,surfaceOrder:1}));
    let totalVisits=0, oracleVisits=0, revision=0;
    for(const offset of [0,1,2,3,4,5,4,3,2,1,0]) {
      const statics=[...tiles.slice(offset,offset+16),...cover.slice(offset,offset+16)];
      const moving=actor(offset-5);
      const result=owner.update({revision:++revision,staticRecords:()=>statics,dynamicRecords:[moving]});
      const oracle=compileSpatialDrawOrder([...statics,moving],{projection:view});
      assert.deepEqual(result.records,oracle.records);
      totalVisits+=result.metrics.staticWork.candidateVisits;
      oracleVisits+=oracle.metrics.candidateVisits;
      if(revision>1) {
        assert.equal(result.metrics.staticWork.preparedReused,30);
        assert.equal(result.metrics.staticWork.preparedNew,2);
        assert(result.metrics.staticWork.relationsReused>0);
      }
    }
    assert(totalVisits<oracleVisits/2,`${totalVisits} retained vs ${oracleVisits} oracle candidate visits`);
  }
});

test("geometry/contact changes invalidate membership reuse and failed revisions preserve painted references", () => {
  const view=projection(),owner=createSpatialSceneOwner({projection:view});
  const ground=face("ground"), cover={...face("cover"),surfaceOrder:1,contains:()=>true,target:"old"};
  const initial=owner.update({revision:1,staticRecords:()=>[ground,cover]});
  const display={};
  const refreshed={...cover,display,contains:()=>true,target:"new"};
  const second=owner.update({revision:2,staticRecords:()=>[ground,refreshed]});
  assert.equal(second.metrics.staticWork.preparedReused,2);
  assert.equal(second.metrics.staticWork.candidateVisits,0);
  assert.equal(second.records[1],refreshed);
  assert.equal(initial.records[1],cover,"a staged successor must not mutate prior borrowed views");
  assert.equal(owner.pick({x:0,y:0}).record,refreshed);
  const replacement={...face("cover",3),contains:()=>true};
  const changed=owner.update({revision:3,staticRecords:()=>[ground,replacement]});
  assert.equal(changed.metrics.staticWork.preparedNew,1);
  assert.deepEqual(changed.records,compileSpatialDrawOrder([ground,replacement],{projection:view}).records);
  const invalid={...replacement,support:{id:"missing",point:{x:3,y:0,z:0}}};
  assert.throws(()=>owner.update({revision:4,staticRecords:()=>[ground,invalid]}),/missing/);
  assert.equal(owner.pick({x:0,y:0}).record,replacement);
  const skippedRevision=owner.update({revision:3,staticRecords:()=>{throw new Error("must retain accepted revision");}});
  assert.equal(skippedRevision.staticRebuilt,false);
  // In-place geometry mutation across an explicit revision cannot evade the
  // captured signature merely because the record identity stayed the same.
  ground.orderGeometry.points=ground.orderGeometry.points.map(point=>({...point,y:.1}));
  assert.equal(owner.update({revision:5,staticRecords:()=>[ground,replacement]}).metrics.staticWork.preparedNew,1);
});

test("unchanged occupants revalidate changed/missing support and relation semantics", () => {
  const view=projection(),owner=createSpatialSceneOwner({projection:view});
  const a=face("a"), b=face("b");
  a.contactSurface=a.orderGeometry.points;b.contactSurface=b.orderGeometry.points;
  const occupant={...face("occupant"),support:{id:"a",point:{x:0,y:0,z:0}}};
  owner.update({revision:1,staticRecords:()=>[a,b,occupant]});
  const movedSupport={...occupant,support:{id:"b",point:{x:0,y:0,z:0}}};
  const next=owner.update({revision:2,staticRecords:()=>[a,b,movedSupport]});
  assert.equal(next.metrics.staticWork.preparedNew,1);
  assert.deepEqual(next.records,compileSpatialDrawOrder([a,b,movedSupport],{projection:view}).records);
  assert.throws(()=>owner.update({revision:3,staticRecords:()=>[a,movedSupport]}),/missing/);
  const invalidSurface={...b,contactSurface:b.contactSurface.map(point=>({...point,y:1}))};
  assert.throws(()=>owner.update({revision:4,staticRecords:()=>[a,invalidSurface,movedSupport]}),/outside/);
  assert.equal(owner.metrics().retained.staticRecords,3);
});

test("retained membership storage remains bounded to the current view and reset evicts it", () => {
  const owner=createSpatialSceneOwner({projection:projection()});
  for(let revision=0;revision<120;revision++) {
    const statics=Array.from({length:6},(_,i)=> {
      const tile=face(`tile:${revision*6+i}`,i*20);
      return [tile,{...tile,id:`cover:${tile.id}`,surfaceOrder:1}];
    }).flat();
    const result=owner.update({revision,staticRecords:()=>statics,dynamicRecords:[actor(0)]});
    const retained=owner.metrics().retained;
    assert.equal(retained.staticRecords,12);
    assert.equal(retained.dynamicRecords,1);
    assert.equal(retained.currentRecords,13);
    assert.equal(retained.staticRelations,6);
    assert(retained.staticBins<100);
    assert.equal(result.metrics.staticWork.preparedNew,12,"evicted members must not survive in a history cache");
  }
  owner.reset();
  assert.deepEqual(owner.metrics().retained,{staticRecords:0,staticRelations:0,staticBins:0,dynamicRecords:0,currentRecords:0});
});
