import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { parseStaticArtManifest } from '../src/art/static-manifest.js';
const priorRevision = '1ded98e6e97df2b15dcd85b7d49e13b349ac1af4';
const priorFile = file => execFileSync('git', ['show', `${priorRevision}:public/generated-art/goblin-static-art-v6/${file}`], { maxBuffer: 16 * 1024 * 1024 });
const prior = JSON.parse(priorFile('manifest.json'));
const current = parseStaticArtManifest(JSON.parse(await readFile('public/generated-art/goblin-static-art-v7/manifest.json')));
const hashes = {};
for (const file of ['ground.png', ...current.pages.map(p=>p.file)]) {
  const oldBytes = priorFile(file);
  const newBytes = await readFile(`public/generated-art/goblin-static-art-v7/${file}`);
  assert.deepEqual(newBytes, oldBytes);
  hashes[file] = createHash('sha256').update(newBytes).digest('hex');
}
assert.deepEqual(current.entries.map(({ordering,...entry})=>entry), prior.entries);
const server = await createServer({root:process.cwd(),configFile:false,optimizeDeps:{noDiscovery:true,include:['pixi.js','three']},server:{host:'127.0.0.1',port:0}});
await server.listen();
const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox','--enable-unsafe-swiftshader']});
try {
  const page=await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/static-art-export.html`);
  const loaded=await page.evaluate(async()=>{
    const {loadStaticArtPack}=await import('/src/art/static-pack.js');
    const pack=await loadStaticArtPack();
    const entries=pack.manifest.entries;
    if(pack.art.orderingByTexture.size!==entries.length)throw new Error('map count');
    for(const entry of entries){
      const texture=entry.path.reduce((value,key)=>value[key],pack.art);
      if(JSON.stringify(pack.art.orderingByTexture.get(texture))!==JSON.stringify(entry.ordering))throw new Error('map data');
    }
    const result={textures:pack.art.orderingByTexture.size,parts:pack.art.partByTexture.size,bed:pack.art.orderingByTexture.get(pack.art.buildings.bed.finished[0]),stair:pack.art.partsByOwner.get('["buildings","stair","finished",0]').map(p=>({id:p.id,ordering:pack.art.orderingByTexture.get(p.texture)}))};
    pack.dispose(); return result;
  });
  await mkdir('.botanical/ordering-pack',{recursive:true});
  const result={priorRevision,allOriginalPngBytesIdentical:true,allOtherEntryDataIdentical:true,hashes,loaded};
  await writeFile('.botanical/ordering-pack/result.json',JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result));
} finally {await browser.close();await server.close();}
