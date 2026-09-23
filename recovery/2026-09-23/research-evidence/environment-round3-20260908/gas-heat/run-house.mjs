import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {runHouse} from './house.mjs';
const options=JSON.parse(process.argv[2]??'{}'),out=process.argv[3]??new URL('house-pilot-v1.json',import.meta.url);
const cpuStart=process.cpuUsage(),start=performance.now();
const hash=name=>createHash('sha256').update(readFileSync(new URL(name,import.meta.url))).digest('hex');
const result={sourceSha256:hash('solver.mjs'),fixtureSha256:hash('house.mjs'),options};
try {
  Object.assign(result,runHouse(options));result.status='completed';
  if(result.result.massErrorKg>=1e-10||result.result.heatErrorJ>=1e-5||result.result.maxDivergence>=1e-8)throw new Error('independent balances/divergence');
} catch(error) {result.status='failed';result.error=error.message;process.exitCode=1;}
result.processWallMs=performance.now()-start;result.cpuUs=process.cpuUsage(cpuStart);result.rssBytes=process.memoryUsage().rss;
writeFileSync(out,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({...result,state:undefined,rows:undefined},null,2));
