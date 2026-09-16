import { BufferImageSource, Texture } from "pixi.js";
import { TERRAIN_PALETTES } from "../../../src/art/terrain-patches.js";

const hex = value => {
  const number = Number.parseInt(value.slice(1), 16);
  return [(number >> 16) & 255, (number >> 8) & 255, number & 255, 255];
};

/** One immutable nearest-sampled palette owned by the cut-terrain renderer.
 * Colors come from the existing terrain art; game material slots stay data.
 */
export function createTerrainFaceAppearance({ soil = 1, stone = 2 } = {}) {
  const colors = [
    TERRAIN_PALETTES.grass.base,
    TERRAIN_PALETTES.grass.cover,
    "#806143",
    TERRAIN_PALETTES.rock.cover,
    "#676b60",
  ];
  const pixels = new Uint8Array(colors.flatMap(hex));
  const texture = new Texture({ source: new BufferImageSource({
    resource: pixels, width: colors.length, height: 1, format: "rgba8unorm",
    alphaMode: "premultiply-alpha-on-upload", scaleMode: "nearest",
  }) });
  const uv = index => {
    const x = (index + 0.5) / colors.length;
    return [x, 0.5, x, 0.5, x, 0.5, x, 0.5];
  };
  function appearance({ cell, face, material, cap, generatedTop }) {
    const top = face === "top";
    const natural = top && !cap && cell[1] === generatedTop;
    const index = material === stone ? (top ? 3 : 4)
      : material === soil ? (natural ? 1 : top ? 0 : 2)
      : top ? 0 : 2;
    return { texture, uvs: uv(index), blendMode: "normal", state: "terrain-opaque" };
  }
  return Object.freeze({ appearance, dispose: () => texture.destroy(true) });
}
