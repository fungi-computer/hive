import { hull } from "./plane-order.js";
import { snapshotVisibleSilhouette } from "../../../src/visual-hit-geometry.js";

const silhouettes = new WeakMap();
const imageShapes = new WeakMap();
const viewNormals = new WeakMap();

function textureHull(texture) {
  if (silhouettes.has(texture)) return silhouettes.get(texture);
  const value = silhouetteShape(snapshotVisibleSilhouette(texture));
  silhouettes.set(texture, value);
  return value;
}

function silhouetteShape(silhouette) {
  if (imageShapes.has(silhouette)) return imageShapes.get(silhouette);
  const { width, height, rows, spans } = silhouette;
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
  const value = Object.freeze({ width, height,
    points: Object.freeze(hull(points).map(Object.freeze)),
    rectangles: Object.freeze(rectangles.map(Object.freeze)) });
  imageShapes.set(silhouette, value);
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
  return uprightShapeGeometry(textureHull(texture), anchor, screen, feet, projection);
}

/** Atlas frames share a source texture; their checked silhouette owns the ink. */
export function uprightImageGeometry(hitArea, screen, feet, projection) {
  return uprightShapeGeometry(silhouetteShape(hitArea.silhouette), hitArea.anchor, screen, feet, projection);
}

function uprightShapeGeometry(shape, anchor, screen, feet, projection) {
  const direction = projection.direction, length = Math.hypot(direction.x, direction.z);
  if (!(length > 0) || ![length, feet.x, feet.z, screen.x, screen.y, anchor.x, anchor.y].every(Number.isFinite))
    throw new Error("upright card requires finite placement and horizontal view direction");
  // Every picture in this view shares exactly the same canonical plane normal.
  // Its immutable ink stays in pixel coordinates; no per-vertex ray lifting or
  // reprojection is needed to discover overlap or compare depth.
  let normal = viewNormals.get(projection);
  if (!normal) {
    normal = Object.freeze({ x: direction.x / length, y: 0, z: direction.z / length });
    viewNormals.set(projection, normal);
  }
  return Object.freeze({ kind: "card", shape,
    offset: Object.freeze({ x: screen.x - anchor.x * shape.width, y: screen.y - anchor.y * shape.height }),
    plane: Object.freeze({ normal, constant: normal.x * feet.x + normal.z * feet.z }) });
}
