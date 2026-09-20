// Reproduction of the inline source-geometry probe run as run-u2503.
// This establishes an ordering counterexample, not baked-pixel visibility or
// attribution of the user's screenshot. No application state is modified.
const repo = process.argv[2] ?? '/home/levi/src/hive-worktrees/living-terrain-integration';
const { grassCover } = await import(`${repo}/src/art/living-terrain.js`);
const { createOrderingProjection } = await import(`${repo}/engine/src/client/ordering-projection.js`);
const { compileVoxelDrawStream } = await import(`${repo}/engine/src/client/voxel-draw-stream.js`);
const { terrainCoverRecords } = await import(`${repo}/engine/src/client/terrain-visibility.js`);
const { createTerrainFaceAppearance } = await import(`${repo}/engine/src/client/terrain-face-appearance.js`);
const projection=createOrderingProjection(), h=.54, toward=Object.fromEntries(Object.entries(projection.direction).map(([k,v])=>[k,-v]));
const appearance=createTerrainFaceAppearance({pack:{body:()=>({}),cover:()=>({})}});
const surfaces=[[0,0,0],[1,0,1],[0,0,1]].map(cell=>({cell,cover:{kind:'grass',condition:'green',height:'full'}}));
const cover=terrainCoverRecords(surfaces,{level:1,projection,appearance,verticalMetres:h}).find(r=>r.id==='cover:0:0:0:grass:green:full');
const bank={id:'terrain:1,1,0:top',part:'face',renderPass:'opaque',attachment:{kind:'cell-face',cell:[1,1,0],face:'top'}};
const scene=grassCover({mask:cover.mask,variant:0,height:'full'});
const witnesses=[];
scene.traverse(mesh=>{
 const positions=mesh.geometry?.attributes?.position;
 if(!positions)return;
 for(let i=0;i<positions.count;i++){
  const p={x:positions.getX(i)+.5,y:positions.getY(i)+.27,z:positions.getZ(i)+.5};
  const t=(.81-p.y)/toward.y;
  const q={x:p.x+t*toward.x,y:.81,z:p.z+t*toward.z};
  if(t>0 && p.x<.49 && p.z<.49 && q.x>.51 && q.x<1.49 && q.z>-.49 && q.z<.49){
   const a=projection.project(p),b=projection.project(q);
   witnesses.push({grassPoint:p,nearBankPoint:q,pixelDistance:Math.hypot(a.x-b.x,a.y-b.y)});
  }
 }
});
const compiled=compileVoxelDrawStream([cover,bank],{direction:projection.direction,verticalMetres:h});
console.log(JSON.stringify({mask:cover.mask,source:'actual grassCover mask13 variant0 vertices; production terrainCoverRecords; actual canonical camera',order:compiled.records.map(r=>r.id),insertion:compiled.trace.map(t=>({record:t.record,key:t.insertion[0]})),witnessCount:witnesses.length,witness:witnesses[0]},null,2));
scene.traverse(o=>o.geometry?.dispose());
