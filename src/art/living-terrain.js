// Original terrain study geometry. No simulation or renderer ownership.
import * as THREE from 'three';
import { mesh } from './geometry.js';
import { terrainPatchEmissions } from './terrain-patches.js';

function random(seed) {
  let value = seed >>> 0;
  return () => ((value = (Math.imul(value, 1664525) + 1013904223) >>> 0) / 4294967296);
}
function polygons() {
  const colors = new Map();
  return {
    add(color, points) {
      if (!colors.has(color)) colors.set(color, []);
      const out = colors.get(color);
      for (let i=1;i<points.length-1;i++) out.push(...points[0], ...points[i], ...points[i+1]);
    },
    finish() {
      const root = new THREE.Group();
      for (const [color, points] of colors) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(points,3));
        geometry.computeVertexNormals();
        mesh(root,geometry,color,0,0,0);
      }
      return root;
    },
  };
}
const side = (a,b,x,z) => (b[0]-a[0])*(z-a[2])-(b[2]-a[2])*(x-a[0]);
function contains(triangles,x,z) {
  return triangles.some(({vertices:[a,b,c]}) => {
    const values=[side(a,b,x,z),side(b,c,x,z),side(c,a,x,z)];
    return values.every(v=>v>=-1e-8)||values.every(v=>v<=1e-8);
  });
}

export const GRASS_MATERIALS = Object.freeze({
  green: { base:'#314c28', root:'#304629', tips:['#53662c','#687c35','#7c8b3c','#425d2d','#8b9645'] },
  dead: { base:'#514536', root:'#48392d', tips:['#89764e','#a18c60','#b4a172','#756449','#c0ad7c'] },
});

export function grassCover({mask=15,variant=0,height='full',condition='green'}={}) {
  if (!Number.isInteger(mask)||mask<0||mask>15||!Number.isInteger(variant)||variant<0||variant>2||!['short','full'].includes(height)||!Object.hasOwn(GRASS_MATERIALS,condition)) throw new Error('Invalid grass art definition');
  const out=polygons(), rng=random(4117+variant*173), material=GRASS_MATERIALS[condition];
  const shapes=terrainPatchEmissions('grass',mask,variant).filter(e=>e.vertices.length===3);
  for (const {vertices} of shapes) out.add(material.base,vertices.map(([x,,z])=>[x,0.008,z]));
  // Same seeds and silhouettes in both heights. Blades exist only during authoring;
  // runtime receives one baked patch, not individual blade entities.
  const scale=height==='short'?0.46:1;
  const palette=material.tips;
  for(let i=0;i<85;i++) {
    const x=rng()-.5,z=rng()-.5;
    const h=(.09+rng()*.19)*scale, angle=rng()*Math.PI*2;
    if(!contains(shapes,x,z)) continue;
    for(let blade=0;blade<3;blade++) {
      const theta=angle+blade*2.1, w=.041+rng()*.033;
      const dx=Math.cos(theta), dz=Math.sin(theta), lean=.025+rng()*.048;
      const tip=[Math.max(-.5,Math.min(.5,x+dx*lean)),h,Math.max(-.5,Math.min(.5,z+dz*lean))];
      const a=[x-dz*w,0.009,z+dx*w],b=[x+dz*w,0.009,z-dx*w];
      const middle=[x+dx*lean*.5,h*.52,z+dz*lean*.5];
      const color=palette[i%palette.length];
      out.add(material.root,[a,b,middle]); out.add(material.root,[middle,b,a]);
      out.add(color,[a,middle,tip]); out.add(color,[tip,middle,a]);
      out.add(palette[i%palette.length],[middle,b,tip]);
      out.add(palette[i%palette.length],[tip,b,middle]);
    }
  }
  return out.finish();
}

export function terrainBody({kind='earth',variant=0}={}) {
  if(!['earth','stone'].includes(kind)||!Number.isInteger(variant)||variant<0||variant>2) throw new Error('Invalid terrain body');
  const out=polygons(),rng=random(193+variant*71), stone=kind==='stone';
  const top=stone?'#626e69':'#75553c', sideColor=stone?'#414f4c':'#493325';
  out.add(top,[[-.5,0,-.5],[-.5,0,.5],[.5,0,.5],[.5,0,-.5]]);
  const corners=[[-.5,-.5],[.5,-.5],[.5,.5],[-.5,.5]];
  for(let edge=0;edge<4;edge++) {
    const [ax,az]=corners[edge],[bx,bz]=corners[(edge+1)%4];
    out.add(sideColor,[[ax,0,az],[bx,0,bz],[bx,-.54,bz],[ax,-.54,az]]);
    for(let i=0;i<24;i++) {
      const u=rng()*.94,v=.05+rng()*.45,w=.03+rng()*.12,h=.025+rng()*.05;
      const at=(t,y)=>[ax+(bx-ax)*t+(az-bz)*.001,y,az+(bz-az)*t+(bx-ax)*.001];
      out.add(stone?(i%3?'#53605a':'#687269'):(i%3?'#61432d':'#795539'),[at(u,-v),at(Math.min(1,u+w),-v),at(Math.min(1,u+w),-v-h),at(u,-v-h)]);
    }
  }
  for(let i=0;i<(stone?18:35);i++) {
    const x=(rng()-.5)*.9,z=(rng()-.5)*.9,w=.025+rng()*(stone?.17:.04);
    out.add(stone?(i%2?'#788079':'#4c5b55'):(i%2?'#826346':'#644731'),[[x-w,.003,z-w/2],[x-w,.003,z+w/2],[x+w,.003,z+w/2],[x+w,.003,z-w/2]]);
  }
  if(stone) for(let ix=0;ix<2;ix++)for(let iz=0;iz<2;iz++) {
    const x=-.48+ix*.5,z=-.48+iz*.5,w=.45,d=.45,y=.045+rng()*.035,b=.045;
    const rim=[[x+b,0,z],[x+w-b,0,z],[x+w,0,z+b],[x+w,0,z+d-b],[x+w-b,0,z+d],[x+b,0,z+d],[x,0,z+d-b],[x,0,z+b]];
    const cap=rim.map(([a,,c])=>[a+(x+w/2-a)*.10,y,c+(z+d/2-c)*.10]);
    out.add(ix===iz?'#6d7972':'#7c867d',[...cap].reverse());
    for(let i=0;i<rim.length;i++){const j=(i+1)%rim.length;out.add('#56665d',[rim[i],cap[i],cap[j],rim[j]]);}
  }
  return out.finish();
}
