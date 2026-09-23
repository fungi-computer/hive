import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, writeFile, mkdir, readdir, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, extname, relative } from "node:path";
import { chromium } from "playwright";
import { interactionCase } from "./editor-interaction-case.mjs";

assert(
  process.argv.length === 4 ||
    (process.argv.length === 5 && process.argv[4] === "--interaction"),
  "Usage: node editor-proof.mjs <built directory> <new evidence directory>",
);
const built = resolve(process.argv[2]),
  output = resolve(process.argv[3]);
await mkdir(output); // Preserve prior evidence; never silently replace a run.
const receipt = {
  scope: "First full-editor static readiness and original-scene render",
  errors: [],
  requests: [],
  screenshots: [],
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
  await page.goto(receipt.origin, { waitUntil: "domcontentloaded" });
  await page
    .getByRole("status")
    .filter({ hasText: "Original workshop · editable baked scene" })
    .waitFor({ timeout: 45000 });
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
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
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
  if (process.argv[4] === "--interaction")
    receipt.interaction = await interactionCase(page, frame, output, project);
  receipt.theme = [await inspectTheme(page)];
  await page.screenshot({
    path: resolve(output, "normal.png"),
    fullPage: true,
  });
  receipt.screenshots.push("normal.png");
  await page.setViewportSize({ width: 390, height: 844 });
  receipt.theme.push(await inspectTheme(page));
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
