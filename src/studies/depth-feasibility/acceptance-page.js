import { Application } from "pixi.js";
import { runRetainedWorldDepthAcceptance } from "./world-depth-acceptance.js";

const output = document.querySelector("#result");
const app = new Application();

async function main() {
  await app.init({ width: 640, height: 400, preference: ["webgl"], antialias: false, resolution: 1, backgroundAlpha: 0 });
  if (app.renderer.name !== "webgl" || app.renderer.context.webGLVersion !== 2)
    throw new Error("retained-depth-page-requires-webgl2");
  const result = await runRetainedWorldDepthAcceptance({ renderer: app.renderer });
  if (!result.permutationStable || result.waterFrontChanged <= result.waterBehindChanged)
    throw new Error(`acceptance-contract-failed:${JSON.stringify(result)}`);
  output.textContent = JSON.stringify({ status: "PASS", ...result });
  globalThis.__HIVE_RETAINED_DEPTH_ACCEPTANCE__ = Object.freeze(result);
}

main().catch((error) => {
  output.textContent = `FAIL — ${error instanceof Error ? error.message : String(error)}`;
  globalThis.__HIVE_RETAINED_DEPTH_ACCEPTANCE__ = Object.freeze({ status: "FAIL", message: output.textContent });
  throw error;
});
