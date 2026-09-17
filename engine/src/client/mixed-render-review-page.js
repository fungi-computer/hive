import { Application } from "pixi.js";
import { loadStaticArtPack } from "../../../src/art/static-pack.js";
import { loadLivingTerrainPack } from "../../../src/art/living-terrain-pack.js";
import { staticArtBase } from "../../../src/art/static-manifest.js";
import { MIXED_FIXTURE_ORIENTATIONS } from "./mixed-render-fixture.js";
import { createMixedRenderReviewOwner } from "./mixed-render-review-owner.js";

const host = document.querySelector("#canvas"), status = document.querySelector("#status");
const camera = document.querySelector("#camera"), object = document.querySelector("#object");
const focus = document.querySelector("#focus"), guide = document.querySelector("#guide");
camera.add(new Option("north (baked view)", "north"));
for (const orientation of MIXED_FIXTURE_ORIENTATIONS) object.add(new Option(orientation, orientation));

const app = new Application();
await app.init({ resizeTo: host, backgroundColor: 0x87928d, antialias: false, resolution: 1,
  preference: "webgl", preferWebGLVersion: 2, preserveDrawingBuffer: true });
host.appendChild(app.canvas);
const terrainPack = await loadLivingTerrainPack();
const staticPack = await loadStaticArtPack({ baseUrl: staticArtBase(import.meta.env?.BASE_URL ?? "/engine/") });
let owner;

function applyFocus() {
  if (!owner) return;
  for (const record of owner.compiled.records) {
    if (!record.display) continue;
    let visible = record.visible !== false;
    if (record.role === "build-guide") visible = guide.checked;
    if (record.role === "actor") {
      visible = focus.value === "all" ||
        (focus.value === "scene" && ["fixture:goblin", "fixture:goblin:stair-middle", "fixture:goblin:bed-side-left"].includes(record.id)) ||
        (focus.value === "stair" && record.fixturePosition?.startsWith("stair-")) ||
        (focus.value === "bed" && record.fixturePosition?.startsWith("bed-"));
    }
    if (record.id === "fixture:stair") visible = !["bed", "terrain"].includes(focus.value);
    if (record.id === "fixture:bed") visible = !["stair", "terrain"].includes(focus.value);
    record.display.visible = visible;
  }
  status.textContent = `${owner.compiled.records.length} original-art records · accepted voxel stream · ${focus.value} focus`;
}

function render() {
  owner?.dispose();
  owner = createMixedRenderReviewOwner({ art: staticPack.art, terrainPack,
    cameraOrientation: camera.value, objectOrientation: object.value });
  const bounds = owner.compiled.records.reduce((box, record) => ({
    left: Math.min(box.left, record.screenBounds.left), right: Math.max(box.right, record.screenBounds.right),
    top: Math.min(box.top, record.screenBounds.top), bottom: Math.max(box.bottom, record.screenBounds.bottom),
  }), { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity });
  const width = bounds.right - bounds.left, height = bounds.bottom - bounds.top;
  const scale = Math.min(3, (app.screen.width - 80) / width, (app.screen.height - 80) / height);
  owner.container.position.set((app.screen.width - width * scale) / 2 - bounds.left * scale,
    (app.screen.height - height * scale) / 2 - bounds.top * scale);
  owner.container.scale.set(scale);
  app.stage.addChild(owner.container);
  applyFocus();
  document.body.dataset.ready = "true";
}
camera.value = "north";
object.value = "north";
camera.addEventListener("change", render);
object.addEventListener("change", render);
focus.addEventListener("change", applyFocus);
guide.addEventListener("change", applyFocus);
render();
window.__MIXED_RENDER_REVIEW = Object.freeze({
  snapshot: () => Object.freeze({
    camera: camera.value,
    object: object.value,
    focus: focus.value,
    recordCount: owner?.compiled.records.length ?? 0,
    alphaHitRecords: owner?.compiled.records.filter(record => record.hitArea?.kind === "visible-silhouette").length ?? 0,
    roles: Object.freeze([...new Set(owner?.compiled.records.map(record => record.role) ?? [])].sort()),
  }),
});
window.addEventListener("beforeunload", () => {
  owner?.dispose();
  staticPack.dispose();
  terrainPack.dispose();
  app.destroy(true);
});
