import {readdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join,relative} from 'node:path';
const root='/tmp/hive-dig-release-dimRCH/dist';const base='https://goblin-mvp-fungi-goblin-bnb.levi-fe0.workers.dev/';
const hash=b=>createHash('sha256').update(b).digest('hex');
async function files(dir){const result=[];for(const e of await readdir(dir,{withFileTypes:true})){const p=join(dir,e.name);result.push(...e.isDirectory()?await files(p):[p]);}return result;}
const paths=(await files(root)).filter(p=>/\.(html|js|css|wasm)$/.test(p));const results=[];
while(paths.length){await Promise.all(paths.splice(0,6).map(async p=>{const path=relative(root,p),local=hash(await readFile(p));const r=await fetch(new URL(path,base));const hosted=hash(Buffer.from(await r.arrayBuffer()));results.push({path,status:r.status,local,hosted,match:r.ok&&local===hosted});}));}
const report={revision:'449e9b8',base,results,mismatches:results.filter(r=>!r.match)};await writeFile('.botanical/digging/hosted-parity.json',JSON.stringify(report,null,2));console.log(JSON.stringify({files:results.length,mismatches:report.mismatches}));if(report.mismatches.length)process.exitCode=1;
