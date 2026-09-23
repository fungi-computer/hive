import{writeFileSync}from'node:fs';
import{H,W,A,NU,startup}from'./reference.mjs';
const points=[[H/2,W/2],[.09,1/12],[.27,.25],[H-.09,W-1/12],[.37,.61]];
const result={initial:points.map(([y,z])=>({at:[y,z],errors:[15,31,63,127,255,511].map(cutoff=>({cutoff,value:startup(y,z,0,511,cutoff)}))})),
  truncation:points.map(([y,z])=>startup(y,z,2,511,127)-startup(y,z,2,255,63)),
  walls:[[0,W/2],[H,W/2],[H/2,0],[H/2,W],[.27,0],[.27,W]].map(([y,z])=>({at:[y,z],value:startup(y,z,2)}))};
const y=.37,z=.61,h=1e-4,t=.7,dt=1e-5;
const ut=(startup(y,z,t+dt)-startup(y,z,t-dt))/(2*dt);
const lap=(startup(y+h,z,t)+startup(y-h,z,t)+startup(y,z+h,t)+startup(y,z-h,t)-4*startup(y,z,t))/(h*h);
result.pdeResidual=ut-A-NU*lap;
writeFileSync(new URL('reference-diagnosis-v1.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
