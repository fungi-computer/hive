import { Application, Sprite } from "pixi.js";
import { bakeArt } from "./art.js";

function alphaFacts(pixels) {
  let opaque = 0;
  for (let index = 3; index < pixels.length; index += 4)
    if (pixels[index]) opaque++;
  return { corner: [...pixels.slice(0, 4)], opaque };
}

/** Browser-only focused render probe. It imports Pixi exactly as art.js does. */
export async function renderStationProfiles() {
  const art = await bakeArt();
  const names = Object.keys(art.buildings["brew-station"].profiles);
  const frames = names.flatMap((profile) =>
    [0, 1].flatMap((direction) =>
      art.buildings["brew-station"].profiles[profile][direction].map(
        (texture, frame) => ({ profile, direction, frame, texture }),
      ),
    ),
  );
  const app = new Application();
  await app.init({
    width: 112,
    height: 112,
    backgroundAlpha: 0,
    antialias: false,
    preference: "webgl",
  });
  document.body.append(app.canvas);
  const profiles = {};
  let lastSprite = null;
  for (const { profile, direction, frame, texture } of frames) {
    const name = `${profile}:d${direction}:f${frame}`;
    // Construction creates a stake sprite first, then changes its texture when
    // a finished station receives a fact-derived profile.
    const sprite = new Sprite(art.buildings["brew-station"].stakes[0]);
    sprite.texture = texture;
    app.stage.addChild(sprite);
    const source = texture.source.resource
      .getContext("2d")
      .getImageData(0, 0, 112, 112).data;
    profiles[name] = { source: alphaFacts(source) };
    app.renderer.render(app.stage);
    const gl =
      app.canvas.getContext("webgl2") || app.canvas.getContext("webgl");
    if (!gl) throw new Error("Pixi did not expose a WebGL framebuffer");
    const pixels = new Uint8Array(112 * 112 * 4);
    gl.readPixels(0, 0, 112, 112, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    profiles[name].pixi = alphaFacts(pixels);
    app.stage.removeChildren();
    lastSprite = sprite;
  }
  if (lastSprite) {
    app.stage.addChild(lastSprite);
    app.renderer.render(app.stage);
  }
  return profiles;
}
