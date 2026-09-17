import type { TerrainPresentationDefinition, TerrainSurfaceCover } from "../contracts";

const SOIL = 1;

function patchValue(seed: string, x: number, z: number): number {
  let value = 2166136261;
  const input = `${seed}:${Math.floor(x / 4)}:${Math.floor(z / 4)}`;
  for (let index = 0; index < input.length; index++) {
    value ^= input.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

/** Goblin's generated surface vocabulary. The engine only validates and carries
 * the returned cover fact; no grass or path identity lives in shared runtime code.
 */
export const colonyTerrainPresentation: TerrainPresentationDefinition = Object.freeze({
  materials: Object.freeze([
    Object.freeze({ slot: 1, art: "earth" }),
    Object.freeze({ slot: 2, art: "stone" }),
  ]),
  generatedCover({ cell: [x, , z], material, worldSeed }): TerrainSurfaceCover | null {
    if (material !== SOIL) return null;
    // Authored arrival track through the initial clearing. It is presentation
    // intent, not traffic simulation or a navigation cost.
    const trackCenter = Math.round(Math.sin(x * 0.45) * 1.5);
    if (Math.abs(z - trackCenter) === 0 && x >= -12 && x <= 12) return null;
    const patch = patchValue(worldSeed, x, z);
    return Object.freeze({
      kind: "grass",
      condition: x < -4 && z < -3 && (patch & 3) !== 0 ? "dead" : "green",
      height: (patch >>> 3) % 3 === 0 ? "full" : "short",
    });
  },
});
