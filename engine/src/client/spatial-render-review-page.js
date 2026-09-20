import { Application, Container, Sprite, Rectangle } from "pixi.js";
import { loadStaticArtPack } from "../../../src/art/static-pack.js";
import { staticArtBase } from "../../../src/art/static-manifest.js";
import { loadLivingTerrainPack } from "../../../src/art/living-terrain-pack.js";
import { createTerrainBatchMeshes } from "./terrain-face-batches.js";
import { compileSpatialDrawOrder } from "./spatial-draw-order.js";
import { createSpatialRenderFixture, SPATIAL_SCENE_SIZE } from "./spatial-render-fixture.js";

const status=document.querySelector("#status"), state={turn:0,walk:0,mown:false};
const app=new Application();
await app.init({...SPATIAL_SCENE_SIZE,backgroundColor:0x7b896d,antialias:false,resolution:1,preference:"webgl",preserveDrawingBuffer:true});
app.stop();document.querySelector("#canvas").append(app.canvas);
const [staticPack,terrainPack]=await Promise.all([
  loadStaticArtPack({baseUrl:staticArtBase(import.meta.env.BASE_URL)}),loadLivingTerrainPack()]);
const root=new Container();root.sortableChildren=true;app.stage.addChild(root);
const batches=createTerrainBatchMeshes({parent:root}),sprites=new Map();
let fixture,compiled,lastMs=0;
function render(next={}) {
  Object.assign(state,next);
  const start=performance.now();
  fixture=createSpatialRenderFixture({...state,art:staticPack.art,terrainPack});
  for(const record of fixture.records) {
    if(record.terrainBatch)continue;
    if(!record.texture)throw new Error(`Missing original art: ${record.id}/${record.part}`);
    const key=`${record.id}/${record.part}`,sprite=sprites.get(key)??new Sprite();
    sprites.set(key,sprite);sprite.texture=record.texture;
    sprite.anchor.set(record.anchor.x,record.anchor.y);
    sprite.position.set(record.displayPoint.x,record.displayPoint.y);
    record.display=sprite;
  }
  compiled=compileSpatialDrawOrder(fixture.records,{projection:fixture.projection});
  batches.update(compiled.records);root.sortChildren();app.renderer.render(app.stage);
  lastMs=performance.now()-start;
  document.querySelector("#mown").checked=state.mown;
  document.querySelector("#walk").value=state.walk;
  status.textContent=`View ${state.turn+1} · ${state.mown?"Mown and tall grass":"Tall grass"} · ${compiled.records.length} pieces · ${lastMs.toFixed(1)} ms scene rebuild`;
  document.body.dataset.ready="true";
  return snapshot();
}
function snapshot() {return {...state,records:compiled.records.map(r=>`${r.id}/${r.part}`),metrics:compiled.metrics,rebuildMs:lastMs};}
document.querySelector("#turn").onclick=()=>render({turn:(state.turn+1)%4});
document.querySelector("#mown").onchange=event=>render({mown:event.target.checked});
document.querySelector("#walk").oninput=event=>render({walk:Number(event.target.value)});
const timer=setInterval(()=>{
  if(!document.querySelector("#moving").checked)return;
  try{render({walk:(state.walk+.06)%10});document.querySelector("#walk").value=state.walk;}
  catch(error){document.querySelector("#moving").checked=false;status.textContent=error.message;throw error;}
},100);
window.__SPATIAL_REVIEW=Object.freeze({render,snapshot,
  fixture:()=>fixture,
  pixels:()=>[...app.renderer.extract.pixels({target:root,frame:new Rectangle(0,0,SPATIAL_SCENE_SIZE.width,SPATIAL_SCENE_SIZE.height)}).pixels],
  image:()=>app.renderer.extract.base64({target:root,frame:new Rectangle(0,0,SPATIAL_SCENE_SIZE.width,SPATIAL_SCENE_SIZE.height)}),
  pairPixels(ids) {
    const chosen=compiled.records.filter(record=>ids.includes(record.id)||ids.includes(`${record.id}/${record.part}`));
    for(const [key,sprite] of sprites)sprite.visible=ids.includes(key)||ids.includes(key.split("/")[0]);
    batches.update(chosen);root.sortChildren();
    const pixels=[...app.renderer.extract.pixels({target:root,frame:new Rectangle(0,0,SPATIAL_SCENE_SIZE.width,SPATIAL_SCENE_SIZE.height)}).pixels];
    for(const sprite of sprites.values())sprite.visible=true;
    batches.update(compiled.records);root.sortChildren();app.renderer.render(app.stage);
    return pixels;
  },
});
render();
window.addEventListener("beforeunload",()=>{clearInterval(timer);batches.dispose();for(const sprite of sprites.values())sprite.destroy({texture:false,textureSource:false});staticPack.dispose();terrainPack.dispose();app.destroy(true);});
