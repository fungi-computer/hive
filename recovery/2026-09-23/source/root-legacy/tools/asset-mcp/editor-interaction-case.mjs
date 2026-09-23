import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

function equivalent(actual, expected, label) {
  if (typeof expected === "number") {
    assert(
      typeof actual === "number" &&
        Math.abs(actual - expected) <= 1e-10 * Math.max(1, Math.abs(expected)),
      label,
    );
  } else if (expected && typeof expected === "object") {
    assert.deepEqual(Object.keys(actual), Object.keys(expected), label);
    for (const key of Object.keys(expected))
      equivalent(actual[key], expected[key], `${label}.${key}`);
  } else assert.equal(actual, expected, label);
}

export async function interactionCase(page, frame, output, original) {
  async function download(button, filename) {
    const pending = page.waitForEvent("download");
    await page.getByRole("button", { name: button, exact: true }).click();
    const file = await pending;
    const path = resolve(output, filename);
    await file.saveAs(path);
    return path;
  }
  async function save(name) {
    return JSON.parse(
      await readFile(await download("Save project", name), "utf8"),
    );
  }
  const bench = (packet) =>
    packet.project.scene.object.children.find(
      (child) => child.userData?.sceneNodeId === "bench",
    );
  const originalChildren = original.project.scene.object.children;
  const normalized = originalChildren.filter(node => node.userData?.serializationNormalization === "original-detached-light-target-v1");
  assert(normalized.length > 0, "Original detached targets became explicit scene nodes");
  for (const light of originalChildren.filter(node => ["DirectionalLight", "SpotLight"].includes(node.type)))
    assert(originalChildren.some(node => node.uuid === light.target), "Light target link resolves in native scene graph");
  const outliner = frame.locator("#outliner");
  await outliner
    .locator(".option")
    .filter({ hasText: /^\s*bench\s*$/ })
    .click();
  const position = frame
    .locator("#properties .Row")
    .filter({ has: frame.locator(".Label", { hasText: /^Position$/ }) })
    .locator("input")
    .first();
  const before = Number(await position.inputValue());
  await position.fill(String(before + 0.5));
  await position.press("Enter");
  assert.equal(Number(await position.inputValue()), before + 0.5);
  await outliner.focus();
  await page.keyboard.press("e");
  assert.equal(
    await frame.locator("#toolbar button.selected img").getAttribute("title"),
    "Rotate",
  );
  await page.keyboard.press("w");
  await page.keyboard.press("Control+z");
  assert.equal(Number(await position.inputValue()), before);
  await page.keyboard.press("Control+Shift+z");
  assert.equal(Number(await position.inputValue()), before + 0.5);
  await frame.locator(".Tab#project").click();
  const row = (label) =>
    frame.locator("#sidebar .Row").filter({
      has: frame.locator(".Label", { hasText: new RegExp(`^${label}$`) }),
    });
  await row("Antialias").locator("input").uncheck();
  await row("Shadows").locator("select").selectOption("0");
  await row("Tonemapping").locator("select").selectOption("4");
  await row("Tonemapping").locator("input").fill("1.25");
  await row("Tonemapping").locator("input").press("Enter");
  const changed = await save("edited.hive-project.json");
  assert.equal(bench(changed).matrix[12], before + 0.5);
  assert.deepEqual(changed.provenance, original.provenance);
  assert.equal(changed.project.project.antialias, false);
  assert.equal(changed.project.project.shadowType, 0);
  assert.equal(changed.project.project.toneMapping, 4);
  assert.equal(changed.project.project.toneMappingExposure, 1.25);
  await page
    .locator("input[type=file]")
    .setInputFiles(resolve(output, "edited.hive-project.json"));
  await page
    .getByRole("status")
    .filter({ hasText: "Opened edited.hive-project.json" })
    .waitFor({ timeout: 45000 });
  const reopened = await save("reopened.hive-project.json");
  for (const key of [
    "project",
    "camera",
    "controls",
    "backgroundType",
    "environmentType",
    "history",
  ])
    equivalent(reopened.project[key], changed.project[key], `${key} restored`);
  equivalent(reopened.project.scene, changed.project.scene, "scene");
  assert.deepEqual(reopened.provenance, original.provenance);
  await frame.locator(".Tab#scene").click();
  await outliner
    .locator(".option")
    .filter({ hasText: /^\s*bench\s*$/ })
    .click();
  await outliner.focus();
  await page.keyboard.press("Control+z");
  assert.equal(Number(await position.inputValue()), before);
  await page.keyboard.press("Control+Shift+z");
  assert.equal(Number(await position.inputValue()), before + 0.5);
  const glbPath = await download("GLB", "edited.glb");
  const bytes = await readFile(glbPath);
  assert.equal(bytes.toString("ascii", 0, 4), "glTF");
  const parsed = await frame.evaluate(
    async (bytes) => {
      const { GLTFLoader } =
        await import("/vendor/examples/jsm/loaders/GLTFLoader.js");
      const { releaseScene } = await import("/scene-resources.js");
      const result = await new GLTFLoader().parseAsync(
        new Uint8Array(bytes).buffer,
        "",
      );
      const nodes = [];
      let meshes = 0;
      result.scene.traverse((node) => {
        if (node.isMesh) meshes++;
        if (node.userData.sceneNodeId)
          nodes.push({
            id: node.userData.sceneNodeId,
            position: node.position.toArray(),
          });
      });
      releaseScene(result.scene);
      return { nodes, meshes };
    },
    [...bytes],
  );
  assert.deepEqual(parsed.nodes.map((node) => node.id).sort(), [
    "bench",
    "bottle",
    "kettle",
  ]);
  assert.equal(
    parsed.nodes.find((node) => node.id === "bench").position[0],
    before + 0.5,
  );
  assert(parsed.meshes > 0);
  return {
    transform: { before, after: before + 0.5 },
    shortcuts: ["w", "e", "Ctrl-Z", "Shift-Ctrl-Z"],
    settings: changed.project.project,
    reopened: true,
    lightTargetGraphPreserved: true,
    historyAfterReopen: true,
    glb: { bytes: bytes.length, ...parsed },
  };
}
