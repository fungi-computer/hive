import { camera } from "../../../src/art/prop-camera.js";
import { building } from "../../../src/art/home.js";
import { figure } from "../../../src/art/figures.js";
import { edgeWallSegment } from "../../../src/art/edge-wall.js";
import { captureVisualVolume, translateVisualVolume } from "../../../src/art/ordering-geometry.js";
import { createOrderingProjection } from "./ordering-projection.js";
import { materialCoverage, terrainCoverRecords, terrainFaceRecords } from "./terrain-visibility.js";
import { createTerrainFaceAppearance } from "./terrain-face-appearance.js";
import { projectSurfaceArt } from "./surface-art-projection.js";
import { uprightDrawGeometry } from "./upright-draw-geometry.js";

export const SPATIAL_SCENE_SIZE = Object.freeze({width:384,height:256});
export const BED_WALK = Object.freeze([[1,1],[2,1],[3,1],[3,2],[3,3],[3,4],[2,4],[1,4],[1,3],[1,2]]);
const h=.54;
const sourceGeometry=new Map();
function visualVolume(key, build, origin, options) {
  if(!sourceGeometry.has(key)) {
    const source=build();
    try {sourceGeometry.set(key,captureVisualVolume(source,options));}
    finally {source.traverse(node=>node.geometry?.dispose());}
  }
  return translateVisualVolume(sourceGeometry.get(key),origin);
}

function snapshot() {
  const columns=[];
  for(let x=0;x<8;x++) for(let z=0;z<8;z++) {
    const height=x===5&&z===2?2:1;
    columns.push({x,z,runs:[{minY:0,maxY:height,material:1},{minY:height,maxY:8,material:0}]});
  }
  return materialCoverage({chunks:[{key:[0,0,0],min:[0,0,0],max:[8,8,8],columns}],
    palette:[{slot:0,solid:false},{slot:1,solid:true,art:"earth"}],
    bounds:{minX:0,maxX:8,minY:0,maxY:8,minZ:0,maxZ:8},verticalMetres:h,variantSeed:1,epoch:1,terrainRevision:1});
}

/** The four-cell mask still selects the original image. Each visible support
 * contributes its actual quarter of the surface, not a depth anchor. This is
 * fixture wiring of surface appearance; the ordering core sees only geometry.
 */
function coverSurfaces(record) {
  const root=record.attachment.point, surfaces=[];
  for(const cell of record.attachment.supports) {
    const left=Math.max(root.x-.5,cell[0]-.5), right=Math.min(root.x+.5,cell[0]+.5);
    const near=Math.max(root.z-.5,cell[2]-.5), far=Math.min(root.z+.5,cell[2]+.5);
    if(right<=left||far<=near)continue;
    surfaces.push({id:cell.join(","),points:[{x:left,y:root.y,z:near},{x:left,y:root.y,z:far},
      {x:right,y:root.y,z:far},{x:right,y:root.y,z:near}]});
  }
  return surfaces;
}

/** Small source-backed scene for the replacement core. No simulation effects,
 * generated art at runtime, renderer ownership or content-name sort policies.
 */
export function createSpatialRenderFixture({art,terrainPack,turn=0,walk=0,mown=false,actorAt,supportPart}={}) {
  const {width,height}=SPATIAL_SCENE_SIZE, view=camera(width,height,1.03);
  const [sx,sz]=[[1,1],[-1,1],[-1,-1],[1,-1]][turn];
  view.position.x=view.position.x*sx+3.5; view.position.z=view.position.z*sz+3.5;
  view.lookAt(3.5,1.03,3.5);
  const projection=createOrderingProjection(view,width,height);
  const appearance=createTerrainFaceAppearance({pack:terrainPack??{
    body:()=>({texture:null,uvs:[0,0,0,1,1,1,1,0]}),cover:()=>({texture:null,uvs:[0,0,0,1,1,1,1,0]})},turn});
  const terrain=terrainFaceRecords(snapshot(),{level:1,projection,appearance})
    .map(record=>({...record,orderGeometry:{kind:"face",points:record.planarCorners}}));
  const surfaces=[];
  for(let x=0;x<8;x++)for(let z=0;z<8;z++) {
    if((x===5&&z===2)||(z===1&&x<4)||(x===2&&(z===2||z===3)))continue;
    surfaces.push({cell:[x,0,z],cover:{kind:"grass",condition:"green",height:mown&&x>=4?"short":"full"}});
  }
  const patches=terrainCoverRecords(surfaces,{level:1,projection,appearance,verticalMetres:h,variantSeed:1});
  const cover=patches.flatMap(record=>projectSurfaceArt(record,coverSurfaces(record),projection));
  const point={x:2,y:h/2,z:2};
  const bed={id:"bed",part:"body",role:"structure",supportY:point.y,texture:art?.buildings.bed.finished[turn],anchor:art?.propAnchor,
    displayPoint:projection.project(point),orderGeometry:visualVolume("bed",()=>building("bed","finished"),point)};
  const walls=[3,4].map(z=>{
    const origin={x:5.5,y:h/2,z};
    return {id:`wall:${z}`,part:"body",role:"structure",supportY:origin.y,texture:art?.edgeWalls.segment.finished[turn%2],anchor:art?.propAnchor,
      displayPoint:projection.project(origin),orderGeometry:visualVolume("wall",()=>edgeWallSegment("finished","x"),origin)};
  });
  const stairOrigin={x:0,y:h/2,z:3}, stair=building("stair","finished"), stairs=[];
  try {
    const packed=art?.partsByOwner.get(JSON.stringify(["buildings","stair","finished",turn]));
    for(const part of stair.userData.staticParts) {
      stairs.push({id:"stair",part:part.id,role:"structure",compositePartition:"stair",supportY:stairOrigin.y,texture:packed?.find(p=>p.id===part.id)?.texture,
        anchor:art?.propAnchor,displayPoint:projection.project(stairOrigin),
        ...(part.role==="supporting-surface"?{contactSurface:part.geometry.footprint.map(([x,y,z])=>({x:x+stairOrigin.x,y:y+stairOrigin.y,z:z+stairOrigin.z}))}:{}),
        orderGeometry:translateVisualVolume(captureVisualVolume(part.group),stairOrigin)});
    }
  } finally {stair.traverse(node=>node.geometry?.dispose());}
  const route=BED_WALK, phase=((walk%route.length)+route.length)%route.length, index=Math.floor(phase), t=phase-index;
  const a=route[index],b=route[(index+1)%route.length], feet=actorAt??{x:a[0]+(b[0]-a[0])*t,y:h/2,z:a[1]+(b[1]-a[1])*t};
  const actor={id:"actor",part:"body",role:"actor",supportY:feet.y,texture:art?.figures["goblin-worker"].idle[turn][0],anchor:art?.pawnAnchor,
    displayPoint:projection.project(feet),feet,...(supportPart?{support:{...supportPart,point:feet}}:{}),
    orderGeometry:uprightDrawGeometry(visualVolume("worker:idle",()=>figure("goblin-worker",0,0,"idle"),feet,{silhouette:true}),feet,projection)};
  return {projection,terrain,cover,patches,bed,walls,stairs,actor,records:[...terrain,...cover,bed,...walls,...stairs,actor],surfaces};
}
