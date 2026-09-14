#!/usr/bin/env node
/*
 * Bounded human-facing Clearing proof.
 *
 * This driver deliberately does not start Vite, Wrangler, a browser server, or
 * a build. The caller supplies the already-built Clearing URL; the compiled
 * client supplies its existing local public-engine-host origin. It uses only
 * the public controls and records the join/command HTTP receipts.
 */
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { project } from "../../engine/src/client/geometry.js";
import { resolveWorldArtPlacement } from "../../engine/src/client/art-placement.js";

const frontendArgument = process.argv[2];
const outputArgument = process.argv[3] ?? ".botanical/playable-browser-proof";
assert(frontendArgument, "usage: node tools/public-engine-host/playable-browser-proof.mjs <built-clearing-url> [output]");
const frontend = new URL(frontendArgument);
const output = resolve(outputArgument);
const root = resolve(new URL("../..", import.meta.url).pathname);
const invite = randomBytes(32).toString("hex");
const worldUrl = new URL(frontend);
worldUrl.searchParams.set("game", "colony");
worldUrl.hash = `world=${invite}`;

const sourceInventory = [
  "tools/public-engine-host/playable-browser-proof.mjs",
  "engine/src/client/client.js",
  "engine/src/client/action-bar.js",
  "engine/src/client/controls.js",
  "engine/src/client/build-placement.js",
  "engine/src/client/art-placement.js",
  "engine/src/client/whistle-command.js",
  "engine/src/games/colony.ts",
  "engine/src/games/colony-building.ts",
  "engine/src/games/colony-party.ts",
  "engine/src/runtime/remote-client.ts",
  "public/generated-art/goblin-static-art-v4/manifest.json",
  "tools/public-engine-host/worker.ts",
  "tools/public-engine-host/protocol.ts",
].sort();

const evidence = {
  proof: "clearing-playable-browser",
  frontend: worldUrl.toString().replace(invite, "[invite]"),
  output,
  sourceInventory: [],
  limits: [
    "One fresh browser context and one fresh invited world.",
    "Public UI controls and HTTP receipts only; no page command injection or save mutation.",
    "The driver does not start, build, deploy, or repair the frontend/backend.",
    "Placement uses the visible-world gesture owner; if the built artifact cannot expose a target, the evidence records that limit.",
  ],
  assertions: [],
  screenshots: [],
  join: null,
  commands: [],
  commandResponses: [],
  errors: [],
  success: false,
};

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const redact = (value) => String(value).replaceAll(invite, "[invite]");
const record = (name, detail = {}) => evidence.assertions.push({ name, ...detail });
const waitForVisible = async (page, name) => {
  const button = page.getByRole("button", { name, exact: true });
  await button.waitFor({ state: "visible", timeout: 20_000 });
  return button;
};
const canvasBox = async (page) => {
  const box = await page.locator("canvas").first().boundingBox();
  assert(box, "Pixi canvas is not visible");
  return box;
};
const projectedCell = (cell, verticalMetres, box) => {
  const zoom = box.width >= 600 ? 2 : 1;
  const cameraX = (box.width - 640 * zoom) / 2;
  const cameraY = (box.height - 400 * zoom) / 2;
  const point = project(cell[0], (cell[1] + 0.5) * verticalMetres, cell[2]);
  return { x: box.x + point.x * zoom + cameraX, y: box.y + point.y * zoom + cameraY };
};
const projectedWorld = (position, box, zoomY = 0) => {
  const zoom = box.width >= 600 ? 2 : 1;
  const cameraX = (box.width - 640 * zoom) / 2;
  const cameraY = (box.height - 400 * zoom) / 2;
  const point = project(position.x, position.y + zoomY, position.z);
  return { x: box.x + point.x * zoom + cameraX, y: box.y + point.y * zoom + cameraY };
};
const screenshot = async (page, name) => {
  await page.screenshot({ path: resolve(output, name), fullPage: true });
  evidence.screenshots.push(name);
};
const waitForReady = async (page) => {
  await page.getByText(/Online · server saved|Online · server saved/i).waitFor({ state: "visible", timeout: 45_000 });
  await page.getByRole("button", { name: "Select Rowan", exact: true }).waitFor({ state: "visible", timeout: 20_000 });
};
const resizeAndResetCamera = async (page) => {
  const viewport = await page.viewportSize();
  assert(viewport, "browser viewport is unavailable");
  const before = await canvasBox(page);
  await page.setViewportSize({ width: viewport.width + 1, height: viewport.height });
  await page.waitForTimeout(350);
  const box = await canvasBox(page);
  assert(box.width > 0 && box.height > 0, "ordinary resize left the clearing canvas without a layout");
  assert(
    box.width !== before.width || box.height !== before.height || box.x !== before.x || box.y !== before.y,
    "ordinary resize did not reach the clearing app layout",
  );
  return box;
};
const commandName = (body) => body?.command?.kind === "command" ? body.command.name : body?.command?.kind;

await mkdir(output, { recursive: true });
for (const relative of sourceInventory) {
  const bytes = await readFile(resolve(root, relative));
  evidence.sourceInventory.push({ path: relative, sha256: sha256(bytes) });
}
await writeFile(resolve(output, "source-inventory.json"), JSON.stringify(evidence.sourceInventory, null, 2));

let browser;
let context;
try {
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_PATH,
    args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
  });
  context = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);
  let latestObservation;
  let latestTerrain;
  const commandResponseById = new Map();
  page.on("pageerror", error => evidence.errors.push(`pageerror: ${error.message}`));
  page.on("console", message => { if (message.type() === "error") evidence.errors.push(`console: ${message.text()}`); });
  page.on("requestfailed", request => evidence.errors.push(`request: ${request.url()} · ${request.failure()?.errorText ?? "failed"}`));
  page.on("websocket", socket => {
    socket.on("framereceived", payload => {
      try {
        const value = JSON.parse(String(payload));
        if (value?.type === "observation" && value.observation) {
          if (value.observation.terrain) latestTerrain = value.observation.terrain;
          latestObservation = { ...value, observation: { ...value.observation, terrain: latestTerrain } };
        }
      } catch {
        evidence.errors.push("observation frame was not JSON");
      }
    });
  });
  page.on("response", async response => {
    if (!response.url().includes("/v2/colony/worlds/")) return;
    if (response.url().endsWith("/command")) {
      try {
        const body = JSON.parse(response.request().postData() ?? "{}");
        const value = await response.json();
        commandResponseById.set(body.id, { status: response.status(), value });
        const command = evidence.commands.find(item => item.id === body.id);
        if (command) command.response = { status: response.status(), value };
        evidence.commandResponses.push({ id: body.id, name: commandName(body), status: response.status(), value });
      } catch (error) {
        evidence.errors.push(`command response unreadable: ${error instanceof Error ? error.message : String(error)}`);
      }
      return;
    }
    if (!response.url().endsWith("/join")) return;
    try {
      const value = await response.json();
      evidence.join = { status: response.status(), player: value.player, party: value.party, people: value.people };
    } catch (error) {
      evidence.errors.push(`join response unreadable: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
  page.on("request", request => {
    if (!request.url().includes("/v2/colony/worlds/") || !request.url().endsWith("/command")) return;
    try {
      const body = JSON.parse(request.postData() ?? "{}");
      evidence.commands.push({ name: commandName(body), id: body.id, command: body.command });
    } catch (error) {
      evidence.errors.push(`command body unreadable: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  const response = await page.goto(worldUrl.toString(), { waitUntil: "domcontentloaded" });
  assert.equal(response?.status(), 200, `Clearing frontend returned ${response?.status()}`);
  await waitForReady(page);
  const resetCanvas = await resizeAndResetCamera(page);
  await page.waitForFunction(() => true, null, { timeout: 100 });
  await page.waitForTimeout(300);
  assert(latestObservation?.observation?.terrain?.surfaces?.length, "authoritative terrain observation was not received");
  assert(evidence.join?.status === 200, "fresh world join receipt was not observed");
  assert.equal(evidence.join.people.length, 2, "fresh party must contain two people");
  assert.equal(new Set(evidence.join.people).size, 2, "party people must be unique");
  record("fresh world joins one party with two people", { party: evidence.join.party, people: evidence.join.people });
  record("camera reset follows an ordinary viewport resize", { canvas: { width: resetCanvas.width, height: resetCanvas.height } });
  await screenshot(page, "desktop-01-joined.png");

  const commandCount = () => evidence.commands.length;
  const waitCommandResponse = async (from, label) => {
    const deadline = Date.now() + 10_000;
    let command;
    let commandIndex = from;
    while (Date.now() < deadline && !command) {
      command = evidence.commands[commandIndex];
      if (!command) await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert(command, `${label} did not emit a command request`);
    while (Date.now() < deadline && !commandResponseById.has(command.id)) await new Promise(resolve => setTimeout(resolve, 50));
    const response = commandResponseById.get(command.id);
    assert(response, `${label} did not receive a command response`);
    return { command, response };
  };
  const waitCommandAccepted = async (from, label) => {
    const { command, response } = await waitCommandResponse(from, label);
    assert.equal(response.status, 200, `${label} HTTP admission failed: ${JSON.stringify(response.value)}`);
    assert.equal(response.value?.status, "applied", `${label} was rejected: ${JSON.stringify(response.value)}`);
    return command;
  };
  const cellKey = (cell) => cell.join(",");
  const occupiedWorldCells = () => {
    const facts = latestObservation?.observation?.facts ?? [];
    const occupied = new Set(facts.flatMap(fact => fact.pose?.position
      ? [`${Math.round(fact.pose.position.x)},${Math.round(fact.pose.position.z)}`]
      : []));
    for (const surface of latestObservation?.observation?.terrain?.structureSurfaces ?? [])
      occupied.add(`${surface.cell[0]},${surface.cell[2]}`);
    return occupied;
  };
  const canvas = resetCanvas;
  const selectionCanvas = await canvasBox(page);
  const actionDock = await page.locator(".hive-action-dock").boundingBox();
  const surfaceMargin = 40;
  const selectionBounds = {
    left: selectionCanvas.x + surfaceMargin,
    right: selectionCanvas.x + selectionCanvas.width - surfaceMargin,
    top: selectionCanvas.y + surfaceMargin,
    bottom: Math.min(
      selectionCanvas.y + selectionCanvas.height - surfaceMargin,
      actionDock ? actionDock.y - surfaceMargin : selectionCanvas.y + selectionCanvas.height - surfaceMargin,
    ),
  };
  const projectedSurfaceVisible = (surface) => {
    const point = projectedCell(surface.cell, latestObservation.observation.terrain.verticalMetres, selectionCanvas);
    return point.x >= selectionBounds.left && point.x <= selectionBounds.right &&
      point.y >= selectionBounds.top && point.y <= selectionBounds.bottom;
  };
  const reservedSurfaceCells = new Set();
  const freeSurface = ({ level, adjacentTo } = {}) => {
    const terrain = latestObservation?.observation?.terrain;
    const occupied = occupiedWorldCells();
    const candidate = terrain?.surfaces?.find(surface => {
      const cell = surface.cell;
      if (surface.material !== 1 || reservedSurfaceCells.has(cellKey(cell))) return false;
      if (level !== undefined && cell[1] !== level) return false;
      if (occupied.has(`${cell[0]},${cell[2]}`)) return false;
      if (!projectedSurfaceVisible(surface)) return false;
      if (adjacentTo && Math.abs(cell[0] - adjacentTo[0]) + Math.abs(cell[2] - adjacentTo[2]) !== 1) return false;
      return true;
    });
    assert(candidate, `no unoccupied material-1 terrain surface${level === undefined ? "" : ` at level ${level}`}`);
    reservedSurfaceCells.add(cellKey(candidate.cell));
    return candidate;
  };
  await (await waitForVisible(page, "Select Rowan")).click();
  await page.getByText("Rowan", { exact: true }).waitFor({ state: "visible" });
  const afterSelection = commandCount();
  await page.waitForTimeout(200);
  assert.equal(commandCount(), afterSelection, "selecting a person issued a world command");
  record("selection has no side effect", { commandsAfterSelection: afterSelection });

  const beforeDraft = commandCount();
  const noDraftTarget = freeSurface();
  const noDraftPoint = projectedCell(noDraftTarget.cell, latestObservation.observation.terrain.verticalMetres, canvas);
  await page.mouse.click(noDraftPoint.x, noDraftPoint.y, { button: "right" });
  const preDraftResult = await waitCommandResponse(beforeDraft, "pre-Draft Go");
  const rejectedBeforeDraft = preDraftResult.command;
  assert(preDraftResult.response.status >= 400 || preDraftResult.response.value?.status === "rejected",
    `pre-Draft Go unexpectedly admitted: ${JSON.stringify(preDraftResult.response.value)}`);
  assert(rejectedBeforeDraft, "right-click before Draft did not submit the Go intent");
  await page.getByText(/go requires drafted workers|Order rejected/i).waitFor({ state: "visible", timeout: 10_000 });
  record("Go is rejected before Draft", { command: rejectedBeforeDraft.name });

  const beforeDraftCommand = commandCount();
  await (await waitForVisible(page, "Draft")).click();
  assert.equal((await waitCommandAccepted(beforeDraftCommand, "Draft")).name, "draft");
  await waitForVisible(page, "Undraft");
  record("Draft appears in the persistent action dock");
  await screenshot(page, "desktop-02-drafted.png");
  const beforeGo = commandCount();
  const goTarget = freeSurface({ level: noDraftTarget.cell[1], adjacentTo: noDraftTarget.cell });
  const goPoint = projectedCell(goTarget.cell, latestObservation.observation.terrain.verticalMetres, canvas);
  await page.mouse.click(goPoint.x, goPoint.y, { button: "right" });
  const draftedGo = await waitCommandAccepted(beforeGo, "Drafted Go");
  assert.equal(draftedGo.name, "go", "Drafted right-click did not submit Go");
  record("Go submits after Draft");

  await (await waitForVisible(page, "Orders / Work")).click();
  await (await waitForVisible(page, "Dig area")).click();
  const digSurface = freeSurface();
  const digNeighbor = freeSurface({ level: digSurface.cell[1], adjacentTo: digSurface.cell });
  const digStart = projectedCell(digSurface.cell, latestObservation.observation.terrain.verticalMetres, canvas);
  const digEnd = projectedCell(digNeighbor.cell, latestObservation.observation.terrain.verticalMetres, canvas);
  const beforeDig = commandCount();
  await page.mouse.move(digStart.x, digStart.y);
  await page.mouse.down();
  await page.mouse.move(digEnd.x, digEnd.y, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(1_000);
  const digCommand = await waitCommandAccepted(beforeDig, "Dig area");
  assert.equal(digCommand.name, "dig", "dragging Dig area submitted the wrong command");
  record("dragging Dig area submits one area order", { digCommands: evidence.commands.filter(command => command.name === "dig").length });
  const beforeUndraftCommand = commandCount();
  await (await waitForVisible(page, "Undraft")).click();
  assert.equal((await waitCommandAccepted(beforeUndraftCommand, "Undraft")).name, "undraft");
  await waitForVisible(page, "Draft");
  await page.waitForTimeout(1_000);
  const workStateText = await page.locator("body").innerText();
  assert(/blocked|waiting|queued|working/i.test(workStateText), "dig did not expose a blocked/waiting/queued/working state");
  record("work state is observable after Undraft without locking the selected worker", {
    stateExcerpt: workStateText.match(/[^\n]*(?:blocked|waiting|queued|working)[^\n]*/i)?.[0] ?? "matched state text",
  });
  await screenshot(page, "desktop-03-dig-area.png");

  const buildCommandsBefore = () => evidence.commands.filter(command => command.name === "build");
  const waitForObservation = async (predicate, label, timeout = 20_000) => {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      if (predicate(latestObservation)) return latestObservation;
      await new Promise(resolve => setTimeout(resolve, 150));
    }
    throw new Error(`timed out waiting for ${label}`);
  };
  const structureFact = (fragment, supportCell) => latestObservation?.observation?.facts?.find(fact =>
    typeof fact.visual === "string" && fact.visual.includes(fragment) &&
    (!supportCell || (fact.pose?.position && Math.round(fact.pose.position.x) === supportCell[0] && Math.round(fact.pose.position.z) === supportCell[2])));
  const artManifestResponse = await page.request.get(new URL("/engine/generated-art/goblin-static-art-v4/manifest.json", frontend).toString());
  assert.equal(artManifestResponse.status(), 200, "the public static-art manifest is unavailable");
  const artManifest = await artManifestResponse.json();
  const visualPathPrefix = (visual) => {
    if (visual.startsWith("colony.bed.")) return ["buildings", "bed", visual.split(".")[2]];
    if (visual.startsWith("colony.brew-station.profile.")) {
      return ["buildings", "brew-station", "profiles", visual.split(".")[3]];
    }
    return null;
  };
  const manifestEntryForVisual = (visual) => {
    const prefix = visualPathPrefix(visual);
    if (!prefix) return null;
    return artManifest.entries.find(entry => prefix.every((part, index) => entry.path[index] === part));
  };
  const visibleManifestPixel = (entry) => {
    const rows = entry.silhouette.rows;
    const spans = entry.silhouette.spans;
    let best = null;
    for (let y = Math.floor(entry.height * 0.45); y < entry.height; y++) {
      const start = rows[y] * 2;
      const end = rows[y + 1] * 2;
      for (let index = start; index < end; index += 2) {
        const candidate = { x: Math.floor((spans[index] + spans[index + 1]) / 2), y, width: spans[index + 1] - spans[index] + 1 };
        if (!best || candidate.width > best.width) best = candidate;
      }
    }
    assert(best, "static-art manifest has no opaque placement pixel");
    return best;
  };
  const structurePoint = async (fragment, supportCell) => {
    await waitForObservation(() => structureFact(fragment, supportCell), `${fragment} visual at ${supportCell?.join(",") ?? "known support"}`);
    const fact = structureFact(fragment, supportCell);
    assert(fact?.pose?.position, `${fragment} has no authoritative pose`);
    assert(fact.placement, `${fragment} has no authoritative placement datum`);
    const entry = manifestEntryForVisual(fact.visual);
    assert(entry?.placement && entry.visualBounds && entry.silhouette, `${fragment} has no matching public art metadata`);
    const resolved = resolveWorldArtPlacement({
      subjectPlacement: fact.placement,
      artPlacement: entry.placement,
      orientation: fact.placement.orientation,
      decodedDepth: { visualBounds: entry.visualBounds },
    });
    const box = await canvasBox(page);
    const zoom = box.width >= 600 ? 2 : 1;
    const base = projectedWorld(fact.pose.position, box);
    const shifted = projectedWorld({
      x: fact.pose.position.x + resolved.offset[0],
      y: fact.pose.position.y,
      z: fact.pose.position.z + resolved.offset[1],
    }, box);
    const pixel = visibleManifestPixel(entry);
    const anchor = artManifest.anchors.prop;
    return {
      fact,
      point: {
        x: shifted.x + (pixel.x - anchor.x * entry.width) * zoom,
        y: shifted.y + (pixel.y - anchor.y * entry.height) * zoom,
      },
      art: { path: entry.path, pixel, offset: resolved.offset, base, shifted },
    };
  };
  async function buildPoint(label, targetCell, expectedName = "build") {
    await (await waitForVisible(page, "Build")).click();
    await (await waitForVisible(page, label)).click();
    const frame = latestObservation.observation.terrain;
    const point = projectedCell(targetCell, frame.verticalMetres, await canvasBox(page));
    const before = commandCount();
    await page.mouse.click(point.x, point.y);
    const submitted = await waitCommandAccepted(before, label);
    assert.equal(submitted.name, expectedName, `${label} submitted ${submitted.name}`);
    return submitted;
  }
  async function buildLine(label, startCell, endCell) {
    await (await waitForVisible(page, "Build")).click();
    await (await waitForVisible(page, label)).click();
    const frame = latestObservation.observation.terrain;
    const box = await canvasBox(page);
    const start = projectedCell(startCell, frame.verticalMetres, box);
    const end = projectedCell(endCell, frame.verticalMetres, box);
    const before = commandCount();
    await page.keyboard.down("Alt");
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 4 });
    await page.mouse.up();
    await page.keyboard.up("Alt");
    const submitted = await waitCommandAccepted(before, label);
    assert.equal(submitted.name, "build", `${label} submitted ${submitted.name}`);
    return submitted;
  }
  const findClearRectangle = () => {
    const terrain = latestObservation?.observation?.terrain;
    const occupied = occupiedWorldCells();
    const surfaces = new Map((terrain?.surfaces ?? []).map(surface => [cellKey(surface.cell), surface]));
    const clear = (cell) => {
      const surface = surfaces.get(cellKey(cell));
      return surface?.material === 1 && !reservedSurfaceCells.has(cellKey(cell)) &&
        !occupied.has(`${cell[0]},${cell[2]}`) && projectedSurfaceVisible(surface);
    };
    for (const origin of terrain?.surfaces ?? []) {
      const [x, y, z] = origin.cell;
      const cells = Array.from({ length: 3 }, (_, dx) => [x + dx, y, z]).concat(
        Array.from({ length: 3 }, (_, dx) => [x + dx, y, z + 1]),
      );
      if (cells.every(clear)) return { cells, brewer: [x, y, z], bed: [x + 2, y, z] };
    }
    return null;
  };
  const rectangle = findClearRectangle();
  assert(rectangle, "no clear same-level 3x2 terrain rectangle is available for north fixtures");
  for (const cell of rectangle.cells) reservedSurfaceCells.add(cellKey(cell));
  const floorBuilds = [];
  for (const cell of rectangle.cells) floorBuilds.push(await buildPoint("Build floor", cell));
  await waitForObservation(() => rectangle.cells.every(cell => structureFact("colony.floor.finished", cell)), "six finished floor supports", 30_000);
  const originalFloorId = structureFact("colony.floor", rectangle.cells[0])?.id;
  assert(originalFloorId, "finished floor has no stable render identity");
  const brewerBuild = await buildPoint("Build brew-station", rectangle.brewer);
  const bedBuild = await buildPoint("Build bed", rectangle.bed);
  assert.equal(brewerBuild.command.input.orientation, "north", "brewer must use the north footprint");
  assert.equal(bedBuild.command.input.orientation, "north", "bed must use the north footprint");
  await waitForObservation(() => structureFact("colony.bed.finished", rectangle.bed) && structureFact("colony.brew-station.profile", rectangle.brewer), "finished bed and brewer", 30_000);
  const wallSupport = freeSurface();
  const wallEndSupport = freeSurface({ level: wallSupport.cell[1], adjacentTo: wallSupport.cell });
  const wallBuild = await buildLine("Build wall", wallSupport.cell, wallEndSupport.cell);
  assert.deepEqual(bedBuild.command.input.target.cell, rectangle.bed,
    "bed placement did not retain the authoritative 1x2 floor support origin");
  assert.deepEqual(brewerBuild.command.input.target.cell, rectangle.brewer,
    "brewer placement did not retain the authoritative 2x2 floor support origin");
  assert(wallBuild.command.input.target.area || wallBuild.command.input.target.cell, "wall line did not produce a placement target");
  record("wall/floor/furniture placement uses the shared visible-surface tool", { builds: buildCommandsBefore().length });
  await screenshot(page, "desktop-04-structures.png");

  // A second floor gesture over the occupied support is the replacement path.
  const bedSurface = await structurePoint("colony.bed", rectangle.bed);
  const brewerSurface = await structurePoint("colony.brew-station", rectangle.brewer);
  const replacementBefore = commandCount();
  await (await waitForVisible(page, "Build")).click();
  await (await waitForVisible(page, "Build floor")).click();
  await page.mouse.click(bedSurface.point.x, bedSurface.point.y);
  const replacement = await waitCommandAccepted(replacementBefore, "bed floor replacement");
  assert.equal(replacement.name, "build");
  assert.equal(replacement.command.input.target.source, "structure", "bed floor gesture did not hit a structure surface");
  assert.deepEqual(replacement.command.input.target.cell, rectangle.bed,
    "bed floor replacement did not preserve its support cell");
  await waitForObservation(observation => observation.observation.facts?.some(fact => fact.id === originalFloorId), "floor identity after bed replacement");
  const brewerReplacementBefore = commandCount();
  await (await waitForVisible(page, "Build")).click();
  await (await waitForVisible(page, "Build floor")).click();
  await page.mouse.click(brewerSurface.point.x, brewerSurface.point.y);
  const brewerReplacement = await waitCommandAccepted(brewerReplacementBefore, "brewer floor replacement");
  assert.equal(brewerReplacement.name, "build");
  assert.equal(brewerReplacement.command.input.target.source, "structure", "brewer floor gesture did not hit a structure surface");
  assert.deepEqual(brewerReplacement.command.input.target.cell, rectangle.brewer,
    "brewer floor replacement did not preserve its support cell");
  record("floor replacement is attempted through the same Build floor command", {
    replacementAccepted: true,
    floorIdentity: originalFloorId,
    bedReplacementTarget: replacement.command.input.target.cell,
    brewerReplacementTarget: brewerReplacement.command.input.target.cell,
    bedArtHit: bedSurface.art,
    brewerArtHit: brewerSurface.art,
    limit: "The bounded browser proof observes command admission and identity; native completion remains covered by the joined construction laws.",
  });
  await buildPoint("Stair north", freeSurface().cell);
  await waitForVisible(page, "Higher voxel layer");
  await (await waitForVisible(page, "Higher voxel layer")).click();
  await page.getByText(/Voxel layer 1/).waitFor({ state: "visible", timeout: 10_000 });
  await (await waitForVisible(page, "Lower voxel layer")).click();
  record("stair and level picking controls are reachable", { stair: true, levelUpDown: true });
  await screenshot(page, "desktop-05-stair-level.png");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  assert((await page.locator("body").boundingBox())?.width <= 390, "390px viewport did not render");
  await screenshot(page, "mobile-390.png");
  record("same build captured at 390px", { viewport: [390, 844] });
  evidence.success = evidence.errors.length === 0;
} catch (error) {
  evidence.failure = redact(error?.stack ?? error);
  evidence.success = false;
  if (context) {
    await context.pages()[0]?.screenshot({ path: resolve(output, "failure.png"), fullPage: true }).catch(() => {});
    evidence.screenshots.push("failure.png");
  }
  throw error;
} finally {
  await writeFile(resolve(output, "REPORT.json"), JSON.stringify(evidence, null, 2));
  await context?.close();
  await browser?.close();
}

console.log(JSON.stringify({ status: evidence.success ? "passed" : "failed", output: outputArgument, screenshots: evidence.screenshots }));
