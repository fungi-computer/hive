import { Application } from "pixi.js";
import { runRetainedWorldDepthAcceptance } from "./world-depth-acceptance.js";

const output = document.querySelector("#result");
const app = new Application();

async function main() {
  await app.init({ width: 640, height: 400, preference: ["webgl"], antialias: false, resolution: 1, backgroundAlpha: 0 });
  if (app.renderer.name !== "webgl" || app.renderer.context.webGLVersion !== 2)
    throw new Error("retained-depth-page-requires-webgl2");
  globalThis.__HIVE_RETAINED_DEPTH_RENDERER__ = Object.freeze({ name: app.renderer.name, webGLVersion: app.renderer.context.webGLVersion });
  let visibleCapture;
  const result = await runRetainedWorldDepthAcceptance({
    renderer: app.renderer,
    onVisibleCapture(canvas) {
      canvas.dataset.hiveDepthCapture = "true";
      canvas.setAttribute("aria-label", "Rendered retained depth acceptance scene");
      document.body.append(canvas);
      visibleCapture = { width: canvas.width, height: canvas.height };
    },
  });
  if (!result.permutationStable || result.waterFrontChanged <= result.waterBehindChanged)
    throw new Error(`acceptance-contract-failed:${JSON.stringify(result)}`);
  output.textContent = JSON.stringify({ status: "PASS", ...result, visibleCapture });
  globalThis.__HIVE_RETAINED_DEPTH_ACCEPTANCE__ = Object.freeze({ ...result, visibleCapture });
}

main().catch((error) => {
  output.textContent = `FAIL — ${error instanceof Error ? error.message : String(error)}`;
  globalThis.__HIVE_RETAINED_DEPTH_ACCEPTANCE__ = Object.freeze({ status: "FAIL", message: output.textContent });
  throw error;
});
