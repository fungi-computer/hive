import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { chromium } from 'playwright';
import { Vector3 } from 'three';
import { camera } from '../../src/art/prop-camera.js';
import { createWetClearing } from '../../src/world-presets/seepage/wet-clearing.mjs';

const output = resolve(process.argv[2] || '.botanical/wet-clearing-release/render');
await mkdir(output, { recursive: true });
const root = resolve('dist'), errors = [], facts = { errors, screenshots: [] };
const mime = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.png':'image/png', '.woff2':'font/woff2', '.ttf':'font/ttf' };
const server = createServer(async (req, res) => {
  const path = resolve(root, '.' + new URL(req.url, 'http://local').pathname);
  if (!path.startsWith(root + '/')) { res.writeHead(403).end(); return; }
  try { const data = await readFile(path); res.writeHead(200, { 'Content-Type': mime[extname(path)] || 'application/octet-stream' }); res.end(data); }
  catch { res.writeHead(404).end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
let browser, page;
const deadline = setTimeout(async () => {
  facts.ok=false; facts.failure='Absolute 45-second render budget exhausted';
  await writeFile(resolve(output,'timeout.json'),JSON.stringify(facts,null,2));
  await browser?.close().catch(()=>{}); server.closeAllConnections(); server.close();
},45000);
try {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, headless: true,
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  page = await browser.newPage({ viewport: { width: 1100, height: 850 } });
  page.setDefaultTimeout(12000);
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`http://127.0.0.1:${server.address().port}/wet-clearing.html`);
  console.log('page-loaded');
  await page.getByRole('button', { name:'Turn view', exact:true }).waitFor();
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.textContent === 'Turn view' && !b.disabled));
  const fixture = createWetClearing(), bounds = { min:[-4,11,124], max:[5,18,133] };
  const scene = fixture.adapter.scene(fixture.input, bounds), spacing = scene.spacingM;
  const origin = bounds.min.map((n,i) => (n+bounds.max[i]-(i===1?1:0))/2*spacing[i]);
  const cam = camera(640,400,0); cam.zoom=1.6; cam.updateProjectionMatrix();
  const point = new Vector3(...fixture.target.map((n,i) => (n+(i===1?1.001:.5))*spacing[i]-origin[i])).project(cam);
  const canvas = page.locator('[data-wet-world] canvas');
  await canvas.click({ position: { x:(point.x+1)/2*(await canvas.boundingBox()).width,
    y:(1-point.y)/2*(await canvas.boundingBox()).height } });
  await page.getByRole('button', { name:'Dig selected block', exact:true }).click();
  console.log('dig-clicked');
  await page.getByRole('button', { name:'Wait ten minutes', exact:true }).click();
  console.log('advance-clicked');
  await page.waitForFunction(() => document.querySelector('[data-wet-facts]').textContent.includes('600 seconds'));
  facts.display = await page.locator('[data-wet-facts]').innerText();
  assert.match(facts.display,/12\.57/);
  console.log('water-facts',facts.display);
  await page.screenshot({ path:resolve(output,'water.png'),timeout:5000 }); facts.screenshots.push('water.png');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth<=innerWidth));
  assert.deepEqual(errors,[]); facts.ok=true;
} catch(error) {
  facts.ok=false;facts.failure=error.stack;
  if(page) facts.display=await page.locator('[data-wet-facts]').innerText({timeout:2000}).catch(()=>null);
  if(page) await page.screenshot({path:resolve(output,'failure.png'),timeout:3000}).catch(()=>{});
  process.exitCode=1;
} finally {
  await browser?.close(); facts.browserClosed=true;
  await new Promise(r=>server.close(r)); facts.listenerClosed=true;
  clearTimeout(deadline);
  await writeFile(resolve(output,'proof.json'),JSON.stringify(facts,null,2)+'\n');
  console.log(JSON.stringify(facts));
}
