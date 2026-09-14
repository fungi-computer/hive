import { Rectangle, Texture } from "pixi.js";
import { registerVisibleSilhouette } from "../visual-hit-geometry.js";
import {
  STATIC_ART_BASE,
  STATIC_ART_LIMITS,
  parseStaticArtManifest,
} from "./static-manifest.js";

const decoder = new TextDecoder("utf-8", { fatal: true });

function hex(bytes) {
  return [...new Uint8Array(bytes)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

async function digest(bytes) {
  return hex(await crypto.subtle.digest("SHA-256", bytes));
}

async function responseBytes(fetchImpl, url, maximum, label) {
  const response = await fetchImpl(url);
  if (!response.ok)
    throw new Error(`Static art ${label} unavailable (${response.status})`);
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maximum)
    throw new Error(`Static art ${label} exceeds its byte limit`);
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > maximum)
    throw new Error(`Static art ${label} exceeds its byte limit`);
  return bytes;
}

async function checkedPng(fetchImpl, decodeImage, base, definition) {
  const url = new URL(definition.file, base);
  if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname))
    throw new Error("Static art file escaped its asset directory");
  const bytes = await responseBytes(
    fetchImpl,
    url,
    STATIC_ART_LIMITS.pngBytes,
    definition.file,
  );
  if ((await digest(bytes)) !== definition.sha256)
    throw new Error(`Static art ${definition.file} failed its hash check`);
  const bitmap = await decodeImage(new Blob([bytes], { type: "image/png" }));
  if (
    bitmap.width !== definition.width ||
    bitmap.height !== definition.height
  ) {
    bitmap.close?.();
    throw new Error(`Static art ${definition.file} has unexpected dimensions`);
  }
  return bitmap;
}

function setTexture(root, path, texture) {
  let target = root;
  for (let index = 0; index < path.length - 1; index++) {
    const segment = path[index],
      next = path[index + 1],
      kind = typeof next === "number" ? [] : {};
    if (target[segment] === undefined) target[segment] = kind;
    target = target[segment];
  }
  target[path.at(-1)] = texture;
}

function textureFromBitmap(bitmap) {
  const texture = Texture.from(bitmap, true);
  texture.source.scaleMode = "nearest";
  return texture;
}

function closeBitmap(bitmap) {
  bitmap?.close?.();
}

async function decodeCpuPixels(bitmap) {
  const canvas =
    typeof OffscreenCanvas === "function"
      ? new OffscreenCanvas(bitmap.width, bitmap.height)
      : Object.assign(document.createElement("canvas"), {
          width: bitmap.width,
          height: bitmap.height,
        });
  if (!(canvas.width && canvas.height)) {
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
  }
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Static art CPU depth canvas is unavailable");
  context.imageSmoothingEnabled = false;
  context.drawImage(bitmap, 0, 0);
  return new Uint8Array(
    context.getImageData(0, 0, bitmap.width, bitmap.height).data,
  );
}

/**
 * Load one complete immutable static bank. Nothing is returned until every
 * checked image, frame and CPU silhouette has been assembled successfully.
 */
export async function loadStaticArtPack({
  baseUrl = STATIC_ART_BASE,
  fetchImpl = fetch,
  decodeImage = createImageBitmap,
  decodeDepthPixels = decodeCpuPixels,
  onProgress = () => {},
} = {}) {
  const base = new URL(baseUrl, document.baseURI);
  let manifest;
  try {
    onProgress({ detail: "Loading the art manifest", completedTextures: 0 });
    const manifestBytes = await responseBytes(
      fetchImpl,
      new URL("manifest.json", base),
      STATIC_ART_LIMITS.manifestBytes,
      "manifest",
    );
    manifest = parseStaticArtManifest(
      JSON.parse(decoder.decode(manifestBytes)),
    );
  } catch (error) {
    throw new Error("The checked static art pack could not load", {
      cause: error,
    });
  }

  const definitions = [
    manifest.ground,
    manifest.groundDepth,
    manifest.depth,
    ...manifest.pages,
  ];
  onProgress({ detail: "Loading the clearing art", completedTextures: 0 });
  const loaded = await Promise.allSettled(
    definitions.map((definition) =>
      checkedPng(fetchImpl, decodeImage, base, definition),
    ),
  );
  const failed = loaded.find((result) => result.status === "rejected");
  if (failed) {
    for (const result of loaded)
      if (result.status === "fulfilled") closeBitmap(result.value);
    throw new Error("The checked static art pack could not load", {
      cause: failed.reason,
    });
  }

  const bitmaps = loaded.map((result) => result.value),
    ownerTextures = [],
    frameTextures = [];
  let disposed = false;
  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const texture of frameTextures) texture.destroy(false);
    for (const texture of ownerTextures) texture.destroy(true);
    for (const bitmap of bitmaps) closeBitmap(bitmap);
  }

  try {
    const groundDepthPixels = decodeDepthPixels
      ? await decodeDepthPixels(bitmaps[1])
      : null;
    const depthPixels = decodeDepthPixels
      ? await decodeDepthPixels(bitmaps[2])
      : null;
    const ground = textureFromBitmap(bitmaps[0]);
    const groundDepth = textureFromBitmap(bitmaps[1]);
    const depth = textureFromBitmap(bitmaps[2]);
    ownerTextures.push(ground, groundDepth, depth);
    registerVisibleSilhouette(ground, {
      width: manifest.ground.width,
      height: manifest.ground.height,
      ...manifest.ground.silhouette,
    });
    const pageTextures = new Map();
    manifest.pages.forEach((page, index) => {
      const texture = textureFromBitmap(bitmaps[index + 3]);
      ownerTextures.push(texture);
      pageTextures.set(page.id, texture);
    });
    const art = {
      ground,
      groundDepth,
      depth,
      pawnAnchor: { ...manifest.anchors.pawn },
      propAnchor: { ...manifest.anchors.prop },
      vehicleAnchor: { ...manifest.anchors.vehicle },
    };
    for (const entry of manifest.entries) {
      const source = pageTextures.get(entry.page).source;
      const texture = new Texture({
        source,
        frame: new Rectangle(entry.x, entry.y, entry.width, entry.height),
      });
      frameTextures.push(texture);
      registerVisibleSilhouette(texture, {
        width: entry.width,
        height: entry.height,
        ...entry.silhouette,
      });
      setTexture(art, entry.path, texture);
    }
    onProgress({
      detail: "Clearing art ready",
      completedTextures: manifest.textureCount,
    });
    return { art, depthPixels, manifest, dispose };
  } catch (error) {
    dispose();
    throw new Error("The checked static art pack could not assemble", {
      cause: error,
    });
  }
}
