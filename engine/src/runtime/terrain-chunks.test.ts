import test from "node:test";
import assert from "node:assert/strict";
import { parseTerrainChunkReply, terrainBaselineSchema } from "./terrain-chunks";

const request={requestId:1,epoch:0,terrainRevision:2,chunks:[[0,0,0]] as [number, number, number][]};
const surface={cell:[0,12,0],material:1,generatedTop:12,cover:{kind:"grass",condition:"green",height:"short"}};
const chunk={key:[0,0,0],min:[0,0,0],max:[1,8,1],columns:[{x:0,z:0,runs:[{minY:0,maxY:8,material:1}]}],surfaces:[surface]};
const ready={kind:"ready",requestId:1,epoch:0,terrainRevision:2,chunks:[chunk]};

test("surface-bearing chunk protocol rejects old formats and keeps vertical-external top metadata",()=>{
  const parsed=parseTerrainChunkReply(ready,request);assert.equal(parsed.kind,"ready");
  if(parsed.kind!=="ready")return;
  assert.deepEqual(parsed.chunks[0].surfaces,[surface]);
  const {surfaces:_,...old}=chunk;
  assert.throws(()=>parseTerrainChunkReply({...ready,chunks:[old]},request));
  assert.throws(()=>terrainBaselineSchema.parse({protocolVersion:2,bounds:{minX:0,maxX:1,minY:0,maxY:8,minZ:0,maxZ:1},verticalMetres:.54,materials:[{slot:1,solid:true}]}));
});

test("chunk surface facts require matching unique columns and consistent repeated metadata",()=>{
  assert.throws(()=>parseTerrainChunkReply({...ready,chunks:[{...chunk,surfaces:[surface,surface]}]},request),/unique/);
  assert.throws(()=>parseTerrainChunkReply({...ready,chunks:[{...chunk,surfaces:[{...surface,cell:[2,12,0]}]}]},request),/outside/);
  const upper={...chunk,key:[0,1,0],min:[0,8,0],max:[1,16,1],columns:[{x:0,z:0,runs:[{minY:8,maxY:16,material:1}]}]};
  const request2={...request,chunks:[[0,0,0],[0,1,0]] as [number, number, number][]};
  assert.equal(parseTerrainChunkReply({...ready,chunks:[chunk,upper]},request2).kind,"ready");
  assert.throws(()=>parseTerrainChunkReply({...ready,chunks:[chunk,{...upper,surfaces:[]}]},request2),/disagrees/);
  assert.throws(()=>parseTerrainChunkReply({...ready,chunks:[chunk,{...upper,surfaces:[{...surface,cover:{...surface.cover,height:"full"}}]}]},request2),/disagrees/);
});
