import { createStaticArtDraft } from "./static-authoring.js";

const status = document.querySelector("#status");
let running = false;

async function encode() {
  if (running) throw new Error("Static art export is already running");
  running = true;
  let generated;
  try {
    generated = await createStaticArtDraft((progress) => {
      status.textContent = `${progress.detail} · ${progress.completedTextures}`;
    });
    const files = {};
    for (const [name, canvas] of generated.files)
      files[name] = canvas.toDataURL("image/png");
    status.textContent = `Prepared ${generated.draft.textureCount} textures`;
    return { draft: generated.draft, files };
  } finally {
    generated?.dispose();
    running = false;
  }
}

window.__HIVE_STATIC_ART_EXPORT__ = Object.freeze({ encode });
status.textContent = "Original art exporter ready";
