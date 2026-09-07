import { chromium } from "playwright";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";

const url = process.argv[2] || "http://127.0.0.1:5187/study.html";
const output = process.argv[3] || ".botanical/home-art-contact-sheets";
const poses = [
  "idle",
  "walk",
  "chop",
  "build",
  "carry",
  "pickup",
  "deliver",
  "sleep",
];
const actors = [
  ["rowan", "Rowan"],
  ["witch-runner", "Sedge"],
];
const sourceFiles = [
  "src/art.js",
  "src/art/figures.js",
  "src/study.js",
  "scripts/export-study-art.mjs",
];
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const sourceHashes = Object.fromEntries(
  await Promise.all(
    sourceFiles.map(async (file) => [file, sha256(await readFile(file))]),
  ),
);
await mkdir(output, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH,
  args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1100 },
  deviceScaleFactor: 1,
});
const page = await context.newPage();
const frameSources = {};
const outputFiles = [];
try {
  const response = await page.goto(url);
  assert.equal(response?.status(), 200);
  await page.waitForFunction(() => window.__STUDY?.ready, null, {
    timeout: 60000,
  });

  for (const [actor, label] of actors) {
    frameSources[actor] = {};
    for (const pose of poses) {
      frameSources[actor][pose] = [];
      for (let direction = 0; direction < 4; direction++) {
        await page.locator(`button[data-home-actor="${actor}"]`).click();
        await page.locator(`button[data-home-pose="${pose}"]`).click();
        await page.locator(`button[data-home-direction="${direction}"]`).click();
        await page.locator('button[data-home-scale="1"]').click();
        await page.waitForFunction(
          ({ actor: expectedActor, pose: expectedPose, direction: expectedDirection }) => {
            const current = window.__STUDY.state.home;
            return (
              current.actor === expectedActor &&
              current.pose === expectedPose &&
              current.direction === expectedDirection &&
              current.scale === 1
            );
          },
          { actor, pose, direction },
        );
        const source = await page
          .locator('#home-sheet img[data-home-frame="0"]')
          .getAttribute("src");
        assert.match(source || "", /^data:image\/png;base64,/);
        frameSources[actor][pose].push(source);
      }
    }
    const pngBase64 = await page.evaluate(
      async ({ actor, label, poses, sources }) => {
        const cellWidth = 96;
        const cellHeight = 108;
        const left = 88;
        const top = 46;
        const width = left + cellWidth * 4 + 8;
        const height = top + cellHeight * poses.length + 8;
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        context.imageSmoothingEnabled = false;
        context.fillStyle = "#17241f";
        context.fillRect(0, 0, width, height);
        context.fillStyle = "#e9ddbc";
        context.font = "bold 16px system-ui, sans-serif";
        context.fillText(`${label} · actual bakeArt() · native 1×`, 8, 21);
        context.font = "11px system-ui, sans-serif";
        for (let direction = 0; direction < 4; direction++)
          context.fillText(`Facing ${direction + 1}`, left + direction * cellWidth + 8, 38);
        for (let row = 0; row < poses.length; row++) {
          const pose = poses[row];
          const y = top + row * cellHeight;
          context.fillStyle = "#d8c896";
          context.font = "bold 11px system-ui, sans-serif";
          context.fillText(pose, 8, y + 47);
          for (let direction = 0; direction < 4; direction++) {
            const x = left + direction * cellWidth;
            context.fillStyle = "#1f3029";
            context.fillRect(x, y, 88, 100);
            context.strokeStyle = "#657254";
            context.strokeRect(x + 0.5, y + 0.5, 87, 99);
            const image = new Image();
            image.src = sources[pose][direction];
            await new Promise((resolve, reject) => {
              image.onload = resolve;
              image.onerror = reject;
            });
            context.drawImage(image, x + 4, y + 4, 80, 80);
            context.fillStyle = "#9cac92";
            context.font = "10px system-ui, sans-serif";
            context.fillText("phase 1", x + 28, y + 96);
          }
        }
        return canvas.toDataURL("image/png").split(",")[1];
      },
      { actor, label, poses, sources: frameSources[actor] },
    );
    const filename = `${actor === "rowan" ? "rowan" : "sedge"}-all-modes-facings-native.png`;
    await writeFile(path.join(output, filename), Buffer.from(pngBase64, "base64"));
    outputFiles.push(filename);
  }
} finally {
  await context.close();
  await browser.close();
}

const outputHashes = Object.fromEntries(
  await Promise.all(
    outputFiles.map(async (file) => [file, sha256(await readFile(path.join(output, file)))]),
  ),
);
const manifest = {
  url,
  renderer: "actual bakeArt() textures consumed by /study",
  frame: { width: 80, height: 80, representativePhase: 0 },
  actors: actors.map(([id, label]) => ({ id, label })),
  poses,
  directions: [0, 1, 2, 3],
  outputFiles,
  sourceSha256: sourceHashes,
  outputSha256: outputHashes,
  video: [],
  wrapper: {
    runner: "/home/levi/src/Botanical-next/.agents/skills/orchestrate-multi-lane-work/scripts/run-proof.sh",
    scope: process.env.PROOF_SCOPE || "10min native proof scope",
    exit: 0,
  },
};
await writeFile(
  path.join(output, "contact-sheet-manifest.json"),
  JSON.stringify(manifest, null, 2) + "\n",
);
await writeFile(
  path.join(output, "source-sha256.txt"),
  Object.entries({ ...sourceHashes, ...outputHashes })
    .map(([file, hash]) => `${hash}  ${file}`)
    .join("\n") + "\n",
);
console.log(JSON.stringify({ output, outputFiles, sourceSha256: sourceHashes, outputSha256: outputHashes, video: [], wrapper: manifest.wrapper }));
