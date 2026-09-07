import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const url = process.argv[2] || "http://127.0.0.1:5188/";
const output = process.argv[3] || ".botanical/local-save-proof";
const expectedIndexSha256 = process.env.EXPECTED_INDEX_SHA256?.trim() || null;
const runtimeTimeout = 45_000;

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function assetRefs(html) {
  return [...html.matchAll(/(?:src|href)=["']\/?(assets\/[^"']+)["']/g)].map(
    (match) => match[1],
  );
}

const indexText = await readFile("dist/index.html", "utf8");
const refs = assetRefs(indexText);
const gameJs = refs.find((asset) => /^assets\/game-.*\.js$/.test(asset));
const gameCss = refs.find((asset) => /^assets\/game-.*\.css$/.test(asset));
const artJs = refs.find((asset) => /^assets\/art-.*\.js$/.test(asset));
assert.ok(gameJs, "dist index has no emitted game JS reference");
assert.ok(gameCss, "dist index has no emitted game CSS reference");
assert.ok(artJs, "dist index has no emitted art JS reference");
const frozenHashes = {
  "dist/index.html": sha256(Buffer.from(indexText)),
  [`dist/${gameJs}`]: sha256(await readFile(`dist/${gameJs}`)),
  [`dist/${gameCss}`]: sha256(await readFile(`dist/${gameCss}`)),
  [`dist/${artJs}`]: sha256(await readFile(`dist/${artJs}`)),
};
if (expectedIndexSha256) {
  assert.equal(
    frozenHashes["dist/index.html"],
    expectedIndexSha256,
    "dist/index.html did not match EXPECTED_INDEX_SHA256",
  );
}

async function fetchBytes(assetUrl) {
  const response = await fetch(assetUrl);
  assert.equal(response.ok, true, `served asset request failed: ${assetUrl}`);
  return Buffer.from(await response.arrayBuffer());
}

const servedIndexResponse = await fetch(url);
assert.equal(
  servedIndexResponse.ok,
  true,
  `served index request failed: ${url}`,
);
const servedIndexUrl = servedIndexResponse.url || url;
const servedIndexBytes = Buffer.from(await servedIndexResponse.arrayBuffer());
const servedIndexText = servedIndexBytes.toString("utf8");
const servedRefs = assetRefs(servedIndexText);
const servedGameJs = servedRefs.find((asset) =>
  /^assets\/game-.*\.js$/.test(asset),
);
const servedGameCss = servedRefs.find((asset) =>
  /^assets\/game-.*\.css$/.test(asset),
);
const servedArtJs = servedRefs.find((asset) =>
  /^assets\/art-.*\.js$/.test(asset),
);
assert.ok(servedGameJs, "served index has no emitted game JS reference");
assert.ok(servedGameCss, "served index has no emitted game CSS reference");
assert.ok(servedArtJs, "served index has no emitted art JS reference");
const servedFiles = {
  index: { url: servedIndexUrl, sha256: sha256(servedIndexBytes) },
  gameJs: {
    url: new URL(servedGameJs, servedIndexUrl).href,
    sha256: sha256(await fetchBytes(new URL(servedGameJs, servedIndexUrl))),
  },
  gameCss: {
    url: new URL(servedGameCss, servedIndexUrl).href,
    sha256: sha256(await fetchBytes(new URL(servedGameCss, servedIndexUrl))),
  },
  artJs: {
    url: new URL(servedArtJs, servedIndexUrl).href,
    sha256: sha256(await fetchBytes(new URL(servedArtJs, servedIndexUrl))),
  },
};
assert.equal(servedFiles.index.sha256, frozenHashes["dist/index.html"]);
assert.equal(servedFiles.gameJs.sha256, frozenHashes[`dist/${gameJs}`]);
assert.equal(servedFiles.gameCss.sha256, frozenHashes[`dist/${gameCss}`]);
assert.equal(servedFiles.artJs.sha256, frozenHashes[`dist/${artJs}`]);
const scriptSha256 = sha256(await readFile("scripts/prove-local-save.mjs"));
await mkdir(output, { recursive: true });

const evidence = {
  url,
  output,
  frozenTarget: {
    expectedIndexSha256,
    resolvedAssets: { gameJs, gameCss, artJs },
    hashes: frozenHashes,
  },
  servedParity: {
    indexUrl: servedIndexUrl,
    resolvedAssets: {
      gameJs: servedGameJs,
      gameCss: servedGameCss,
      artJs: servedArtJs,
    },
    files: servedFiles,
    matchesLocalDist: true,
  },
  scriptSha256,
  wrapper: {
    runner:
      "/home/levi/src/Botanical-next/.agents/skills/orchestrate-multi-lane-work/scripts/run-proof.sh",
    scope: "RuntimeMaxSec=10min; bounded local-save persistence proof",
  },
  errors: [],
  screenshots: [],
  claims: {
    staleNewTwoPage:
      "not included; separate CAS unit coverage owns multi-tab stale-New behavior",
  },
};

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH,
  args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
});
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 1,
  acceptDownloads: true,
});
const page = await context.newPage();
page.setDefaultTimeout(20_000);
page.on("pageerror", (error) => evidence.errors.push(`pageerror: ${error}`));
page.on("console", (message) => {
  if (message.type() === "error")
    evidence.errors.push(`console: ${message.text()}`);
});
page.on("requestfailed", (request) =>
  evidence.errors.push(
    `requestfailed: ${request.url()} · ${request.failure()?.errorText}`,
  ),
);

const state = () => page.evaluate(() => window.__GOBLIN.state);
const persistence = () => page.evaluate(() => window.__GOBLIN.persistence);
const selection = () => page.evaluate(() => window.__GOBLIN.selection);
const project = (x, z, height = 0) =>
  page.evaluate(
    ([nextX, nextZ, nextHeight]) =>
      window.__GOBLIN.project(nextX, nextZ, nextHeight),
    [x, z, height],
  );
const waitFor = (predicate, value = null, timeout = 30_000) =>
  page.waitForFunction(predicate, value, { timeout });

function actorMotion(actor) {
  return {
    id: actor.id,
    x: actor.x,
    z: actor.z,
    level: actor.level,
    dir: actor.dir,
    mode: actor.mode,
    path: actor.path,
    leg: actor.leg,
    work: actor.work,
    rest: actor.rest,
    routine: actor.routine,
    allowedWork: actor.allowedWork,
    task: actor.task,
    assignment: actor.assignment,
    cargo: actor.cargo,
  };
}

function freezeFields(next) {
  return {
    tick: next.tick,
    paused: next.paused,
    nextId: next.nextId,
    actors: Object.fromEntries(
      Object.entries(next.actors).map(([id, actor]) => [
        id,
        actorMotion(actor),
      ]),
    ),
    cat: next.cat,
    trees: next.trees,
    piles: next.piles,
    sites: next.sites,
    jobs: next.jobs,
    claims: next.claims,
    feed: next.feed,
    demand: next.demand,
    felled: next.felled,
    finishedJobs: next.finishedJobs,
    rested: next.rested,
    notice: next.notice,
  };
}

function savedFields(next) {
  const frozen = freezeFields(next);
  delete frozen.paused;
  return frozen;
}

function physicalWood(next) {
  return (
    next.piles.reduce((total, pile) => total + pile.amount, 0) +
    next.sites.reduce((total, site) => total + site.delivered, 0) +
    Object.values(next.actors).reduce(
      (total, actor) => total + (actor.cargo?.amount || 0),
      0,
    )
  );
}

async function screenshot(name) {
  await page.screenshot({ path: `${output}/${name}.png` });
  evidence.screenshots.push(`${name}.png`);
}

async function openDatabase() {
  return page.evaluate(
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
          resolve(true);
          db.close();
        };
      }),
    { dbName: "hive-local-world", storeName: "world" },
  );
}

async function readSlot() {
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
            resolve(get.result === undefined ? null : get.result);
            db.close();
          };
        };
      }),
    { dbName: "hive-local-world", storeName: "world", key: "current" },
  );
}

async function putSlot(value) {
  await openDatabase();
  await page.evaluate(
    ({ dbName, storeName, key, value: nextValue }) =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open(dbName, 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction(storeName, "readwrite");
          tx.objectStore(storeName).put(nextValue, key);
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
          tx.onabort = () =>
            reject(tx.error || new Error("IndexedDB write aborted"));
        };
      }),
    { dbName: "hive-local-world", storeName: "world", key: "current", value },
  );
}

async function reloadReady() {
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitFor(() => window.__GOBLIN?.artReady, null, 90_000);
  await page.waitForSelector("#stage canvas");
}

async function requireMenu(autoOpen = true) {
  const menu = page.getByRole("region", { name: "Menu", exact: true });
  if (autoOpen && !(await menu.isVisible()))
    await page.locator('[aria-label="Open game menu"]').click();
  await menu.waitFor({ state: "visible" });
  return menu;
}

async function downloadJson(buttonName) {
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: buttonName, exact: true }).click(),
  ]);
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return {
    filename: download.suggestedFilename(),
    value: JSON.parse(Buffer.concat(chunks).toString("utf8")),
  };
}

async function setWork(actor, work, enabled) {
  const selector = `#work-${actor}-${work}`;
  const checkbox = page.locator(selector);
  assert.equal(await checkbox.count(), 1, `${selector} missing`);
  if ((await checkbox.isChecked()) !== enabled) {
    if (enabled) await checkbox.check();
    else await checkbox.uncheck();
  }
  await waitFor(
    ([actorId, workType, wanted]) =>
      window.__GOBLIN.state.actors[actorId].allowedWork[workType] === wanted,
    [actor, work, enabled],
  );
}

async function openWork() {
  const button = page
    .locator(".command-bar")
    .getByRole("button", { name: "Work", exact: true });
  assert.equal(await button.count(), 1);
  await button.click();
  const panel = page.getByRole("region", { name: "Work", exact: true });
  await panel.waitFor({ state: "visible" });
  return panel;
}

async function closeWork() {
  await page.getByRole("button", { name: "Close Work", exact: true }).click();
  await page
    .getByRole("region", { name: "Work", exact: true })
    .waitFor({ state: "hidden" });
}

try {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await waitFor(() => window.__GOBLIN?.artReady, null, 90_000);
  await page.waitForSelector("#stage canvas");

  const fresh = await state();
  const freshFrozen = freezeFields(fresh);
  assert.equal(fresh.paused, true);
  assert.equal(fresh.tick, 0);
  assert.equal((await persistence()).slot, "missing");
  assert.equal((await persistence()).autosaveEnabled, true);
  await page
    .getByRole("region", { name: "Menu", exact: true })
    .waitFor({ state: "visible" });
  assert.equal(await page.locator("#continue").count(), 1);
  await page.waitForTimeout(350);
  assert.deepEqual(freezeFields(await state()), freshFrozen);
  evidence.claims.freshMissing = {
    menuVisiblePaused: true,
    tick: fresh.tick,
    frozenAfterObservation: true,
    positionsWorkFeedFrozen: true,
  };
  await screenshot("fresh-missing-menu");

  await page.locator("#continue").click();
  await waitFor(() => window.__GOBLIN.state.paused === false);
  await waitFor((oldTick) => window.__GOBLIN.state.tick > oldTick, fresh.tick);
  evidence.claims.continue = { started: true, tick: (await state()).tick };

  const sedge = (await state()).actors.sedge;
  const sedgePoint = await project(sedge.x, sedge.z);
  await page.mouse.click(sedgePoint.x, sedgePoint.y);
  await waitFor(() => window.__GOBLIN.selection.inspectedId === "sedge");
  const recruit = page.locator("#recruit");
  assert.equal(await recruit.count(), 1);
  await recruit.click();
  await waitFor(() =>
    window.__GOBLIN.state.parties.home.members.includes("sedge"),
  );

  const workPanel = await openWork();
  assert.match(await workPanel.textContent(), /Work priorities/);
  assert.equal(await workPanel.locator("#work-rowan-build").count(), 1);
  assert.equal(await workPanel.locator("#work-sedge-haul").count(), 1);
  await setWork("rowan", "build", false);
  await setWork("sedge", "haul", false);
  const workPrefs = {
    rowanBuild: (await state()).actors.rowan.allowedWork.build,
    sedgeHaul: (await state()).actors.sedge.allowedWork.haul,
  };
  await closeWork();

  const oak = (await state()).trees.find((tree) => tree.felledAt === null);
  assert.ok(oak, "no standing oak available for shared chop");
  const oakPoint = await project(oak.x, oak.z, 1.5);
  await page.mouse.click(oakPoint.x, oakPoint.y);
  await page
    .getByRole("region", { name: "Oak actions", exact: true })
    .waitFor({ state: "visible" });
  assert.deepEqual((await selection()).selectedIds, []);
  await page.locator("#mark-chop").click();
  await waitFor(() =>
    window.__GOBLIN.state.jobs.some(
      (job) => job.kind === "chop" && job.scope.actors === null,
    ),
  );

  const buildButton = page
    .locator(".command-bar")
    .getByRole("button", { name: /^Build/ });
  await buildButton.click();
  await page.locator('[data-build="wall"]').click();
  const wallPoint = await project(7, 5);
  await page.mouse.click(wallPoint.x, wallPoint.y);
  await waitFor(() => window.__GOBLIN.state.sites.length === 1);
  await page.locator("#task").click();
  await waitFor(() =>
    window.__GOBLIN.state.jobs.some((job) => job.kind === "build"),
  );
  const queued = await state();
  assert.equal(
    queued.jobs.filter((job) => job.kind === "chop")[0].scope.actors,
    null,
  );
  assert.equal(
    queued.jobs.filter((job) => job.kind === "build")[0].scope.actors,
    null,
  );
  evidence.claims.workSetup = {
    recruitedSedge: true,
    workPrefs,
    sharedChop: true,
    sharedBuild: true,
    jobs: queued.jobs,
  };
  await screenshot("work-shared-queued");

  const claimHandle = await page.waitForFunction(
    () => {
      const current = window.__GOBLIN.state;
      const hasClaim = Object.keys(current.claims).length > 0;
      const hasCargo = Object.values(current.actors).some(
        (actor) => actor.cargo,
      );
      return hasClaim || hasCargo;
    },
    null,
    { timeout: runtimeTimeout },
  );
  const claimState = await claimHandle.jsonValue();
  await claimHandle.dispose();
  await page.locator("#pause").click();
  await waitFor(() => window.__GOBLIN.state.paused === true);
  const pausedContinuation = await state();
  const committedHandle = await page.waitForFunction(
    (pausedTick) => {
      const current = window.__GOBLIN.state;
      const save = window.__GOBLIN.persistence;
      return save.phase === "saved" &&
        save.revision > 0 &&
        save.tick === pausedTick
        ? { state: current, persistence: save }
        : false;
    },
    pausedContinuation.tick,
    { timeout: runtimeTimeout },
  );
  const committed = await committedHandle.jsonValue();
  await committedHandle.dispose();
  assert.equal(committed.persistence.tick, pausedContinuation.tick);
  assert.deepEqual(
    savedFields(committed.state),
    savedFields(pausedContinuation),
  );
  const pausedTick = pausedContinuation.tick;
  await page.waitForTimeout(350);
  assert.deepEqual(
    freezeFields(await state()),
    freezeFields(pausedContinuation),
  );
  evidence.claims.pausedCommitted = {
    claimOrCargoObserved: true,
    claimSnapshot: claimState,
    savedRevision: committed.persistence.revision,
    savedTick: committed.persistence.tick,
    pausedTick,
    frozenAfterPause: true,
  };
  await screenshot("paused-committed");

  await reloadReady();
  await page
    .getByRole("region", { name: "Menu", exact: true })
    .waitFor({ state: "visible" });
  const restored = await state();
  const restoredSave = await persistence();
  assert.equal(restoredSave.slot, "valid");
  assert.equal(restoredSave.phase, "loaded");
  assert.equal(restoredSave.paused, true);
  assert.equal(restoredSave.revision, committed.persistence.revision);
  assert.deepEqual(savedFields(restored), savedFields(pausedContinuation));
  assert.deepEqual(restored.commands, []);
  evidence.claims.reloadRestores = {
    paused: restored.paused,
    commands: restored.commands.length,
    revision: restoredSave.revision,
    tick: restored.tick,
    workPrefs: {
      rowanBuild: restored.actors.rowan.allowedWork.build,
      sedgeHaul: restored.actors.sedge.allowedWork.haul,
    },
    jobs: restored.jobs.length,
    claims: Object.keys(restored.claims).length,
    cargo: Object.values(restored.actors).filter((actor) => actor.cargo).length,
    nextId: restored.nextId,
    feed: restored.feed,
  };
  await screenshot("reloaded-paused");

  await page.locator("#continue").click();
  await waitFor(() => window.__GOBLIN.state.paused === false);
  await waitFor(
    () => {
      const current = window.__GOBLIN.state;
      return (
        current.felled >= 1 &&
        current.finishedJobs >= 2 &&
        current.jobs.length === 0 &&
        Object.keys(current.claims).length === 0 &&
        Object.values(current.actors).every((actor) => !actor.cargo) &&
        current.sites.some((site) => site.finishedAt !== null)
      );
    },
    null,
    runtimeTimeout,
  );
  const completed = await state();
  assert.equal(physicalWood(completed), completed.felled * 6);
  evidence.claims.resumeCompletes = {
    tick: completed.tick,
    felled: completed.felled,
    finishedJobs: completed.finishedJobs,
    jobs: completed.jobs.length,
    claims: Object.keys(completed.claims).length,
    cargo: Object.values(completed.actors).filter((actor) => actor.cargo)
      .length,
    physicalWood: physicalWood(completed),
    conservedWood: true,
  };
  await requireMenu();
  const backup = await downloadJson("Download backup");
  assert.equal(backup.filename, "hive-local-world.json");
  assert.equal(backup.value.kind, "hive-local-world");
  assert.equal(backup.value.schema, 1);
  assert.equal(typeof backup.value.revision, "number");
  assert.equal("commands" in backup.value.savedState, false);
  evidence.claims.backup = {
    filename: backup.filename,
    kind: backup.value.kind,
    schema: backup.value.schema,
    revision: backup.value.revision,
    commandsOmitted: true,
  };

  const corruptRecord = {
    kind: "unknown-local-record",
    schema: 999,
    payload: { preserved: true, marker: "corrupt-slot-proof" },
  };
  await putSlot(corruptRecord);
  await reloadReady();
  await requireMenu(false);
  const corruptFallback = await state();
  const corruptSave = await persistence();
  assert.equal(corruptFallback.paused, true);
  assert.equal(corruptFallback.tick, 0);
  assert.equal(corruptSave.slot, "invalid");
  assert.equal(corruptSave.autosaveEnabled, false);
  assert.match(
    await page.locator("#save-status").textContent(),
    /old slot is untouched/,
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Download raw local save", exact: true })
      .count(),
    1,
  );
  const rawBefore = await readSlot();
  assert.deepEqual(rawBefore, corruptRecord);
  await page.waitForTimeout(350);
  assert.deepEqual(await state(), corruptFallback);
  assert.deepEqual(await readSlot(), corruptRecord);
  const rawDownload = await downloadJson("Download raw local save");
  assert.equal(rawDownload.filename, "hive-local-world-corrupt.json");
  assert.deepEqual(rawDownload.value, corruptRecord);
  assert.equal((await persistence()).autosaveEnabled, false);
  assert.deepEqual(await readSlot(), corruptRecord);
  evidence.claims.corruptFallback = {
    paused: true,
    autosaveDisabled: true,
    rawAvailable: true,
    fallbackFrozen: true,
    rawDownloadFilename: rawDownload.filename,
    rawPreserved: true,
  };
  await screenshot("corrupt-fallback");

  await page.locator("#reset").click();
  await waitFor(
    () => {
      const current = window.__GOBLIN.state;
      const save = window.__GOBLIN.persistence;
      return (
        save.slot === "valid" &&
        save.phase === "saved" &&
        save.autosaveEnabled &&
        current.paused &&
        current.commands.length === 0 &&
        current.jobs.length === 0 &&
        current.sites.length === 0 &&
        save.revision === 1
      );
    },
    null,
    runtimeTimeout,
  );
  const replaced = await state();
  const replacedSave = await persistence();
  assert.equal(replaced.paused, true);
  assert.deepEqual(replaced.commands, []);
  assert.equal(replaced.jobs.length, 0);
  assert.equal(replaced.sites.length, 0);
  assert.equal(replacedSave.slot, "valid");
  assert.equal(replacedSave.autosaveEnabled, true);
  assert.equal(
    await page
      .getByRole("button", { name: "Download raw local save", exact: true })
      .count(),
    0,
  );
  const replacementRecord = await readSlot();
  assert.equal(replacementRecord.kind, "hive-local-world");
  assert.equal(replacementRecord.schema, 1);
  assert.equal("commands" in replacementRecord.savedState, false);
  evidence.claims.explicitNew = {
    cleanPausedClearing: true,
    revision: replacedSave.revision,
    commands: replaced.commands.length,
    jobs: replaced.jobs.length,
    sites: replaced.sites.length,
    rawAvailable: false,
  };
  await screenshot("explicit-new");

  await page.setViewportSize({ width: 390, height: 844 });
  await waitFor(() => window.innerWidth === 390);
  await requireMenu();
  const narrow = await page.evaluate(() => {
    const menu = document.querySelector(".menu-window").getBoundingClientRect();
    const command = document
      .querySelector(".command-bar")
      .getBoundingClientRect();
    return {
      viewport: { width: innerWidth, height: innerHeight },
      menu: {
        left: menu.left,
        right: menu.right,
        top: menu.top,
        bottom: menu.bottom,
      },
      command: {
        left: command.left,
        right: command.right,
        top: command.top,
        bottom: command.bottom,
      },
      noOverflow:
        document.documentElement.scrollWidth <= innerWidth &&
        document.documentElement.scrollHeight <= innerHeight,
    };
  });
  assert.equal(narrow.viewport.width, 390);
  assert.equal(narrow.noOverflow, true);
  assert.ok(narrow.menu.left >= 0 && narrow.menu.right <= 390);
  assert.ok(narrow.command.left >= 0 && narrow.command.right <= 390);
  evidence.claims.narrow390 = narrow;
  await screenshot("narrow-390-menu");

  assert.deepEqual(evidence.errors, []);
  evidence.success = true;
} catch (error) {
  evidence.success = false;
  evidence.failure = String(error.stack || error);
  await page.screenshot({ path: `${output}/failure.png` }).catch(() => {});
  evidence.screenshots.push("failure.png");
  console.error(evidence.failure);
  process.exitCode = 1;
} finally {
  await writeFile(`${output}/proof.json`, JSON.stringify(evidence, null, 2));
  await context.close();
  await browser.close();
  console.log(JSON.stringify(evidence, null, 2));
}
