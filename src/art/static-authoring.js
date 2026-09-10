import * as THREE from "three";
import { bakeArt } from "../art.js";
import { snapshotVisibleSilhouette } from "../visual-hit-geometry.js";
import {
  STATIC_ART_LIMITS,
  STATIC_ART_RENDER,
  STATIC_ART_SCHEMA,
  serializeSilhouette,
} from "./static-manifest.js";

const ATLAS_SIDE = STATIC_ART_LIMITS.pageSide;
const PADDING = 1;

function pathOrder(left, right) {
  const encodedLeft = JSON.stringify(left),
    encodedRight = JSON.stringify(right);
  return encodedLeft < encodedRight ? -1 : encodedLeft > encodedRight ? 1 : 0;
}

function collectTextures(root) {
  const entries = [];
  const visited = new Set();
  function collect(value, path) {
    if (!value || (typeof value !== "object" && typeof value !== "function"))
      return;
    if (value.isTexture) {
      entries.push({ path, texture: value });
      return;
    }
    if (visited.has(value)) return;
    visited.add(value);
    const children = Array.isArray(value)
      ? value.map((child, index) => [index, child])
      : Object.entries(value);
    for (const [key, child] of children) collect(child, [...path, key]);
  }
  collect(root, []);
  return entries.sort((left, right) => pathOrder(left.path, right.path));
}

function page(index) {
  if (index >= STATIC_ART_LIMITS.pages)
    throw new Error("Static art exceeds the atlas page limit");
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = ATLAS_SIDE;
  const context = canvas.getContext("2d", { willReadFrequently: false });
  if (!context) throw new Error("Static art atlas canvas is unavailable");
  context.imageSmoothingEnabled = false;
  return {
    id: `atlas-${index}`,
    file: `atlas-${index}.png`,
    width: ATLAS_SIDE,
    height: ATLAS_SIDE,
    canvas,
    context,
    x: PADDING,
    y: PADDING,
    rowHeight: 0,
  };
}

function place(current, width, height) {
  if (current.x + width + PADDING > current.width) {
    current.x = PADDING;
    current.y += current.rowHeight + PADDING;
    current.rowHeight = 0;
  }
  if (current.y + height + PADDING > current.height) return null;
  const result = { x: current.x, y: current.y };
  current.x += width + PADDING;
  current.rowHeight = Math.max(current.rowHeight, height);
  return result;
}

function textureCanvas(texture, label) {
  const resource = texture.source?.resource;
  if (!resource || typeof resource.getContext !== "function")
    throw new Error(`Static art ${label} is not backed by its baked canvas`);
  if (
    texture.frame.x !== 0 ||
    texture.frame.y !== 0 ||
    texture.frame.width !== resource.width ||
    texture.frame.height !== resource.height
  )
    throw new Error(`Static art ${label} has an unexpected source frame`);
  return resource;
}

function serializedSilhouette(texture, width, height) {
  const value = snapshotVisibleSilhouette(texture);
  if (value.width !== width || value.height !== height)
    throw new Error("Static art silhouette dimensions differ from its texture");
  return serializeSilhouette(value);
}

/** Bake the original bank once and arrange its exact final pixels for export. */
export async function createStaticArtDraft(onProgress = () => {}) {
  const art = await bakeArt(onProgress);
  try {
    const textures = collectTextures(art);
    const ground = textures.find(
      ({ path }) => path.length === 1 && path[0] === "ground",
    );
    if (
      !ground ||
      textures.filter(({ path }) => path[0] === "ground").length !== 1
    )
      throw new Error("Static art must contain one ground texture");
    const groundCanvas = textureCanvas(ground.texture, "ground");
    if (
      groundCanvas.width !== STATIC_ART_RENDER.ground.width ||
      groundCanvas.height !== STATIC_ART_RENDER.ground.height
    )
      throw new Error("Static art ground dimensions changed");

    const atlases = [page(0)],
      entries = [];
    for (const item of textures.filter(({ path }) => path[0] !== "ground")) {
      const canvas = textureCanvas(item.texture, JSON.stringify(item.path));
      let owner = atlases.at(-1),
        at = place(owner, canvas.width, canvas.height);
      if (!at) {
        owner = page(atlases.length);
        atlases.push(owner);
        at = place(owner, canvas.width, canvas.height);
      }
      if (!at) throw new Error("Static art frame exceeds an atlas page");
      owner.context.drawImage(canvas, at.x, at.y);
      entries.push({
        path: item.path,
        page: owner.id,
        x: at.x,
        y: at.y,
        width: canvas.width,
        height: canvas.height,
        silhouette: serializedSilhouette(
          item.texture,
          canvas.width,
          canvas.height,
        ),
      });
    }
    const draft = {
      schema: STATIC_ART_SCHEMA,
      textureCount: textures.length,
      anchors: {
        pawn: { ...art.pawnAnchor },
        prop: { ...art.propAnchor },
      },
      ground: {
        file: "ground.png",
        width: groundCanvas.width,
        height: groundCanvas.height,
        silhouette: serializedSilhouette(
          ground.texture,
          groundCanvas.width,
          groundCanvas.height,
        ),
      },
      pages: atlases.map(({ id, file, width, height }) => ({
        id,
        file,
        width,
        height,
      })),
      entries,
      provenance: {
        threeRevision: THREE.REVISION,
        renderer: { ...STATIC_ART_RENDER.renderer },
      },
    };
    return {
      draft,
      files: new Map([
        ["ground.png", groundCanvas],
        ...atlases.map(({ file, canvas }) => [file, canvas]),
      ]),
      dispose: art.dispose,
    };
  } catch (error) {
    art.dispose();
    throw error;
  }
}
