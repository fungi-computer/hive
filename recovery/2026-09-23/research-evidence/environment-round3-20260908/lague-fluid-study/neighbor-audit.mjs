// Small CPU reproduction of the pinned HLSL lookup, with an independent
// all-pairs oracle. This is not a Unity/GPU run or an SPH performance benchmark.
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const offsets=[];
for(let z=-1;z<=1;z++) for(let y=-1;y<=1;y++) for(let x=-1;x<=1;x++) offsets.push([x,y,z]);
function hash(cell) {
  const u=cell.map(v=>(v+25)>>>0), local=u.map(v=>v%50), block=u.map(v=>Math.floor(v/50));
  const blockHash=(Math.imul(block[0],15823)+Math.imul(block[1],9737333)+Math.imul(block[2],440817757))>>>0;
  return (local[0]+50*(local[1]+50*local[2])+blockHash)>>>0;
}
const radius=1, positions=[[.1,.1,.1],[.1,.1,-.1]];
while(positions.length<1000) positions.push([100+2*positions.length,100,100]);
const cell=p=>p.map(x=>Math.floor(x/radius));
const near=(a,b)=>a.reduce((sum,v,i)=>sum+(v-b[i])**2,0)<=radius**2;
const buckets=new Map();
positions.forEach((p,i)=>{const key=hash(cell(p))%positions.length;if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(i);});
function lookup(deduplicateKeys) {
  const visited=new Set(), found=[];
  for(const offset of offsets) {
    const c=cell(positions[0]).map((v,i)=>v+offset[i]),key=hash(c)%positions.length;
    if(deduplicateKeys&&visited.has(key))continue;
    visited.add(key);
    for(const i of buckets.get(key)??[])if(near(positions[0],positions[i]))found.push(i);
  }
  return found.sort((a,b)=>a-b);
}
const oracle=positions.flatMap((p,i)=>near(positions[0],p)?[i]:[]);
const pinnedLookup=lookup(false),uniqueBinLookup=lookup(true);
assert.deepEqual(oracle,[0,1]);
assert.notDeepEqual(pinnedLookup,oracle);
assert.deepEqual(uniqueBinLookup,oracle);
const result={sourceCommit:'4717b7259718d349b0001c82836f24ce5fec81d7',
  mode:'CPU translation of pinned hash/lookup, independently checked against all pairs',
  particles:positions.length,radius,query:positions[0],nearNeighbor:positions[1],
  oracle,pinnedLookup,uniqueBinLookup,
  conclusion:'Distinct neighboring cells can hash to the same queried bucket. The pinned loop visits that bucket repeatedly and double-counts an in-radius particle.',
  limits:['Not executed on GPU','No whole-SPH accuracy/capacity claim','Deduplicating bucket keys is a demonstrated local correction, not a complete adapted solver']};
writeFileSync(fileURLToPath(new URL('./neighbor-audit.json',import.meta.url)),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({oracle,pinnedLookup,uniqueBinLookup,diagnosticPassed:true}));
