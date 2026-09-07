import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const url = process.argv[2] || "http://127.0.0.1:5188/";
const output = process.argv[3] || ".botanical/deconstruction-proof";
const behaviorTimeout = 44_000;
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

await mkdir(output, { recursive: true });
const evidence = {
  url,
  output,
  scriptSha256: sha256(
    await readFile(new URL("./prove-deconstruction.mjs", import.meta.url)),
  ),
  wrapper: {
    runner:
      "/home/levi/src/Botanical-next/.agents/skills/orchestrate-multi-lane-work/scripts/run-proof.sh",
    scope:
      "one short real-UI deconstruction trace; normal viewport plus 390px containment capture; behavior waits <=44s",
  },
  target: {
    expectedIndexSha256: process.env.EXPECTED_INDEX_SHA256 || null,
    local: {},
    served: {},
  },
  screenshots: [],
  errors: [],
  claims: {},
};
let browser = null;

function localAssetRefs(indexText) {
  return [
    ...new Set(
      [...indexText.matchAll(/(?:src|href)=["']\/?(assets\/[^"']+)["']/g)].map(
        (match) => match[1],
      ),
    ),
  ];
}

function materialSnapshot(state) {
  return {
    piles: state.piles.map(({ id, x, z, level, amount }) => ({
      id,
      x,
      z,
      level,
      amount,
    })),
    delivered: state.sites.map(({ id, delivered }) => ({ id, delivered })),
    cargo: Object.fromEntries(
      Object.entries(state.actors).map(([id, actor]) => [id, actor.cargo]),
    ),
    consumedWood: state.consumedWood,
  };
}

function looseWood(state) {
  return state.piles.reduce((sum, pile) => sum + pile.amount, 0);
}

function totalWood(state) {
  return (
    looseWood(state) +
    state.sites.reduce((sum, site) => sum + site.delivered, 0) +
    Object.values(state.actors).reduce(
      (sum, actor) => sum + (actor.cargo?.amount || 0),
      0,
    ) +
    state.consumedWood
  );
}

function durableState(state) {
  const snapshot = structuredClone(state);
  delete snapshot.commands;
  return snapshot;
}

function chooseWallCell(state) {
  const occupied = new Set(
    [
      ...state.rocks,
      state.watcher,
      ...state.trees.filter((tree) => tree.felledAt === null),
      ...state.piles.filter((pile) => pile.amount > 0),
      ...Object.values(state.actors).flatMap((actor) => [actor, ...actor.path]),
    ].map((cell) => cell.x + "," + cell.z + "," + (cell.level ?? 0)),
  );
  const people = Object.values(state.actors);
  const candidates = [];
  for (let x = 1; x < 14; x++)
    for (let z = 1; z < 14; z++) {
      const key = x + "," + z + ",0";
      if (occupied.has(key)) continue;
      const distance = Math.min(
        ...people.map(
          (person) => Math.abs(person.x - x) + Math.abs(person.z - z),
        ),
      );
      candidates.push({ x, z, level: 0, distance });
    }
  candidates.sort((a, b) => b.distance - a.distance);
  assert.ok(candidates.length, "no clear wall cell was available");
  return candidates[0];
}

try {
  const localIndex = await readFile("dist/index.html");
  const indexText = localIndex.toString("utf8");
  const indexSha256 = sha256(localIndex);
  if (evidence.target.expectedIndexSha256)
    assert.equal(
      indexSha256,
      evidence.target.expectedIndexSha256,
      "local dist/index.html does not match EXPECTED_INDEX_SHA256",
    );
  const assets = localAssetRefs(indexText);
  assert.ok(assets.length, "dist index has no emitted asset references");
  evidence.target.local["dist/index.html"] = indexSha256;
  for (const asset of assets)
    evidence.target.local["dist/" + asset] = sha256(
      await readFile("dist/" + asset),
    );

  for (const [file, expected] of Object.entries(evidence.target.local)) {
    const servedPath =
      file === "dist/index.html" ? "/" : "/" + file.slice("dist/".length);
    const response = await fetch(new URL(servedPath, url));
    assert.equal(response.status, 200, servedPath + " was not served");
    const actual = sha256(Buffer.from(await response.arrayBuffer()));
    assert.equal(
      actual,
      expected,
      servedPath + " served bytes differ from local " + file,
    );
    evidence.target.served[servedPath] = actual;
  }
  evidence.target.assetRefs = assets;

  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_PATH,
    args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
  });
  const context = await browser.newContext({
    viewport: { width: 1024, height: 768 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(behaviorTimeout);
  page.on("pageerror", (error) => evidence.errors.push("pageerror: " + error));
  page.on("console", (message) => {
    if (message.type() === "error")
      evidence.errors.push("console: " + message.text());
  });
  page.on("requestfailed", (request) =>
    evidence.errors.push(
      "requestfailed: " + request.url() + " · " + request.failure()?.errorText,
    ),
  );

  const state = () => page.evaluate(() => window.__GOBLIN.state);
  const selection = () => page.evaluate(() => window.__GOBLIN.selection);
  const persistence = () => page.evaluate(() => window.__GOBLIN.persistence);
  const waitForState = (predicate, arg = null, timeout = behaviorTimeout) =>
    page.waitForFunction(predicate, arg, { timeout });
  const project = (x, z, height = 0) =>
    page.evaluate(
      ([nextX, nextZ, nextHeight]) =>
        window.__GOBLIN.project(nextX, nextZ, nextHeight),
      [x, z, height],
    );
  const clickCell = async (cell, height = 0) => {
    const point = await project(cell.x, cell.z, height);
    assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y));
    await page.mouse.click(point.x, point.y);
  };
  const screenshot = async (name) => {
    await page.screenshot({ path: output + "/" + name + ".png" });
    evidence.screenshots.push(name + ".png");
  };
  const closeMenuIfVisible = async () => {
    const close = page.getByRole("button", {
      name: "Close Menu",
      exact: true,
    });
    if ((await close.count()) && (await close.isVisible())) await close.click();
  };
  const waitArt = () => waitForState(() => window.__GOBLIN?.artReady === true);

  const response = await page.goto(url, { waitUntil: "domcontentloaded" });
  assert.equal(response?.status(), 200);
  await waitArt();
  await page.waitForSelector("#stage canvas");
  let current = await state();
  assert.equal(current.paused, true);
  assert.equal((await persistence()).slot, "missing");

  await page.locator("#continue").click();
  await waitForState(() => window.__GOBLIN.state.paused === false);
  await closeMenuIfVisible();

  current = await state();
  if (!current.parties.home.members.includes("sedge")) {
    const sedge = current.actors.sedge;
    await clickCell(sedge);
    await waitForState(
      () =>
        window.__GOBLIN.selection.inspectedTarget?.kind === "actor" &&
        window.__GOBLIN.selection.inspectedTarget.id === "sedge",
    );
    const recruit = page.locator("#recruit");
    assert.equal(await recruit.count(), 1);
    assert.equal(await recruit.evaluate((node) => node.tagName), "BUTTON");
    await recruit.click();
    await waitForState(() =>
      window.__GOBLIN.state.parties.home.members.includes("sedge"),
    );
  }
  evidence.claims.recruit = {
    homeMembers: (await state()).parties.home.members,
    visibleSedge: true,
  };

  await page.locator("#pause").click();
  await waitForState(() => window.__GOBLIN.state.paused === true);

  current = await state();
  const oak = current.trees.find((tree) => tree.felledAt === null);
  assert.ok(oak, "no standing oak was available");
  await clickCell(oak, 1.5);
  await page
    .getByRole("region", { name: "Oak actions", exact: true })
    .waitFor();
  assert.deepEqual((await selection()).selectedIds, []);
  const markChop = page.locator("#mark-chop");
  assert.equal(await markChop.count(), 1);
  assert.equal(await markChop.evaluate((node) => node.tagName), "BUTTON");
  await markChop.click();
  await waitForState(
    (oakId) =>
      window.__GOBLIN.state.jobs.some(
        (job) =>
          job.kind === "chop" &&
          job.target === oakId &&
          job.scope.actors === null,
      ),
    oak.id,
  );
  const chopQueued = await state();
  assert.equal(chopQueued.paused, true);
  assert.equal(chopQueued.commands.at(-1).kind, "chop");
  assert.equal(chopQueued.commands.at(-1).actors, null);

  await page.locator("#pause").click();
  await page.locator("#speed").click();
  await waitForState(() => window.__GOBLIN.state.paused === false);
  await waitForState(
    (oakId) =>
      window.__GOBLIN.state.trees.find((tree) => tree.id === oakId)
        ?.felledAt !== null,
    oak.id,
  );
  current = await state();
  assert.ok(current.piles.some((pile) => pile.amount >= 6));
  await page.locator("#pause").click();
  await waitForState(() => window.__GOBLIN.state.paused === true);
  assert.match(await page.locator("#speed").textContent(), /4×/);
  evidence.claims.sharedChop = {
    target: oak.id,
    actors: chopQueued.jobs.find((job) => job.kind === "chop").scope.actors,
    felled: current.felled,
    looseWood: looseWood(current),
  };

  const wallCell = chooseWallCell(current);
  const buildButton = page
    .locator(".command-bar")
    .getByRole("button", { name: /^Build/ });
  assert.equal(await buildButton.count(), 1);
  await buildButton.click();
  const wallTool = page.locator('[data-build="wall"]');
  assert.equal(await wallTool.count(), 1);
  await wallTool.click();
  await clickCell(wallCell);
  await waitForState(
    (cell) =>
      window.__GOBLIN.state.sites.some(
        (site) =>
          site.type === "wall" &&
          site.x === cell.x &&
          site.z === cell.z &&
          site.finishedAt === null,
      ),
    wallCell,
  );
  let wallState = await state();
  const wall = wallState.sites.find(
    (site) =>
      site.type === "wall" && site.x === wallCell.x && site.z === wallCell.z,
  );
  assert.ok(wall);
  const buildJob = wallState.jobs.find(
    (job) => job.kind === "build" && job.target === wall.id,
  );
  assert.ok(buildJob);
  assert.equal(buildJob.scope.actors, null);
  assert.equal(wallState.commands.at(-1).kind, "build");
  assert.equal(wallState.commands.at(-1).actors, null);
  await page.locator("#task").click();

  await page.locator("#pause").click();
  await waitForState(() => window.__GOBLIN.state.paused === false);
  await waitForState(
    (siteId) =>
      window.__GOBLIN.state.sites.some(
        (site) => site.id === siteId && site.finishedAt !== null,
      ),
    wall.id,
  );
  await page.locator("#pause").click();
  await waitForState(() => window.__GOBLIN.state.paused === true);
  wallState = await state();
  assert.ok(wallState.sites.some((site) => site.id === wall.id));
  await screenshot("normal-finished-wall");

  await clickCell(wall);
  const structureActions = page.getByRole("region", {
    name: "Structure actions",
    exact: true,
  });
  await structureActions.waitFor();
  const deconstruct = structureActions.locator(
    '[data-action="deconstruct"][data-site="' + wall.id + '"]',
  );
  assert.equal(await deconstruct.count(), 1);
  assert.equal(await deconstruct.evaluate((node) => node.tagName), "BUTTON");
  await deconstruct.click();
  await waitForState(
    (siteId) =>
      window.__GOBLIN.state.jobs.some(
        (job) =>
          job.kind === "deconstruct" &&
          job.target === siteId &&
          job.scope.actors === null,
      ),
    wall.id,
  );
  await waitForState(
    () =>
      document.querySelector('[data-action="deconstruct"]')?.disabled === true,
  );
  assert.equal(await deconstruct.isDisabled(), true);
  assert.equal(await deconstruct.textContent(), "Deconstruction queued");
  assert.match(
    await structureActions.locator('[data-status="deconstruct"]').textContent(),
    /already in the work queue/,
  );
  const ordered = await state();
  const deconstructJob = ordered.jobs.find(
    (job) => job.kind === "deconstruct" && job.target === wall.id,
  );
  assert.ok(deconstructJob);
  const beforeWork = materialSnapshot(ordered);
  const beforeLooseWood = looseWood(ordered);
  const beforeSink = ordered.consumedWood;
  assert.equal(
    ordered.sites.find((site) => site.id === wall.id).finishedAt !== null,
    true,
  );
  assert.equal(ordered.commands.at(-1).kind, "deconstruct");
  assert.equal(ordered.commands.at(-1).actors, null);
  await screenshot("normal-deconstruct-ordered");

  // Slow only this observation so in-progress deconstruction is observable;
  // wood/build preparation ran at 4x. The builder finishes adjacent to the
  // wall, so this joined trace must not require an artificial walk first.
  await page.locator("#speed").click();
  assert.match(await page.locator("#speed").textContent(), /1×/);
  await page.locator("#pause").click();
  await waitForState(() => window.__GOBLIN.state.paused === false);
  await waitForState(
    () =>
      Object.values(window.__GOBLIN.state.actors).some(
        (actor) => actor.task?.kind === "deconstruct",
      ),
    null,
    15_000,
  );
  await waitForState(
    () => {
      const started = Object.values(window.__GOBLIN.state.actors).some(
        (actor) =>
          actor.task?.kind === "deconstruct" &&
          actor.mode === "deconstruct" &&
          actor.work > 0,
      );
      if (started) document.querySelector("#pause").click();
      return started;
    },
    null,
    15_000,
  );
  await waitForState(() => window.__GOBLIN.state.paused === true);
  const working = await state();
  assert.deepEqual(materialSnapshot(working), beforeWork);
  assert.ok(working.sites.some((site) => site.id === wall.id));
  const assignedActor = Object.values(working.actors).find(
    (actor) => actor.task?.kind === "deconstruct",
  );
  assert.ok(assignedActor);
  evidence.claims.midwork = {
    actor: assignedActor.id,
    mode: assignedActor.mode,
    work: assignedActor.work,
    sitePresent: true,
    woodUnchanged: true,
    sinkUnchanged: true,
    jobId: deconstructJob.id,
  };
  await screenshot("normal-deconstruct-work");

  const pausedContinuation = await state();
  await waitForState(
    () =>
      window.__GOBLIN.persistence.phase === "saved" &&
      window.__GOBLIN.persistence.tick === window.__GOBLIN.state.tick,
    null,
    15_000,
  );
  const savedContinuation = await state();
  assert.deepEqual(
    durableState(savedContinuation),
    durableState(pausedContinuation),
  );
  evidence.claims.pausedSaved = {
    tick: pausedContinuation.tick,
    revision: (await persistence()).revision,
    exactBeforeReload: true,
  };

  await page.reload({ waitUntil: "domcontentloaded" });
  await waitArt();
  await page.waitForSelector("#stage canvas");
  const reloaded = await state();
  assert.deepEqual(durableState(reloaded), durableState(pausedContinuation));
  assert.deepEqual(reloaded.commands, []);
  assert.equal(reloaded.paused, true);
  assert.equal((await persistence()).slot, "valid");
  evidence.claims.reloadExact = {
    tick: reloaded.tick,
    paused: reloaded.paused,
    activeJob: reloaded.jobs.find((job) => job.id === deconstructJob.id)?.kind,
    exactState: true,
  };
  await screenshot("normal-reloaded-paused");

  const continueButton = page.locator("#continue");
  assert.equal(await continueButton.count(), 1);
  await continueButton.click();
  await waitForState(() => window.__GOBLIN.state.paused === false);
  await closeMenuIfVisible();
  await waitForState(
    (siteId) => !window.__GOBLIN.state.sites.some((site) => site.id === siteId),
    wall.id,
  );
  const completed = await state();
  assert.equal(
    completed.sites.some((site) => site.id === wall.id),
    false,
  );
  const salvagePile = completed.piles.find(
    (pile) => pile.x === wall.x && pile.z === wall.z,
  );
  assert.equal(salvagePile?.amount, 1);
  assert.equal(completed.consumedWood - beforeSink, 0);
  assert.equal(looseWood(completed) - beforeLooseWood, 1);
  assert.equal(totalWood(completed), completed.felled * 6);
  evidence.claims.completed = {
    siteRemoved: true,
    salvage: 1,
    sinkDelta: completed.consumedWood - beforeSink,
    looseWoodDelta: looseWood(completed) - beforeLooseWood,
    conservation: {
      totalWood: totalWood(completed),
      expected: completed.felled * 6,
    },
    resumedOnce: true,
  };

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => innerWidth === 390, null, {
    timeout: 5_000,
  });
  const narrow = await page.evaluate(() => {
    const story = document.querySelector(".story").getBoundingClientRect();
    const roster = [...document.querySelectorAll(".roster button")].map(
      (node) => node.getBoundingClientRect(),
    );
    return {
      innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      rosterStorySeparated: roster.every(
        (box) => box.right <= story.left || story.right <= box.left,
      ),
      rosterCount: roster.length,
    };
  });
  const commandBar = page.locator('[aria-label="Colony controls"]');
  const commandBox = await commandBar.boundingBox();
  assert.equal(narrow.innerWidth, 390);
  assert.ok(
    narrow.scrollWidth <= 390,
    "document overflow: " + narrow.scrollWidth,
  );
  assert.ok(
    narrow.bodyScrollWidth <= 390,
    "body overflow: " + narrow.bodyScrollWidth,
  );
  assert.equal(narrow.rosterCount, 2);
  assert.equal(narrow.rosterStorySeparated, true);
  assert.ok(
    commandBox && commandBox.x >= 0 && commandBox.x + commandBox.width <= 390,
  );
  evidence.claims.narrow = { ...narrow, commandBox };
  await screenshot("narrow-deconstruction-complete");
  assert.deepEqual(evidence.errors, []);
  evidence.success = true;
} catch (error) {
  evidence.success = false;
  evidence.failure = {
    name: error?.name,
    message: error?.message,
    stack: error?.stack,
  };
  if (browser) {
    const pages = browser.contexts().flatMap((context) => context.pages());
    if (pages[0]) {
      await pages[0]
        .screenshot({ path: output + "/failure.png" })
        .then(() => evidence.screenshots.push("failure.png"))
        .catch(() => {});
    }
  }
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  evidence.errorCount = evidence.errors.length;
  await writeFile(
    output + "/proof.json",
    JSON.stringify(evidence, null, 2) + "\n",
  );
}
