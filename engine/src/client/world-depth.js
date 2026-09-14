import { decodeDepth24 } from "../../../src/art/depth-image.js";

export const WORLD_DEPTH_ROLE_ORDER = Object.freeze({
  floor: 0,
  structure: 1,
  actor: 2,
  item: 3,
  terrain: 4,
});

function finite(value, at) {
  if (!Number.isFinite(value)) throw new Error(`invalid world depth ${at}`);
  return value;
}

function point3(value, at) {
  const point = Array.isArray(value) ? value : [value?.x, value?.y, value?.z];
  if (point.length !== 3) throw new Error(`invalid world depth ${at}`);
  return point.map((entry, index) => finite(entry, `${at}[${index}]`));
}

export function worldDepthBasis(towardCamera) {
  const point = point3(towardCamera, "camera basis");
  const length = Math.hypot(...point);
  if (!(length > 0)) throw new Error("invalid world depth camera basis");
  return Object.freeze(point.map((entry) => entry / length));
}

function depthRange(item) {
  const range = item.depthFrame?.depthRange;
  if (
    !range ||
    !Number.isFinite(range.min) ||
    !Number.isFinite(range.max) ||
    !(range.max > range.min)
  )
    throw new Error("invalid world depth range");
  return range;
}

function originDepth(item, basis) {
  const origin = point3(item.worldOrigin, "world origin");
  return origin[0] * basis[0] + origin[1] * basis[1] + origin[2] * basis[2];
}

export function worldDepthBounds(items, towardCamera, margin = 0.001) {
  const basis = worldDepthBasis(towardCamera);
  if (!Number.isFinite(margin) || margin < 0 || margin >= 0.5)
    throw new Error("invalid world depth margin");
  let nearDepth = -Infinity;
  let farDepth = Infinity;
  for (const item of items) {
    if (item.visible === false) continue;
    const range = depthRange(item);
    const origin = originDepth(item, basis);
    nearDepth = Math.max(nearDepth, origin + range.max);
    farDepth = Math.min(farDepth, origin + range.min);
  }
  if (!Number.isFinite(nearDepth) || !Number.isFinite(farDepth)) return null;
  const span = Math.max(nearDepth - farDepth, 1);
  return Object.freeze({
    basis,
    nearDepth: nearDepth + span * margin,
    farDepth: farDepth - span * margin,
  });
}

export function compareWorldDepthItems(
  left,
  right,
  roleOrder = WORLD_DEPTH_ROLE_ORDER,
) {
  const leftRole = roleOrder[left.physicalRole] ?? 100;
  const rightRole = roleOrder[right.physicalRole] ?? 100;
  return (
    leftRole - rightRole ||
    String(left.entityId).localeCompare(String(right.entityId)) ||
    String(left.visualPartId).localeCompare(String(right.visualPartId))
  );
}

function screenFrame(item) {
  const frame = item.depthFrame?.frame;
  const transform = item.screenTransform;
  const anchor = item.anchor;
  if (
    !frame ||
    !Number.isSafeInteger(frame.x) ||
    !Number.isSafeInteger(frame.y) ||
    !Number.isSafeInteger(frame.width) ||
    !Number.isSafeInteger(frame.height) ||
    frame.x < 0 ||
    frame.y < 0 ||
    frame.width <= 0 ||
    frame.height <= 0
  )
    throw new Error("invalid world depth frame");
  const scaleX = finite(transform?.scaleX ?? transform?.scale ?? 1, "scale x");
  const scaleY = finite(transform?.scaleY ?? transform?.scale ?? 1, "scale y");
  if (!(scaleX > 0) || !(scaleY > 0))
    throw new Error("invalid world depth scale");
  const x = finite(transform?.x, "screen x");
  const y = finite(transform?.y, "screen y");
  const anchorX = finite(anchor?.x, "anchor x");
  const anchorY = finite(anchor?.y, "anchor y");
  return {
    frame,
    x,
    y,
    scaleX,
    scaleY,
    left: x - anchorX * frame.width * scaleX,
    top: y - anchorY * frame.height * scaleY,
    right: x + (1 - anchorX) * frame.width * scaleX,
    bottom: y + (1 - anchorY) * frame.height * scaleY,
  };
}

function pixelDepth(item, screen, point, basis) {
  const localX = Math.floor((point.x - screen.left) / screen.scaleX);
  const localY = Math.floor((point.y - screen.top) / screen.scaleY);
  if (
    localX < 0 ||
    localY < 0 ||
    localX >= screen.frame.width ||
    localY >= screen.frame.height
  )
    return null;
  const atlasWidth = item.depthFrame.atlasWidth;
  const atlasHeight = item.depthFrame.atlasHeight;
  const pixels = item.depthFrame.pixels;
  if (
    !Number.isSafeInteger(atlasWidth) ||
    !Number.isSafeInteger(atlasHeight) ||
    atlasWidth <= 0 ||
    atlasHeight <= 0 ||
    !(pixels instanceof Uint8Array) ||
    pixels.length !== atlasWidth * atlasHeight * 4
  )
    throw new Error("invalid world depth pixels");
  const atlasX = screen.frame.x + localX;
  const atlasY = screen.frame.y + localY;
  if (atlasX >= atlasWidth || atlasY >= atlasHeight)
    throw new Error("world depth frame exceeds atlas");
  const offset = (atlasY * atlasWidth + atlasX) * 4;
  if (pixels[offset + 3] <= 128) return null;
  const range = depthRange(item);
  return (
    originDepth(item, basis) +
    range.min +
    decodeDepth24(pixels, offset) * (range.max - range.min)
  );
}

function bucketKey(x, y) {
  return `${x},${y}`;
}

/** Screen-space broad phase and exact depth sampler for the current draw list. */
export function createWorldDepthPicker({
  bucketSize = 64,
  roleOrder = WORLD_DEPTH_ROLE_ORDER,
} = {}) {
  if (!Number.isSafeInteger(bucketSize) || bucketSize < 8 || bucketSize > 512)
    throw new Error("invalid world depth bucket size");
  let buckets = new Map();
  let basis = null;

  function update(items, towardCamera) {
    const nextBasis = worldDepthBasis(towardCamera);
    const nextBuckets = new Map();
    for (const item of items) {
      if (item.visible === false) continue;
      const screen = screenFrame(item);
      const record = { item, screen };
      const minX = Math.floor(screen.left / bucketSize);
      const maxX = Math.floor((screen.right - Number.EPSILON) / bucketSize);
      const minY = Math.floor(screen.top / bucketSize);
      const maxY = Math.floor((screen.bottom - Number.EPSILON) / bucketSize);
      for (let y = minY; y <= maxY; y++)
        for (let x = minX; x <= maxX; x++) {
          const key = bucketKey(x, y);
          const bucket = nextBuckets.get(key);
          if (bucket) bucket.push(record);
          else nextBuckets.set(key, [record]);
        }
    }
    buckets = nextBuckets;
    basis = nextBasis;
  }

  function pick(point) {
    if (!basis) return null;
    const x = finite(point?.x, "pick x");
    const y = finite(point?.y, "pick y");
    const candidates = [];
    for (const record of buckets.get(
      bucketKey(Math.floor(x / bucketSize), Math.floor(y / bucketSize)),
    ) ?? []) {
      const depth = pixelDepth(record.item, record.screen, { x, y }, basis);
      if (depth !== null) candidates.push({ item: record.item, depth });
    }
    candidates.sort(
      (left, right) =>
        right.depth - left.depth ||
        compareWorldDepthItems(left.item, right.item, roleOrder),
    );
    const winner = candidates[0];
    return winner
      ? Object.freeze({
          entityId: winner.item.entityId,
          visualPartId: winner.item.visualPartId,
          depth: winner.depth,
          target: winner.item.pickable === false ? null : winner.item.entityId,
        })
      : null;
  }

  return Object.freeze({ update, pick, reset: () => update([], [1, 0, 0]) });
}
