import test from 'node:test';
import assert from 'node:assert/strict';
import { createVolume, createVolumeGeometry, compensatedSum } from './index.js';

function ledge({coefficient=.5, upperMass=270, lowerMass=0, conductivity=1e-4}={}) {
  const soil={id:'declared-ledge-loam',thetaR:.05,porosity:.45,alphaPerM:2,n:2,
    ksMPerS:conductivity,ell:.5,minHeadM:-4,maxHeadM:8,densityKgM3:1000};
  const descriptor={regionId:'connected-ledge',revision:0,spacingM:[1,.54,1],exterior:'closed',
    definitions:[soil],cells:[[0,0,0],[0,-1,0],[1,-1,0]].map(at=>({at,soilId:soil.id})),
    reservoirs:[{id:'upper',kind:'vented-pit',at:[0,1,0],heightCells:2,bottom:'porous'},
      {id:'lower',kind:'vented-pit',at:[1,0,0],heightCells:3,bottom:'porous'}],
    ports:[{cell:[0,0,0],side:'y+',reservoirId:'upper'},
      {cell:[1,-1,0],side:'y+',reservoirId:'lower'},
      {cell:[0,0,0],side:'x+',reservoirId:'lower'}],
    closedFaces:[],surfaceEdges:[{left:'upper',right:'lower',coefficient}]};
  const geometry=createVolumeGeometry(descriptor), owner=createVolume(descriptor);
  const state=owner.initial({stocks:geometry.nodes.map(node=>({nodeId:node.id,
    massKg:node.kind==='soil'?node.maxMassKg:node.reservoirId==='upper'?upperMass:lowerMass}))});
  return {descriptor,geometry,owner,state};
}
const stock=(owner,state,id)=>owner.read(state).nodes.find(n=>n.nodeId===`reservoir:${id}`);
function conserved(before,after) {
  assert.ok(Math.abs(compensatedSum(after.massKg)-compensatedSum(before.massKg))<2e-9);
}

test('real0.54m ledge drains downhill through one paired surface edge',()=>{
  const {owner,state,geometry}=ledge(), frozen=JSON.stringify(state);
  const result=owner.advance(state,2,{dtMaxS:.1});
  assert.equal(JSON.stringify(state),frozen);
  const edge=geometry.faces.findIndex(f=>f.kind==='surface');
  assert.equal(geometry.faces[edge].crestM,.54);
  assert.ok(result.receipt.faceTransferKg[edge]>0);
  assert.ok(stock(owner,result.state,'upper').massKg<270);
  assert.ok(stock(owner,result.state,'lower').massKg>0);
  assert.equal(result.receipt.maxAbsMetrics.chordDifferenceKg,0);
  conserved(state,result.state);
});

test('receiving water occupies real stacked air voxels and survives exact reconstruction',()=>{
  const {owner,state,descriptor}=ledge({upperMass:1000,lowerMass:500});
  const halfway=owner.advance(state,2,{dtMaxS:.1});
  const fresh=createVolume(JSON.parse(JSON.stringify(owner.geometry)));
  const restored=fresh.decode(owner.encode(halfway.state));
  const resumed=fresh.advance(restored,2,{dtMaxS:.1});
  const continuous=owner.advance(halfway.state,2,{dtMaxS:.1});
  assert.deepEqual(resumed.state,continuous.state);
  const low=stock(fresh,resumed.state,'lower');
  assert.equal(low.heightCells,3); assert.equal(low.capacityKg,1620);
  assert.ok(low.depthM>.54 && low.depthM<=1.62);
  conserved(state,resumed.state);
  const truncated=structuredClone(descriptor);truncated.reservoirs[1].heightCells=1;
  assert.throws(()=>createVolume(truncated),/open vertical interval/);
  const shorter=structuredClone(descriptor);shorter.reservoirs[1].heightCells=2;
  assert.throws(()=>createVolume(shorter),/share one modeled rim/);
  const taller=structuredClone(descriptor);taller.reservoirs[0].heightCells=3;
  assert.throws(()=>createVolume(taller),/share one modeled rim/);
});

test('closed surface connection retains exact zero constitutive and closure transfer',()=>{
  const {owner,state,geometry}=ledge({coefficient:0});
  const next=owner.advance(state,2,{dtMaxS:.1});
  const edge=geometry.faces.findIndex(f=>f.kind==='surface');
  assert.equal(next.receipt.faceTransferKg[edge],0);
  for(const step of next.receipt.steps) {
    assert.equal(step.ledger.constitutiveTransferKg[edge],0);
    assert.equal(step.ledger.treeCorrectionKg[edge],0);
  }
  conserved(state,next.state);
});

test('equal surfaces and subcrest water do not cross the ledge; reversed head reverses discharge',()=>{
  for(const setup of [{upperMass:270,lowerMass:810},{upperMass:0,lowerMass:270}]) {
    const {owner,state,geometry}=ledge(setup);
    const result=owner.advance(state,.2,{dtMaxS:.1});
    const edge=geometry.faces.findIndex(f=>f.kind==='surface');
    assert.equal(result.receipt.faceTransferKg[edge],0);
    for(const step of result.receipt.steps) assert.equal(step.ledger.treeCorrectionKg[edge],0);
    conserved(state,result.state);
  }
  const {owner,state,geometry}=ledge({lowerMass:1200});
  const result=owner.advance(state,.2,{dtMaxS:.1});
  const edge=geometry.faces.findIndex(f=>f.kind==='surface');
  assert.ok(result.receipt.faceTransferKg[edge]<0);
  assert.ok(stock(owner,result.state,'upper').massKg>270);
  conserved(state,result.state);
});

test('free drainage approaches an independent hydrostatic rating curve under refinement',()=>{
  // Declared nearly impermeable soil isolates overflow over this short interval;
  // the small remaining pore exchange is still included in the common ledger.
  const {owner,state}=ledge({conductivity:1e-8});
  const seconds=1, K=.5*Math.sqrt(9.81), expected=(.27**(-.5)+K*seconds/2)**(-2);
  const coarse=owner.advance(state,seconds,{dtMaxS:.1});
  const fine=owner.advance(state,seconds,{dtMaxS:.025});
  assert.equal(coarse.state.timeS,1); assert.equal(fine.state.timeS,1);
  const coarseError=Math.abs(stock(owner,coarse.state,'upper').depthM-expected);
  const fineError=Math.abs(stock(owner,fine.state,'upper').depthM-expected);
  assert.ok(fineError<coarseError*.4,`${fineError} did not refine from ${coarseError}`);
  assert.ok(fineError<.002,`drainage error${fineError}m`);
  conserved(state,fine.state);
});

test('current geometry rejects overlapping capacity, nonadjacent edges and absent side custody',()=>{
  const {descriptor}=ledge();
  const overlapping=structuredClone(descriptor); overlapping.reservoirs[1].at=[0,1,0];
  assert.throws(()=>createVolume(overlapping),/overlapping air voxels/);
  const missingSide=structuredClone(descriptor);missingSide.ports.pop();
  assert.throws(()=>createVolume(missingSide),/every adjacent porous cell/);
  const duplicated=structuredClone(descriptor); duplicated.surfaceEdges.push({...duplicated.surfaceEdges[0]});
  assert.throws(()=>createVolume(duplicated),/one connection/);
  assert.throws(()=>createVolume({...descriptor,version:'rigid-soil-voxel-pit-graph-v1'}),/descriptor version/);
  const reversed=structuredClone(descriptor);reversed.cells.reverse();reversed.reservoirs.reverse();reversed.ports.reverse();
  reversed.surfaceEdges=[{left:'lower',right:'upper',coefficient:.5}];
  assert.equal(createVolume(reversed).identity,createVolume(descriptor).identity);
});
