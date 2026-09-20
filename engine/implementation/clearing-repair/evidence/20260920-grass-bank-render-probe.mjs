// Bounded original-art witness. This is not a replacement renderer or a
// reproduction of the user's entire world. Run through the shared proof guard.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { chromium } from "playwright";

const root = fileURLToPath(new URL("../../../../", import.meta.url));
const out = process.env.HIVE_STUDY_OUT ?? `${root}/.botanical/engine-study-20260920`;
const moduleSource = `
import { Application, Container, Rectangle } from "pixi.js";
import { camera } from "/src/art/prop-camera.js";
import { loadLivingTerrainPack } from "/src/art/living-terrain-pack.js";
import { createOrderingProjection } from "/engine/src/client/ordering-projection.js";
import { createTerrainFaceAppearance } from "/engine/src/client/terrain-face-appearance.js";
import { materialCoverage, terrainCoverRecords, terrainFaceRecords } from "/engine/src/client/terrain-visibility.js";
import { compileVoxelDrawStream } from "/engine/src/client/voxel-draw-stream.js";
import { createTerrainBatchMeshes } from "/engine/src/client/terrain-face-batches.js";
window.probe = (async () => {
  const width = 128, height = 96, verticalMetres = .54;
  const app = new Application();
  await app.init({ width, height, backgroundAlpha: 0, antialias: false, resolution: 1,
    preference: "webgl", preserveDrawingBuffer: true });
  app.stop();
  const container = new Container();
  container.sortableChildren = true;
  app.stage.addChild(container);
  const pack = await loadLivingTerrainPack();
  const projection = createOrderingProjection(camera(width, height, 0), width, height);
  const appearance = createTerrainFaceAppearance({ pack });
  const surfaces = [[0,0,0],[1,0,1],[0,0,1]].map(cell => ({ cell,
    cover: { kind: "grass", condition: "green", height: "full" } }));
  const cover = terrainCoverRecords(surfaces, { level: 1, projection, appearance,
    verticalMetres, variantSeed: 1 }).find(r => r.id === "cover:0:0:0:grass:green:full");
  const columns = Array.from({length:8}, (_, x) => Array.from({length:8}, (_, z) => {
    const top = x === 1 && z === 0 ? 2 : x <= 1 && z <= 1 ? 1 : 0;
    return { x, z, runs: [...(top ? [{minY:0,maxY:top,material:1}] : []),
      {minY:top,maxY:8,material:0}] };
  })).flat();
  const coverage = materialCoverage({ chunks: [{key:[0,0,0],min:[0,0,0],max:[8,8,8],columns}],
    bounds: {minX:0,maxX:8,minY:0,maxY:8,minZ:0,maxZ:8}, verticalMetres, variantSeed:1,
    palette: [{slot:0,solid:false},{slot:1,solid:true,art:"earth"}], epoch:1,terrainRevision:1 });
  const bank = terrainFaceRecords(coverage, {level:1,projection,appearance})
    .filter(r => r.cell.join(",") === "1,1,0");
  const compiled = compileVoxelDrawStream([cover, ...bank], {direction:projection.direction, verticalMetres});
  const batches = createTerrainBatchMeshes({parent:container});
  const frame = new Rectangle(0,0,width,height);
  async function capture(records) {
    batches.update(records);
    container.sortChildren();
    const pixels = app.renderer.extract.pixels({target:container,frame}).pixels;
    const image = await app.renderer.extract.base64({target:container,frame});
    return {pixels,image};
  }
  const grassOnly = await capture([cover]), bankOnly = await capture(bank);
  const actual = await capture(compiled.records);
  // Independent geometric relation: all grass lies below .55m. Where the ray
  // enters the bank above .57m, the opaque bank is nearer. Reversing whole
  // sprites is an oracle ONLY for those pixels, not a general sorting repair.
  const expected = await capture([cover, ...bank]);
  let changedPixels = 0, interiorOverlapPixels = 0, wrongInteriorPixels = 0;
  const samples = [];
  for (let y=1;y<height-1;y++) for (let x=1;x<width-1;x++) {
    const i=(y*width+x)*4;
    const changed=actual.pixels.slice(i,i+4).some((v,k)=>v!==expected.pixels[i+k]);
    if(changed) changedPixels++;
    const bankInterior=[[0,0],[-1,0],[1,0],[0,-1],[0,1]].every(([dx,dy])=>
      bankOnly.pixels[((y+dy)*width+x+dx)*4+3]===255);
    const ray=projection.ray({x:x+.5,y:y+.5});
    const near={x:.5,y:.27,z:-.5}, far={x:1.5,y:.81,z:.5};
    let enter=-Infinity,exit=Infinity;
    for(const axis of ["x","y","z"]) {
      const a=(near[axis]-ray.origin[axis])/ray.direction[axis];
      const b=(far[axis]-ray.origin[axis])/ray.direction[axis];
      enter=Math.max(enter,Math.min(a,b)); exit=Math.min(exit,Math.max(a,b));
    }
    const bankY=ray.origin.y+enter*ray.direction.y;
    if(!bankInterior || grassOnly.pixels[i+3]===0 || enter>exit || bankY<=.57) continue;
    interiorOverlapPixels++;
    if(changed) {
      wrongInteriorPixels++;
      if(samples.length<5) samples.push({x,y,bankY,actual:[...actual.pixels.slice(i,i+4)],
        expected:[...expected.pixels.slice(i,i+4)]});
    }
  }
  const result={width,height,mask:cover.mask,variantSeed:1,order:compiled.records.map(r=>r.id),
    changedPixels,interiorOverlapPixels,wrongInteriorPixels,samples,
    images:{actual:actual.image,expected:expected.image,grass:grassOnly.image,bank:bankOnly.image}};
  batches.dispose(); pack.dispose(); app.destroy(true,{children:true,texture:false,textureSource:false});
  return result;
})();
`;

await mkdir(out, { recursive: true });
let browser;
const server = await createServer({ root, configFile: false, logLevel: "error",
  optimizeDeps: { noDiscovery: true, include: ["pixi.js", "three"] },
  server: { host: "127.0.0.1", port: 0 },
  plugins: [{ name: "bounded-grass-bank-probe",
    resolveId(id) { if (id === "/__hive_order_probe.js") return "\0hive-order-probe"; },
    load(id) { if (id === "\0hive-order-probe") return moduleSource; },
    configureServer(server) { server.middlewares.use((req,res,next) => {
      if(req.url !== "/__hive_order_probe.html") return next();
      res.setHeader("Content-Type", "text/html");
      res.end('<!doctype html><script type="module" src="/__hive_order_probe.js"></script>');
    }); },
  }],
});
const errors = [];
try {
  await server.listen();
  browser = await chromium.launch({ headless: true,
    executablePath: process.env.CHROMIUM_PATH ?? "/home/levi/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell",
    args: ["--no-sandbox","--enable-unsafe-swiftshader","--use-gl=angle","--use-angle=swiftshader"],
  });
  const page = await browser.newPage();
  page.on("pageerror", error => errors.push(String(error)));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/__hive_order_probe.html`);
  await page.waitForFunction(() => window.probe !== undefined);
  const result = await page.evaluate(() => window.probe);
  for(const [name,data] of Object.entries(result.images))
    await writeFile(`${out}/grass-bank-${name}.png`, Buffer.from(data.split(",")[1], "base64"));
  delete result.images;
  await writeFile(`${out}/grass-bank-render.json`, JSON.stringify({...result,errors},null,2)+"\n");
  console.log(JSON.stringify({...result,errors}));
  assert.deepEqual(errors, []);
  assert(result.wrongInteriorPixels > 0, "fixture must expose incorrect original-art interior pixels");
} finally {
  await browser?.close();
  await server.close();
}
