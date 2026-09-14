import * as THREE from "three";
import { renderBakeCanvas } from "./bake.js";
import { camera } from "./prop-camera.js";
import {
  terrainBase,
  terrainPatch,
  cliffPart,
  TERRAIN_PALETTES,
} from "./terrain-patches.js";
import { STATIC_ART_RENDER } from "./static-manifest.js";

const FRAME = 64,
  COLUMNS = 16;
export function authorTerrainPack() {
  const settings = STATIC_ART_RENDER.renderer;
  const renderer = new THREE.WebGLRenderer({
    alpha: settings.alpha,
    antialias: settings.antialias,
    preserveDrawingBuffer: settings.preserveDrawingBuffer,
  });
  renderer.setPixelRatio(settings.pixelRatio);
  renderer.setClearColor(settings.clearColor, settings.clearAlpha);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const tiles = [];
  try {
    for (let variant = 0; variant < 3; variant++)
      tiles.push({
        id: `base/earth/${variant}`,
        scene: () => terrainBase(variant),
        kind: "earth",
        variant,
      });
    for (const kind of Object.keys(TERRAIN_PALETTES))
      for (let variant = 0; variant < 3; variant++)
        for (let mask = 0; mask < 16; mask++)
          tiles.push({
            id: `${kind}/${variant}/${mask}`,
            scene: () => terrainPatch(kind, mask, variant),
            kind,
            variant,
            mask,
          });
    for (const kind of ["earth", "stone", "grass-lip"])
      for (let variant = 0; variant < 3; variant++)
        for (let facing = 0; facing < 4; facing++)
          tiles.push({
            id: `cliff/${kind}/${variant}/${facing}`,
            scene: () => cliffPart(kind, facing, variant),
            kind,
            variant,
            facing,
          });
    const atlas = document.createElement("canvas");
    atlas.width = COLUMNS * FRAME;
    atlas.height = Math.ceil(tiles.length / COLUMNS) * FRAME;
    const ctx = atlas.getContext("2d");
    const entries = tiles.map((tile, i) => {
      const { canvas, context } = renderBakeCanvas(
        renderer,
        tile.scene(),
        camera(FRAME, FRAME, 0),
        FRAME,
        FRAME,
        { ink: false },
      );
      const pixels = context.getImageData(0, 0, FRAME, FRAME).data;
      let visible = 0;
      for (let py = 0; py < FRAME; py++)
        for (let px = 0; px < FRAME; px++) {
          if (!pixels[(py * FRAME + px) * 4 + 3]) continue;
          visible++;
          if (px === 0 || py === 0 || px === FRAME - 1 || py === FRAME - 1)
            throw new Error(`Clipped terrain art: ${tile.id}`);
        }
      if (!visible && tile.mask !== 0)
        throw new Error(`Empty terrain art: ${tile.id}`);
      const x = (i % COLUMNS) * FRAME,
        y = Math.floor(i / COLUMNS) * FRAME;
      ctx.drawImage(canvas, x, y);
      const { scene: _, ...entry } = tile;
      return {
        ...entry,
        x,
        y,
        width: FRAME,
        height: FRAME,
        anchor: [32, 32],
        visiblePixels: visible,
      };
    });
    const manifest = {
      schema: "hive.terrain-art-study/1",
      atlas: "terrain-atlas.png",
      width: atlas.width,
      height: atlas.height,
      units: { cellMetres: 1, verticalMetres: 0.54, projectedStep: [16, 8] },
      corners: ["NW", "NE", "SE", "SW"],
      diagonalPolicy: "disconnected-cover",
      surfaceLayers: ["base/earth", "grass", "damp", "rock"],
      placement:
        "surface patch centered on the corner between four cells; cliff at face midpoint, y=top",
      provenance: {
        threeRevision: THREE.REVISION,
        camera: "src/art/prop-camera.js",
        bake: "src/art/bake.js",
        ink: false,
      },
      entries,
    };
    return {
      manifest,
      atlas,
      preview: landscapePreview(atlas, entries),
      sheet: contactSheet(atlas, entries),
    };
  } finally {
    renderer.dispose();
    renderer.forceContextLoss();
  }
}

function draw(ctx, atlas, entry, x, y) {
  ctx.drawImage(
    atlas,
    entry.x,
    entry.y,
    64,
    64,
    Math.round(x) - 32,
    Math.round(y) - 32,
    64,
    64,
  );
}

function contactSheet(atlas, entries) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 4 * 128;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#273a30";
  ctx.fillRect(0, 0, 1024, 512);
  ctx.font = "12px monospace";
  ctx.fillStyle = "#e5d4ad";
  for (const [row, kind] of ["grass", "rock", "damp"].entries()) {
    ctx.fillText(`${kind} / all 16 corner masks`, 12, row * 128 + 18);
    for (let mask = 0; mask < 16; mask++) {
      const entry = entries.find((e) => e.id === `${kind}/0/${mask}`);
      draw(
        ctx,
        atlas,
        entries.find((e) => e.id === "base/earth/0"),
        mask * 64 + 32,
        row * 128 + 62,
      );
      draw(ctx, atlas, entry, mask * 64 + 32, row * 128 + 62);
      ctx.fillText(String(mask), mask * 64 + 26, row * 128 + 109);
    }
  }
  ctx.fillText(
    "cliff earth / stone / rooted grass lip — 4 fixed-light facings each",
    12,
    402,
  );
  let col = 0;
  for (const kind of ["earth", "stone", "grass-lip"])
    for (let facing = 0; facing < 4; facing++)
      draw(
        ctx,
        atlas,
        entries.find((e) => e.id === `cliff/${kind}/0/${facing}`),
        40 + col++ * 80,
        450,
      );
  return canvas;
}

// Authored assembly for art acceptance only; this is not a second world generator.
function landscapePreview(atlas, entries) {
  const canvas = document.createElement("canvas");
  canvas.width = 704;
  canvas.height = 440;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#273a30";
  ctx.fillRect(0, 0, 704, 440);
  const index = new Map(entries.map((e) => [e.id, e]));
  const sample = (x, z) => {
    if (x >= 3 && x <= 6 && z >= 4 && z <= 6) return "earth";
    if ((x - 11) ** 2 / 15 + (z - 5) ** 2 / 10 < 1) return "rock";
    if ((x - 5) ** 2 / 13 + (z - 12) ** 2 / 8 < 1) return "damp";
    const trail = 7 + Math.sin(z * 0.38) * 2;
    return Math.abs(x - trail) < 1.1 ? "earth" : "grass";
  };
  const height = (x, z) =>
    x >= 3 && x < 6 && z >= 4 && z < 6 ? -0.54 : x > 11 && z < 9 ? 0.54 : 0;
  const commands = [];
  for (let z = 0; z < 17; z++)
    for (let x = 0; x < 17; x++) {
      const h = height(x, z),
        corners = [
          [x, z],
          [x + 1, z],
          [x + 1, z + 1],
          [x, z + 1],
        ];
      const types = corners.map(([cx, cz]) => sample(cx, cz));
      const variant = (x * 7 + z * 11) % 3;
      commands.push({
        x,
        z,
        h,
        entry: index.get(`base/earth/${variant}`),
        depth: x + z,
      });
      for (const [layer, kind] of ["grass", "damp", "rock"].entries()) {
        const mask = types.reduce(
          (bits, type, i) => bits | (type === kind ? 1 << i : 0),
          0,
        );
        if (mask)
          commands.push({
            x,
            z,
            h,
            entry: index.get(`${kind}/${variant}/${mask}`),
            depth: x + z + 0.01 * (layer + 1),
          });
      }
      for (const [dx, dz, facing] of [
        [1, 0, 1],
        [0, 1, 0],
      ]) {
        const neighbor =
          x + dx >= 17 || z + dz >= 17 ? h - 0.54 : height(x + dx, z + dz);
        if (neighbor >= h) continue;
        commands.push({
          x: x + dx * 0.5,
          z: z + dz * 0.5,
          h,
          entry: index.get(`cliff/earth/${variant}/${facing}`),
          depth: x + z + 0.7,
        });
        if (sample(x, z) === "grass")
          commands.push({
            x: x + dx * 0.5,
            z: z + dz * 0.5,
            h,
            entry: index.get(`cliff/grass-lip/${variant}/${facing}`),
            depth: x + z + 0.71,
          });
      }
    }
  commands.sort((a, b) => a.depth - b.depth);
  for (const c of commands)
    draw(
      ctx,
      atlas,
      c.entry,
      352 + (c.x - c.z) * 16,
      65 + (c.x + c.z) * 8 - c.h * 16 * Math.sqrt(1.5),
    );
  ctx.fillStyle = "#eadcbd";
  ctx.font = "17px monospace";
  ctx.fillText("CLEARING / TERRAIN ART", 24, 28);
  ctx.font = "12px monospace";
  ctx.fillText(
    "Original Three scenes → shared bake → packed sprite assembly",
    24,
    411,
  );
  ctx.fillText(
    "Grass · earth · rock · damp ground · terrace · dug notch",
    24,
    429,
  );
  return canvas;
}
