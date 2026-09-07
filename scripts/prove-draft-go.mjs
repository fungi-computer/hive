#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = process.argv[2] || "http://127.0.0.1:5188/";
const evidenceDir = path.resolve(
  process.argv[3] || ".botanical/draft-go-local-20260907",
);
const root = process.cwd();
const expectedDist = {
  "dist/index.html":
    "ca4f0f4a502ae08921a7a8769822b4bde42f24f8e8d2c0327ff31dbd6a93014a",
  "dist/assets/game-D4WiZ8Ed.js":
    "246f8e443748e9d61b5323a4832cf2b7f637087ec542a617ad6dce47e8a9bc52",
  "dist/assets/game-CxFQJg3g.css":
    "45cbaed4bacf64b93ca69702f0330eab7e15ba41d67f7132c810e79ce96ab87c",
  "dist/assets/art-BfFl4vsZ.js":
    "9572e073cb45803ef87a694a3d1a14cbd44412528705b1987ee44cae144c12e7",
};
const expectedSource = {
  "src/model.ts":
    "8169176c147c5e0a2322b83bca74d9c5a12c39e1390a85fee5168323fef33862",
  "src/actors.ts":
    "327d6b96e221231d3ab8e15c03740a10843924ea7cda49e1343801999abeec44",
  "src/orders.ts":
    "a2877c5178cdba2f37e0c779239ded2f94ffb7bf4d42b6e7d03f638d1729928c",
  "src/jobs.ts":
    "bc1d83533a95500600c1c807620a02f66dcf481aa27f3c9add7be92ee5a1e53c",
  "src/routine.ts":
    "5a395b8f583d03590781b69e6a553e05db930dc9a6f61c3b399b6df5d1aaf4c9",
  "src/clearing.ts":
    "e003526ed6591e403813cec3dee02486fe3da007e064be92e3754f21773733a3",
  "src/persistence.ts":
    "2794ce5d5f4875fadf2f8def0f817b948f1af9437f133d3a477bb5bc9034c341",
  "src/ui-actions.ts":
    "a1a13ac74d75cc10829255a4d490f29dcff95e0ffebc952c8665219146197ade",
  "src/hud.jsx":
    "e8e57500cb4d6db0ed83e2bad0487a41917e5b1f70e164bd9eadeb53889f027a",
  "src/style.css":
    "397e56827cabc72af17b373c87b3618a7963d3a1082a0c6a175673b29cd01bad",
  "src/main.js":
    "8a2955a9fe73510a0f4c1ac32957f1aaf41e4140a8d27f02461b97c2710149b0",
  "src/view.js":
    "006f1bdd15357a744c8b730d42276d3c69b4bd8f1394058053587afae3499adc",
  "src/activity.ts":
    "520b2890b78894bd36a8606a534eb108f6e9174e5a1a014e7934773eb03efb50",
  "src/construction-view.js":
    "06d7f2f0f70c8e7c24d7a230b6ede7b1f0b74421de361fe06488c5a0554df2ce",
};

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const hashFile = async (relative) =>
  sha256(await readFile(path.join(root, relative)));
const clone = (value) => structuredClone(value);
const cellKey = (cell) =>
  String(cell.x) + "," + String(cell.z) + "," + String(cell.level || 0);

function resourceTotal(state) {
  const pileWood = state.piles.reduce((total, pile) => total + pile.amount, 0);
  const deliveredWood = state.sites.reduce(
    (total, site) => total + site.delivered,
    0,
  );
  const cargoWood = Object.values(state.actors).reduce(
    (total, actor) => total + (actor.cargo?.amount || 0),
    0,
  );
  return pileWood + deliveredWood + cargoWood + state.consumedWood;
}

function actorFacts(state, actorId = "rowan") {
  const actor = state.actors[actorId];
  return {
    id: actorId,
    x: actor.x,
    z: actor.z,
    level: actor.level,
    mode: actor.mode,
    path: clone(actor.path || []),
    task: actor.task || null,
    assignment: actor.assignment || null,
    cargo: clone(actor.cargo || null),
    work: actor.work || 0,
    drafted: Boolean(actor.drafted),
    routine: Boolean(actor.routine),
  };
}

function worldWorkFacts(state) {
  return {
    trees: state.trees.map((tree) => ({
      id: tree.id,
      work: tree.work,
      felledAt: tree.felledAt,
    })),
    sites: state.sites.map((site) => ({
      id: site.id,
      delivered: site.delivered,
      work: site.work,
      finishedAt: site.finishedAt,
    })),
    jobs: state.jobs.map((job) => ({
      id: job.id,
      kind: job.kind,
      scope: clone(job.scope),
      target: job.target,
      reason: job.reason,
    })),
  };
}

function claimsFor(state, actorId) {
  return state.claims[actorId] ? [clone(state.claims[actorId])] : [];
}

async function stateOf(page) {
  return page.evaluate(() => structuredClone(window.__GOBLIN.state));
}

async function selectionOf(page) {
  return page.evaluate(() => structuredClone(window.__GOBLIN.selection));
}

async function waitFor(page, predicate, label, timeout = 30000, arg) {
  await page.waitForFunction(predicate, arg, { timeout });
  return stateOf(page);
}

async function clickId(page, id) {
  const locator = page.locator("#" + id);
  await locator.waitFor({ state: "visible", timeout: 10000 });
  await locator.click();
}

async function stagePoint(page, cell, height = 0) {
  return page.evaluate(
    ([x, z, h]) => window.__GOBLIN.project(x, z, h),
    [cell.x, cell.z, height],
  );
}

async function leftCell(page, cell, height = 0) {
  const point = await stagePoint(page, cell, height);
  assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y));
  await page.mouse.click(point.x, point.y, { button: "left" });
}

async function rightCell(page, cell, height = 0) {
  const point = await stagePoint(page, cell, height);
  assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y));
  await page.mouse.click(point.x, point.y, { button: "right" });
}

async function savedEnvelope(page) {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const opening = indexedDB.open("hive-local-world");
        opening.onerror = () => reject(opening.error);
        opening.onsuccess = () => {
          const database = opening.result;
          const request = database
            .transaction("world", "readonly")
            .objectStore("world")
            .get("current");
          request.onerror = () => {
            database.close();
            reject(request.error);
          };
          request.onsuccess = () => {
            database.close();
            resolve(structuredClone(request.result));
          };
        };
      }),
  );
}

function clearNeighbor(state, actorId, avoid = []) {
  const actor = state.actors[actorId];
  const blocked = new Set();
  for (const rock of state.rocks) blocked.add(cellKey(rock));
  blocked.add(cellKey(state.watcher));
  for (const tree of state.trees)
    if (tree.felledAt === null) blocked.add(cellKey(tree));
  for (const site of state.sites)
    if (site.type === "wall" || site.type === "door")
      blocked.add(cellKey(site));
  for (const pile of state.piles)
    if (pile.amount > 0) blocked.add(cellKey(pile));
  for (const person of Object.values(state.actors)) {
    blocked.add(cellKey(person));
    for (const cell of person.path || []) blocked.add(cellKey(cell));
  }
  blocked.add(cellKey(state.cat));
  for (const cell of state.cat.path || []) blocked.add(cellKey(cell));
  for (const cell of avoid) blocked.add(cellKey(cell));
  const origin = {
    x: Math.round(actor.x),
    z: Math.round(actor.z),
    level: actor.level || 0,
  };
  const offsets = [
    { x: 1, z: 0 },
    { x: 0, z: 1 },
    { x: -1, z: 0 },
    { x: 0, z: -1 },
    { x: 2, z: 0 },
    { x: 0, z: 2 },
  ];
  for (const offset of offsets) {
    const candidate = {
      x: origin.x + offset.x,
      z: origin.z + offset.z,
      level: origin.level,
    };
    if (
      candidate.x < 0 ||
      candidate.z < 0 ||
      candidate.x >= 15 ||
      candidate.z >= 15
    )
      continue;
    if (!blocked.has(cellKey(candidate))) return candidate;
  }
  throw new Error("No clear adjacent Go target for Rowan");
}

async function screenshot(page, name) {
  await page.screenshot({ path: path.join(evidenceDir, name), fullPage: true });
}

const evidence = {
  proof: "draft-go-local",
  baseUrl,
  wrapperInvocation:
    "/home/levi/src/Botanical-next/.agents/skills/orchestrate-multi-lane-work/scripts/run-proof.sh node scripts/prove-draft-go.mjs " +
    baseUrl +
    " " +
    path.relative(root, evidenceDir),
  hashes: { source: {}, dist: {}, served: {}, script: null },
  assertions: [],
  snapshots: {},
  errors: { page: [], console: [], request: [] },
  success: false,
  failure: null,
  limits: [
    "One fresh, local browser context against the pinned server; no test/build/source mutation.",
    "Only Rowan is recruited and selected; Sedge remains a visible visitor while the retained shared wall job waits.",
    "The proof observes public UI gestures plus read-only __GOBLIN state hooks; it does not inject commands or mutate save storage.",
  ],
};

let browser;
let page;
try {
  await mkdir(evidenceDir, { recursive: true });
  for (const [file, expected] of Object.entries(expectedSource)) {
    const actual = await hashFile(file);
    evidence.hashes.source[file] = {
      expected,
      actual,
      ok: actual === expected,
    };
    assert.equal(actual, expected, "Source hash drift: " + file);
  }
  for (const [file, expected] of Object.entries(expectedDist)) {
    const actual = await hashFile(file);
    evidence.hashes.dist[file] = { expected, actual, ok: actual === expected };
    assert.equal(actual, expected, "Dist hash drift: " + file);
  }
  evidence.hashes.script = {
    file: "scripts/prove-draft-go.mjs",
    actual: await hashFile("scripts/prove-draft-go.mjs"),
  };

  const served = await fetch(baseUrl);
  const servedIndex = await served.text();
  evidence.hashes.served["dist/index.html"] = {
    expected: expectedDist["dist/index.html"],
    actual: sha256(servedIndex),
    ok: sha256(servedIndex) === expectedDist["dist/index.html"],
  };
  assert.equal(served.status, 200, "Pinned server index is unavailable");
  assert.equal(
    sha256(servedIndex),
    expectedDist["dist/index.html"],
    "Served index hash drift",
  );
  for (const [file, expected] of Object.entries(expectedDist)) {
    if (file === "dist/index.html") continue;
    const asset = file.slice("dist/".length);
    const response = await fetch(new URL(asset, baseUrl));
    const body = Buffer.from(await response.arrayBuffer());
    const actual = sha256(body);
    evidence.hashes.served[file] = {
      expected,
      actual,
      status: response.status,
      ok: response.status === 200 && actual === expected,
    };
    assert.equal(
      response.status,
      200,
      "Pinned server asset is unavailable: " + file,
    );
    assert.equal(actual, expected, "Served asset hash drift: " + file);
  }
  evidence.assertions.push(
    "Pinned source, local dist, served index/game/CSS/art, and proof-script hashes recorded; source and served artifact values match the frozen candidate.",
  );

  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_PATH || chromium.executablePath(),
    args: ["--disable-dev-shm-usage", "--no-sandbox"],
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  page = await context.newPage();
  page.on("pageerror", (error) => evidence.errors.page.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error")
      evidence.errors.console.push(message.text());
  });
  page.on("requestfailed", (request) =>
    evidence.errors.request.push({
      url: request.url(),
      failure: request.failure()?.errorText || "unknown",
    }),
  );
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.waitForFunction(
    () => window.__GOBLIN?.artReady === true && Boolean(window.__GOBLIN?.state),
  );

  let state = await stateOf(page);
  evidence.snapshots.startup = {
    paused: state.paused,
    tick: state.tick,
    persistence: await page.evaluate(() =>
      structuredClone(window.__GOBLIN.persistence),
    ),
  };
  assert.equal(state.paused, true, "Fresh startup must be paused");
  evidence.assertions.push(
    "Normal viewport starts paused before any simulation advance.",
  );
  await screenshot(page, "01-startup-paused.png");

  await clickId(page, "continue");
  await waitFor(page, () => window.__GOBLIN.state.paused === false, "continue");
  await clickId(page, "select-rowan");
  let selection = await selectionOf(page);
  assert.deepEqual(
    selection.selectedIds,
    ["rowan"],
    "Visible roster selection must select exactly Rowan",
  );
  evidence.assertions.push(
    "Visible roster selection is exactly Rowan (Sedge remains unselected).",
  );

  const buildButton = page
    .locator(".command-bar")
    .getByRole("button", { name: /^Build/ });
  await buildButton.click();
  await page.locator('[data-build="wall"]').click();
  state = await stateOf(page);
  const beforeOccupiedPlacement = {
    sites: state.sites.length,
    jobs: state.jobs.length,
  };
  const rowanCell = {
    x: Math.round(state.actors.rowan.x),
    z: Math.round(state.actors.rowan.z),
    level: state.actors.rowan.level,
  };
  await leftCell(page, rowanCell);
  await page.waitForFunction(() =>
    /path clear/i.test(document.querySelector("#notice")?.innerText || ""),
  );
  state = await stateOf(page);
  selection = await selectionOf(page);
  assert.equal(
    state.sites.length,
    beforeOccupiedPlacement.sites,
    "An occupied Wall cell must not create a site",
  );
  assert.equal(
    state.jobs.length,
    beforeOccupiedPlacement.jobs,
    "An occupied Wall cell must not create a job",
  );
  assert.deepEqual(
    selection.selectedIds,
    ["rowan"],
    "An armed tool click through Rowan must preserve selection",
  );
  assert.ok(
    selection.tool,
    "A rejected occupied Wall placement must retain the armed tool",
  );
  evidence.assertions.push(
    "An armed Wall click over Rowan reaches authoritative placement validation, preserves selection, and keeps the tool armed without creating a site/job.",
  );
  const wallCell = clearNeighbor(state, "rowan");
  await leftCell(page, wallCell);
  state = await waitFor(
    page,
    (cell) =>
      window.__GOBLIN.state.sites.some(
        (site) =>
          site.type === "wall" && site.x === cell.x && site.z === cell.z,
      ),
    "wall site",
    30000,
    wallCell,
  );
  const wall = state.sites.find(
    (site) =>
      site.type === "wall" && site.x === wallCell.x && site.z === wallCell.z,
  );
  assert.ok(wall, "Visible Wall placement must create a wall site");
  const sharedWall = state.jobs.find(
    (job) =>
      job.kind === "build" &&
      job.target === wall.id &&
      job.scope.party === "home" &&
      job.scope.actors === null,
  );
  assert.ok(
    sharedWall,
    "Visible Wall placement must create a shared build job",
  );
  await clickId(page, "task");

  await clickId(page, "pause");
  state = await waitFor(
    page,
    () => window.__GOBLIN.state.paused === true,
    "pause before direct chop",
  );
  const directAdmissionTick = state.tick;

  const oak = state.trees.find((tree) => tree.felledAt === null);
  assert.ok(oak, "A standing oak is required for direct chopping");
  await leftCell(page, oak, 1.5);
  await page
    .getByRole("region", { name: "Oak actions", exact: true })
    .waitFor({ state: "visible", timeout: 10000 });
  const directButton = await page.locator("#chop-now").evaluate((node) => {
    const rect = node.getBoundingClientRect();
    const center = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
    const hit = document.elementFromPoint(center.x, center.y);
    return {
      disabled: node.disabled,
      ariaDisabled: node.getAttribute("aria-disabled"),
      text: node.textContent,
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      pointerEvents: getComputedStyle(node).pointerEvents,
      hit: hit
        ? {
            tag: hit.tagName,
            id: hit.id,
            className: hit.className,
            text: hit.textContent,
          }
        : null,
    };
  });
  const directSelection = await selectionOf(page);
  await page.locator("#chop-now").focus();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(250);
  const afterDirectClick = await stateOf(page);
  evidence.snapshots.directClick = {
    button: directButton,
    selection: directSelection,
    notice: await page.locator("#notice").innerText(),
    commands: clone(afterDirectClick.commands || []),
    jobs: clone(afterDirectClick.jobs),
  };
  state = await waitFor(
    page,
    (oakId) =>
      window.__GOBLIN.state.jobs.some(
        (job) =>
          job.kind === "chop" &&
          job.target === oakId &&
          job.scope.actors?.includes("rowan"),
      ),
    "direct chop admission",
    10000,
    oak.id,
  );
  assert.equal(state.paused, true, "Direct chop admission must remain paused");
  assert.equal(
    state.tick,
    directAdmissionTick,
    "Direct chop admission while paused must not advance tick",
  );
  evidence.assertions.push(
    "A personal direct Chop is admitted while paused without advancing simulation time.",
  );
  await clickId(page, "pause");
  state = await waitFor(
    page,
    () => {
      const actor = window.__GOBLIN.state.actors.rowan;
      return (
        Boolean(actor.cargo) || window.__GOBLIN.state.claims.rowan !== undefined
      );
    },
    "active cargo or claim",
    45000,
  );
  assert.ok(
    state.actors.rowan.cargo || claimsFor(state, "rowan").length,
    "Rowan must genuinely own cargo or an active claim before pausing",
  );
  assert.equal(
    resourceTotal(state),
    state.felled * 6,
    "Active direct-chop state must conserve felled wood",
  );
  await clickId(page, "pause");
  state = await waitFor(
    page,
    () => window.__GOBLIN.state.paused === true,
    "pause after active ownership",
  );
  const beforeDraft = clone(state);
  evidence.snapshots.beforeDraft = {
    tick: state.tick,
    rowan: actorFacts(state),
    claims: claimsFor(state, "rowan"),
    world: worldWorkFacts(state),
    feed: clone(state.feed),
    materialTotal: resourceTotal(state),
    material: { piles: clone(state.piles), sites: clone(state.sites) },
  };

  await clickId(page, "select-rowan");
  await clickId(page, "draft");
  state = await waitFor(
    page,
    () => window.__GOBLIN.state.actors.rowan.drafted === true,
    "Draft",
  );
  const afterDraft = state;
  evidence.snapshots.afterDraft = {
    tick: state.tick,
    rowan: actorFacts(state),
    claims: claimsFor(state, "rowan"),
    world: worldWorkFacts(state),
    feed: clone(state.feed),
    materialTotal: resourceTotal(state),
    notice: await page.locator("#notice").innerText(),
    draftButton: await page.locator("#draft").innerText(),
  };
  assert.equal(
    afterDraft.paused,
    true,
    "Draft must not resume a paused simulation",
  );
  assert.equal(
    afterDraft.tick,
    beforeDraft.tick,
    "Draft while paused must preserve tick",
  );
  assert.deepEqual(
    [
      afterDraft.actors.rowan.x,
      afterDraft.actors.rowan.z,
      afterDraft.actors.rowan.level,
    ],
    [
      beforeDraft.actors.rowan.x,
      beforeDraft.actors.rowan.z,
      beforeDraft.actors.rowan.level,
    ],
    "Draft must preserve position",
  );
  assert.deepEqual(
    worldWorkFacts(afterDraft).trees,
    worldWorkFacts(beforeDraft).trees,
    "Draft must preserve tree work",
  );
  assert.deepEqual(
    worldWorkFacts(afterDraft).sites,
    worldWorkFacts(beforeDraft).sites,
    "Draft must preserve site work/delivery",
  );
  assert.deepEqual(
    worldWorkFacts(afterDraft).jobs,
    worldWorkFacts(beforeDraft).jobs,
    "Draft must preserve queued jobs",
  );
  assert.deepEqual(
    afterDraft.feed,
    beforeDraft.feed,
    "Draft while paused must preserve feed state",
  );
  assert.equal(
    resourceTotal(afterDraft),
    resourceTotal(beforeDraft),
    "Draft interruption must conserve wood across piles/sites/cargo/sink",
  );
  assert.equal(
    resourceTotal(afterDraft),
    afterDraft.felled * 6,
    "Draft interruption must preserve felled-wood conservation",
  );
  assert.equal(
    afterDraft.actors.rowan.task,
    null,
    "Draft must clear active task",
  );
  assert.equal(
    afterDraft.actors.rowan.assignment,
    null,
    "Draft must clear assignment",
  );
  assert.equal(afterDraft.actors.rowan.cargo, null, "Draft must drop cargo");
  assert.equal(
    claimsFor(afterDraft, "rowan").length,
    0,
    "Draft must release active claims",
  );
  assert.match(
    await page.locator("#notice").innerText(),
    /drafted and holding position/i,
    "Visible status must say drafted holding",
  );
  assert.match(
    await page.locator("#draft").innerText(),
    /undraft/i,
    "Visible button must expose Undraft",
  );
  evidence.assertions.push(
    "Visible Draft keeps paused tick/position/world-work/jobs/material total, releases task/assignment/cargo/claim, and displays drafted holding.",
  );
  await screenshot(page, "02-drafted-holding.png");

  const goTarget = clearNeighbor(afterDraft, "rowan");
  const pausedTick = afterDraft.tick;
  const pausedPosition = [
    afterDraft.actors.rowan.x,
    afterDraft.actors.rowan.z,
    afterDraft.actors.rowan.level,
  ];
  await rightCell(page, goTarget);
  state = await waitFor(
    page,
    () => {
      const actor = window.__GOBLIN.state.actors.rowan;
      return (
        actor.drafted === true &&
        actor.mode === "walk" &&
        actor.path?.length > 0
      );
    },
    "paused Go path",
  );
  evidence.snapshots.pausedGo = {
    target: goTarget,
    tick: state.tick,
    rowan: actorFacts(state),
    commands: clone(state.commands || []),
  };
  assert.equal(state.paused, true, "Paused Go must remain paused");
  assert.equal(state.tick, pausedTick, "Paused Go must not advance tick");
  assert.deepEqual(
    [state.actors.rowan.x, state.actors.rowan.z, state.actors.rowan.level],
    pausedPosition,
    "Paused Go must not move Rowan",
  );
  evidence.assertions.push(
    "Visible right-click on clear ground creates a drafted Go path/mode without paused travel or tick advance.",
  );

  const commandCount = (candidate) => (candidate.commands || []).length;
  const wallArmedBefore = await stateOf(page);
  await buildButton.click();
  await page.locator('[data-build="wall"]').click();
  await rightCell(page, goTarget);
  state = await waitFor(
    page,
    () => window.__GOBLIN.selection.tool === null,
    "Wall tool cancellation",
  );
  assert.equal(
    commandCount(state),
    commandCount(wallArmedBefore),
    "Armed Wall right-click must not issue Go",
  );
  assert.deepEqual(
    worldWorkFacts(state).jobs,
    worldWorkFacts(wallArmedBefore).jobs,
    "Armed Wall right-click must not create an order",
  );
  const chopArmedBefore = clone(state);
  await clickId(page, "chop-tool");
  await rightCell(page, goTarget);
  state = await waitFor(
    page,
    () => window.__GOBLIN.selection.tool === null,
    "Chop tool cancellation",
  );
  assert.equal(
    commandCount(state),
    commandCount(chopArmedBefore),
    "Armed Chop right-click must not issue Go",
  );
  assert.deepEqual(
    worldWorkFacts(state).jobs,
    worldWorkFacts(chopArmedBefore).jobs,
    "Armed Chop right-click must not create an order",
  );
  evidence.assertions.push(
    "Armed Wall and Chop right-clicks each cancel their tool only: no Go command and no new job/order.",
  );

  await clickId(page, "pause");
  state = await waitFor(
    page,
    (target) => {
      const actor = window.__GOBLIN.state.actors.rowan;
      return (
        window.__GOBLIN.state.paused === false &&
        actor.drafted &&
        actor.mode === "idle" &&
        Math.round(actor.x) === target.x &&
        Math.round(actor.z) === target.z
      );
    },
    "drafted Go arrival",
    30000,
    goTarget,
  );
  const sharedJobAfterArrival = state.jobs.find(
    (job) => job.id === sharedWall.id,
  );
  assert.ok(
    sharedJobAfterArrival,
    "Shared wall job must still exist after drafted travel",
  );
  assert.equal(
    state.actors.rowan.task,
    null,
    "Drafted Rowan must hold without ordinary task at Go arrival",
  );
  assert.equal(
    state.actors.rowan.assignment,
    null,
    "Drafted Rowan must hold without ordinary assignment at Go arrival",
  );
  assert.equal(
    state.actors.rowan.cargo,
    null,
    "Drafted Rowan must hold without cargo at Go arrival",
  );
  await page.waitForTimeout(800);
  state = await stateOf(page);
  assert.ok(
    state.jobs.some((job) => job.id === sharedWall.id),
    "Shared ordinary work must remain queued with the only worker drafted",
  );
  assert.equal(
    state.actors.rowan.task,
    null,
    "Shared work must remain ineligible while Rowan is drafted",
  );
  evidence.snapshots.arrivedHolding = {
    target: goTarget,
    rowan: actorFacts(state),
    sharedJob: clone(state.jobs.find((job) => job.id === sharedWall.id)),
  };
  evidence.assertions.push(
    "After resume, drafted Rowan reaches Go target and holds; the shared wall job remains queued with no ordinary assignment.",
  );
  await screenshot(page, "03-arrived-drafted-holding.png");

  await clickId(page, "pause");
  await waitFor(
    page,
    () => window.__GOBLIN.state.paused === true,
    "second pause",
  );
  const beforePersist = await page.evaluate(() =>
    structuredClone(window.__GOBLIN.persistence),
  );
  const reloadTarget = clearNeighbor(await stateOf(page), "rowan", [goTarget]);
  await rightCell(page, reloadTarget);
  state = await waitFor(
    page,
    () => {
      const actor = window.__GOBLIN.state.actors.rowan;
      return (
        window.__GOBLIN.state.paused &&
        actor.drafted &&
        actor.mode === "walk" &&
        actor.path?.length > 0
      );
    },
    "persisted pending Go",
  );
  await page.waitForFunction(
    (revision) =>
      window.__GOBLIN.persistence.phase === "saved" &&
      window.__GOBLIN.persistence.revision > revision,
    beforePersist.revision,
    { timeout: 15000 },
  );
  const beforeReloadEnvelope = await savedEnvelope(page);
  assert.equal(
    beforeReloadEnvelope.schema,
    3,
    "Pending Go must commit as save schema v3",
  );
  evidence.snapshots.beforeReload = {
    target: reloadTarget,
    persistence: await page.evaluate(() =>
      structuredClone(window.__GOBLIN.persistence),
    ),
    envelope: {
      kind: beforeReloadEnvelope.kind,
      schema: beforeReloadEnvelope.schema,
      revision: beforeReloadEnvelope.revision,
    },
    rowan: actorFacts(await stateOf(page)),
    commands: clone((await stateOf(page)).commands || []),
  };
  await screenshot(page, "04-pending-go-before-reload.png");
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForFunction(
    () => window.__GOBLIN?.artReady === true && Boolean(window.__GOBLIN?.state),
  );
  state = await stateOf(page);
  evidence.snapshots.afterReload = {
    persistence: await page.evaluate(() =>
      structuredClone(window.__GOBLIN.persistence),
    ),
    paused: state.paused,
    rowan: actorFacts(state),
    commands: clone(state.commands || []),
  };
  assert.equal(
    state.paused,
    true,
    "Reloaded persisted state must remain paused",
  );
  const reloadedPersistence = await page.evaluate(() =>
    structuredClone(window.__GOBLIN.persistence),
  );
  const reloadedEnvelope = await savedEnvelope(page);
  assert.equal(
    reloadedPersistence.slot,
    "valid",
    "Reload must expose a valid persisted save slot",
  );
  assert.ok(
    reloadedPersistence.revision >= beforePersist.revision + 1,
    "Reload must retain the saved persistence revision",
  );
  assert.equal(
    reloadedEnvelope.schema,
    3,
    "Reloaded slot must remain exact save schema v3",
  );
  assert.equal(
    state.actors.rowan.drafted,
    true,
    "Reload must preserve drafted state",
  );
  assert.equal(
    state.actors.rowan.mode,
    "walk",
    "Reload must preserve pending Go mode",
  );
  assert.ok(
    state.actors.rowan.path?.length > 0,
    "Reload must preserve pending Go path",
  );
  assert.deepEqual(
    state.commands || [],
    [],
    "Reloaded snapshot must omit command journal",
  );
  evidence.assertions.push(
    "Exact schema-v3 save/reload preserves paused drafted pending Go/path while omitting command journal.",
  );

  await clickId(page, "select-rowan");
  await clickId(page, "draft");
  state = await waitFor(
    page,
    () => {
      const actor = window.__GOBLIN.state.actors.rowan;
      return (
        !actor.drafted &&
        actor.mode === "idle" &&
        (!actor.path || actor.path.length === 0)
      );
    },
    "paused Undraft clears Go",
  );
  assert.equal(state.paused, true, "Undraft must not resume paused simulation");
  assert.equal(
    state.actors.rowan.task,
    null,
    "Undraft begins from clean holding state",
  );
  evidence.snapshots.undraftedPaused = {
    rowan: actorFacts(state),
    sharedJob: clone(state.jobs.find((job) => job.id === sharedWall.id)),
  };
  await clickId(page, "pause");
  state = await waitFor(
    page,
    () => {
      const actor = window.__GOBLIN.state.actors.rowan;
      return (
        !window.__GOBLIN.state.paused &&
        !actor.drafted &&
        Boolean(actor.task || actor.assignment)
      );
    },
    "ordinary eligibility after Undraft",
    20000,
  );
  evidence.snapshots.ordinaryResumed = {
    rowan: actorFacts(state),
    sharedJob: clone(state.jobs.find((job) => job.id === sharedWall.id)),
  };
  evidence.assertions.push(
    "Visible paused Undraft clears Go path; after resume Rowan becomes eligible for ordinary queued work again.",
  );

  await page.locator('.command-bar [aria-label="Center on selection"]').click();
  selection = await selectionOf(page);
  assert.deepEqual(
    selection.selectedIds,
    ["rowan"],
    "Camera focus must preserve the active selection",
  );
  evidence.assertions.push(
    "Center-on-selection remains operable and preserves Rowan selection after Draft/Go.",
  );

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(200);
  const narrow = await page.evaluate(() => {
    const pause = document.querySelector("#pause")?.getBoundingClientRect();
    const roster = document.querySelector(".roster")?.getBoundingClientRect();
    const story = document.querySelector(".story")?.getBoundingClientRect();
    const overlaps =
      roster &&
      story &&
      !(
        roster.right <= story.left ||
        story.right <= roster.left ||
        roster.bottom <= story.top ||
        story.bottom <= roster.top
      );
    return {
      width: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      pauseVisible: Boolean(
        pause &&
        pause.width > 0 &&
        pause.right <= window.innerWidth &&
        pause.bottom > 0,
      ),
      rosterStorySeparated: overlaps === false,
      notice: document.querySelector("#notice")?.innerText || "",
    };
  });
  evidence.snapshots.narrow390 = narrow;
  assert.equal(narrow.width, 390, "Narrow viewport must be 390px");
  assert.ok(
    narrow.scrollWidth <= narrow.width,
    "390px HUD must not horizontally overflow",
  );
  assert.equal(
    narrow.pauseVisible,
    true,
    "390px pause control must remain visible and contained",
  );
  assert.equal(
    narrow.rosterStorySeparated,
    true,
    "390px roster and story must remain visually separated",
  );
  evidence.assertions.push(
    "390px viewport remains contained/readable with visible pause control and separated roster/story regions.",
  );
  await screenshot(page, "05-narrow-390.png");

  await page.getByRole("button", { name: "Open game menu" }).click();
  await clickId(page, "reset");
  state = await waitFor(
    page,
    () => {
      const current = window.__GOBLIN.state;
      return (
        current.paused === true &&
        current.tick === 0 &&
        current.jobs.length === 0 &&
        current.sites.length === 0 &&
        current.actors.rowan.drafted === false
      );
    },
    "New clearing reset",
  );
  await page.waitForFunction(
    () =>
      window.__GOBLIN.persistence.phase === "saved" &&
      window.__GOBLIN.persistence.tick === 0,
    undefined,
    { timeout: 15000 },
  );
  selection = await selectionOf(page);
  assert.deepEqual(
    selection.selectedIds,
    [],
    "New clearing must clear actor selection",
  );
  evidence.snapshots.reset = {
    tick: state.tick,
    paused: state.paused,
    jobs: state.jobs.length,
    sites: state.sites.length,
    rowan: actorFacts(state),
    persistence: await page.evaluate(() =>
      structuredClone(window.__GOBLIN.persistence),
    ),
  };
  evidence.assertions.push(
    "Visible New clearing resets to a paused tick-0 world, clears selection/Draft/jobs/sites, and reports the replacement save committed.",
  );
  await screenshot(page, "06-reset-paused.png");

  assert.deepEqual(evidence.errors.page, [], "Page errors occurred");
  assert.deepEqual(evidence.errors.console, [], "Console errors occurred");
  assert.deepEqual(evidence.errors.request, [], "Failed requests occurred");
  evidence.success = true;
} catch (error) {
  evidence.failure = {
    name: error?.name || "Error",
    message: error?.message || String(error),
    stack: error?.stack || null,
  };
  if (page) {
    try {
      await screenshot(page, "failure.png");
    } catch {}
  }
  process.exitCode = 1;
} finally {
  try {
    if (browser) await browser.close();
  } catch {}
  try {
    await mkdir(evidenceDir, { recursive: true });
    await writeFile(
      path.join(evidenceDir, "proof.json"),
      JSON.stringify(evidence, null, 2) + "\n",
    );
  } catch (writeError) {
    console.error(writeError);
    process.exitCode = 1;
  }
}
