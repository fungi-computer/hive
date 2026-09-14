import { loadStaticArtPack } from "../../art/static-pack.js";
import { project, WORLD_TOWARD_CAMERA } from "../../../engine/src/client/geometry.js";
import { resolveWorldArtPlacement } from "../../../engine/src/client/art-placement.js";
import { subjectWorldDepthItem } from "../../../engine/src/client/world-depth-items.js";
import { createWorldDepthLayer } from "../../../engine/src/client/world-depth-layer.js";

function pathValue(root, path) {
  return path.reduce((value, segment) => value?.[segment], root);
}

function placementFor(art, texture, subjectPlacement, orientation) {
  const decoded = art.depthByTexture?.get(texture);
  const resolved = resolveWorldArtPlacement({
    subjectPlacement,
    artPlacement: decoded?.placement,
    orientation,
    decodedDepth: decoded,
  });
  return resolved.offset;
}

function item(art, id, path, world, screen, role, subjectPlacement = null, orientation = "north", pickable = true, extra = {}) {
  const texture = pathValue(art, path);
  if (!texture) throw new Error(`retained depth fixture missing ${JSON.stringify(path)}`);
  const placement = subjectPlacement
    ? { offset: placementFor(art, texture, subjectPlacement, orientation), screenOffset: [0, 0] }
    : undefined;
  return subjectWorldDepthItem({
    subject: { id, ...world, screen, pickable, ...extra },
    texture,
    anchor: art.propAnchor,
    art,
    scale: 1,
    physicalRole: role,
    placement,
  });
}

/**
 * Browser/WebGL2-only D3–D5 fixture. It loads the retained v4 bank, creates
 * the real paired DrawItems used by the world-depth owner, and returns the
 * render/pick/memory counters for the caller's acceptance receipt.
 */
export async function runRetainedWorldDepthAcceptance({ renderer, transparentContainer, width = 640, height = 400, load = loadStaticArtPack } = {}) {
  if (renderer?.name !== "webgl" || renderer.context?.webGLVersion !== 2)
    throw new Error("retained-world-depth-acceptance-requires-webgl2");
  const loaded = await load();
  const { art, manifest, dispose } = loaded;
  if (!transparentContainer) throw new Error("retained-world-depth-acceptance-requires-terrain-water-container");
  const layer = createWorldDepthLayer({ width, height });
  const center = { x: width / 2, y: height / 2 };
  const items = [
    item(art, "bed", ["buildings", "bed", "finished", 0], { x: 0, y: 0, z: 0 }, center, "structure", { kind: "footprint", footprint: [[0, 0], [0, 1]], orientation: "north" }),
    item(art, "brewer", ["buildings", "brew-station", "finished", 0], { x: 0, y: 0, z: 0 }, center, "structure", { kind: "footprint", footprint: [[0, 0], [1, 0], [0, 1], [1, 1]], orientation: "north" }),
    item(art, "stair-bottom", ["buildings", "stair", "finished", 0], { x: -1, y: 0, z: 0 }, { x: center.x - 36, y: center.y }, "structure", { kind: "stair", entrance: [0, 0, 0], landing: [0, 2.16, 2], orientation: "north" }),
    item(art, "stair-mid", ["buildings", "stair", "finished", 1], { x: 0, y: 4, z: 0 }, { x: center.x, y: center.y }, "structure", { kind: "stair", entrance: [0, 0, 0], landing: [0, 2.16, 2], orientation: "east" }),
    item(art, "stair-landing", ["buildings", "stair", "finished", 2], { x: 1, y: 8, z: 0 }, { x: center.x + 36, y: center.y }, "structure", { kind: "stair", entrance: [0, 0, 0], landing: [0, 2.16, 2], orientation: "south" }),
    item(art, "person", ["figures", "rowan", "idle", 0, 0], { x: 0, y: 0, z: 0 }, center, "actor"),
    item(art, "opaque-wall", ["buildings", "wall", "finished", 0], { x: 0, y: 0, z: 0 }, center, "structure", null, "north", false),
    item(art, "upper-hidden", ["buildings", "bed", "finished", 1], { x: 0, y: 4, z: 0 }, center, "structure", { kind: "footprint", footprint: [[0, 0], [0, 1]], orientation: "north" }, "north", false, { visible: false }),
  ];
  const started = performance.now();
  const orders = [items, [...items].reverse()];
  const outputs = [];
  for (const order of orders) {
    layer.update(order, WORLD_TOWARD_CAMERA);
    layer.render(renderer);
    layer.renderTransparent(renderer, transparentContainer);
    outputs.push(layer.picker.pick(center));
  }
  const elapsedMs = performance.now() - started;
  const atlasBytes = manifest.pages.reduce((sum, page) => sum + page.width * page.height * 4, 0) + manifest.depthPages.reduce((sum, page) => sum + page.width * page.height * 4, 0);
  const result = Object.freeze({
    status: "rendered",
    permutationStable: outputs[0]?.entityId === outputs[1]?.entityId,
    picked: outputs.map((value) => value?.entityId ?? null),
    candidates: items.length,
    atlasBytes,
    frameMs: elapsedMs,
    retainedEntries: manifest.entries.length,
  });
  layer.dispose();
  dispose();
  return result;
}
