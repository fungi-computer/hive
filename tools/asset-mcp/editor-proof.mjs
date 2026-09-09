import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, writeFile, mkdir, readdir, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, extname, relative } from "node:path";
import { chromium } from "playwright";
import { loadavg, availableParallelism, freemem } from "node:os";
import { interactionCase } from "./editor-interaction-case.mjs";

const flags = process.argv.slice(4);
assert(
  process.argv.length >= 4 &&
    flags.every((flag) => ["--interaction", "--compact"].includes(flag)),
  "Usage: node editor-proof.mjs <built directory> <new evidence directory> [--interaction] [--compact]",
);
const built = resolve(process.argv[2]),
  output = resolve(process.argv[3]);
await mkdir(output); // Preserve prior evidence; never silently replace a run.
const started = performance.now();
const cpuStarted = process.cpuUsage();
const hostSample = () => ({
  elapsedMs: performance.now() - started,
  loadAverage: loadavg(),
  availableCpu: availableParallelism(),
  freeMemoryBytes: freemem(),
  proofProcessCpuMicros: process.cpuUsage(cpuStarted),
});
const receipt = {
  scope:
    flags.includes("--compact") && !flags.includes("--interaction")
      ? "Shell-only chrome, viewport, fonts and enabled labels at desktop/390"
      : "Full-editor readiness and optional native interaction",
  errors: [],
  requests: [],
  screenshots: [],
  lifecycle: [],
  host: [hostSample()],
};
const mime = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ttf": "font/ttf",
  ".woff2": "font/woff2",
  ".wasm": "application/wasm",
};
const server = createServer(async (req, res) => {
  const pathname = new URL(req.url, "http://localhost").pathname;
  const file = resolve(
    built,
    `.${pathname === "/" ? "/index.html" : decodeURIComponent(pathname)}`,
  );
  if (!file.startsWith(`${built}/`)) {
    res.writeHead(400).end();
    return;
  }
  try {
    const bytes = await readFile(file);
    res
      .writeHead(200, {
        "Content-Type": mime[extname(file)] || "application/octet-stream",
      })
      .end(bytes);
  } catch {
    res.writeHead(404).end("Missing static resource");
  }
});
async function inspectTheme(page) {
  const result = await page.evaluate(() => {
    const context = document
      .createElement("canvas")
      .getContext("2d", { willReadFrequently: true });
    function rgba(color) {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      return [...context.getImageData(0, 0, 1, 1).data];
    }
    function composite(front, back) {
      const alpha = front[3] / 255;
      return front
        .slice(0, 3)
        .map((value, index) => value * alpha + back[index] * (1 - alpha));
    }
    function luminance(color) {
      const linear = color.map((value) => {
        const c = value / 255;
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
      return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
    }
    const buttons = [...document.querySelectorAll("header button")]
      .filter((button) => button.textContent !== "Save project")
      .map((button) => {
        const style = getComputedStyle(button),
          ancestors = [];
        for (let node = button; node; node = node.parentElement)
          ancestors.unshift(node);
        let background = [255, 255, 255];
        for (const ancestor of ancestors)
          background = composite(
            rgba(getComputedStyle(ancestor).backgroundColor),
            background,
          );
        const foreground = composite(rgba(style.color), background);
        const values = [luminance(background), luminance(foreground)].sort(
          (a, b) => a - b,
        );
        return {
          name: button.textContent,
          disabled: button.disabled,
          color: style.color,
          background,
          opacity: style.opacity,
          font: style.fontFamily,
          contrast: (values[1] + 0.05) / (values[0] + 0.05),
        };
      });
    return {
      width: innerWidth,
      theme: document.documentElement.dataset.theme,
      fontToken: getComputedStyle(document.documentElement).getPropertyValue(
        "--font-sans",
      ),
      shellBackground: getComputedStyle(document.querySelector(".studio"))
        .backgroundColor,
      buttons,
    };
  });
  assert.equal(result.theme, "latte");
  assert.equal(result.shellBackground, "rgb(239, 241, 245)");
  assert(result.fontToken.includes("Nunito"));
  assert.equal(result.buttons.length, 3);
  for (const button of result.buttons) {
    assert.equal(button.disabled, false);
    assert(
      button.contrast >= 4.5,
      `${button.name} enabled-label contrast ${button.contrast}`,
    );
    assert(button.font.includes("Nunito"));
  }
  return result;
}
async function inspectLayout(page) {
  const result = await page.evaluate(() => {
    const rect = (node) => {
      const { x, y, width, height, bottom, right } =
        node.getBoundingClientRect();
      return { x, y, width, height, bottom, right };
    };
    return {
      width: innerWidth,
      height: innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      scrollHeight: document.documentElement.scrollHeight,
      frame: rect(document.querySelector("iframe")),
      actions: [...document.querySelectorAll("header button")].map((node) => ({
        name: node.textContent,
        ...rect(node),
      })),
      footer: rect(document.querySelector("footer")),
    };
  });
  assert(
    result.scrollWidth <= result.width && result.scrollHeight <= result.height,
    "Outer page fits viewport",
  );
  assert(
    result.frame.height >= 300,
    "Editor retains available viewport height",
  );
  assert(result.footer.bottom <= result.height + 1);
  for (const action of result.actions) {
    assert.equal(action.height, 32, "Public Caps small button");
    assert(
      action.x >= 0 &&
        action.right <= result.width &&
        action.bottom <= result.height,
    );
  }
  return result;
}
async function installLifecycleProbe(page) {
  await page.exposeBinding("__hiveProofLifecycle", (_source, event) => {
    if (receipt.lifecycle.length < 128)
      receipt.lifecycle.push({
        ...event,
        receivedElapsedMs: performance.now() - started,
      });
  });
  await page.addInitScript(() => {
    let count = 0;
    const report = (kind, details = {}) => {
      if (count++ >= 64) return;
      void window
        .__hiveProofLifecycle({
          kind,
          path: location.pathname,
          browserEpochMs: performance.timeOrigin + performance.now(),
          ...details,
        })
        .catch(() => {});
    };
    report("script-installed");
    addEventListener("DOMContentLoaded", () => report("dom-content-loaded"), {
      once: true,
    });
    addEventListener("load", () => report("window-loaded"), { once: true });
    addEventListener("message", (event) => {
      const data = event.data;
      if (
        event.origin !== location.origin ||
        data?.channel !== "hive-full-editor-v1"
      )
        return;
      // Observe only lifecycle metadata, never transferred project/asset bytes.
      report("editor-message", {
        event: data.event,
        operation: data.operation,
        ok: data.ok,
        bytes:
          data.bytes instanceof ArrayBuffer ? data.bytes.byteLength : undefined,
      });
    });
    if (window === window.top) {
      let previous;
      const observer = new MutationObserver(() => {
        const text = document.querySelector('[role="status"]')?.textContent;
        if (text !== previous) {
          previous = text;
          report("outer-status", { text });
        }
      });
      observer.observe(document, {
        subtree: true,
        childList: true,
        characterData: true,
      });
      addEventListener("pagehide", () => observer.disconnect(), { once: true });
    }
    if (PerformanceObserver.supportedEntryTypes.includes("longtask")) {
      let longTasks = 0;
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (longTasks++ < 16)
            report("long-task", {
              startMs: entry.startTime,
              durationMs: entry.duration,
            });
        }
      });
      observer.observe({ type: "longtask", buffered: true });
      addEventListener("pagehide", () => observer.disconnect(), { once: true });
    }
  });
}
let browser, page;
try {
  await new Promise((yes, no) => {
    server.once("error", no);
    server.listen(0, "127.0.0.1", yes);
  });
  receipt.origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH,
    headless: true,
    args: ["--no-sandbox"],
  });
  page = await browser.newPage({
    viewport: { width: 1440, height: 1050 },
    deviceScaleFactor: 1,
    acceptDownloads: true,
  });
  page.setDefaultTimeout(15000);
  await installLifecycleProbe(page);
  page.on("pageerror", (error) => receipt.errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") receipt.errors.push(message.text());
  });
  page.on("response", (response) => {
    receipt.requests.push({
      path: new URL(response.url()).pathname,
      status: response.status(),
      sameOrigin: new URL(response.url()).origin === receipt.origin,
    });
  });
  receipt.lifecycle.push({
    kind: "navigation-start",
    nodeEpochMs: Date.now(),
    elapsedMs: performance.now() - started,
  });
  await page.goto(receipt.origin, { waitUntil: "domcontentloaded" });
  await page
    .getByRole("status")
    .filter({ hasText: "Original workshop · editable baked scene" })
    .waitFor({ timeout: 45000 });
  receipt.lifecycle.push({
    kind: "ready-locator-resolved",
    nodeEpochMs: Date.now(),
    elapsedMs: performance.now() - started,
  });
  const frame = page
    .frames()
    .find((frame) => frame.url().endsWith("/frame.html"));
  assert(frame, "Maintained upstream frame loaded");
  receipt.fonts = [];
  for (const context of [page, frame])
    receipt.fonts.push(
      await context.evaluate(async () => {
        await document.fonts.load('16px "Nunito"');
        await document.fonts.load('16px "Maple Mono"');
        await document.fonts.ready;
        return {
          faces: [...document.fonts]
            .filter((face) => face.status === "loaded")
            .map((face) => face.family),
          resources: performance
            .getEntriesByType("resource")
            .filter((entry) => /\.(ttf|woff2)(?:$|\?)/.test(entry.name))
            .map((entry) => new URL(entry.name).pathname),
        };
      }),
    );
  for (const fonts of receipt.fonts) {
    assert(fonts.faces.some((face) => face.includes("Nunito")));
    assert(fonts.faces.some((face) => face.includes("Maple Mono")));
  }
  receipt.editor = await frame.evaluate(() => ({
    text: document.body.innerText,
    canvases: [...document.querySelectorAll("canvas")].map((canvas) => ({
      width: canvas.width,
      height: canvas.height,
    })),
    scriptTabHidden: [...document.querySelectorAll("#scriptTab")].every(
      (node) => getComputedStyle(node).display === "none",
    ),
    appHidden:
      getComputedStyle(document.querySelector("#app")).display === "none",
    resources: performance
      .getEntriesByType("resource")
      .map((entry) => new URL(entry.name).pathname),
  }));
  assert(receipt.editor.text.includes("bench"));
  assert(
    receipt.editor.canvases.some(
      (canvas) => canvas.width > 200 && canvas.height > 200,
    ),
  );
  assert(receipt.editor.scriptTabHidden && receipt.editor.appHidden);
  if (!flags.includes("--compact") || flags.includes("--interaction")) {
    const downloadPromise = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Save project", exact: true })
      .click();
    const download = await downloadPromise;
    await download.saveAs(resolve(output, "original.hive-project.json"));
    const project = JSON.parse(
      await readFile(resolve(output, "original.hive-project.json"), "utf8"),
    );
    assert.equal(project.format, "hive-editor-project");
    assert.equal(project.project.scene.object.type, "Scene");
    assert.deepEqual(
      project.project.scene.object.children
        .filter((child) => child.userData?.sceneNodeId)
        .map((child) => child.userData.sceneNodeId)
        .sort(),
      ["bench", "bottle", "kettle"],
    );
    assert.equal(project.provenance.document.nodes.length, 3);
    assert.deepEqual(project.project.scripts, {});
    receipt.project = {
      scene: project.project.scene.object.name,
      originalNodes: project.provenance.document.nodes.length,
      geometries: project.project.scene.geometries.length,
      materials: project.project.scene.materials.length,
      limitations: project.limitations,
    };
    if (flags.includes("--interaction"))
      receipt.interaction = await interactionCase(page, frame, output, project);
  }
  receipt.theme = [await inspectTheme(page)];
  if (flags.includes("--compact")) receipt.layout = [await inspectLayout(page)];
  await page.screenshot({
    path: resolve(output, "normal.png"),
    fullPage: true,
  });
  receipt.screenshots.push("normal.png");
  await page.setViewportSize({ width: 390, height: 844 });
  receipt.theme.push(await inspectTheme(page));
  if (flags.includes("--compact"))
    receipt.layout.push(await inspectLayout(page));
  await page.screenshot({ path: resolve(output, "390.png"), fullPage: true });
  receipt.screenshots.push("390.png");
  assert(
    receipt.requests.every(
      (request) => request.sameOrigin && request.status < 400,
    ),
    "Static graph must load locally without missing resources",
  );
  assert.deepEqual(receipt.errors, []);
  receipt.status = "passed";
} catch (error) {
  receipt.status = "failed";
  receipt.error = error.stack;
  receipt.lifecycle.push({
    kind: "proof-failed",
    nodeEpochMs: Date.now(),
    elapsedMs: performance.now() - started,
  });
  if (page && !page.isClosed()) {
    let timer;
    receipt.failureDiagnostics = await Promise.race([
      page
        .evaluate(() => ({
          status: document.querySelector("[role=status]")?.textContent,
          text: document.body.innerText,
          frames: document.querySelectorAll("iframe").length,
        }))
        .catch((error) => ({ error: error.message })),
      new Promise((resolve) => {
        timer = setTimeout(
          () => resolve({ error: "DOM diagnostics exceeded 5s" }),
          5000,
        );
      }),
    ]);
    clearTimeout(timer);
  }
  if (page && !page.isClosed()) {
    await page
      .screenshot({ path: resolve(output, "failure.png"), fullPage: true })
      .then(() => receipt.screenshots.push("failure.png"))
      .catch(() => {});
  }
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  if (server.listening)
    await new Promise((yes, no) =>
      server.close((error) => (error ? no(error) : yes())),
    );
  receipt.host.push(hostSample());
  receipt.browserClosed = true;
  receipt.listenerClosed = !server.listening;
  await writeFile(
    resolve(output, "receipt.json"),
    JSON.stringify(receipt, null, 2) + "\n",
  );
}
async function inventory(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await inventory(path)));
    else {
      const bytes = await readFile(path);
      files.push({
        path: relative(built, path),
        bytes: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      });
    }
  }
  return files;
}
await writeFile(
  resolve(output, "static-inventory.json"),
  JSON.stringify({ root: built, files: await inventory(built) }, null, 2) +
    "\n",
);
console.log(
  JSON.stringify({
    status: receipt.status,
    error: receipt.error,
    requests: receipt.requests.length,
    browserClosed: receipt.browserClosed,
    listenerClosed: receipt.listenerClosed,
  }),
);
