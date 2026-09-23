import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const root = resolve(process.cwd());
const studyPath = '/.botanical/research/environment-round3-20260908/worldgen/height-sea/world-lab.html';
const output = new URL('./browser-proof/', import.meta.url);
const evidence = {
  scope: 'isolated locally served World Lab height/sea candidate; no live deployment, game source, water stock, physics, or production renderer',
  checks: [], errors: [], screenshots: [],
  server: { kind: 'ephemeral Vite dev server', root, path: studyPath },
};
const sha256 = async (relative) => createHash('sha256').update(await readFile(new URL(relative, import.meta.url))).digest('hex');
const check = async (name, fn) => { await fn(); evidence.checks.push(name); };
let server;
let browser;
try {
  server = await createServer({
    root,
    logLevel: 'error',
    server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false },
  });
  await server.listen();
  const address = server.httpServer?.address();
  assert(address && typeof address !== 'string' && address.port > 0, 'ephemeral server did not bind a port');
  const url = `http://127.0.0.1:${address.port}${studyPath}`;
  evidence.server.url = url;

  browser = await chromium.launch({
    headless: true,
    executablePath: '/home/levi/.cache/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell',
    args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
    env: {
      ...process.env,
      LD_LIBRARY_PATH: '/home/levi/src/Botanical-next/.botanical/browser-libs/root/usr/lib/x86_64-linux-gnu',
    },
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.setDefaultTimeout(8_000);
  page.on('pageerror', (error) => evidence.errors.push(`page: ${error}`));
  page.on('console', (message) => {
    if (message.type() === 'error') evidence.errors.push(`console: ${message.text()}`);
  });
  page.on('requestfailed', (request) => evidence.errors.push(`request: ${request.url()} · ${request.failure()?.errorText || 'unknown'}`));

  await check('served copied page and worker load without runtime errors', async () => {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded' });
    assert.equal(response?.status(), 200);
    await page.waitForFunction(() => document.querySelector('#world-lab-request-status')?.textContent?.includes('showing request'));
    assert.match(await page.title(), /height\/sea candidate/);
  });

  await check('named wet/dry jump renders an exact cardinal boundary with height-derived water', async () => {
    const boundaryButton = page.getByRole('button', { name: /Northwater wet\/dry boundary/ });
    const [x, z] = (await boundaryButton.getAttribute('data-cell')).split(',').map(Number);
    await boundaryButton.click();
    await page.waitForFunction(([x, z]) => {
      const text = document.querySelector('[data-field=selection]')?.textContent;
      if (!text) return false;
      const value = JSON.parse(text);
      return value.focus?.x === x && value.focus?.z === z && value.localRenderCell?.matchesSampler;
    }, [x, z]);
    await page.waitForFunction(() => document.querySelector('#world-lab-request-status')?.textContent?.includes('showing request'));
    const selection = JSON.parse(await page.locator('[data-field=selection]').textContent());
    const contract = JSON.parse(await page.locator('[data-field=contract]').textContent());
    const selectedWet = selection.sharedLocalSampler.terrainLabel === 'surface-water';
    const dryOpposite = selection.sharedLocalSampler.wetDryNeighbours.filter((cell) => cell.wet !== selectedWet);
    assert.equal(selection.sharedLocalSampler.seaSurfaceLevel, 12);
    assert.equal(selection.sharedLocalSampler.wetDryBoundary, true);
    assert(dryOpposite.length > 0);
    assert(dryOpposite.every((cell) => cell.wet !== selectedWet));
    assert(dryOpposite.every((cell) => cell.wet ? cell.terrain === 'surface-water' && cell.bedLevel < 12 : cell.terrain !== 'surface-water' && cell.bedLevel >= 12));
    assert.equal(contract.heightSeaDefinition.seaSurfaceLevel, 12);
    evidence.boundary = { focus: selection.focus, exact: selection.sharedLocalSampler, opposite: dryOpposite, heightSeaDefinition: contract.heightSeaDefinition };
  });

  await check('overview, local render, and section report the shared bed-level contract', async () => {
    const [selection, section, claims] = await Promise.all([
      page.locator('[data-field=selection]').textContent().then(JSON.parse),
      page.locator('[data-field=section]').textContent().then(JSON.parse),
      page.locator('[data-field=claims]').textContent().then(JSON.parse),
    ]);
    assert.equal(selection.localRenderCell.matchesSampler, true);
    assert.equal(selection.localRenderCell.bedLevel, selection.sharedLocalSampler.bedLevel);
    assert.equal(section.focusBedLevel, selection.sharedLocalSampler.bedLevel);
    assert.equal(selection.overviewSampler.classificationScope, 'footprint-approximation');
    assert.equal(selection.overviewSampler.labelLimit, 'footprint approximation; inspect exact cell below');
    assert.match(claims.displayedOverview, /world cells over 512x512 pixels/);
    evidence.consistency = {
      localBedLevel: selection.localRenderCell.bedLevel,
      sectionBedLevel: section.focusBedLevel,
      exactScope: 'exact-cell',
      overviewScope: selection.overviewSampler.classificationScope,
      overviewLabel: selection.overviewSampler.terrainLabel,
    };
  });

  await page.screenshot({ path: fileURLToPath(new URL('./normal-wet-dry.png', output)), fullPage: true });
  evidence.screenshots.push('browser-proof/normal-wet-dry.png');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(100);
  await check('390px frame contains the copied candidate without document-width overflow', async () => {
    const dimensions = await page.evaluate(() => ({ viewport: window.innerWidth, documentWidth: document.documentElement.scrollWidth, controls: document.querySelector('.controls')?.getBoundingClientRect().width }));
    assert.equal(dimensions.viewport, 390);
    assert(dimensions.documentWidth <= dimensions.viewport, `document width ${dimensions.documentWidth} exceeds viewport ${dimensions.viewport}`);
    evidence.narrow = dimensions;
  });
  await page.screenshot({ path: fileURLToPath(new URL('./narrow-390-wet-dry.png', output)), fullPage: true });
  evidence.screenshots.push('browser-proof/narrow-390-wet-dry.png');
  await context.close();
  await browser.close(); browser = null;
} catch (error) {
  evidence.errors.push(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
  await server?.close().catch(() => {});
  evidence.hashes = {
    candidateTerrain: await sha256('./terrain.js'),
    callerMain: await sha256('./world-lab/main.js'),
    callerWorker: await sha256('./world-lab/worker.js'),
    callerSection: await sha256('./world-lab/section.js'),
    callerHtml: await sha256('./world-lab.html'),
    callerStyles: await sha256('./world-lab/styles.css'),
    browserProof: await sha256('./browser-proof.mjs'),
  };
  await writeFile(new URL('./browser-proof.json', import.meta.url), JSON.stringify(evidence, null, 2) + '\n');
}
console.log(JSON.stringify({ checks: evidence.checks.length, errors: evidence.errors.length, screenshots: evidence.screenshots, boundary: evidence.boundary, narrow: evidence.narrow }));
