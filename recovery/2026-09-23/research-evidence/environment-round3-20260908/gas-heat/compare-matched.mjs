import {readFileSync,writeFileSync} from 'node:fs';
import {house} from './house.mjs';
const load=name=>JSON.parse(readFileSync(new URL(name,import.meta.url)));
const files={local:'house-local180-v1.json',sealed:'house-sealed180-v1.json',high:'house-high180-v1.json',exterior4:'house-local180-exterior4-v1.json'};
const data=Object.fromEntries(Object.entries(files).map(([key,name])=>[key,load(name)]));
for(const r of Object.values(data))if(r.status!=='completed')throw new Error('incomplete prerequisite');
const ref=data.sealed.result,local=data.local.result,high=data.high.result,extended=data.exterior4.result;
const relative=(a,b)=>Math.abs(a-b)/Math.max(Math.abs(b),1e-30);
const f=house({dx:.5,mode:'local',exterior:2,revision:1});
const localIndoor=f.indoor.reduce((sum,i)=>sum+data.local.state.smoke[i],0);
const result={files,newApertureAreaM2:2,duration:180,
  localUpstairsReductionVsSealed:1-local.upperExposure/ref.upperExposure,
  highUpstairsIncreaseVsSealed:high.upperExposure/ref.upperExposure-1,
  localLowerReductionVsSealed:1-local.lowerExposure/ref.lowerExposure,
  highLowerReductionVsSealed:1-high.lowerExposure/ref.lowerExposure,
  exteriorUpstairsRelativeDifference:relative(local.upperExposure,extended.upperExposure),
  exteriorIndoorStockRelativeDifference:relative(localIndoor,extended.indoorSmokeKg),
  localIndoorKg:localIndoor,exterior4IndoorKg:extended.indoorSmokeKg,
  exteriorBoundaryCriterionPassed:relative(local.upperExposure,extended.upperExposure)<=.05,
  unresolved:['900s 80% export/25% exposure criterion','spatial and timestep room convergence','matched 3D/narrow-throat validation'],
  interpretation:'Small local-versus-sealed advantage is not a validated gameplay guarantee; doubling exterior does not measure remaining spatial/time uncertainty.'};
writeFileSync(new URL('matched-comparison-v1.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
if(!result.exteriorBoundaryCriterionPassed)throw new Error('predeclared exterior exposure sensitivity');
