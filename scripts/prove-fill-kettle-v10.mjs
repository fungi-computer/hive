import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const url = process.argv[2] || "http://127.0.0.1:5196/";
const output =
  process.argv[3] || ".botanical/schema10-fill-kettle-final-20260908/local";
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const assetRefs = (html) =>
  [...html.matchAll(/(?:src|href)=["']\/?(assets\/[^"']+)["']/g)].map(
    (match) => match[1],
  );
const hashes = async (root, refs, fetchAsset = null) =>
  Object.fromEntries(
    await Promise.all(
      refs.map(async (ref) => [
        ref,
        sha256(
          fetchAsset
            ? Buffer.from(await (await fetchAsset(ref)).arrayBuffer())
            : await readFile(`${root}/${ref}`),
        ),
      ]),
    ),
  );

await mkdir(output, { recursive: true });
const evidence = {
  mode: "local-served-browser-interaction",
  url,
  scriptSha256: sha256(await readFile("scripts/prove-fill-kettle-v10.mjs")),
  errors: [],
  screenshots: [],
  claims: {},
};
let browser;

try {
  const localIndex = await readFile("dist/index.html");
  const refs = assetRefs(localIndex.toString("utf8"));
  const local = {
    index: sha256(localIndex),
    assets: await hashes("dist", refs),
  };
  const response = await fetch(url);
  assert.equal(response.status, 200);
  const servedIndex = Buffer.from(await response.arrayBuffer());
  const servedRefs = assetRefs(servedIndex.toString("utf8"));
  assert.deepEqual(servedRefs, refs);
  const served = {
    index: sha256(servedIndex),
    assets: await hashes("", servedRefs, async (ref) => {
      const asset = await fetch(new URL(ref, response.url || url));
      assert.equal(asset.status, 200, `${ref} did not serve`);
      return asset;
    }),
  };
  assert.deepEqual(served, local);
  evidence.parity = { local, served, exact: true };

  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_PATH,
    args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
  });
  const context = await browser.newContext({
    viewport: { width: 1100, height: 760 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(45_000);
  page.on("pageerror", (error) => evidence.errors.push(`page: ${error}`));
  page.on("console", (message) => {
    if (message.type() === "error")
      evidence.errors.push(`console: ${message.text()}`);
  });
  page.on("requestfailed", (request) =>
    evidence.errors.push(
      `request: ${request.url()} · ${request.failure()?.errorText || "unknown"}`,
    ),
  );

  const state = () => page.evaluate(() => window.__GOBLIN.state);
  const selection = () => page.evaluate(() => window.__GOBLIN.selection);
  const waitState = (predicate, value = null, timeout = 45_000) =>
    page.waitForFunction(predicate, value, { timeout });
  const project = (cell, height = 0) =>
    page.evaluate(
      ([x, z, y, level]) => window.__GOBLIN.project(x, z, y, level),
      [cell.x, cell.z, height, cell.level ?? 0],
    );
  const clickCell = async (cell, height = 0) => {
    const point = await project(cell, height);
    await page.mouse.click(point.x, point.y);
    return point;
  };
  const closeTarget = async () => {
    const close = page.locator(".target-window button.close");
    if (await close.count()) await close.first().click();
  };
  const inspect = async (kind, id, cell) => {
    const point = await project(cell, 0);
    const offsets = [
      [0, -12],
      [0, -24],
      [-12, -18],
      [12, -18],
      [-20, -8],
      [20, -8],
      [0, 0],
    ];
    const attempts = [];
    for (const [dx, dy] of offsets) {
      await closeTarget();
      const at = { x: point.x + dx, y: point.y + dy };
      await page.mouse.click(at.x, at.y);
      await page.waitForTimeout(80);
      const selected = await selection();
      attempts.push({ at, selected: selected[kind] ?? null });
      if (selected[kind] === id) return { at, attempts };
    }
    throw new Error(
      `could not inspect ${kind}:${id} ${JSON.stringify(attempts)}`,
    );
  };
  const setPaused = async (wanted) => {
    if ((await state()).paused !== wanted) {
      await page.locator("#pause").click();
      await waitState(
        (value) => window.__GOBLIN.state.paused === value,
        wanted,
      );
    }
  };
  const screenshot = async (name) => {
    await page.screenshot({ path: `${output}/${name}.png` });
    evidence.screenshots.push(`${name}.png`);
  };
  const key = (cell) => `${cell.x},${cell.z},${cell.level ?? 0}`;
  const stationAnchor = (snapshot) => {
    const blocked = new Set(
      [
        ...snapshot.trees,
        ...snapshot.rocks,
        ...snapshot.sources,
        ...snapshot.herbs,
        ...snapshot.sites,
        ...Object.values(snapshot.actors),
        ...snapshot.materials.lots
          .filter((lot) => lot.location.kind === "ground")
          .map((lot) => lot.location),
      ].map(key),
    );
    for (let z = 2; z < 12; z++)
      for (let x = 2; x < 12; x++) {
        const cells = [
          { x, z, level: 0 },
          { x: x + 1, z, level: 0 },
          { x, z: z + 1, level: 0 },
          { x: x + 1, z: z + 1, level: 0 },
        ];
        if (cells.every((cell) => !blocked.has(key(cell)))) return cells[0];
      }
    throw new Error("no clear 2x2 station anchor");
  };
  const openBuild = async () => {
    if (!(await page.locator('[data-build="brew-station"]').count()))
      await page.getByRole("button", { name: "Build", exact: true }).click();
    await page.locator('[data-build="brew-station"]').waitFor();
  };

  assert.equal(
    (await page.goto(url, { waitUntil: "domcontentloaded" }))?.status(),
    200,
  );
  await waitState(() => window.__GOBLIN?.artReady, null, 90_000);
  await page.locator("#stage canvas").waitFor();
  const fresh = await state();
  assert.equal(fresh.paused, true);
  assert.equal(fresh.tick, 0);
  const cache = fresh.sources.find(
    (source) => source.kind === "reclaimed-timber-cache",
  );
  const spring = fresh.sources.find((source) => source.kind === "spring");
  assert.ok(cache && spring);
  const initialSpring = fresh.materials.lots.find(
    (lot) =>
      lot.material === "water" &&
      lot.location.kind === "container" &&
      lot.location.container === `source:${spring.id}`,
  );
  assert.equal(initialSpring?.quantity, 8);
  evidence.claims.fresh = {
    paused: true,
    tick: 0,
    cache: { id: cache.id, access: cache.access },
    spring: { id: spring.id, water: initialSpring.quantity },
  };

  await page.locator("#continue").click();
  await waitState(() => !window.__GOBLIN.state.paused);
  await page.locator("#speed").click();
  const oak = (await state()).trees.find((tree) => tree.felledAt === null);
  assert.ok(oak);
  await inspect("tree", oak.id, oak);
  await page.locator("#mark-chop").click();
  await waitState(
    (id) =>
      window.__GOBLIN.state.jobs.some(
        (job) => job.kind === "chop" && job.target === id,
      ),
    oak.id,
  );
  await waitState(
    (id) =>
      window.__GOBLIN.state.trees.find((tree) => tree.id === id)?.felledAt !==
      null,
    oak.id,
    60_000,
  );
  await setPaused(true);
  assert.equal(
    (await state()).materials.lots.find(
      (lot) => lot.material === "wood" && lot.location.kind === "ground",
    )?.quantity,
    6,
  );

  const cachePick = await inspect("source", cache.id, cache);
  await page.getByRole("region", { name: "Finite source details" }).waitFor();
  assert.match(await page.locator("body").innerText(), /Wood 10\/10/);
  await page.locator("#repair-cache").click();
  await setPaused(false);
  await waitState(
    (id) =>
      window.__GOBLIN.state.sources.find((source) => source.id === id)
        ?.repaired === true,
    cache.id,
    60_000,
  );
  await setPaused(true);
  const repaired = await state();
  assert.equal(repaired.materials.consumedWood, 2);
  assert.equal(
    repaired.materials.lots.find(
      (lot) => lot.material === "wood" && lot.location.kind === "ground",
    )?.quantity,
    4,
  );
  evidence.claims.cacheRepair = {
    id: cache.id,
    selectedAt: cachePick.at,
    repaired: true,
    consumedOrdinaryWood: 2,
  };

  const anchor = stationAnchor(await state());
  await openBuild();
  await page.locator('[data-build="brew-station"]').click();
  await clickCell(anchor);
  await page.locator("#task").click();
  await waitState(
    ({ x, z }) =>
      window.__GOBLIN.state.sites.some(
        (site) => site.type === "brew-station" && site.x === x && site.z === z,
      ),
    anchor,
  );
  const station = (await state()).sites.find(
    (site) =>
      site.type === "brew-station" &&
      site.x === anchor.x &&
      site.z === anchor.z,
  );
  assert.ok(station);
  await setPaused(false);
  await waitState(
    (id) =>
      window.__GOBLIN.state.sites.find((site) => site.id === id)?.finishedAt !==
      null,
    station.id,
    60_000,
  );
  await setPaused(true);
  const built = await state();
  assert.equal(
    built.materials.embedded.find(
      (entry) => entry.container === `construction-buffer:${station.id}`,
    )?.quantity,
    6,
  );
  assert.equal(
    built.materials.lots.find(
      (lot) =>
        lot.material === "wood" &&
        lot.location.kind === "container" &&
        lot.location.container === `source:${cache.id}`,
    )?.quantity,
    8,
  );
  assert.equal(
    built.materials.lots.filter(
      (lot) => lot.material === "wood" && lot.location.kind === "ground",
    ).length,
    0,
  );
  evidence.claims.station = {
    id: station.id,
    anchor,
    footprint: [
      anchor,
      { x: anchor.x + 1, z: anchor.z, level: 0 },
      { x: anchor.x, z: anchor.z + 1, level: 0 },
      { x: anchor.x + 1, z: anchor.z + 1, level: 0 },
    ],
    finished: true,
    wood: { embedded: 6, groundUsed: 4, cacheUsed: 2, cacheRemaining: 8 },
  };

  const stationPick = await inspect("site", station.id, station);
  const structure = page.getByRole("region", { name: "Structure actions" });
  await structure.waitFor();
  assert.match(await structure.innerText(), /Kettle water 0\/2/);
  await page.locator("#fill-kettle").click();
  await setPaused(false);
  await waitState(
    () => {
      const current = window.__GOBLIN.state;
      const operation = current.operations.find(
        (entry) => entry.phase === "pour",
      );
      if (!operation) return false;
      const transfer = current.materials.transfers.find(
        (entry) =>
          entry.owner.kind === "operation" &&
          entry.owner.operation === operation.id &&
          entry.phase.kind === "carrying",
      );
      const water = current.materials.lots.find(
        (lot) => lot.id === operation.water && lot.quantity === 2,
      );
      return !!transfer && !!water;
    },
    null,
    60_000,
  );
  await setPaused(true);
  const carrying = await state();
  const operation = carrying.operations.find((entry) => entry.phase === "pour");
  const transfer = carrying.materials.transfers.find(
    (entry) =>
      entry.owner.kind === "operation" &&
      entry.owner.operation === operation.id,
  );
  assert.equal(transfer.phase.kind, "carrying");
  const pailWater = carrying.materials.lots.find(
    (lot) => lot.id === operation.water,
  );
  assert.equal(pailWater.quantity, 2);
  assert.equal(pailWater.location.container, `vessel:${operation.pail}`);
  evidence.claims.carrying = {
    operation: operation.id,
    actor: operation.actor,
    pail: operation.pail,
    water: pailWater.id,
    quantity: pailWater.quantity,
    phase: operation.phase,
  };
  await screenshot("filled-pail-to-kettle");

  await setPaused(false);
  await waitState(
    (id) => {
      const current = window.__GOBLIN.state;
      return (
        !current.jobs.some(
          (job) => job.kind === "fill-kettle" && job.target === id,
        ) &&
        !current.operations.some((entry) => entry.station === id) &&
        current.materials.lots.some(
          (lot) =>
            lot.material === "water" &&
            lot.quantity === 2 &&
            lot.location.kind === "container" &&
            lot.location.container === `kettle:${id}`,
        )
      );
    },
    station.id,
    60_000,
  );
  await setPaused(true);
  const finished = await state();
  const finalSpring = finished.materials.lots.find(
    (lot) => lot.id === initialSpring.id,
  );
  const finalPail = finished.materials.lots.find(
    (lot) => lot.material === "pail",
  );
  assert.equal(finalSpring.quantity, 6);
  assert.equal(finished.operations.length, 0);
  assert.equal(finished.materials.vesselUses.length, 0);
  assert.equal(
    finished.materials.transfers.filter(
      (entry) => entry.owner.kind === "operation",
    ).length,
    0,
  );
  assert.equal(finalPail.location.kind, "ground");
  const finalStationPick = await inspect("site", station.id, station);
  await structure.waitFor();
  assert.match(await structure.innerText(), /Kettle water 2\/2/);
  await screenshot("filled-kettle-settled");
  evidence.claims.settlement = {
    station: station.id,
    selectedAt: finalStationPick.at,
    kettleWater: 2,
    springWater: finalSpring.quantity,
    operationCount: 0,
    vesselUseCount: 0,
    operationTransferCount: 0,
    pailLocation: finalPail.location,
  };
  assert.deepEqual(evidence.errors, []);
} catch (error) {
  evidence.failure = { message: error.message, stack: error.stack };
  if (browser) {
    const pages = browser.contexts().flatMap((context) => context.pages());
    if (pages[0]) {
      evidence.failure.state = await pages[0]
        .evaluate(() => window.__GOBLIN?.state ?? null)
        .catch(() => null);
      await pages[0].screenshot({ path: `${output}/failure.png` });
      evidence.screenshots.push("failure.png");
    }
  }
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  await writeFile(
    `${output}/proof.json`,
    `${JSON.stringify(evidence, null, 2)}\n`,
  );
}
