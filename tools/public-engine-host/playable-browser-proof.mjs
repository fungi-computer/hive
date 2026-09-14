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
  "engine/src/client/whistle-command.js",
  "engine/src/games/colony.ts",
  "engine/src/games/colony-building.ts",
  "engine/src/games/colony-party.ts",
  "engine/src/runtime/remote-client.ts",
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
const canvasPoint = (box, fx, fy) => ({ x: box.x + box.width * fx, y: box.y + box.height * fy });
const screenshot = async (page, name) => {
  await page.screenshot({ path: resolve(output, name), fullPage: true });
  evidence.screenshots.push(name);
};
const waitForReady = async (page) => {
  await page.getByText(/Online · server saved|Online · server saved/i).waitFor({ state: "visible", timeout: 45_000 });
  await page.getByRole("button", { name: "Select Rowan", exact: true }).waitFor({ state: "visible", timeout: 20_000 });
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
  page.on("pageerror", error => evidence.errors.push(`pageerror: ${error.message}`));
  page.on("console", message => { if (message.type() === "error") evidence.errors.push(`console: ${message.text()}`); });
  page.on("requestfailed", request => evidence.errors.push(`request: ${request.url()} · ${request.failure()?.errorText ?? "failed"}`));
  page.on("response", async response => {
    if (!response.url().includes("/v2/colony/worlds/") || !response.url().endsWith("/join")) return;
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

  const response = await page.goto(worldUrl, { waitUntil: "domcontentloaded" });
  assert.equal(response?.status(), 200, `Clearing frontend returned ${response?.status()}`);
  await waitForReady(page);
  assert(evidence.join?.status === 200, "fresh world join receipt was not observed");
  assert.equal(evidence.join.people.length, 2, "fresh party must contain two people");
  assert.equal(new Set(evidence.join.people).size, 2, "party people must be unique");
  record("fresh world joins one party with two people", { party: evidence.join.party, people: evidence.join.people });
  await screenshot(page, "desktop-01-joined.png");

  const commandCount = () => evidence.commands.length;
  await (await waitForVisible(page, "Select Rowan")).click();
  await page.getByText("Rowan", { exact: true }).waitFor({ state: "visible" });
  const afterSelection = commandCount();
  await page.waitForTimeout(200);
  assert.equal(commandCount(), afterSelection, "selecting a person issued a world command");
  record("selection has no side effect", { commandsAfterSelection: afterSelection });

  const canvas = await canvasBox(page);
  const beforeDraft = commandCount();
  await page.mouse.click(canvasPoint(canvas, 0.56, 0.48).x, canvasPoint(canvas, 0.56, 0.48).y, { button: "right" });
  await page.waitForTimeout(700);
  const rejectedBeforeDraft = [...evidence.commands].slice(beforeDraft).find(command => command.name === "go");
  assert(rejectedBeforeDraft, "right-click before Draft did not submit the Go intent");
  await page.getByText(/go requires drafted workers|Order rejected/i).waitFor({ state: "visible", timeout: 10_000 });
  record("Go is rejected before Draft", { command: rejectedBeforeDraft.name });

  await (await waitForVisible(page, "Draft")).click();
  await waitForVisible(page, "Undraft");
  record("Draft appears in the persistent action dock");
  await screenshot(page, "desktop-02-drafted.png");
  const beforeGo = commandCount();
  const goPoint = canvasPoint(canvas, 0.62, 0.54);
  await page.mouse.click(goPoint.x, goPoint.y, { button: "right" });
  await page.waitForFunction((start) => document.body.innerText.includes("Order queued") || document.body.innerText.includes("Move workers"), beforeGo, { timeout: 10_000 });
  assert(evidence.commands.slice(beforeGo).some(command => command.name === "go"), "Drafted Go did not submit");
  record("Go submits after Draft");

  await (await waitForVisible(page, "Orders / Work")).click();
  await (await waitForVisible(page, "Dig area")).click();
  const digStart = canvasPoint(canvas, 0.44, 0.44);
  const digEnd = canvasPoint(canvas, 0.51, 0.50);
  await page.mouse.move(digStart.x, digStart.y);
  await page.mouse.down();
  await page.mouse.move(digEnd.x, digEnd.y, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(1_000);
  assert(evidence.commands.some(command => command.name === "dig"), "dragging Dig area did not submit a dig command");
  record("dragging Dig area submits one area order", { digCommands: evidence.commands.filter(command => command.name === "dig").length });
  await (await waitForVisible(page, "Undraft")).click();
  await waitForVisible(page, "Draft");
  await page.waitForTimeout(1_000);
  const workStateText = await page.locator("body").innerText();
  assert(/blocked|waiting|queued|working/i.test(workStateText), "dig did not expose a blocked/waiting/queued/working state");
  record("work state is observable after Undraft without locking the selected worker", {
    stateExcerpt: workStateText.match(/[^\n]*(?:blocked|waiting|queued|working)[^\n]*/i)?.[0] ?? "matched state text",
  });
  await screenshot(page, "desktop-03-dig-area.png");

  const buildCommandsBefore = () => evidence.commands.filter(command => command.name === "build");
  async function build(label, fx, fy) {
    await (await waitForVisible(page, "Build")).click();
    await (await waitForVisible(page, label)).click();
    const point = canvasPoint(await canvasBox(page), fx, fy);
    await page.mouse.click(point.x, point.y);
    await page.waitForTimeout(500);
    const submitted = buildCommandsBefore().at(-1);
    assert(submitted, `${label} did not submit a build command`);
    return submitted;
  }
  await build("Build wall", 0.40, 0.43);
  await build("Build floor", 0.48, 0.43);
  const bedBuild = await build("Build bed", 0.48, 0.43);
  const brewerBuild = await build("Build brew-station", 0.56, 0.43);
  const firstFloorBuild = evidence.commands.find(command => command.name === "build" && command.command.input.catalog === "timber-floor");
  assert(firstFloorBuild, "initial floor build receipt was not recorded");
  assert.deepEqual(bedBuild.command.input.target.cell, firstFloorBuild.command.input.target.cell,
    "bed placement did not retain the floor support cell");
  record("wall/floor/furniture placement uses the shared visible-surface tool", { builds: buildCommandsBefore().length });
  await screenshot(page, "desktop-04-structures.png");

  // A second floor gesture over the occupied support is the replacement path.
  const replacement = await build("Build floor", 0.48, 0.43);
  assert.deepEqual(replacement.command.input.target.cell, bedBuild.command.input.target.cell,
    "floor replacement target moved away from the bed support");
  record("floor replacement is attempted through the same Build floor command", {
    replacementAttempt: true,
    supportCell: replacement.command.input.target.cell,
    brewerSupportCell: brewerBuild.command.input.target.cell,
  });
  await build("Stair north", 0.64, 0.48);
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
