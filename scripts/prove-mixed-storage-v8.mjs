import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const url = process.argv[2] || "http://127.0.0.1:5188/";
const output =
  process.argv[3] || ".botanical/mixed-storage-v8-final-20260908/local";
const parityOnly = process.argv.includes("--parity-only");
const runner =
  "/home/levi/src/Botanical-next/.agents/skills/orchestrate-multi-lane-work/scripts/run-proof.sh";

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
  scriptSha256: sha256(await readFile("scripts/prove-mixed-storage-v8.mjs")),
  wrapper: {
    runner,
    scope:
      "RuntimeMaxSec=10min; fresh-v8 mixed storage plus reserved transfer save/reload (migration, carrying reload, and contention remain unit-law claims)",
  },
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
    const persistence = () => page.evaluate(() => window.__GOBLIN.persistence);
    const waitState = (predicate, value = null, timeout = 45_000) =>
      page.waitForFunction(predicate, value, { timeout });
    const project = (cell, height = 0) =>
      page.evaluate(
        ([x, z, nextHeight, level]) =>
          window.__GOBLIN.project(x, z, nextHeight, level),
        [cell.x, cell.z, height, cell.level ?? 0],
      );
    const clickCell = async (cell, height = 0) => {
      const point = await project(cell, height);
      await page.mouse.click(point.x, point.y);
      return point;
    };
    const inspect = async (kind, id, cell, height = 0) => {
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
        const current = await selection();
        attempts.push({ at, selected: current[kind] ?? null });
        if (current[kind] === id) return at;
        for (const selector of [
          ".target-window button.close",
          ".character-window button.close",
        ]) {
          const close = page.locator(selector);
          if (await close.count()) await close.first().click();
        }
      }
      throw new Error(
        `could not select ${kind} ${id} through rendered body: ${JSON.stringify(attempts)}`,
      );
    };
    const screenshot = async (name) => {
      await page.screenshot({ path: `${output}/${name}.png` });
      evidence.screenshots.push(`${name}.png`);
    };
    const setPaused = async (wanted) => {
      const current = await state();
      if (current.paused !== wanted) {
        await page.locator("#pause").click();
        await waitState(
          (value) => window.__GOBLIN.state.paused === value,
          wanted,
        );
      }
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
      if (!(await page.locator('[data-build="shelf"]').count())) {
        const build = page.getByRole("button", { name: "Build", exact: true });
        assert.equal(await build.count(), 1, "Build control missing");
        await build.click();
      }
      await page.locator('[data-build="shelf"]').waitFor();
    };
    const placeBuilding = async (type, cell) => {
      await openBuild();
      await page.locator(`[data-build="${type}"]`).click();
      await clickCell(cell);
      await page.locator("#task").click();
      await waitState(
        ({ type: wantedType, x, z }) =>
          window.__GOBLIN.state.sites.some(
            (site) => site.type === wantedType && site.x === x && site.z === z,
          ),
        { type, x: cell.x, z: cell.z },
      );
    };
    const openDatabase = () =>
      page.evaluate(
        ({ dbName, storeName }) =>
          new Promise((resolve, reject) => {
            const request = indexedDB.open(dbName, 1);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
              const db = request.result;
              if (!db.objectStoreNames.contains(storeName)) {
                db.close();
                reject(new Error(`Missing IndexedDB store ${storeName}`));
                return;
              }
              db.close();
              resolve(true);
            };
          }),
        { dbName: "hive-local-world", storeName: "world" },
      );
    const readSlot = async () => {
      await openDatabase();
      return page.evaluate(
        ({ dbName, storeName, key }) =>
          new Promise((resolve, reject) => {
            const request = indexedDB.open(dbName, 1);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
              const db = request.result;
              const tx = db.transaction(storeName, "readonly");
              const get = tx.objectStore(storeName).get(key);
              get.onerror = () => reject(get.error);
              get.onsuccess = () => {
                const value = get.result === undefined ? null : get.result;
                db.close();
                resolve(value);
              };
            };
          }),
        { dbName: "hive-local-world", storeName: "world", key: "current" },
      );
    };
    const storageMaterials = (snapshot, shelfId) =>
      snapshot.materials.lots.filter(
        (lot) =>
          lot.location.kind === "container" &&
          lot.location.container === `shelf:${shelfId}`,
      );
    const assertTransferJoin = (snapshot, shelfId, wallId) => {
      const wallJob = snapshot.jobs.find(
        (job) => job.kind === "build" && job.target === wallId,
      );
      assert.ok(wallJob, "wall build job must survive the reserved snapshot");
      const transfer = snapshot.materials.transfers.find(
        (candidate) => candidate.owner.job === wallJob.id,
      );
      assert.ok(
        transfer,
        "wall build transfer must survive the reserved snapshot",
      );
      assert.deepEqual(transfer.request.source, {
        kind: "eligible-container",
        material: "wood",
        container: `shelf:${shelfId}`,
      });
      assert.equal(transfer.request.quantity, 1);
      assert.equal(transfer.request.quantityPolicy, "portion");
      assert.equal(
        transfer.request.destination,
        `construction-buffer:${wallId}`,
      );
      assert.equal(transfer.phase.kind, "reserved");
      assert.equal(transfer.phase.quantity, 1);
      assert.equal(
        transfer.phase.sourceLot,
        storageMaterials(snapshot, shelfId).find(
          (lot) => lot.material === "wood",
        )?.id,
      );
      const actor = snapshot.actors[transfer.actor];
      assert.ok(actor, "transfer actor must exist");
      assert.deepEqual(actor.task, {
        kind: "transfer",
        job: wallJob.id,
        target: transfer.id,
        duration: 8,
      });
      assert.deepEqual(actor.assignment, {
        character: actor.id,
        task: wallJob.id,
        cost: actor.assignment.cost,
      });
      return { wallJob, transfer, actor };
    };

    assert.equal(
      (await page.goto(url, { waitUntil: "domcontentloaded" }))?.status(),
      200,
    );
    await waitState(() => window.__GOBLIN?.artReady, null, 90_000);
    await page.waitForSelector("#stage canvas");
    const fresh = await state();
    assert.equal(fresh.tick, 0);
    assert.equal(fresh.paused, true);
    assert.equal((await persistence()).slot, "missing");
    assert.deepEqual(fresh.materials.lots, []);
    evidence.claims.fresh = { tick: 0, paused: true, missingSlot: true };

    await page.locator("#continue").click();
    await waitState(() => !window.__GOBLIN.state.paused);
    await page.locator("#pause").click();
    await waitState(() => window.__GOBLIN.state.paused);
    await page.locator("#speed").click();

    const oak = (await state()).trees.find((tree) => tree.felledAt === null);
    assert.ok(oak, "an oak must be available");
    await inspect("tree", oak.id, oak, 1.5);
    await page.locator("#mark-chop").click();
    await waitState(
      (id) =>
        window.__GOBLIN.state.jobs.some(
          (job) => job.kind === "chop" && job.target === id,
        ),
      oak.id,
    );
    await setPaused(false);
    await waitState(
      (id) =>
        window.__GOBLIN.state.trees.find((tree) => tree.id === id)?.felledAt !==
        null,
      oak.id,
    );
    await setPaused(true);
    const afterChop = await state();
    const choppedWood = afterChop.materials.lots.find(
      (lot) => lot.material === "wood" && lot.location.kind === "ground",
    );
    assert.ok(choppedWood);
    assert.equal(choppedWood.quantity, 6);

    const shelfCell = clearCell(afterChop);
    await placeBuilding("shelf", shelfCell);
    const shelf = (await state()).sites.find(
      (site) =>
        site.type === "shelf" &&
        site.x === shelfCell.x &&
        site.z === shelfCell.z,
    );
    assert.ok(shelf);
    const wallCells = [];
    for (let i = 0; i < 3; i++) {
      const cell = clearCell(await state(), shelfCell);
      wallCells.push(cell);
      await placeBuilding("wall", cell);
    }
    await setPaused(false);
    await waitState(
      (ids) =>
        ids.every(
          (id) =>
            window.__GOBLIN.state.sites.find((site) => site.id === id)
              ?.finishedAt !== null,
        ),
      [
        shelf.id,
        ...(await state()).sites
          .filter((site) => site.type === "wall")
          .map((site) => site.id),
      ],
      60_000,
    );
    await setPaused(true);
    const built = await state();
    const builtWood = built.materials.lots.find(
      (lot) => lot.material === "wood" && lot.location.kind === "ground",
    );
    assert.ok(builtWood);
    assert.equal(builtWood.quantity, 2);
    assert.equal(
      built.materials.lots.filter(
        (lot) => lot.material === "wood" && lot.location.kind === "ground",
      ).length,
      1,
    );
    evidence.claims.construction = {
      oakId: oak.id,
      woodFromOak: 6,
      shelfId: shelf.id,
      wallCells,
      finishedSites: [
        shelf.id,
        ...built.sites
          .filter((site) => site.type === "wall")
          .map((site) => site.id),
      ],
      groundWood: 2,
    };

    await openBuild();
    await page.locator("#herb-tool").click();
    const herbCells = [];
    for (let i = 0; i < 2; i++) {
      const cell = clearCell(await state(), shelfCell);
      herbCells.push(cell);
      await clickCell(cell);
      await waitState(
        (count) => window.__GOBLIN.state.herbs.length === count,
        i + 1,
      );
    }
    const cancelHerb = page.locator("#cancel-herb");
    if (await cancelHerb.count()) await cancelHerb.click();
    const closeBuild = page.getByRole("button", {
      name: "Close Build",
      exact: true,
    });
    if (await closeBuild.count()) await closeBuild.click();
    await setPaused(false);
    await waitState(
      () =>
        window.__GOBLIN.state.herbs.length === 2 &&
        window.__GOBLIN.state.herbs.every((herb) => herb.stage === "ready"),
      null,
      60_000,
    );
    await setPaused(true);
    const readyHerbs = await state();
    for (const herb of readyHerbs.herbs) {
      await inspect("herb", herb.id, herb, 0.5);
      await page.locator("#harvest-herb").click();
      await waitState(
        (id) =>
          window.__GOBLIN.state.jobs.some(
            (job) => job.kind === "harvest" && job.target === id,
          ),
        herb.id,
      );
    }
    await setPaused(false);
    await waitState(
      () =>
        window.__GOBLIN.state.materials.lots.filter(
          (lot) => lot.material === "mugwort" && lot.location.kind === "ground",
        ).length === 2,
      null,
      60_000,
    );
    await setPaused(true);
    const harvested = await state();
    const mugwortLots = harvested.materials.lots.filter(
      (lot) => lot.material === "mugwort" && lot.location.kind === "ground",
    );
    assert.equal(mugwortLots.length, 2);
    assert.deepEqual(
      mugwortLots.map((lot) => lot.quantity),
      [1, 1],
    );
    evidence.claims.herbs = {
      plantedCells: herbCells,
      harvestedLots: mugwortLots.map((lot) => lot.id),
      quantities: [1, 1],
    };

    const storeLot = async (lotId) => {
      const snapshot = await state();
      const lot = snapshot.materials.lots.find(
        (candidate) => candidate.id === lotId,
      );
      assert.ok(lot && lot.location.kind === "ground");
      await inspect("lot", lot.id, lot.location, 0);
      await page
        .getByRole("region", { name: "Material lot actions", exact: true })
        .waitFor();
      const store = page.locator(
        `[data-action="store"][data-lot="${lot.id}"][data-site="${shelf.id}"]`,
      );
      assert.equal(
        await store.count(),
        1,
        `store control missing for ${lot.id}`,
      );
      await store.click();
      await waitState(
        ({ id, shelfId }) =>
          window.__GOBLIN.state.jobs.some(
            (job) =>
              job.kind === "store" &&
              job.source === id &&
              job.destination === `shelf:${shelfId}`,
          ),
        { id: lot.id, shelfId: shelf.id },
      );
      await setPaused(false);
      await waitState(
        ({ id, shelfId }) => {
          const current = window.__GOBLIN.state;
          return (
            !current.jobs.some(
              (job) => job.kind === "store" && job.source === id,
            ) &&
            current.materials.lots.some(
              (candidate) =>
                candidate.id === id &&
                candidate.location.kind === "container" &&
                candidate.location.container === `shelf:${shelfId}`,
            )
          );
        },
        { id: lot.id, shelfId: shelf.id },
        60_000,
      );
      await setPaused(true);
    };

    const woodToStore = (await state()).materials.lots.find(
      (lot) => lot.material === "wood" && lot.location.kind === "ground",
    );
    assert.ok(woodToStore);
    assert.equal(woodToStore.quantity, 2);
    await storeLot(woodToStore.id);
    for (const lot of mugwortLots) await storeLot(lot.id);
    const stored = await state();
    assert.equal(
      stored.materials.lots.filter(
        (lot) => lot.material === "wood" && lot.location.kind === "ground",
      ).length,
      0,
    );
    assert.deepEqual(
      storageMaterials(stored, shelf.id).map((lot) => [
        lot.material,
        lot.quantity,
      ]),
      [
        ["wood", 2],
        ["mugwort", 1],
        ["mugwort", 1],
      ],
    );
    await inspect("site", shelf.id, shelf, 0.5);
    const shelfRegion = page.getByRole("region", {
      name: "Structure actions",
      exact: true,
    });
    await shelfRegion.waitFor();
    const shelfText = await shelfRegion.textContent();
    assert.match(shelfText, /Wood 2 · Mugwort 2 · 6\/6 bulk/);
    assert.match(
      await page.locator("body").innerText(),
      /Wood 2 · Mugwort 2 · 6\/6 bulk/,
    );
    await screenshot("mixed-storage-filled-shelf");
    evidence.claims.fullShelf = {
      shelfId: shelf.id,
      groupedText: "Wood 2 · Mugwort 2 · 6/6 bulk",
      wood: 2,
      mugwort: 2,
      bulk: 6,
    };

    const wallCell = clearCell(await state(), shelfCell);
    await placeBuilding("wall", wallCell);
    const wall = (await state()).sites.find(
      (site) =>
        site.type === "wall" &&
        site.x === wallCell.x &&
        site.z === wallCell.z &&
        site.finishedAt === null,
    );
    assert.ok(wall);
    const wallJob = (await state()).jobs.find(
      (job) => job.kind === "build" && job.target === wall.id,
    );
    assert.ok(wallJob);
    await setPaused(false);
    await waitState(
      (id) =>
        window.__GOBLIN.state.materials.transfers.some(
          (transfer) =>
            transfer.owner.job === id && transfer.phase.kind === "reserved",
        ),
      wallJob.id,
    );
    await setPaused(true);
    const reserved = await state();
    const liveJoin = assertTransferJoin(reserved, shelf.id, wall.id);
    const groundWoodAfterAdmission = reserved.materials.lots.filter(
      (lot) => lot.material === "wood" && lot.location.kind === "ground",
    );
    assert.equal(groundWoodAfterAdmission.length, 0);
    evidence.claims.containerSupply = {
      wallId: wall.id,
      wallJobId: wallJob.id,
      transferId: liveJoin.transfer.id,
      source: liveJoin.transfer.request.source,
      quantity: liveJoin.transfer.request.quantity,
      phase: "reserved",
      groundWood: 0,
    };

    const beforeRevision = (await persistence()).revision ?? -1;
    await waitState(
      ({ tick, revision }) => {
        const save = window.__GOBLIN.persistence;
        return (
          save.phase === "saved" &&
          save.tick === tick &&
          save.revision >= revision &&
          window.__GOBLIN.state.paused
        );
      },
      { tick: reserved.tick, revision: beforeRevision },
      60_000,
    );
    const envelope = await readSlot();
    assert.ok(envelope);
    assert.equal(envelope.kind, "hive-local-world");
    assert.equal(envelope.schema, 8);
    assert.equal(envelope.savedState.paused, true);
    const savedJoin = assertTransferJoin(
      envelope.savedState,
      shelf.id,
      wall.id,
    );
    assert.deepEqual(savedJoin.transfer, liveJoin.transfer);
    assert.deepEqual(savedJoin.wallJob, liveJoin.wallJob);
    assert.deepEqual(savedJoin.actor.task, liveJoin.actor.task);
    assert.deepEqual(savedJoin.actor.assignment, liveJoin.actor.assignment);
    evidence.claims.savedReserved = {
      schema: envelope.schema,
      revision: envelope.revision,
      tick: envelope.savedState.tick,
      exactTransferJobTask: true,
      transferId: savedJoin.transfer.id,
    };

    const savedMaterials = structuredClone(envelope.savedState.materials);
    const savedJobs = structuredClone(envelope.savedState.jobs);
    const savedTask = structuredClone(
      envelope.savedState.actors[savedJoin.transfer.actor].task,
    );
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitState(() => window.__GOBLIN?.artReady, null, 90_000);
    await page.waitForSelector("#stage canvas");
    const restored = await state();
    assert.equal(restored.paused, true);
    assert.equal(restored.tick, envelope.savedState.tick);
    assert.deepEqual(restored.materials, savedMaterials);
    assert.deepEqual(restored.jobs, savedJobs);
    assert.deepEqual(restored.actors[savedJoin.transfer.actor].task, savedTask);
    assertTransferJoin(restored, shelf.id, wall.id);
    evidence.claims.reload = {
      paused: true,
      tick: restored.tick,
      exactMaterials: true,
      exactTransferJobTask: true,
    };

    await setPaused(false);
    await waitState(
      ({ wallId, wallJobId, transferId }) => {
        const current = window.__GOBLIN.state;
        const finishedWall = current.sites.find((site) => site.id === wallId);
        return (
          finishedWall?.finishedAt !== null &&
          !current.jobs.some((job) => job.id === wallJobId) &&
          !current.materials.transfers.some(
            (transfer) =>
              transfer.id === transferId || transfer.owner.job === wallJobId,
          )
        );
      },
      {
        wallId: wall.id,
        wallJobId: liveJoin.wallJob.id,
        transferId: liveJoin.transfer.id,
      },
      60_000,
    );
    await setPaused(true);
    const completed = await state();
    const completedShelf = completed.sites.find((site) => site.id === shelf.id);
    assert.ok(completedShelf);
    const finishedWall = completed.sites.find((site) => site.id === wall.id);
    assert.ok(finishedWall);
    assert.notEqual(finishedWall.finishedAt, null);
    assert.equal(
      completed.jobs.some((job) => job.id === liveJoin.wallJob.id),
      false,
    );
    assert.equal(
      completed.materials.transfers.some(
        (transfer) =>
          transfer.id === liveJoin.transfer.id ||
          transfer.owner.job === liveJoin.wallJob.id,
      ),
      false,
    );
    await inspect("site", shelf.id, completedShelf, 0.5);
    const finalShelfRegion = page.getByRole("region", {
      name: "Structure actions",
      exact: true,
    });
    await finalShelfRegion.waitFor();
    const finalShelfText = await finalShelfRegion.textContent();
    assert.match(finalShelfText, /Wood 1 · Mugwort 2 · 4\/6 bulk/);
    assert.match(
      await page.locator("body").innerText(),
      /Wood 1 · Mugwort 2 · 4\/6 bulk/,
    );
    await screenshot("mixed-storage-after-wall");
    assert.equal(
      completed.materials.lots.filter(
        (lot) => lot.location.kind === "ground" && lot.material === "wood",
      ).length,
      0,
    );
    assert.equal(
      completed.materials.lots
        .filter(
          (lot) =>
            lot.location.kind === "container" &&
            lot.location.container === `shelf:${shelf.id}` &&
            lot.material === "wood",
        )
        .reduce((sum, lot) => sum + lot.quantity, 0),
      1,
    );
    assert.equal(
      completed.materials.lots
        .filter(
          (lot) =>
            lot.location.kind === "container" &&
            lot.location.container === `shelf:${shelf.id}` &&
            lot.material === "mugwort",
        )
        .reduce((sum, lot) => sum + lot.quantity, 0),
      2,
    );
    evidence.claims.wallFinished = {
      wallId: wall.id,
      shelfId: shelf.id,
      groupedText: "Wood 1 · Mugwort 2 · 4/6 bulk",
      transferSettled: true,
    };
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
