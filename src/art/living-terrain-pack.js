import { Texture } from "pixi.js";

const MANIFEST_URL = new URL("../../artifacts/living-terrain/manifest.json", import.meta.url);
const ATLAS_URL = new URL("../../artifacts/living-terrain/living-terrain-runtime-atlas.png", import.meta.url);
const MAX_MANIFEST_BYTES = 512 * 1024;
const MAX_ATLAS_BYTES = 2 * 1024 * 1024;

const bytes = async (fetchImpl, url, limit, label) => {
  const response = await fetchImpl(url);
  if (!response.ok) throw new Error(`Living terrain ${label} unavailable (${response.status})`);
  const value = await response.arrayBuffer();
  if (value.byteLength > limit) throw new Error(`Living terrain ${label} exceeds its byte limit`);
  return value;
};
const hex = value => [...new Uint8Array(value)].map(byte => byte.toString(16).padStart(2, "0")).join("");
const digest = async value => hex(await crypto.subtle.digest("SHA-256", value));
const integer = (value, minimum, maximum) => Number.isInteger(value) && value >= minimum && value <= maximum;

export function parseLivingTerrainRuntimeManifest(value) {
  const runtime = value?.runtime;
  if (value?.schema !== "hive.living-terrain-art-study/1" || runtime?.schema !== "hive.living-terrain-runtime/1" ||
    runtime.atlas !== "living-terrain-runtime-atlas.png" || !integer(runtime.width, 1, 4096) ||
    !integer(runtime.height, 1, 4096) || !Array.isArray(runtime.entries) || runtime.entries.length !== 210)
    throw new Error("Invalid living terrain runtime manifest");
  const entries = new Map();
  for (const entry of runtime.entries) {
    if (typeof entry?.id !== "string" || entries.has(entry.id) || !integer(entry.x, 0, runtime.width - 1) ||
      !integer(entry.y, 0, runtime.height - 1) || entry.width !== 64 || entry.height !== 64 ||
      entry.x + 64 > runtime.width || entry.y + 64 > runtime.height)
      throw new Error("Invalid living terrain runtime frame");
    entries.set(entry.id, Object.freeze({ ...entry }));
  }
  for (const material of ["earth", "stone"]) for (let variant = 0; variant < 3; variant++)
    for (const face of ["top", "east", "south"])
      if (!entries.has(`body/${material}/${variant}/${face}`)) throw new Error("Incomplete living terrain body bank");
  for (const condition of ["green", "dead"]) for (const height of ["short", "full"])
    for (let variant = 0; variant < 3; variant++) for (let mask = 0; mask < 16; mask++)
      if (!entries.has(`cover/grass/${condition}/${height}/${variant}/${mask}`)) throw new Error("Incomplete living terrain cover bank");
  const sha256 = value?.hashes?.[runtime.atlas];
  if (typeof sha256 !== "string" || !/^[0-9a-f]{64}$/.test(sha256)) throw new Error("Missing living terrain atlas hash");
  return Object.freeze({ width: runtime.width, height: runtime.height, entries, sha256 });
}

const stableVariant = (seed, values) => {
  let hash = (seed ^ 2166136261) >>> 0;
  for (const value of values) hash = Math.imul(hash ^ (Number(value) | 0), 16777619) >>> 0;
  return hash % 3;
};

export async function loadLivingTerrainPack({
  manifestUrl = MANIFEST_URL,
  atlasUrl = ATLAS_URL,
  fetchImpl = fetch,
  decodeImage = createImageBitmap,
} = {}) {
  const manifestBytes = await bytes(fetchImpl, manifestUrl, MAX_MANIFEST_BYTES, "manifest");
  const manifest = parseLivingTerrainRuntimeManifest(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(manifestBytes)));
  const atlasBytes = await bytes(fetchImpl, atlasUrl, MAX_ATLAS_BYTES, "atlas");
  if (await digest(atlasBytes) !== manifest.sha256) throw new Error("Living terrain atlas failed its hash check");
  const bitmap = await decodeImage(new Blob([atlasBytes], { type: "image/png" }));
  if (bitmap.width !== manifest.width || bitmap.height !== manifest.height) {
    bitmap.close?.();
    throw new Error("Living terrain atlas has unexpected dimensions");
  }
  const texture = Texture.from(bitmap, true);
  texture.source.scaleMode = "nearest";
  let disposed = false;
  function frame(id) {
    if (disposed) throw new Error("Living terrain pack is disposed");
    const entry = manifest.entries.get(id);
    if (!entry) throw new Error(`Unknown living terrain frame: ${id}`);
    const left = entry.x / manifest.width, right = (entry.x + entry.width) / manifest.width;
    const top = entry.y / manifest.height, bottom = (entry.y + entry.height) / manifest.height;
    return { texture, uvs: [left, top, left, bottom, right, bottom, right, top], blendMode: "normal" };
  }
  return Object.freeze({
    body({ art, face, cell, seed = 0 }) {
      return frame(`body/${art}/${stableVariant(seed, cell)}/${face}`);
    },
    cover({ kind, condition, height, mask, root, seed = 0 }) {
      return frame(`cover/${kind}/${condition}/${height}/${stableVariant(seed, root)}/${mask}`);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      texture.destroy(true);
      bitmap.close?.();
    },
  });
}
