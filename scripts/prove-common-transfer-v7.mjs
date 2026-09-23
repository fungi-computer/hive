import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const url = process.argv[2] || "http://127.0.0.1:5188/";
const output =
  process.argv[3] || ".botanical/common-transfer-v7-final-20260908/local";
const parityOnly = process.argv.includes("--parity-only");

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const assetRefs = (html) =>
  [...html.matchAll(/(?:src|href)=["']\/?(assets\/[^"']+)["']/g)].map(
    (match) => match[1],
  );
const assetHashes = async (root, refs, fetchAsset = null) =>
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
  url,
  output,
  mode: parityOnly ? "served-byte-parity" : "local-served-browser-interaction",
  scriptSha256: sha256(await readFile("scripts/prove-common-transfer-v7.mjs")),
  errors: [],
  screenshots: [],
  claims: {},
};

let browser;
let context;
let page;

try {
  const localIndex = await readFile("dist/index.html");
  const localRefs = assetRefs(localIndex.toString("utf8"));
  const local = {
    index: sha256(localIndex),
    assets: await assetHashes("dist", localRefs),
  };
  const response = await fetch(url);
  assert.equal(response.status, 200, "served index must return HTTP 200");
  const servedUrl = response.url || url;
  const servedIndex = Buffer.from(await response.arrayBuffer());
  const servedRefs = assetRefs(servedIndex.toString("utf8"));
  assert.deepEqual(servedRefs, localRefs, "served index asset graph drifted");
  const served = {
    index: sha256(servedIndex),
    assets: await assetHashes("", servedRefs, async (ref) => {
      const assetResponse = await fetch(new URL(ref, servedUrl));
      assert.equal(assetResponse.status, 200, `${ref} must return HTTP 200`);
      return assetResponse;
    }),
  };
  assert.deepEqual(served, local, "served bytes differ from frozen dist");
  evidence.parity = { local, served, exact: true };

  if (!parityOnly) {
    browser = await chromium.launch({
      headless: true,
      executablePath: process.env.CHROMIUM_PATH,
      args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
    });
    context = await browser.newContext({
      viewport: { width: 1100, height: 760 },
      deviceScaleFactor: 1,
    });
    page = await context.newPage();
    page.setDefaultTimeout(45_000);
    page.on("pageerror", (error) =>
      evidence.errors.push(`pageerror: ${error}`),
    );
    page.on("console", (message) => {
      if (message.type() === "error")
        evidence.errors.push(`console: ${message.text()}`);
    });
    page.on("requestfailed", (request) =>
      evidence.errors.push(
        `requestfailed: ${request.url()} · ${request.failure()?.errorText || "unknown"}`,
      ),
    );

    const state = () => page.evaluate(() => window.__GOBLIN.state);
    const selection = () => page.evaluate(() => window.__GOBLIN.selection);
    const waitState = (predicate, value = null, timeout = 45_000) =>
      page.waitForFunction(predicate, value, { timeout });
    const project = (cell, height = 0) =>
      page.evaluate(
        ([x, z, level, nextHeight]) =>
          window.__GOBLIN.project(x, z, nextHeight, level),
        [cell.x, cell.z, cell.level ?? 0, height],
      );
    const clickCell = async (cell, height = 0) => {
      const point = await project(cell, height);
      await page.mouse.click(point.x, point.y);
      return point;
    };
    const inspect = async (kind, id, cell, height) => {
      const point = await project(cell, height);
      const canvas = await page.locator("#stage canvas").boundingBox();
      const zoom = canvas.width >= 900 ? 2 : 1;
      const offsets = [
        [0, 0],
        [0, -8 * zoom],
        [-12 * zoom, -8 * zoom],
        [12 * zoom, -8 * zoom],
        [0, -18 * zoom],
        [-12 * zoom, -18 * zoom],
        [12 * zoom, -18 * zoom],
      ];
      const attempts = [];
      for (const [x, y] of offsets) {
        const at = { x: point.x + x, y: point.y + y };
        await page.mouse.click(at.x, at.y);
        await page.waitForTimeout(80);
        attempts.push({ at, selected: (await selection())[kind] });
        if ((await selection())[kind] === id) return at;
        for (const selector of [
          ".target-window button.close",
          ".character-window button.close",
        ]) {
          const close = page.locator(selector);
          if (await close.count()) await close.first().click();
        }
      }
      throw new Error(
        `could not select ${kind} ${id} through its rendered body: ${JSON.stringify(attempts)}`,
      );
    };
    const screenshot = async (name) => {
      await page.screenshot({ path: `${output}/${name}.png` });
      evidence.screenshots.push(`${name}.png`);
    };
    const clearCell = (snapshot, awayFrom = null) => {
      const key = (cell) => `${cell.x},${cell.z},${cell.level ?? 0}`;
      const blocked = new Set(
        [
          ...snapshot.trees,
          ...snapshot.rocks,
          snapshot.watcher,
          ...snapshot.herbs,
          ...snapshot.sites,
          ...Object.values(snapshot.actors),
          ...snapshot.materials.lots
            .filter((lot) => lot.location.kind === "ground")
            .map((lot) => lot.location),
        ].map(key),
      );
      const candidates = [];
      for (let z = 2; z <= 12; z++)
        for (let x = 2; x <= 12; x++) {
          const cell = { x, z, level: 0 };
          if (!blocked.has(key(cell))) candidates.push(cell);
        }
      const origin = awayFrom || snapshot.actors.rowan;
      candidates.sort(
        (a, b) =>
          Math.abs(a.x - origin.x) +
          Math.abs(a.z - origin.z) -
          (Math.abs(b.x - origin.x) + Math.abs(b.z - origin.z)),
      );
      assert.ok(candidates[0], "a clear ground cell must exist");
      return candidates[0];
    };
    const openBuild = async () => {
      if (!(await page.locator('[data-build="shelf"]').count()))
        await page.getByRole("button", { name: "Build", exact: true }).click();
    };
    const legacyLiveFieldsAbsent = (snapshot) => ({
      clearing: [
        "piles",
        "herbBundles",
        "claims",
        "herbStorageClaims",
        "consumedWood",
      ].every((key) => !(key in snapshot)),
      actors: Object.values(snapshot.actors).every(
        (actor) => !("cargo" in actor),
      ),
      sites: snapshot.sites.every(
        (site) => !("delivered" in site) && !("materials" in site),
      ),
    });

    assert.equal(
      (await page.goto(url, { waitUntil: "domcontentloaded" }))?.status(),
      200,
    );
    await waitState(() => window.__GOBLIN?.artReady);
    await page.waitForSelector("#stage canvas");
    const fresh = await state();
    assert.equal(fresh.tick, 0);
    assert.equal(fresh.paused, true);
    assert.deepEqual(fresh.materials.lots, []);
    assert.deepEqual(legacyLiveFieldsAbsent(fresh), {
      clearing: true,
      actors: true,
      sites: true,
    });
    await page.locator("#continue").click();
    await waitState(() => !window.__GOBLIN.state.paused);
    await page.locator("#pause").click();
    await waitState(() => window.__GOBLIN.state.paused);

    const oak = (await state()).trees.find((tree) => tree.felledAt === null);
    assert.ok(oak);
    const oakPoint = await inspect("tree", oak.id, oak, 1.5);
    await page.locator("#mark-chop").click();
    await waitState(
      (id) =>
        window.__GOBLIN.state.jobs.some(
          (job) => job.kind === "chop" && job.target === id,
        ),
      oak.id,
    );
    await page.locator("#speed").click();
    await page.locator("#pause").click();
    await waitState(
      (id) =>
        window.__GOBLIN.state.trees.find((tree) => tree.id === id)?.felledAt !==
        null,
      oak.id,
    );
    await page.locator("#pause").click();
    await waitState(() => window.__GOBLIN.state.paused);

    const afterChop = await state();
    const woodLot = afterChop.materials.lots.find(
      (lot) => lot.material === "wood" && lot.location.kind === "ground",
    );
    assert.ok(woodLot);
    assert.equal(woodLot.quantity, 6);
    await openBuild();
    await page.locator('[data-build="shelf"]').click();
    const shelfCell = clearCell(afterChop);
    await clickCell(shelfCell);
    await waitState(
      (cell) =>
        window.__GOBLIN.state.sites.some(
          (site) =>
            site.type === "shelf" && site.x === cell.x && site.z === cell.z,
        ),
      shelfCell,
    );
    if (await page.locator("#task").count())
      await page.locator("#task").click();
    const shelf = (await state()).sites.find(
      (site) =>
        site.type === "shelf" &&
        site.x === shelfCell.x &&
        site.z === shelfCell.z,
    );
    assert.ok(shelf);
    await page.locator("#pause").click();
    await waitState(
      (id) =>
        window.__GOBLIN.state.sites.find((site) => site.id === id)
          ?.finishedAt !== null,
      shelf.id,
    );
    await page.locator("#pause").click();
    await waitState(() => window.__GOBLIN.state.paused);
    const built = await state();
    assert.deepEqual(
      built.materials.embedded.find(
        (entry) => entry.container === `construction-buffer:${shelf.id}`,
      ),
      {
        container: `construction-buffer:${shelf.id}`,
        material: "wood",
        quantity: 1,
      },
    );

    await openBuild();
    await page.locator("#herb-tool").click();
    const herbCell = clearCell(await state(), shelfCell);
    await clickCell(herbCell);
    await waitState(
      () =>
        window.__GOBLIN.state.herbs.length === 1 &&
        window.__GOBLIN.state.jobs.some((job) => job.kind === "sow"),
    );
    const herbId = (await state()).herbs[0].id;
    if (await page.locator("#cancel-herb").count())
      await page.locator("#cancel-herb").click();
    const closeBuild = page.getByRole("button", {
      name: "Close Build",
      exact: true,
    });
    if (await closeBuild.count()) await closeBuild.click();
    await page.locator("#pause").click();
    await waitState(
      (id) =>
        window.__GOBLIN.state.herbs.find((herb) => herb.id === id)?.stage ===
        "ready",
      herbId,
    );
    await page.locator("#pause").click();
    await waitState(() => window.__GOBLIN.state.paused);
    const readyHerb = (await state()).herbs.find((herb) => herb.id === herbId);
    assert.ok(readyHerb);
    const herbPoint = await inspect("herb", herbId, readyHerb, 0.5);
    await page.locator("#harvest-herb").click();
    await page.locator("#pause").click();
    await waitState(() =>
      window.__GOBLIN.state.materials.lots.some(
        (lot) => lot.material === "mugwort" && lot.location.kind === "ground",
      ),
    );
    await page.locator("#pause").click();
    await waitState(() => window.__GOBLIN.state.paused);

    const harvested = await state();
    const bundle = harvested.materials.lots.find(
      (lot) => lot.material === "mugwort" && lot.location.kind === "ground",
    );
    assert.ok(bundle);
    assert.equal(bundle.quantity, 1);
    const bundlePoint = await inspect("bundle", bundle.id, bundle.location, 0);
    const store = page.locator(
      `[data-action="store-herb"][data-bundle="${bundle.id}"][data-site="${shelf.id}"]`,
    );
    assert.equal(await store.count(), 1);
    await store.click();
    await waitState(
      (id) =>
        window.__GOBLIN.state.jobs.some(
          (job) => job.kind === "transfer" && job.source === id,
        ),
      bundle.id,
    );
    const admitted = await state();
    assert.equal(admitted.paused, true);
    assert.equal(
      admitted.jobs.find(
        (job) => job.kind === "transfer" && job.source === bundle.id,
      )?.scope.actors,
      null,
    );
    await page.locator("#pause").click();
    await waitState(
      ({ id, container }) =>
        window.__GOBLIN.state.materials.lots.some(
          (lot) =>
            lot.id === id &&
            lot.location.kind === "container" &&
            lot.location.container === container,
        ),
      { id: bundle.id, container: `shelf:${shelf.id}` },
    );
    await page.locator("#pause").click();
    await waitState(() => window.__GOBLIN.state.paused);

    const stored = await state();
    assert.equal(stored.materials.transfers.length, 0);
    assert.equal(
      stored.jobs.some((job) => job.kind === "transfer"),
      false,
    );
    assert.equal(stored.harvestedHerbs, 1);
    assert.equal(stored.materials.consumedWood, 0);
    assert.deepEqual(legacyLiveFieldsAbsent(stored), {
      clearing: true,
      actors: true,
      sites: true,
    });
    evidence.claims.lifecycle = {
      oakId: oak.id,
      oakPoint,
      sourceWoodLot: woodLot.id,
      shelfId: shelf.id,
      shelfCell,
      embeddedWood: 1,
      herbId,
      herbPoint,
      bundleId: bundle.id,
      bundlePoint,
      storedContainer: `shelf:${shelf.id}`,
      finalTick: stored.tick,
      freshV7Only: true,
    };
    await screenshot("stored-common-transfer-v7");

    const savedMaterials = structuredClone(stored.materials);
    const beforeRevision =
      (await page.evaluate(() => window.__GOBLIN.persistence)).revision ?? -1;
    await waitState(
      ({ tick, revision }) => {
        const save = window.__GOBLIN.persistence;
        return (
          save.phase === "saved" &&
          save.tick === tick &&
          save.revision >= revision
        );
      },
      { tick: stored.tick, revision: beforeRevision },
    );
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitState(() => window.__GOBLIN?.artReady);
    const restored = await state();
    assert.equal(restored.paused, true);
    assert.equal(restored.tick, stored.tick);
    assert.deepEqual(restored.materials, savedMaterials);
    assert.equal(restored.commands.length, 0);
    assert.deepEqual(legacyLiveFieldsAbsent(restored), {
      clearing: true,
      actors: true,
      sites: true,
    });
    evidence.claims.reload = {
      tick: restored.tick,
      paused: true,
      exactMaterials: true,
      commandsCleared: true,
      bundleId: bundle.id,
      location: restored.materials.lots.find((lot) => lot.id === bundle.id)
        ?.location,
    };
    await screenshot("restored-common-transfer-v7");
    assert.deepEqual(evidence.errors, []);
  }
  evidence.success = true;
} catch (error) {
  evidence.success = false;
  evidence.failure = String(error?.stack || error);
  await page?.screenshot({ path: `${output}/failure.png` }).catch(() => {});
  console.error(evidence.failure);
  process.exitCode = 1;
} finally {
  await writeFile(
    `${output}/proof.json`,
    `${JSON.stringify(evidence, null, 2)}\n`,
  );
  await context?.close();
  await browser?.close();
  console.log(JSON.stringify(evidence, null, 2));
}
