import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createVoxelWorld,worldIdentity,MATERIAL} from '../voxel-world.mjs';
import {compileGasSection,sectionCellCenter,assertCurrentSection} from '../section-geometry.mjs';
import {geometry,initial,advance} from '../../gas-heat/binding-checkpoint/solver.mjs';
import * as old from '../../gas-heat/metric-checkpoint/solver.mjs';
const assert=(ok,text)=>{if(!ok)throw new Error(text);};
const sha=text=>createHash('sha256').update(text).digest('hex');
const pins=()=>Object.fromEntries(['../voxel-world.mjs','../section-geometry.mjs','../../gas-heat/binding-checkpoint/solver.mjs'].map(name=>[name,sha(readFileSync(new URL(name,import.meta.url)))]));
const sourcePins=pins(),start=performance.now(),rows=[];
function check(name,fn){const t=performance.now();try{rows.push({name,status:'pass',...fn(),wallMs:performance.now()-t});}catch(error){rows.push({name,status:'fail',error:error.message,wallMs:performance.now()-t});throw error;}}
const identity=worldIdentity({worldId:'section-proof-world',spaceId:'surface',seed:'gas-section-v1'}),world=createVoxelWorld(identity);
try {
  check('cold describe and independent section geometry',()=>{
    const description=world.describe();description.identity.base.units.verticalMetres=99;
    assert(world.describe().identity.base.units.verticalMetres===.54,'describe leaks identity');
    const section=compileGasSection(world,{axis:'x',origin:{x:-18,y:-4,z:-9},columns:8,rows:8});
    const before=JSON.stringify(world.save()),at={x:-18,y:-4,z:-9},material=world.read(at);
    section.geometryInput.solid.splice(0);section.geometryInput.hz=27;
    assert(world.read(at)===material&&JSON.stringify(world.save())===before,'geometry mutation changed canonical world');
    return {worldUntouched:true,describeIndependent:true};
  });
  check('exact centers for both horizontal axes and negative origins',()=>{
    const output=[];
    for(const [axis,origin] of [['x',{x:-18,y:-4,z:-9}],['z',{x:-11,y:-5,z:-20}]]) {
      const section=compileGasSection(world,{axis,origin,columns:8,rows:8}),g=geometry(section.geometryInput);
      for(const [column,row] of [[0,0],[2,1],[7,7]]) {
        const center=sectionCellCenter(section,column,row),cell=g.cells[row*8+column],other=axis==='x'?'z':'x';
        assert(Math.abs(center[axis]-(origin[axis]+cell.x))<1e-12,'horizontal center');
        assert(Math.abs(center.y-(origin.y*.54+cell.z))<1e-12,'world y /solver z');
        assert(center[other]===origin[other]+.5,'one-voxel extrusion center');
        output.push({axis,column,row,center});
      }
      assert(g.metric.hx===1&&g.metric.hz===.54&&g.metric.depth===1&&g.volume===.54,'voxel metric');
    }
    return {output,volumeM3:.54};
  });
  check('generated solid mask, underground carve and stale state rejection',()=>{
    const x=-18,z=-9;let surface;
    for(let y=-64;y<64;y++)if(world.read({x,y,z})===MATERIAL.air){surface=y;break;}
    assert(Number.isInteger(surface)&&surface>=-60&&surface<=54,'bounded generated surface');
    const window={axis:'x',origin:{x,y:surface-4,z},columns:8,rows:10};
    const section=compileGasSection(world,window),solidSet=new Set(section.geometryInput.solid);
    let air=0,solid=0;
    for(let row=0;row<window.rows;row++)for(let col=0;col<window.columns;col++){
      const at={x:x+col,y:window.origin.y+row,z},expected=world.read(at)!==MATERIAL.air;
      assert(solidSet.has(row*window.columns+col)===expected,'generated voxel/mask index');
      if(expected)solid++;else air++;
    }
    assert(air>0&&solid>0,'actual terrain/air interface');
    const g=geometry(section.geometryInput),s=initial(g),r=advance(g,s,.1,{dtMax:.02});
    assert(r.state.velocity.every(v=>v===0)&&r.state.smoke.every(m=>m===0)&&r.state.heat.every(h=>h===0),'generated geometry rest');
    const at={x,y:surface-3,z},before=world.read(at);assert(before!==MATERIAL.air,'underground carve target');
    const edit=world.edit({expectedRevision:0,cells:[{...at,expectedMaterial:before,material:MATERIAL.air}]});
    assert(edit.ok&&world.read(at)===MATERIAL.air,'canonical carve');
    let staleRejected=false;try{assertCurrentSection(world,section);}catch{staleRejected=true;}
    assert(staleRejected,'stale section admitted');
    const next=compileGasSection(world,window),nextG=geometry(next.geometryInput),index=1*8;
    assert(!next.geometryInput.solid.includes(index)&&solidSet.has(index),'exact carved voxel index');
    let stateRejected=false;try{advance(nextG,r.state,.02);}catch{stateRejected=true;}
    assert(stateRejected,'pre-dig state admitted into changed air volume');
    // No initial(nextG), gas mass creation, or old-state transplant is performed.
    return {surface,air,solid,sampledCells:section.sampledCells,carvedCell:at,carvedIndex:index,
      beforeFaces:g.faces.length,afterFaces:nextG.faces.length,staleRejected,stateRejected,
      noPostDigQuantityInitialization:true};
  });
  check('same shape different domain rejection and exact continuation',()=>{
    const aWindow={axis:'x',origin:{x:-20,y:48,z:-10},columns:4,rows:4};
    const bWindow={...aWindow,origin:{x:13,y:48,z:8}};
    const cWindow={...aWindow,axis:'z'};
    const a=compileGasSection(world,aWindow),b=compileGasSection(world,bWindow),c=compileGasSection(world,cWindow);
    assert(a.geometryInput.solid.length===0&&b.geometryInput.solid.length===0&&c.geometryInput.solid.length===0,'matched all-air shapes');
    const other=createVoxelWorld(worldIdentity({worldId:'another-world',spaceId:'surface',seed:'gas-section-v1'}));
    const mirror=other.edit({expectedRevision:0,cells:world.save().changes.map(entry=>({x:entry.x,y:entry.y,z:entry.z,
      expectedMaterial:other.read(entry),material:entry.material}))});
    assert(mirror.ok&&other.describe().revision===world.describe().revision,'actual matching revision in another world');
    const d=compileGasSection(other,aWindow);
    const g=geometry(a.geometryInput),s=initial(g,2);
    const record=[];
    for(const [label,section,owner] of [['origin',b,world],['axis',c,world],['world',d,other]]) {
      assertCurrentSection(owner,section);const target=geometry(section.geometryInput);
      assert(g.faces.length===target.faces.length&&g.metric.volume===target.metric.volume,'equivalent local shape');
      let rejected=false;try{advance(target,s,.02);}catch(error){rejected=true;record.push({label,reason:error.message});}
      assert(rejected,`foreign ${label} field admitted`);
    }
    const restored=createVoxelWorld(identity,{checkpoint:world.save()}),again=compileGasSection(restored,aWindow);
    const one=advance(g,s,.1),two=advance(geometry(again.geometryInput),JSON.parse(JSON.stringify(s)),.1);
    assert(JSON.stringify(one)===JSON.stringify(two),'exact domain continuation');
    const oldA=old.geometry(a.geometryInput),oldB=old.geometry(b.geometryInput);
    const gap=oldA.identity===oldB.identity;
    assert(gap,'old local geometry gap not reproduced');
    const obsoleteAccepted=old.advance(oldB,old.initial(oldA),.02).state.time===.02;
    assert(obsoleteAccepted,'old missing-domain admission counterexample');
    for(const domainId of ['', '   ', null, 9]) {
      let rejected=false;try{geometry({...a.geometryInput,domainId});}catch{rejected=true;}assert(rejected,'invalid domain ID');
    }
    return {record,exactSameDomainContinuation:true,preservedMetricSourceReproducesGap:true,newDomainFence:true};
  });
  assert(JSON.stringify(sourcePins)===JSON.stringify(pins()),'source changed during qualification');
}finally {
  const result={sourcePins,proofSha256:sha(readFileSync(new URL(import.meta.url))),wallMs:performance.now()-start,
    rssBytes:process.memoryUsage().rss,rows,limits:['2D section with one-voxel extrusion','coarse global revision invalidates unrelated sections','no gas displacement or post-dig quantity creation','no 3D flow or world performance claim']};
  writeFileSync(new URL('result-v1.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
}
