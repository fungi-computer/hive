import { hull } from "./plane-order.js";
import { snapshotVisibleSilhouette } from "../../../src/visual-hit-geometry.js";

const silhouettes = new WeakMap();

function textureHull(texture) {
  if (silhouettes.has(texture)) return silhouettes.get(texture);
  const { width, height, rows, spans } = snapshotVisibleSilhouette(texture);
  const points = [], rectangles = [];
  let previous = new Map();
  for (let y = 0; y < height; y++) {
    const next = new Map();
    for (let pair = rows[y]; pair < rows[y + 1]; pair++) {
      const left = spans[pair * 2], right = spans[pair * 2 + 1] + 1, key = `${left}:${right}`;
      const rectangle = previous.get(key) ?? { left, right, top: y, bottom: y };
      if (!previous.has(key)) rectangles.push(rectangle);
      rectangle.bottom = y + 1; next.set(key, rectangle);
    }
    previous = next;
    if (rows[y] === rows[y + 1]) continue;
    const left = spans[rows[y] * 2], right = spans[rows[y + 1] * 2 - 1] + 1;
    points.push({ x: left, y }, { x: right, y }, { x: left, y: y + 1 }, { x: right, y: y + 1 });
  }
  const value = { width, height, points: hull(points), rectangles: Object.freeze(rectangles.map(Object.freeze)) };
  silhouettes.set(texture, value);
  return value;
}

/** Baked metadata includes the view rotation. Undo only the camera turn;
 * physical facing is already present in the chosen frame. */
export function worldVisualVolume(metadata, origin, cameraTurn) {
  if (metadata?.kind !== "volume") throw new Error("checked asset ordering volume required");
  const angle = -cameraTurn * Math.PI / 2, c = Math.round(Math.cos(angle)), s = Math.round(Math.sin(angle));
  const points = [];
  for (const x of [metadata.min.x, metadata.max.x]) for (const z of [metadata.min.z, metadata.max.z])
    points.push({ x: origin.x + x * c + z * s, z: origin.z - x * s + z * c });
  return { kind: "volume", min: { x: Math.min(...points.map(p => p.x)), y: origin.y + metadata.min.y, z: Math.min(...points.map(p => p.z)) },
    max: { x: Math.max(...points.map(p => p.x)), y: origin.y + metadata.max.y, z: Math.max(...points.map(p => p.z)) } };
}

/** Upright 2.5D card through feet. Checked alpha includes the baked outline,
 * and is cached by immutable texture rather than reconstructed from meshes. */
export function uprightTextureGeometry(texture, anchor, screen, feet, projection) {
  const shape = textureHull(texture), normal = { x: projection.direction.x, z: projection.direction.z };
  const constant = normal.x * feet.x + normal.z * feet.z;
  const points = shape.points.map(pixel => {
    const { origin, direction } = projection.ray({ x: screen.x + pixel.x - anchor.x * shape.width,
      y: screen.y + pixel.y - anchor.y * shape.height });
    const distance = (constant - normal.x * origin.x - normal.z * origin.z) / (normal.x * direction.x + normal.z * direction.z);
    return { x: origin.x + distance * direction.x, y: origin.y + distance * direction.y, z: origin.z + distance * direction.z };
  });
  return { kind: "face", points, coverage: { rectangles: shape.rectangles,
    offset: { x: screen.x - anchor.x * shape.width, y: screen.y - anchor.y * shape.height } } };
}
