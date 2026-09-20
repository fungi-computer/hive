import test from "node:test";
import assert from "node:assert/strict";
import {parseTerrainRegionEvent,terrainRegionRequestSchema,terrainBaselineSchema,terrainChangeSchema} from "./terrain-regions";
const request={requestId:1,epoch:0,terrainRevision:2,level:4,regions:[[0,0]] as [number,number][]};
const surface={cell:[0,12,0],material:1,generatedTop:12,cover:{kind:"grass",condition:"green",height:"short"}};
const face={cell:[0,4,0],face:"top",material:1,cap:true};
const patch={key:[0,0],bounds:{minX:0,maxX:8,minZ:0,maxZ:8},faces:[face],surfaces:[surface]};
const identity={requestId:1,epoch:0,terrainRevision:2,level:4};
const event={kind:"patch",...identity,patch};

test("region protocol requires version four and retains exterior facts above a cut",()=>{
 const baseline={protocolVersion:4,bounds:{minX:0,maxX:8,minY:0,maxY:16,minZ:0,maxZ:8},verticalMetres:.54,materials:[{slot:1,solid:true}]};
 assert.equal(terrainBaselineSchema.parse(baseline).protocolVersion,4);
 for(const protocolVersion of [2,3])assert.throws(()=>terrainBaselineSchema.parse({...baseline,protocolVersion}));
 const parsed=parseTerrainRegionEvent(event,request);assert.equal(parsed.kind,"patch");if(parsed.kind!=="patch")return;
 assert.deepEqual(parsed.patch.surfaces,[surface]);
 assert.equal(parseTerrainRegionEvent({...event,patch:{...patch,faces:[],surfaces:[]}},request).kind,"patch","empty region is complete coverage");
 assert.throws(()=>terrainRegionRequestSchema.parse({...identity,chunks:[[0,0,0]]}));
 assert.throws(()=>parseTerrainRegionEvent({...event,kind:"ready",chunks:[]},request));
 assert.deepEqual(terrainChangeSchema.parse({kind:"changed-columns",revision:3,columns:[[-1,0]]}),{kind:"changed-columns",revision:3,columns:[[-1,0]]});
});

test("region requests and patches reject duplicate, unrequested and out-of-core geometry",()=>{
 assert.throws(()=>terrainRegionRequestSchema.parse({...request,regions:[[0,0],[0,0]]}),/duplicate/);
 assert.throws(()=>terrainRegionRequestSchema.parse({...request,regions:[]}));
 assert.throws(()=>terrainRegionRequestSchema.parse({...request,regions:Array.from({length:257},(_,x)=>[x,0])}));
 assert.throws(()=>parseTerrainRegionEvent({...event,patch:{...patch,faces:[face,face]}},request),/duplicate/);
 assert.throws(()=>parseTerrainRegionEvent({...event,patch:{...patch,faces:[{...face,cell:[8,4,0]}]}},request),/region face/);
 assert.throws(()=>parseTerrainRegionEvent({...event,patch:{...patch,key:[1,0],bounds:{minX:8,maxX:16,minZ:0,maxZ:8},faces:[],surfaces:[]}},request),/unrequested/);
 assert.throws(()=>parseTerrainRegionEvent({...event,patch:{...patch,faces:[{...face,cell:[0,5,0]}]}},request),/cut level/);
 assert.throws(()=>parseTerrainRegionEvent({...event,patch:{...patch,faces:[{...face,cell:[0,3,0]}]}},request),/cut level/);
 assert.throws(()=>parseTerrainRegionEvent({...event,patch:{...patch,faces:[{...face,face:"east"}]}},request),/region face/);
});

test("support halo allows boundary columns, rejects duplicate or wider facts",()=>{
 const halo=[{...surface,cell:[-1,12,-1]},{...surface,cell:[8,12,8]}];
 assert.equal(parseTerrainRegionEvent({...event,patch:{...patch,surfaces:halo}},request).kind,"patch");
 assert.throws(()=>parseTerrainRegionEvent({...event,patch:{...patch,surfaces:[surface,surface]}},request),/support halo/);
 assert.throws(()=>parseTerrainRegionEvent({...event,patch:{...patch,surfaces:[{...surface,cell:[9,12,0]}]}},request),/support halo/);
});

test("stream events preserve request and cut identity; only stale may name a newer world",()=>{
 for(const kind of ["complete","stale"] as const)assert.equal(parseTerrainRegionEvent({kind,...identity},request).kind,kind);
 assert.equal(parseTerrainRegionEvent({kind:"stale",...identity,epoch:1,terrainRevision:3},request).kind,"stale");
 for(const change of [{requestId:2},{level:5},{epoch:1},{terrainRevision:3}])assert.throws(()=>parseTerrainRegionEvent({...event,...change},request),/mismatch/);
 assert.throws(()=>parseTerrainRegionEvent({kind:"stale",...identity,level:5},request),/identity/);
 assert.throws(()=>parseTerrainRegionEvent({kind:"unavailable",...identity,reason:""},request));
});
