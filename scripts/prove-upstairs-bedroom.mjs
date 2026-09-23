import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const url = process.argv[2] || "http://127.0.0.1:5188/";
const output = process.argv[3] || ".botanical/upstairs-bedroom-final-20260907";
const runner =
  "/home/levi/src/Botanical-next/.agents/skills/orchestrate-multi-lane-work/scripts/run-proof.sh";
const expectedNames = {
  gameJs: "game-BrzYf50O.js",
  gameCss: "game-CvQe2sTu.css",
  artJs: "art-Ci6kLFIF.js",
};
const expectedHashes = {
  index: "f05b03147285c2fcecab70983d79f1c44d8f99c5d3335f12057879229b78e68c",
  gameJs: "fa8569c1c75119b5571ed5dc2a0a32ea2adbb5b015f580f05e2468b43eeb4c79",
  gameCss: "1321c9548f927b8ee60b36a6168e35b61a89f6b9e753362987bd7676ecc9a175",
  artJs: "d1427348997d559d580a835e9132cd2bbc85da15def3373dbb3f1985e247ab56",
};
function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function refs(html) {
  return [...html.matchAll(/(?:src|href)=["']\/?(assets\/[^"']+)["']/g)].map(
    (match) => match[1],
  );
}

function resolveAssets(list) {
  return {
    gameJs: list.find((asset) => /^assets\/game-.*\.js$/.test(asset)),
    gameCss: list.find((asset) => /^assets\/game-.*\.css$/.test(asset)),
    artJs: list.find((asset) => /^assets\/art-.*\.js$/.test(asset)),
  };
}

const localIndexBytes = await readFile("dist/index.html");
const localAssets = resolveAssets(refs(localIndexBytes.toString("utf8")));
assert.deepEqual(
  localAssets,
  {
    gameJs: `assets/${expectedNames.gameJs}`,
    gameCss: `assets/${expectedNames.gameCss}`,
    artJs: `assets/${expectedNames.artJs}`,
  },
  "frozen dist asset names drifted",
);
const localHashes = {
  index: sha256(localIndexBytes),
  gameJs: sha256(await readFile(`dist/${localAssets.gameJs}`)),
  gameCss: sha256(await readFile(`dist/${localAssets.gameCss}`)),
  artJs: sha256(await readFile(`dist/${localAssets.artJs}`)),
};
assert.deepEqual(localHashes, expectedHashes, "frozen dist hashes drifted");

const servedIndexResponse = await fetch(url);
assert.equal(servedIndexResponse.status, 200, "served index must return 200");
const servedIndexUrl = servedIndexResponse.url || url;
const servedIndexBytes = Buffer.from(await servedIndexResponse.arrayBuffer());
const servedAssets = resolveAssets(refs(servedIndexBytes.toString("utf8")));
assert.deepEqual(servedAssets, localAssets, "served asset references drifted");
const fetchHash = async (asset) => {
  const response = await fetch(new URL(asset, servedIndexUrl));
  assert.equal(response.status, 200, `served asset must return 200: ${asset}`);
  return sha256(Buffer.from(await response.arrayBuffer()));
};
const servedHashes = {
  index: sha256(servedIndexBytes),
  gameJs: await fetchHash(servedAssets.gameJs),
  gameCss: await fetchHash(servedAssets.gameCss),
  artJs: await fetchHash(servedAssets.artJs),
};
assert.deepEqual(
  servedHashes,
  expectedHashes,
  "served frozen dist hashes drifted",
);

await mkdir(output, { recursive: true });
const evidence = {
  url,
  output,
  frozenTarget: {
    buildCommit: "32cd423",
    runtimeSourceCommit: "32cd423",
    localAssets,
    localHashes,
  },
  servedParity: {
    indexUrl: servedIndexUrl,
    assets: servedAssets,
    hashes: servedHashes,
    matchesLocalDist: true,
  },
  scriptSha256: sha256(await readFile("scripts/prove-upstairs-bedroom.mjs")),
  wrapper: {
    runner,
    scope: "RuntimeMaxSec=10min; one focused upstairs bedroom browser proof",
  },
  screenshots: [],
  errors: { page: [], console: [], request: [] },
  claims: {},
};

let browser;
let context;
let page;

const state = () => page.evaluate(() => structuredClone(window.__GOBLIN.state));
const selection = () =>
  page.evaluate(() => structuredClone(window.__GOBLIN.selection));
const persistence = () =>
  page.evaluate(() => structuredClone(window.__GOBLIN.persistence));
const project = (cell, height = 0) =>
  page.evaluate(
    ([x, z, nextHeight, level]) =>
      window.__GOBLIN.project(x, z, nextHeight, level),
    [cell.x, cell.z, height, cell.level ?? 0],
  );
const clickCell = async (cell, height = 0) => {
  const point = await project(cell, height);
  await page.mouse.click(point.x, point.y);
};
const dragCells = async (start, end) => {
  const from = await project(start);
  const to = await project(end);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 4 });
  await page.mouse.up();
};
const waitState = (predicate, value = null, timeout = 45_000) =>
  page.waitForFunction(predicate, value, { timeout });
const screenshot = async (name) => {
  await page.screenshot({ path: `${output}/${name}.png` });
  evidence.screenshots.push(`${name}.png`);
};
const commandBar = () =>
  page.getByRole("navigation", { name: "Colony controls", exact: true });
const buildButton = () =>
  commandBar().getByRole("button", { name: "Build", exact: true });
const levelButton = (level) => page.locator(`[data-level="${level}"]`);
const buildTool = (type) => page.locator(`[data-build="${type}"]`);

function physicalWood(next) {
  return (
    next.piles.reduce((sum, pile) => sum + pile.amount, 0) +
    next.sites.reduce((sum, site) => sum + site.delivered, 0) +
    Object.values(next.actors).reduce(
      (sum, actor) => sum + (actor.cargo?.amount || 0),
      0,
    )
  );
}

function durableState(next) {
  const copy = structuredClone(next);
  delete copy.commands;
  return copy;
}

function siteAt(next, type, cell, level = cell.level ?? 0) {
  return next.sites.find(
    (site) =>
      site.type === type &&
      site.level === level &&
      site.x === cell.x &&
      site.z === cell.z,
  );
}

async function pause() {
  if (!(await state()).paused) {
    await page.locator("#pause").click();
    await waitState(() => window.__GOBLIN.state.paused === true);
  }
}

async function resume() {
  if ((await state()).paused) {
    await page.locator("#pause").click();
    await waitState(() => window.__GOBLIN.state.paused === false);
  }
}

async function speed4() {
  if ((await page.locator("#speed").textContent()) !== "4×") {
    await page.locator("#speed").click();
    await waitState(
      () => document.querySelector("#speed")?.textContent === "4×",
    );
  }
}

async function speed1() {
  if ((await page.locator("#speed").textContent()) !== "1×") {
    await page.locator("#speed").click();
    await waitState(
      () => document.querySelector("#speed")?.textContent === "1×",
    );
  }
}

async function setLevel(level) {
  await levelButton(level).click();
  await waitState(
    (expectedLevel) => window.__GOBLIN.selection.level === expectedLevel,
    level,
  );
}

async function openBuild() {
  const panel = page.getByRole("region", { name: "Build", exact: true });
  if (!(await panel.count())) await buildButton().click();
  await panel.waitFor({ state: "visible" });
}

async function chooseTool(type) {
  await openBuild();
  await buildTool(type).click();
  await waitState(
    (expectedTool) => window.__GOBLIN.selection.tool === expectedTool,
    type,
  );
}

async function placeSingle(type, cell) {
  const before = (await state()).sites.length;
  await chooseTool(type);
  await clickCell(cell);
  await waitState(
    (expected) => window.__GOBLIN.state.sites.length > expected,
    before,
  );
  const next = await state();
  const site = siteAt(next, type, cell, cell.level ?? 0);
  assert.ok(
    site,
    `${type} site should be admitted at ${cell.x},${cell.z},${cell.level ?? 0}`,
  );
  return site;
}

async function placeBatch(type, cells) {
  await chooseTool(type);
  for (const cell of cells) {
    const before = (await state()).sites.length;
    await clickCell(cell);
    await waitState(
      (expected) => window.__GOBLIN.state.sites.length > expected,
      before,
    );
    assert.ok(
      siteAt(await state(), type, cell, cell.level ?? 0),
      `${type} site should be admitted at ${cell.x},${cell.z},${cell.level ?? 0}`,
    );
  }
  return (await state()).sites.filter((site) => site.type === type);
}

async function selectOnlyActor(id) {
  const current = await selection();
  if (current.selectedIds.length !== 1 || current.selectedIds[0] !== id)
    await page.locator(`#select-${id}`).click();
  await waitState(
    (actorId) =>
      window.__GOBLIN.selection.selectedIds.length === 1 &&
      window.__GOBLIN.selection.selectedIds[0] === actorId,
    id,
  );
}

async function draftAndGo(id, target) {
  await selectOnlyActor(id);
  if (!(await state()).actors[id].drafted) await page.locator("#draft").click();
  await waitState(
    (actorId) => window.__GOBLIN.state.actors[actorId].drafted,
    id,
  );
  const characterPanel = page.getByRole("region", {
    name: "Character",
    exact: true,
  });
  if (await characterPanel.count()) {
    await page
      .getByRole("button", { name: "Close Character", exact: true })
      .click();
    await characterPanel.waitFor({ state: "detached" });
  }
  const destination = await project(target);
  await page.mouse.click(destination.x, destination.y, { button: "right" });
  await waitState(
    ({ actorId, cell }) => {
      const actor = window.__GOBLIN.state.actors[actorId];
      return (
        actor.drafted &&
        (actor.mode === "walk" ||
          (actor.x === cell.x &&
            actor.z === cell.z &&
            actor.level === cell.level))
      );
    },
    { actorId: id, cell: target },
  );
}

async function parkHomeAwayFrom(cells) {
  if ((await selection()).tool) {
    await page.locator("#task").click();
    await waitState(() => window.__GOBLIN.selection.tool === null);
  }
  const buildPanel = page.getByRole("region", { name: "Build", exact: true });
  if (await buildPanel.count()) {
    await page
      .getByRole("button", { name: "Close Build", exact: true })
      .click();
    await buildPanel.waitFor({ state: "detached" });
  }
  const destinations = {
    rowan: { x: 3, z: 11, level: 0 },
    sedge: { x: 10, z: 10, level: 0 },
  };
  await draftAndGo("rowan", destinations.rowan);
  await draftAndGo("sedge", destinations.sedge);
  await speed4();
  await resume();
  await waitState(
    ({ destinations: targets, forbidden }) => {
      const key = (cell) => `${cell.x},${cell.z},${cell.level ?? 0}`;
      const blocked = new Set(forbidden.map(key));
      const peopleParked = Object.entries(targets).every(([id, target]) => {
        const actor = window.__GOBLIN.state.actors[id];
        return (
          actor.drafted &&
          actor.mode === "idle" &&
          actor.path.length === 0 &&
          key(actor) === key(target)
        );
      });
      const cat = window.__GOBLIN.state.cat;
      return (
        peopleParked &&
        !blocked.has(key(cat)) &&
        cat.path.every((cell) => !blocked.has(key(cell)))
      );
    },
    { destinations, forbidden: cells },
  );
  await pause();
  for (const id of Object.keys(destinations)) {
    await selectOnlyActor(id);
    await page.locator("#draft").click();
    await waitState(
      (actorId) => !window.__GOBLIN.state.actors[actorId].drafted,
      id,
    );
  }
}

try {
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_PATH,
    args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
  });
  context = await browser.newContext({
    viewport: { width: 1024, height: 768 },
    deviceScaleFactor: 1,
  });
  page = await context.newPage();
  page.setDefaultTimeout(15_000);
  page.on("pageerror", (error) => evidence.errors.page.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error")
      evidence.errors.console.push(message.text());
  });
  page.on("requestfailed", (request) =>
    evidence.errors.request.push(
      `${request.url()} · ${request.failure()?.errorText}`,
    ),
  );

  const response = await page.goto(url, { waitUntil: "domcontentloaded" });
  assert.equal(response?.status(), 200);
  await page.waitForFunction(() => window.__GOBLIN?.artReady, null, {
    timeout: 45_000,
  });
  await page.waitForSelector("#stage canvas");

  await page.locator("#reset").click();
  await waitState(
    () =>
      window.__GOBLIN.state.tick === 0 && window.__GOBLIN.state.paused === true,
  );
  await waitState(() => window.__GOBLIN.persistence.phase === "saved");
  const fresh = await state();
  assert.equal(physicalWood(fresh), 0);
  assert.deepEqual(fresh.parties.home.members, ["rowan"]);
  evidence.claims.newClearing = {
    paused: true,
    tick: 0,
    physicalWood: 0,
    homeMembers: ["rowan"],
  };

  await resume();
  const visitor = (await state()).actors.sedge;
  await clickCell(visitor, 1.5);
  await waitState(
    () =>
      window.__GOBLIN.selection.inspectedTarget?.kind === "actor" &&
      window.__GOBLIN.selection.inspectedTarget.id === "sedge",
  );
  await page.locator("#recruit").click();
  await waitState(() =>
    window.__GOBLIN.state.parties.home.members.includes("sedge"),
  );
  evidence.claims.recruit = {
    visibleSedge: true,
    homeMembers: (await state()).parties.home.members,
  };
  await pause();

  await openBuild();
  await setLevel(0);
  await page.locator("#chop-tool").click();
  await waitState(() => window.__GOBLIN.selection.tool === "chop");
  const trees = (await state()).trees.filter((tree) => tree.felledAt === null);
  const chopBefore = (await state()).jobs.length;
  await dragCells({ x: 1, z: 1, level: 0 }, { x: 12, z: 13, level: 0 });
  await waitState(
    (expected) =>
      window.__GOBLIN.state.jobs.filter((job) => job.kind === "chop").length ===
      expected,
    trees.length,
  );
  assert.equal((await state()).jobs.length, chopBefore + trees.length);
  await page.locator("#chop-tool").click();
  await waitState(() => window.__GOBLIN.selection.tool === null);
  await resume();
  await speed4();
  await waitState(
    () =>
      window.__GOBLIN.state.felled === 8 &&
      window.__GOBLIN.state.piles.reduce(
        (sum, pile) => sum + pile.amount,
        0,
      ) === 48,
  );
  await pause();
  const earned = await state();
  assert.equal(earned.felled, 8);
  assert.equal(physicalWood(earned), 48);
  evidence.claims.earnedOak = {
    felled: earned.felled,
    generatedWood: earned.felled * 6,
    physicalWood: physicalWood(earned),
    freeStock: false,
  };
  await screenshot("normal-earned-48-oak");

  const stairCell = { x: 8, z: 2, level: 0 };
  const stairMiddle = { x: 8, z: 3, level: 0 };
  const stairLanding = { x: 8, z: 4, level: 1 };
  const supportCells = [];
  for (let x = 6; x <= 9; x += 1)
    for (let z = 4; z <= 6; z += 1)
      if (!(x === 8 && z === 4)) supportCells.push({ x, z, level: 0 });
  const interiorSupportCells = supportCells.filter(
    (cell) => (cell.x === 7 || cell.x === 8) && cell.z === 5,
  );
  const perimeterSupportCells = supportCells.filter(
    (cell) => !interiorSupportCells.includes(cell),
  );
  const interiorFloorCells = interiorSupportCells.map((cell) => ({
    ...cell,
    level: 1,
  }));
  const perimeterFloorCells = perimeterSupportCells.map((cell) => ({
    ...cell,
    level: 1,
  }));
  const upperWalls = [];
  for (let x = 6; x <= 9; x += 1)
    for (const z of [4, 6])
      if (!(x === 8 && z === 4)) upperWalls.push({ x, z, level: 1 });
  for (const x of [6, 9]) upperWalls.push({ x, z: 5, level: 1 });
  const upperDoor = stairLanding;
  const bedCell = { x: 7, z: 5, level: 1 };
  const bedSecondCell = { x: 8, z: 5, level: 1 };
  const roofCells = [bedCell, bedSecondCell];

  await chooseTool("wall");
  const strokeSites = (await state()).sites.length;
  const strokeJobs = (await state()).jobs.length;
  const strokeFrom = await project({ ...supportCells[0] });
  const strokeTo = await project({ ...supportCells[1] });
  await page.mouse.move(strokeFrom.x, strokeFrom.y);
  await page.mouse.down();
  await page.mouse.move(strokeTo.x, strokeTo.y, { steps: 3 });
  await waitState(() => window.__GOBLIN.selection.phase === "dragging");
  await levelButton(1).click();
  await waitState(() => window.__GOBLIN.selection.phase !== "dragging");
  const canceledStroke = await selection();
  const afterStroke = await state();
  await page.mouse.up().catch(() => {});
  assert.equal(canceledStroke.tool, "wall");
  assert.equal(afterStroke.sites.length, strokeSites);
  assert.equal(afterStroke.jobs.length, strokeJobs);
  evidence.claims.levelSwitchCancelsStroke = {
    toolPersists: true,
    phase: canceledStroke.phase,
    straySites: 0,
    strayJobs: 0,
  };
  await setLevel(0);

  await placeBatch("wall", interiorSupportCells);
  await resume();
  await speed4();
  await waitState((cells) => {
    const current = window.__GOBLIN.state;
    return cells.every((cell) =>
      current.sites.some(
        (site) =>
          site.type === "wall" &&
          site.x === cell.x &&
          site.z === cell.z &&
          site.finishedAt !== null,
      ),
    );
  }, interiorSupportCells);
  await pause();

  await placeBatch("floor", interiorFloorCells);
  await speed1();
  await resume();
  await waitState(() => {
    const current = window.__GOBLIN.state;
    return (
      current.sites.some(
        (site) => site.type === "floor" && site.finishedAt === null,
      ) &&
      Object.values(current.actors).some(
        (actor) =>
          actor.level === 0 &&
          actor.task &&
          ["deliver", "build"].includes(actor.task.kind) &&
          current.sites.some(
            (site) => site.id === actor.task.target && site.type === "floor",
          ),
      )
    );
  });
  await pause();
  const floorWork = await state();
  const floorWorker = Object.values(floorWork.actors).find(
    (actor) =>
      actor.level === 0 &&
      actor.task &&
      floorWork.sites.some(
        (site) => site.id === actor.task.target && site.type === "floor",
      ),
  );
  assert.ok(
    floorWorker,
    "floor work should be observed from below before the stair exists",
  );
  assert.equal(
    floorWork.sites.some((site) => site.type === "stair"),
    false,
  );
  evidence.claims.floorBeforeStair = {
    actor: floorWorker.id,
    actorLevel: floorWorker.level,
    task: floorWorker.task.kind,
    stairSites: 0,
  };
  await screenshot("normal-floor-work-from-below");
  await resume();
  await speed4();
  await waitState(() =>
    window.__GOBLIN.state.sites
      .filter((site) => site.type === "floor")
      .every((site) => site.finishedAt !== null),
  );
  await pause();

  await setLevel(0);
  await parkHomeAwayFrom(perimeterSupportCells);
  const parked = await state();
  evidence.claims.supportAdmissionParking = {
    rowan: {
      x: parked.actors.rowan.x,
      z: parked.actors.rowan.z,
      drafted: parked.actors.rowan.drafted,
    },
    sedge: {
      x: parked.actors.sedge.x,
      z: parked.actors.sedge.z,
      drafted: parked.actors.sedge.drafted,
    },
    catPath: parked.cat.path,
    actorsReturnedToWork: true,
  };
  await placeBatch("wall", perimeterSupportCells);
  await resume();
  await speed4();
  await waitState((cells) => {
    const current = window.__GOBLIN.state;
    return cells.every((cell) =>
      current.sites.some(
        (site) =>
          site.type === "wall" &&
          site.x === cell.x &&
          site.z === cell.z &&
          site.finishedAt !== null,
      ),
    );
  }, perimeterSupportCells);
  await pause();

  await placeBatch("floor", perimeterFloorCells);
  await resume();
  await speed4();
  await waitState(() =>
    window.__GOBLIN.state.sites
      .filter((site) => site.type === "floor")
      .every((site) => site.finishedAt !== null),
  );
  await pause();

  const stair = await placeSingle("stair", stairCell);
  assert.deepEqual(
    [
      { x: stair.x, z: stair.z, level: 0 },
      { x: stair.x, z: stair.z + 1, level: 0 },
      { x: stair.x, z: stair.z + 2, level: 0 },
    ],
    [stairCell, stairMiddle, { x: 8, z: 4, level: 0 }],
  );
  evidence.claims.stairFootprint = {
    id: stair.id,
    lower: stairCell,
    middle: stairMiddle,
    upper: stairLanding,
    direction: stair.direction,
    cells: [stairCell, stairMiddle, { x: 8, z: 4, level: 0 }],
  };
  await resume();
  await waitState(
    (stairId) =>
      window.__GOBLIN.state.sites.find((site) => site.id === stairId)
        ?.finishedAt !== null,
    stair.id,
  );
  await pause();

  await setLevel(1);
  await placeBatch("wall", upperWalls);
  const door = await placeSingle("door", upperDoor);
  const enclosureIds = [
    ...(await state()).sites
      .filter(
        (site) =>
          site.level === 1 &&
          site.type === "wall" &&
          upperWalls.some((cell) => cell.x === site.x && cell.z === site.z),
      )
      .map((site) => site.id),
    door.id,
  ];
  await resume();
  await speed4();
  await waitState(
    (siteIds) =>
      window.__GOBLIN.state.sites
        .filter((site) => siteIds.includes(site.id))
        .every((site) => site.finishedAt !== null),
    enclosureIds,
    90_000,
  );
  await pause();
  await placeBatch("roof", roofCells);
  await chooseTool("bed");
  await page.locator("#rotate").click();
  await waitState(() => window.__GOBLIN.selection.direction === 1);
  const bedBefore = (await state()).sites.length;
  await clickCell(bedCell);
  await waitState(
    (expected) => window.__GOBLIN.state.sites.length > expected,
    bedBefore,
  );
  const bed = siteAt(await state(), "bed", bedCell, 1);
  assert.ok(bed);
  assert.equal(bed.direction, 1);
  assert.equal(bed.level, 1);
  await page.locator("#task").click();
  await waitState(() => window.__GOBLIN.selection.tool === null);
  await speed1();
  await resume();
  await waitState(() => {
    const current = window.__GOBLIN.state;
    return Object.values(current.actors).some(
      (actor) =>
        actor.cargo &&
        actor.task?.kind === "deliver" &&
        (actor.level === 1 || actor.path.some((cell) => cell.level === 1)),
    );
  });
  await pause();
  const traversal = await state();
  const traversingActor = Object.values(traversal.actors).find(
    (actor) =>
      actor.cargo &&
      actor.task?.kind === "deliver" &&
      (actor.level === 1 || actor.path.some((cell) => cell.level === 1)),
  );
  assert.ok(
    traversingActor,
    "one home member should carry wood through the sole stair for upstairs work",
  );
  evidence.claims.soleStairTraversalCarry = {
    actor: traversingActor.id,
    actorLevel: traversingActor.level,
    pathLevels: traversingActor.path.map((cell) => cell.level),
    cargo: traversingActor.cargo,
  };
  await screenshot("normal-upstairs-traversal-carry");
  await resume();
  await speed4();
  await waitState(
    (siteIds) =>
      window.__GOBLIN.state.sites
        .filter((site) => siteIds.includes(site.id))
        .every((site) => site.finishedAt !== null),
    (await state()).sites
      .filter(
        (site) =>
          ["wall", "door", "roof", "bed"].includes(site.type) &&
          site.level === 1,
      )
      .map((site) => site.id),
  );
  await pause();
  const finishedFixture = await state();
  const deliveredWood = finishedFixture.sites.reduce(
    (sum, site) => sum + site.delivered,
    0,
  );
  const remainingWood =
    finishedFixture.piles.reduce((sum, pile) => sum + pile.amount, 0) +
    Object.values(finishedFixture.actors).reduce(
      (sum, actor) => sum + (actor.cargo?.amount || 0),
      0,
    );
  assert.equal(deliveredWood, 40);
  assert.equal(remainingWood, 8);
  assert.equal(physicalWood(finishedFixture), 48);
  evidence.claims.fixtureWood = {
    earnedWood: 48,
    deliveredToFixture: deliveredWood,
    remainingWood,
    conservedWood: physicalWood(finishedFixture),
    exactUnitLaw:
      "unit tests own the 18-tick edge and conservation/corruption laws; browser records this 40-delivered/8-remaining fixture",
  };

  await setLevel(0);
  await clickCell({ x: bed.x, z: bed.z, level: 1 });
  await page.evaluate(() => new Promise(requestAnimationFrame));
  const groundPick = await selection();
  const groundPickedSite = finishedFixture.sites.find(
    (site) => site.id === groundPick.site,
  );
  assert.notEqual(groundPick.site, bed.id);
  if (groundPickedSite) assert.equal(groundPickedSite.level, 0);
  await setLevel(1);
  await clickCell({ x: supportCells[0].x, z: supportCells[0].z, level: 0 });
  await page.evaluate(() => new Promise(requestAnimationFrame));
  const upperPick = await selection();
  const lowerSiteIds = finishedFixture.sites
    .filter(
      (site) =>
        site.level === 0 &&
        site.x === supportCells[0].x &&
        site.z === supportCells[0].z,
    )
    .map((site) => site.id);
  const upperPickedSite = finishedFixture.sites.find(
    (site) => site.id === upperPick.site,
  );
  assert.equal(lowerSiteIds.includes(upperPick.site), false);
  if (upperPickedSite) assert.equal(upperPickedSite.level, 1);
  evidence.claims.levelScopedPicking = {
    groundCannotPickUpper: groundPick.site !== bed.id,
    groundSelectedSite: groundPick.site,
    groundSelectedLevel: groundPickedSite?.level ?? null,
    upperCannotPickLower: !lowerSiteIds.includes(upperPick.site),
    upperSelectedSite: upperPick.site,
    upperSelectedLevel: upperPickedSite?.level ?? null,
  };

  await setLevel(1);
  // Click the visible low mattress while the cutaway wall is non-interactive.
  await clickCell(bedCell, 0.25);
  await waitState((bedId) => window.__GOBLIN.selection.site === bedId, bed.id);
  assert.equal(await page.locator("#cutaway").isChecked(), true);
  await screenshot("normal-upper-bed-selected-cutaway");
  await page.locator("#cutaway").uncheck();
  await waitState(() => window.__GOBLIN.selection.cutaway === false);
  await screenshot("normal-upper-bed-selected-depth");
  await page.locator("#cutaway").check();

  await page.locator("#select-rowan").click();
  await waitState(() =>
    window.__GOBLIN.selection.selectedIds.includes("rowan"),
  );
  const restedBefore = (await state()).rested;
  const restButton = page.locator("#rest");
  assert.equal(await restButton.count(), 1);
  assert.equal(await restButton.isDisabled(), false);
  await restButton.click();
  await resume();
  await speed4();
  await waitState(
    () =>
      window.__GOBLIN.state.actors.rowan.level === 1 &&
      window.__GOBLIN.state.actors.rowan.mode === "sleep",
  );
  evidence.claims.upstairsSleep = {
    actor: "rowan",
    level: (await state()).actors.rowan.level,
    mode: (await state()).actors.rowan.mode,
    bed: bed.id,
  };
  await screenshot("normal-upstairs-sleep");
  await waitState(
    (expectedRested) => window.__GOBLIN.state.rested > expectedRested,
    restedBefore,
  );
  await pause();

  await setLevel(0);
  await clickCell(stairCell);
  await waitState(
    (stairId) => window.__GOBLIN.selection.site === stairId,
    stair.id,
  );
  const deconstruct = page.locator(`#deconstruct[data-site="${stair.id}"]`);
  assert.equal(await deconstruct.count(), 1);
  await deconstruct.click();
  await waitState(
    (stairId) =>
      window.__GOBLIN.state.jobs.some(
        (job) => job.kind === "deconstruct" && job.target === stairId,
      ),
    stair.id,
  );
  await resume();
  await waitState((stairId) => {
    const job = window.__GOBLIN.state.jobs.find(
      (candidate) =>
        candidate.kind === "deconstruct" && candidate.target === stairId,
    );
    return /upper structures|clear/i.test(job?.reason || "");
  }, stair.id);
  await pause();
  const blockedStair = (await state()).jobs.find(
    (job) => job.kind === "deconstruct" && job.target === stair.id,
  );
  assert.ok(blockedStair);
  assert.match(blockedStair.reason, /upper structures|clear/i);
  assert.equal(
    (await state()).sites.some((site) => site.id === stair.id),
    true,
  );
  evidence.claims.dependentStairRemovalWaits = {
    job: blockedStair.id,
    active: false,
    reason: blockedStair.reason,
    stairStillPresent: true,
    pathClosureCoveredByUnitLaw: true,
  };
  const revisionBeforeCancel = (await persistence()).revision ?? 0;
  await page.getByRole("button", { name: /^Orders/ }).click();
  await page
    .locator(`[data-job="${blockedStair.id}"] [data-action="cancel"]`)
    .click();
  await waitState(
    (jobId) => !window.__GOBLIN.state.jobs.some((job) => job.id === jobId),
    blockedStair.id,
  );
  await waitState(
    (revision) =>
      window.__GOBLIN.persistence.phase === "saved" &&
      window.__GOBLIN.persistence.revision > revision,
    revisionBeforeCancel,
  );
  evidence.claims.dependentStairRemovalWaits.canceled = true;

  await pause();
  const paused = await state();
  await waitState(
    (tick) =>
      window.__GOBLIN.persistence.phase === "saved" &&
      window.__GOBLIN.persistence.tick === tick &&
      window.__GOBLIN.state.paused,
    paused.tick,
  );
  const pausedDurable = durableState(paused);
  const pausedSave = await persistence();
  assert.equal(pausedSave.slot, "valid");
  assert.equal(pausedSave.paused, true);
  evidence.claims.pausedSave = {
    tick: paused.tick,
    revision: pausedSave.revision,
    schemaFacts: {
      upperLevel: true,
      stair: true,
      floor: true,
      commandsOmitted: true,
    },
  };
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__GOBLIN?.artReady, null, {
    timeout: 45_000,
  });
  await page.waitForSelector("#stage canvas");
  const restored = await state();
  assert.equal(restored.paused, true);
  assert.deepEqual(
    durableState(restored),
    pausedDurable,
    "v6 paused upper-bedroom facts must restore exactly",
  );
  assert.deepEqual(
    restored.commands,
    [],
    "reload intentionally restores no command history",
  );
  assert.ok(
    restored.sites.some((site) => site.type === "stair" && site.level === 0),
  );
  assert.ok(
    restored.sites.some((site) => site.type === "floor" && site.level === 1),
  );
  assert.ok(
    restored.sites.some((site) => site.type === "bed" && site.level === 1),
  );
  evidence.claims.reloadExactPaused = {
    tick: restored.tick,
    paused: restored.paused,
    commands: restored.commands,
    upperSites: restored.sites.filter((site) => site.level === 1).length,
    revision: (await persistence()).revision,
  };
  await page.getByRole("button", { name: "Close Menu", exact: true }).click();
  await setLevel(1);
  await screenshot("normal-reloaded-paused-upper-bedroom");

  await page.setViewportSize({ width: 390, height: 844 });
  await waitState(() => innerWidth === 390);
  const narrow = await page.evaluate(() => {
    const rect = (selector) => {
      const node = document.querySelector(selector);
      if (!node) return null;
      const box = node.getBoundingClientRect();
      return {
        left: box.left,
        right: box.right,
        top: box.top,
        bottom: box.bottom,
        width: box.width,
        height: box.height,
      };
    };
    return {
      viewport: innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      commandBar: rect(".command-bar"),
      story: rect(".story"),
      roster: [...document.querySelectorAll(".roster button")].map((node) => {
        const box = node.getBoundingClientRect();
        return {
          left: box.left,
          right: box.right,
          top: box.top,
          bottom: box.bottom,
        };
      }),
      levels: rect(".level-controls"),
      cutaway: rect(".cutaway-control"),
    };
  });
  assert.equal(narrow.viewport, 390);
  assert.ok(narrow.scrollWidth <= 390);
  assert.ok(
    narrow.commandBar &&
      narrow.commandBar.right <= 390 &&
      narrow.commandBar.left >= 0,
  );
  assert.ok(narrow.levels && narrow.levels.right <= 390);
  assert.ok(narrow.cutaway && narrow.cutaway.right <= 390);
  assert.ok(narrow.roster.every((box) => box.left >= 0 && box.right <= 390));
  evidence.claims.narrow390 = narrow;
  await screenshot("narrow-upper-bedroom-controls");

  assert.deepEqual(evidence.errors, { page: [], console: [], request: [] });
  evidence.success = true;
} catch (error) {
  evidence.success = false;
  evidence.failure = String(error.stack || error);
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
