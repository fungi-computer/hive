import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
const out = process.argv[2] ?? ".botanical/renderer-audit-20260919";
const mode = process.argv[3] ?? "dirty";
await mkdir(out, { recursive: true });
console.log("launch", mode);
const browser = await chromium.launch({
  headless: true,
  executablePath:
    "/home/levi/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell",
  args: [
    "--no-sandbox",
    "--enable-unsafe-swiftshader",
    "--use-gl=angle",
    "--use-angle=swiftshader",
  ],
});
console.log("launched");
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
console.log("page");
const errors = [];
page.on("crash", () => console.log("PAGE CRASH"));
page.on("pageerror", (e) => {
  errors.push(String(e));
  console.log("PAGEERROR", String(e));
});
page.on("console", (m) => {
  if (m.type() === "error") console.log("CONSOLE", m.text());
});
await page.addInitScript(() => {
  window.audit = {
    times: {},
    frames: [],
    commands: [],
    events: [],
    native: [],
  };
  window.measure = (key, fn) => {
    const t = performance.now();
    try {
      return fn();
    } finally {
      (audit.times[key] ??= []).push(performance.now() - t);
    }
  };
  for (const type of [WebGLRenderingContext, WebGL2RenderingContext])
    for (const name of ["bufferData", "bufferSubData"]) {
      const original = type.prototype[name];
      type.prototype[name] = function (...args) {
        return window.measure("webgl." + name, () =>
          original.apply(this, args),
        );
      };
    }
  let last;
  const frame = (t) => {
    if (last) audit.frames.push(t - last);
    last = t;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
});
await page
  .context()
  .route("**/engine/src/runtime/worker-entry.ts*", async (route) => {
    const response = await route.fetch();
    const body = (await response.text()).replace(
      "options = {}",
      "options = {metrics:true}",
    );
    await route.fulfill({ response, body });
  });
await page.route("**/engine/src/client/*.js*", async (route) => {
  const response = await route.fetch();
  let body = await response.text();
  const name = new URL(route.request().url()).pathname.split("/").pop();
  if (name === "terrain-visibility.js" && mode === "head")
    body = execFileSync(
      "git",
      ["show", "HEAD:engine/src/client/terrain-visibility.js"],
      { encoding: "utf8" },
    );
  const functions =
    {
      "terrain-visibility.js": [
        "visibleTerrainChunks",
        "materialCoverage",
        "terrainFaceRecords",
        "terrainCoverRecords",
      ],
      "voxel-draw-stream.js": ["compileVoxelDrawStream"],
      "terrain-face-batches.js": ["terrainBatchPlan"],
    }[name] ?? [];
  for (const fn of functions)
    if (body.includes(`export function ${fn}(`)) {
      body =
        body.replace(`export function ${fn}(`, `function raw_${fn}(`) +
        `\nexport function ${fn}(...args){return window.measure('${fn}',()=>raw_${fn}(...args));}\n`;
    }
  for (const fn of {
    "cut-terrain-layer.js": ["createCutTerrainLayer"],
    "terrain-face-batches.js": ["createTerrainBatchMeshes"],
  }[name] ?? []) {
    body =
      body.replace(`export function ${fn}(`, `function raw_${fn}(`) +
      `\nexport function ${fn}(...args){const owner=raw_${fn}(...args),copy={};for(const [key,d] of Object.entries(Object.getOwnPropertyDescriptors(owner))){if(typeof d.value==='function'){const f=d.value;d.value=(...args)=>window.measure('${fn}.'+key,()=>f.apply(owner,args));}Object.defineProperty(copy,key,d)}return copy;}\n`;
  }
  if (name === "terrain-face-batches.js")
    body = body.replace(
      "function buffers(records) {",
      'function buffers(records){return window.measure("batchBufferArrays",()=>rawBuffers(records))}\nfunction rawBuffers(records) {',
    );
  if (name === "client.js") {
    body = body.replace(
      "  function draw() {",
      `  function draw(){return window.measure("drawCPU",()=>rawDraw());}
    function rawDraw() {
      if(app.renderer && !app.renderer.__auditWrapped){const render=app.renderer.render.bind(app.renderer);app.renderer.render=(...args)=>window.measure('pixiRenderCPU',()=>render(...args));app.renderer.__auditWrapped=true;}`,
    );
    body = body.replace(
      "  return {\n    state,",
      `  window.clientAudit = {state,camera,app,terrainLayer, get terrain(){return terrainFrame}, get records(){return orderedSprites}, get actors(){return actorCache}, get placement(){const s=terrainTarget.getSnapshot();return {value:s.value,context:s.context}}, get area(){const s=terrainArea.getSnapshot();return {value:s.value,context:s.context}}};
    const originalSend=runtime.send.bind(runtime);runtime.send=(command)=>{audit.commands.push(command);return originalSend(command)};
    const chunks=runtime.terrainChunks.bind(runtime);runtime.terrainChunks=(...args)=>{const t=performance.now();return chunks(...args).finally(()=>(audit.times.chunkRoundTrip??=[]).push(performance.now()-t))};
    runtime.subscribe(event=>{audit.events.push({type:event.type,time:performance.now()});if(event.metrics)audit.native.push(event.metrics);if(audit.events.length>500)audit.events.shift()});
    return {\n    state,`,
    );
  }
  await route.fulfill({ response, body });
});
try {
  await page.goto(
    "http://127.0.0.1:5187/engine/colony.html?game=colony&runtime=local&diagnostics=draw",
    { waitUntil: "domcontentloaded" },
  );
  console.log("loaded");
  await page.waitForFunction(
    () => window.__HIVE_DRAW_DIAGNOSTICS?.().visibleDrawRecords > 100,
    { timeout: 120000 },
  );
  await page.waitForTimeout(1500);
  // Existing startup screenshot is retained; measurements exclude screenshot work.
  const snapshot = () =>
    page.evaluate(() => ({
      state: {
        selectedIds: clientAudit.state.selectedIds,
        paused: clientAudit.state.paused,
        view: clientAudit.state.view,
        message: clientAudit.state.message,
      },
      camera: {
        x: clientAudit.camera.x,
        y: clientAudit.camera.y,
        zoom: clientAudit.camera.zoom,
      },
      canvas: clientAudit.app.canvas.getBoundingClientRect().toJSON(),
      subjects: clientAudit.state.subjects.map((s) => ({
        id: s.id,
        name: s.name,
        screen: s.screen,
        x: s.x,
        y: s.y,
        z: s.z,
        pickable: s.pickable,
      })),
      diagnostics: __HIVE_DRAW_DIAGNOSTICS(),
      coverage: (() => {
        const c = clientAudit.terrainLayer.coverage;
        return {
          ...c,
          chunks: c.chunks.map((x) => ({ key: x.key })),
          baseline: undefined,
        };
      })(),
      buttons: [...document.querySelectorAll("button")].map(
        (b) => b.textContent,
      ),
    }));
  const initial = await snapshot();
  await writeFile(
    `${out}/${mode}-initial.json`,
    JSON.stringify({ initial, errors }, null, 2),
  );
  console.log(
    JSON.stringify({
      mode,
      subjects: initial.subjects,
      buttons: initial.buttons,
      errors,
    }),
  );
  const phases = [],
    clicks = [];
  async function phase(name, action) {
    await page.evaluate(() => {
      audit.times = {};
      audit.frames = [];
      audit.native = [];
    });
    const before = await snapshot();
    console.log("start phase", name);
    await action();
    const samples = await page.evaluate(() => ({
      times: audit.times,
      frames: audit.frames,
      native: audit.native,
    }));
    const after = await snapshot();
    phases.push({ name, before, after, samples });
    console.log("phase", name, samples.frames.length);
    await writeFile(
      `${out}/${mode}-receipt.json`,
      JSON.stringify({ mode, phases, clicks, errors }, null, 2),
    );
  }
  async function clickPerson(label) {
    const hit = await page.evaluate(() => {
      const actor = clientAudit.state.subjects.find((s) => s.name === "Sedge");
      const r = clientAudit.records.find((r) => r.id === actor.id);
      const p = { x: actor.screen.x, y: actor.screen.y - 13 };
      const hits = [...clientAudit.records]
        .reverse()
        .filter((r) => r.contains?.(p))
        .map((r) => ({
          id: r.id,
          part: r.part,
          pickable: r.pickable,
          role: r.role,
        }));
      const b = clientAudit.app.canvas.getBoundingClientRect();
      const c = clientAudit.camera;
      return {
        id: actor.id,
        world: { x: actor.x, y: actor.y, z: actor.z },
        point: p,
        screen: { x: b.x + c.x + p.x * c.zoom, y: b.y + c.y + p.y * c.zoom },
        hits,
        actorContains: r.contains?.(p),
      };
    });
    await page.mouse.click(hit.screen.x, hit.screen.y);
    await page.waitForTimeout(100);
    clicks.push({
      label,
      ...hit,
      selected: await page.evaluate(() => clientAudit.state.selectedIds),
    });
  }
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  if (mode === "uploads") {
    await page.mouse.click(528, 475.35);
    await phase("pan-upload", async () => {
      for (let i = 0; i < 6; i++) await page.keyboard.press("ArrowLeft");
      await page.waitForTimeout(1500);
    });
  } else if (mode === "edit") {
    await page
      .getByRole("button", { name: "Orders / Work", exact: true })
      .click();
    await page.getByRole("button", { name: "Dig area", exact: true }).click();
    const before = await page.evaluate(() => ({
      revision: clientAudit.terrain.revision,
      surfaces: clientAudit.terrain.surfaces,
    }));
    await page.mouse.click(600, 560);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Resume", exact: true }).click();
    await phase("terrain-edit", async () => {
      await page.waitForFunction(
        (revision) => clientAudit.terrain.revision > revision,
        before.revision,
        { timeout: 45000 },
      );
      await page.waitForTimeout(500);
    });
    const after = await page.evaluate(() => ({
      revision: clientAudit.terrain.revision,
      surfaces: clientAudit.terrain.surfaces,
      commands: audit.commands,
      facts: clientAudit.state.presentationFacts,
      message: clientAudit.state.message,
    }));
    await writeFile(
      `${out}/edit-terrain.json`,
      JSON.stringify({ before, after }, null, 2),
    );
  } else {
    if (!["controls", "building"].includes(mode)) {
      await phase("stationary-paused", () => page.waitForTimeout(2500));
      await clickPerson("initial");
      await phase("pan", async () => {
        for (let i = 0; i < 12; i++) await page.keyboard.press("ArrowLeft");
        await page.waitForTimeout(500);
      });
      await clickPerson("after-pan");
      await phase("zoom", async () => {
        for (let i = 0; i < 4; i++) {
          await page.mouse.wheel(0, -100);
          await page.waitForTimeout(80);
        }
        await page.waitForTimeout(500);
      });
      await clickPerson("after-zoom");
      await page.evaluate(() => clientAudit.app.stop());
      const pixels = await page.evaluate(() =>
        clientAudit.app.renderer.extract.base64({
          target: clientAudit.app.stage,
        }),
      );
      await writeFile(
        `${out}/${mode}-selection.png`,
        Buffer.from(pixels.split(",")[1], "base64"),
      );
      await page.evaluate(() => clientAudit.app.start());
    }
    if (mode !== "head") {
      if (!["controls", "building"].includes(mode))
        await phase("chunk-crossing", async () => {
          for (let i = 0; i < 24; i++) await page.keyboard.press("ArrowRight");
          await page.waitForTimeout(800);
        });
      if (mode !== "building") {
        await phase("cut", async () => {
          await page
            .getByRole("button", { name: "Toggle cutaway", exact: true })
            .click();
          await page
            .getByRole("button", { name: "Lower voxel layer", exact: true })
            .click();
          await page.waitForTimeout(800);
        });
        await page
          .getByRole("button", { name: "Higher voxel layer", exact: true })
          .click();
        await page
          .getByRole("button", { name: "Toggle cutaway", exact: true })
          .click();
      }
      if (!["controls", "building"].includes(mode))
        for (let i = 0; i < 12; i++) await page.keyboard.press("ArrowLeft");
      if (mode !== "controls") {
        await page.getByRole("button", { name: "Resume", exact: true }).click();
        await phase("moving-actors", () => page.waitForTimeout(3500));
        await page.getByRole("button", { name: "Pause", exact: true }).click();
      }
      await page.getByRole("button", { name: "Build", exact: true }).click();
      console.log(
        "build-buttons",
        await page.locator("button").allTextContents(),
      );
      await page
        .getByRole("button", { name: "Build floor", exact: true })
        .click();
      await page.mouse.move(650, 600);
      await page.waitForTimeout(400);
      const hover = await page.evaluate(() => ({
        placement: clientAudit.placement,
        area: clientAudit.area,
        view: clientAudit.state.view,
      }));
      await phase("floor-rectangle-input", async () => {
        await page.mouse.down();
        await page.mouse.move(715, 625, { steps: 4 });
        await page.mouse.up();
        await page.waitForTimeout(300);
      });
      const floor = await page.evaluate(() => ({
        commands: audit.commands,
        placement: clientAudit.placement,
        area: clientAudit.area,
        message: clientAudit.state.message,
      }));
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "Build", exact: true }).click();
      await page
        .getByRole("button", { name: "Build bed", exact: true })
        .click();
      await page.mouse.move(650, 550);
      await page.waitForTimeout(300);
      const bedHover = await page.evaluate(() => ({
        placement: clientAudit.placement,
        decision: clientAudit.state.placementDecision,
        view: clientAudit.state.view,
      }));
      await page
        .getByRole("button", { name: "Lower voxel layer", exact: true })
        .click();
      const bedLower = await page.evaluate(() => ({
        placement: clientAudit.placement,
        view: clientAudit.state.view,
      }));
      await writeFile(
        `${out}/${mode}-building.json`,
        JSON.stringify({ hover, floor, bedHover, bedLower }, null, 2),
      );
    }
  }
  await writeFile(
    `${out}/${mode}-receipt.json`,
    JSON.stringify(
      { mode, phases, clicks, errors, browser: await browser.version() },
      null,
      2,
    ),
  );
} catch (error) {
  console.log("FAIL", String(error));
  console.log(
    await page
      .locator("body")
      .innerText()
      .catch(() => "(page unavailable)"),
  );
  await writeFile(
    `${out}/${mode}-failure.json`,
    JSON.stringify({ error: String(error), errors }),
  );
  throw error;
} finally {
  await browser.close();
}
