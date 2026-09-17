import * as THREE from 'three';
import { Application, Container, Sprite, Texture } from 'pixi.js';
import { scene } from './geometry.js';
import { camera } from './prop-camera.js';
import { renderBakeCanvas } from './bake.js';
import { figure } from './figures.js';
import { grassCover, terrainBody } from './living-terrain.js';

const FRAME=64;
function canvas(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;return c;}
function enlarged(source,scale){const c=canvas(source.width*scale,source.height*scale);const ctx=c.getContext('2d');ctx.imageSmoothingEnabled=false;ctx.drawImage(source,0,0,c.width,c.height);return c;}
export async function authorLivingTerrain(){
  const renderer=new THREE.WebGLRenderer({alpha:true,antialias:false,preserveDrawingBuffer:true});
  renderer.setPixelRatio(1);renderer.setClearColor(0,0);renderer.outputColorSpace=THREE.SRGBColorSpace;
  const tiles=[];
  const entries=[];
  const atlas=canvas(16*FRAME,13*FRAME),ctx=atlas.getContext('2d');
  try{
    for(const kind of ['earth','stone'])for(let variant=0;variant<3;variant++)tiles.push({id:`${kind}/${variant}`,kind,variant,build:()=>terrainBody({kind,variant})});
    for(const condition of ['green','dead'])for(const height of ['short','full'])for(let variant=0;variant<3;variant++)for(let mask=0;mask<16;mask++)tiles.push({id:`grass/${condition}/${height}/${variant}/${mask}`,kind:'grass',condition,height,variant,mask,build:()=>grassCover({height,variant,mask,condition})});
    for(const [index,tile] of tiles.entries()){
      const s=scene();s.add(tile.build());
      const {canvas:tileCanvas,context}=renderBakeCanvas(renderer,s,camera(FRAME,FRAME,0),FRAME,FRAME,{ink:false});
      const data=context.getImageData(0,0,FRAME,FRAME).data;
      let count=0;
      for(let y=0;y<FRAME;y++)for(let x=0;x<FRAME;x++)if(data[(y*FRAME+x)*4+3]){
        count++;if(x===0||y===0||x===FRAME-1||y===FRAME-1)throw new Error(`Clipped tile: ${tile.id}`);
      }
      if(tile.mask!==0&&!count)throw new Error(`Empty tile: ${tile.id}`);
      const x=index%16*FRAME,y=Math.floor(index/16)*FRAME;
      ctx.drawImage(tileCanvas,x,y);
      const {build,...definition}=tile;
      entries.push({...definition,x,y,width:FRAME,height:FRAME,anchor:[32,32],visiblePixels:count,
        placement:{kind:'footprint',bakedFootprint:[[0,0]],rotationPivot:[0,0]},
        geometry:{footprint:[[-.5,0,-.5],[-.5,0,.5],[.5,0,.5],[.5,0,-.5]],minY:tile.kind==='grass'?0:-.54,maxY:tile.kind==='grass'?(tile.height==='short'?.13:.28):(tile.kind==='stone'?.08:.003)}});
    }
    const sheet=canvas(16*64,14*90),sc=sheet.getContext('2d');sc.fillStyle='#28382e';sc.fillRect(0,0,sheet.width,sheet.height);sc.font='12px monospace';
    for(const [conditionRow,condition] of ['green','dead'].entries())for(const [row,height] of ['short','full'].entries())for(let variant=0;variant<3;variant++)for(let mask=0;mask<16;mask++){
      const e=entries.find(t=>t.id===`grass/${condition}/${height}/${variant}/${mask}`),y=(conditionRow*6+row*3+variant)*90;
      sc.drawImage(atlas,e.x,e.y,64,64,mask*64,y+20,64,64);sc.fillStyle='#e1d7b5';sc.fillText(`${condition[0]}${height[0]}${variant} ${mask}`,mask*64+8,y+16);
    }
    for(const [i,e] of entries.filter(t=>t.kind!=='grass').entries())sc.drawImage(atlas,e.x,e.y,64,64,i*100+20,1110,64,64);
    const court=scene();
    const cells=new Map();
    for(let x=-6;x<=6;x++)for(let z=-5;z<=5;z++){
      const path=Math.abs(z-(Math.sin(x*.55)*1.05))<.9;
      const rock=x>2&&z<-1;
      const pit=x>=-3&&x<=-2&&z>=2&&z<=3;
      const level=pit?-.54:(x>=3&&z>=2?.54:0);
      const kind=rock?'stone':'earth';
      const body=terrainBody({kind,variant:Math.abs(x*7+z*3)%3});body.position.set(x,level,z);court.add(body);
      if(level>0){const support=terrainBody({kind});support.position.set(x,0,z);court.add(support);}
      cells.set(`${x},${z}`,{level,grass:!path&&!rock&&!pit,height:z<-1?'full':'short'});
    }
    for(let x=-7;x<=6;x++)for(let z=-6;z<=5;z++)for(const level of [0,.54])for(const height of ['short','full']){
      const neighbors=[[x,z],[x+1,z],[x+1,z+1],[x,z+1]].map(([a,b])=>cells.get(`${a},${b}`));
      const mask=neighbors.reduce((m,c,i)=>m|(c?.grass&&c.level===level&&c.height===height?1<<i:0),0);
      if(mask){const cover=grassCover({mask,height,variant:Math.abs(x*11+z*7)%3,condition:x<-3&&z<-2?'dead':'green'});cover.position.set(x+.5,level,z+.5);court.add(cover);}
    }
    for(const [x,z,direction] of [[-1,-2,.5],[1,1,-.5],[4,3,1]]){
      const f=figure('goblin',0,direction,'idle');
      for(const child of [...f.children])if(!child.isLight){child.position.add(new THREE.Vector3(x,cells.get(`${x},${z}`).level,z));court.add(child);}
    }
    const native=renderBakeCanvas(renderer,court,camera(512,320,0,100),512,320,{ink:false}).canvas;
    // Demonstrate consumption of the baked art with ordinary Pixi textures.
    const app=new Application();await app.init({width:1024,height:640,background:'#202a27',antialias:false,preference:'webgl'});
    const root=new Container();const texture=Texture.from(native);texture.source.scaleMode='nearest';
    const sprite=new Sprite(texture);sprite.scale.set(2);root.addChild(sprite);app.stage.addChild(root);app.renderer.render(app.stage);
    const preview=await app.renderer.extract.canvas(app.stage);
    const files={'living-terrain-atlas.png':atlas.toDataURL(),'living-terrain-masks.png':sheet.toDataURL(),'living-terrain-scene-native.png':native.toDataURL(),'living-terrain-scene-3x.png':enlarged(native,3).toDataURL(),'living-terrain-pixi-2x.png':preview.toDataURL()};
    app.destroy(true,{children:true,texture:true,textureSource:true});
    return {files,manifest:{schema:'hive.living-terrain-art-study/1',atlas:'living-terrain-atlas.png',width:atlas.width,height:atlas.height,entries,corners:['NW','NE','SE','SW'],cellMetres:1,verticalMetres:.54,dualGridOffset:[.5,.5],pipeline:'Original Three geometry → shared bake/camera → nearest Pixi texture',scope:'Art study only. No new simulation or runtime sorting.',camera:'src/art/prop-camera.js',bake:'src/art/bake.js'}};
  }finally{renderer.dispose();renderer.forceContextLoss();}
}
