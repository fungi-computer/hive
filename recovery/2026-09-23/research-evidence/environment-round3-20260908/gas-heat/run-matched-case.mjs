import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {runHouse,house} from './house.mjs';
const options=JSON.parse(process.argv[2]),output=process.argv[3];
const hash=s=>createHash('sha256').update(s).digest('hex');
const source=readFileSync(new URL('solver.mjs',import.meta.url),'utf8');
const fixture=readFileSync(new URL('house.mjs',import.meta.url),'utf8');
const historical=JSON.parse(readFileSync(new URL('house-local180-v1.json',import.meta.url)));
const restoredLabel=fixture.replace('maxCourant,peakThetaK:maxTheta,','maxCourant,maxTheta,');
if(hash(source)!==historical.sourceSha256||hash(restoredLabel)!==historical.fixtureSha256)throw new Error('historical numerical source pin mismatch');
const pin={solverSha256:hash(source),fixtureSha256:hash(fixture),historicalFixtureSha256:hash(restoredLabel),
  labelOnlyChange:true,planSha256:hash(readFileSync(new URL('MATCHED-LAYOUT-PLAN.md',import.meta.url)))};
writeFileSync(new URL('matched-source-pin.json',import.meta.url),JSON.stringify(pin,null,2)+'\n');
const cpuStart=process.cpuUsage(),start=performance.now(),result={...pin,options};
try {
  Object.assign(result,runHouse(options));
  const r=result.result, f=house({dx:options.dx,mode:options.mode,exterior:options.exterior,revision:1});
  r.indoorSmokeKg=f.indoor.reduce((sum,i)=>sum+result.state.smoke[i],0);
  r.criteria={finite:result.state.velocity.concat(result.state.smoke,result.state.heat).every(Number.isFinite),
    positive:r.minSmoke>=-1e-14,mass:r.massErrorKg<1e-10,heat:r.heatErrorJ<1e-5,
    divergence:r.maxDivergence<1e-8,courant:r.maxCourant<=.45000000001,
    boussinesq:r.maxBoussinesqRatio<=.05};
  if(Object.values(r.criteria).some(ok=>!ok))throw new Error('predeclared physical/numerical screening criterion');
  result.status='completed';
}catch(error){result.status='failed';result.error=error.message;process.exitCode=1;}
result.processWallMs=performance.now()-start;result.cpuUs=process.cpuUsage(cpuStart);result.rssBytes=process.memoryUsage().rss;
writeFileSync(output,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({...result,state:undefined,rows:undefined},null,2));
