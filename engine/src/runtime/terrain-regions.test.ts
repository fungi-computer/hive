import test from "node:test";
import assert from "node:assert/strict";
import {parseTerrainRegionEvent,terrainRegionRequestSchema,terrainBaselineSchema,terrainChangeSchema} from "./terrain-regions";
import {materialPatch} from "./terrain-region-fixture.js";
import {validateTerrainMaterialPatch} from "./terrain-region-materials.js";
const request={requestId:1,epoch:0,terrainRevision:2,regions:[[0,0,0]] as [number,number,number][]};
const baseline={protocolVersion:5,bounds:{minX:-1,maxX:9,minY:0,maxY:16,minZ:-1,maxZ:9},verticalMetres:.54,materials:[{slot:0,solid:false},{slot:1,solid:true}]};
const surface={cell:[0,12,0],material:1,generatedTop:12,cover:{kind:"grass",condition:"green",height:"short"}};
const patch={...materialPatch([0,0,0],baseline.bounds),surfaces:[surface]};
const identity={requestId:1,epoch:0,terrainRevision:2};
const event={kind:"patch",...identity,patch};

test("version five carries complete material coverage independent of cuts and exterior support height",()=>{
 assert.equal(terrainBaselineSchema.parse(baseline).protocolVersion,5);
 for(const protocolVersion of [2,3,4])assert.throws(()=>terrainBaselineSchema.parse({...baseline,protocolVersion}));
 const parsed=parseTerrainRegionEvent(event,request);assert.equal(parsed.kind,"patch");if(parsed.kind!=="patch")return;
 assert.deepEqual(parsed.patch.surfaces,[surface]);
 assert.equal(parsed.patch.columns.length,100,"air columns remain explicit known coverage");
 assert.throws(()=>terrainRegionRequestSchema.parse({...request,level:4}),/Unrecognized/);
 assert.throws(()=>parseTerrainRegionEvent({...event,patch:{...patch,faces:[]}},request),/Unrecognized/);
 assert.deepEqual(terrainChangeSchema.parse({kind:"changed-columns",revision:3,columns:[[-1,0]]}),{kind:"changed-columns",revision:3,columns:[[-1,0]]});
});

test("requests and patches reject duplicate, unrequested, missing and noncanonical material coverage",()=>{
 assert.throws(()=>terrainRegionRequestSchema.parse({...request,regions:[[0,0,0],[0,0,0]]}),/duplicate/);
 assert.throws(()=>terrainRegionRequestSchema.parse({...request,regions:[]}));
 assert.throws(()=>terrainRegionRequestSchema.parse({...request,regions:Array.from({length:257},(_,x)=>[x,0,0])}));
 assert.throws(()=>parseTerrainRegionEvent({...event,patch:materialPatch([1,0,0])},request),/unrequested/);
 assert.throws(()=>parseTerrainRegionEvent({...event,patch:{...patch,columns:patch.columns.slice(1)}},request),/incomplete/);
 const invalid=(runs:number[][])=>({...event,patch:{...patch,columns:patch.columns.map((c,i)=>i?c:{...c,runs})}});
 for(const runs of [[],[[15,0]],[[8,0],[16,0]],[[8,1],[7,0],[16,1]],[[17,0]]]) assert.throws(()=>parseTerrainRegionEvent(invalid(runs),request));
 assert.throws(()=>parseTerrainRegionEvent({...event,patch:{...patch,columns:[patch.columns[1],patch.columns[0],...patch.columns.slice(2)]}},request),/canonical/);
});

test("the baseline verifies exact clipped XYZ halo and palette, including slab identity",()=>{
 const checked=terrainBaselineSchema.parse(baseline);
 const parsed=parseTerrainRegionEvent(event,request);if(parsed.kind!=="patch")throw Error();
 validateTerrainMaterialPatch(parsed.patch,checked);
 assert.throws(()=>validateTerrainMaterialPatch({...parsed.patch,key:[0,0,1]},checked),/authoritative bounds/);
 assert.throws(()=>validateTerrainMaterialPatch({...parsed.patch,columns:parsed.patch.columns.map(c=>({...c,runs:[[16,65535]]}))},checked),/unknown slot/);
 const noHalo=materialPatch([0,0,0],{...baseline.bounds,minX:0});
 assert.throws(()=>validateTerrainMaterialPatch(noHalo as typeof parsed.patch,checked),/authoritative bounds/);
});

test("support halo permits boundary columns but rejects duplicated or wider facts",()=>{
 const halo=[{...surface,cell:[-1,12,-1]},{...surface,cell:[8,12,8]}];
 assert.equal(parseTerrainRegionEvent({...event,patch:{...patch,surfaces:halo}},request).kind,"patch");
 assert.throws(()=>parseTerrainRegionEvent({...event,patch:{...patch,surfaces:[surface,surface]}},request),/support halo/);
 assert.throws(()=>parseTerrainRegionEvent({...event,patch:{...patch,surfaces:[{...surface,cell:[9,12,0]}]}},request),/support halo/);
});

test("stream identity is world/request identity; only stale may name a newer world",()=>{
 for(const kind of ["complete","stale"] as const)assert.equal(parseTerrainRegionEvent({kind,...identity},request).kind,kind);
 assert.equal(parseTerrainRegionEvent({kind:"stale",...identity,epoch:1,terrainRevision:3},request).kind,"stale");
 for(const change of [{requestId:2},{epoch:1},{terrainRevision:3}])assert.throws(()=>parseTerrainRegionEvent({...event,...change},request),/mismatch/);
 assert.throws(()=>parseTerrainRegionEvent({kind:"stale",...identity,level:5},request),/Unrecognized/);
 assert.throws(()=>parseTerrainRegionEvent({kind:"unavailable",...identity,reason:""},request));
});
