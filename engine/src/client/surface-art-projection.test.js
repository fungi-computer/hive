import assert from "node:assert/strict";
import test from "node:test";
import { createOrderingProjection } from "./ordering-projection.js";
import { createTerrainFaceAppearance } from "./terrain-face-appearance.js";
import { terrainCoverRecords } from "./terrain-visibility.js";
import { projectSupportedSurfaceArt } from "./surface-art-projection.js";

const projection = createOrderingProjection();
const appearance = createTerrainFaceAppearance({pack:{body:()=>({texture:null,uvs:[0,0,0,1,1,1,1,0]}),cover:()=>({texture:null,uvs:[0,0,0,1,1,1,1,0]})}});
const cells = [[0,0,0],[1,0,0],[1,0,1],[0,0,1]];
test("all dual-grid masks retain exactly their supported quarters when rectangles merge",()=>{
  for(let mask=1;mask<16;mask++) {
    const surfaces=cells.filter((_,i)=>mask&(1<<i)).map(cell=>({cell,cover:{kind:"grass",condition:"green",height:"full"}}));
    const patch=terrainCoverRecords(surfaces,{level:0,projection,appearance,verticalMetres:.54})
      .find(record=>record.id==="cover:0:0:0:grass:green:full");
    const pieces=projectSupportedSurfaceArt(patch,projection);
    let area=0;
    for(const {orderGeometry:{points}} of pieces) {
      area+=(points[2].x-points[0].x)*(points[2].z-points[0].z);
      assert(points.every(point=>point.y===.27));
    }
    assert.equal(area,mask.toString(2).replaceAll("0","").length/4);
    for(let i=0;i<4;i++) {
      const x=cells[i][0]===0?.25:.75,z=cells[i][2]===0?.25:.75;
      const covering=pieces.filter(({orderGeometry:{points:p}})=>x>p[0].x&&x<p[2].x&&z>p[0].z&&z<p[2].z);
      assert.equal(covering.length,mask&(1<<i)?1:0,`mask ${mask} quarter ${i}`);
    }
    if(mask===15)assert.equal(pieces.length,1,"full square needs one quad");
  }
});
