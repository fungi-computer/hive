// Original terrain art. Coordinates are ground metres; bit order NW, NE, SE, SW.
// Display patches sit between four physical cells and never redefine those cells.
import * as THREE from "three";
import { scene, mesh } from "./geometry.js";

const points = [
  [0, 0],
  [0.5, 0],
  [1, 0],
  [1, 0.5],
  [1, 1],
  [0.5, 1],
  [0, 1],
  [0, 0.5],
];
const outlines = [
  [],
  [[0, 1, 7]],
  [[2, 3, 1]],
  [[0, 2, 3, 7]],
  [[4, 5, 3]],
  [
    [0, 1, 7],
    [4, 5, 3],
  ],
  [[1, 2, 4, 5]],
  [[0, 2, 4, 5, 7]],
  [[6, 7, 5]],
  [[0, 1, 5, 6]],
  [
    [2, 3, 1],
    [6, 7, 5],
  ],
  [[0, 2, 3, 5, 6]],
  [[7, 3, 4, 6]],
  [[0, 1, 3, 4, 6]],
  [[1, 2, 4, 6, 7]],
  [[0, 2, 4, 6]],
];

export const TERRAIN_PALETTES = Object.freeze({
  grass: {
    base: "#948055",
    cover: "#778c47",
    flecks: ["#8f9e53", "#a7ad60", "#627b46"],
  },
  rock: {
    base: "#948055",
    cover: "#77786a",
    flecks: ["#92917a", "#626859", "#a4a087"],
  },
  damp: {
    base: "#948055",
    cover: "#645c42",
    flecks: ["#77734b", "#53583c", "#858052"],
  },
});

export function patchShapes(mask) {
  if (!Number.isInteger(mask) || mask < 0 || mask > 15)
    throw new Error("terrain mask must be 0..15");
  return outlines[mask].map((indices) => {
    const shape = new THREE.Shape();
    const [x, z] = points[indices[0]];
    shape.moveTo(x - 0.5, z - 0.5);
    for (let i = 1; i <= indices.length; i++) {
      const previous = indices[(i - 1) % indices.length],
        next = indices[i % indices.length];
      const [nx, nz] = points[next];
      // Only round the internal boundary. Shared outer edges remain exact.
      if (previous % 2 && next % 2 && Math.abs(previous - next) !== 4)
        shape.quadraticCurveTo(0, 0, nx - 0.5, nz - 0.5);
      else shape.lineTo(nx - 0.5, nz - 0.5);
    }
    shape.closePath();
    return shape;
  });
}

/** Shared deterministic flat emissions consumed by authoring and runtime bakes. */
export function terrainPatchEmissions(kind, mask, variant = 0) {
  const palette = TERRAIN_PALETTES[kind];
  if (!palette) throw new Error("unknown terrain palette");
  if (!Number.isInteger(variant) || variant < 0 || variant > 2) throw new Error("terrain variant must be 0..2");
  const emissions = patchShapes(mask).map((shape) => ({ color: palette.cover, vertices: shape.getPoints(12).map(({ x, y }) => [x, 0.001, y]) }));
  if (mask === 15) {
    const rng = random(1027 + variant * 93);
    for (let i = 0; i < (kind === "rock" ? 11 : 7); i++) {
      const x = (rng() - 0.5) * 0.94, z = (rng() - 0.5) * 0.94;
      emissions.push({ color: palette.flecks[i % 3], vertices: [[x - 0.04, 0.004, z - 0.02], [x + 0.04, 0.004, z - 0.02], [x + 0.04, 0.004, z + 0.02], [x - 0.04, 0.004, z + 0.02]] });
    }
  }
  return emissions;
}

export function cliffEmissions(kind, facing, variant = 0) {
  if (!["earth", "stone", "grass-lip"].includes(kind)) throw new Error("unknown cliff emission");
  if (!Number.isInteger(facing) || facing < 0 || facing > 3) throw new Error("invalid cliff facing");
  if (kind === "grass-lip") return [{ color: "#627b46", vertices: [[-0.5, 0, 0], [0.5, 0, 0], [0.5, -0.05, 0], [-0.5, -0.05, 0]] }, { color: "#8f9e53", vertices: [[-0.45, 0.01, 0], [-0.2, 0.01, 0], [-0.2, 0.04, 0], [-0.45, 0.04, 0]] }];
  const base = kind === "earth" ? "#806143" : "#676b60";
  return [{ color: base, vertices: [[-0.5, 0, 0], [0.5, 0, 0], [0.5, -0.54, 0], [-0.5, -0.54, 0]] }];
}

function surface(parent, shape, color, y) {
  const geometry = new THREE.ShapeGeometry(shape, 8);
  geometry.rotateX(Math.PI / 2);
  // Shape winding after X rotation faces down; rotate its triangles, not lighting.
  const index = geometry.index;
  for (let i = 0; i < index.count; i += 3) {
    const a = index.getX(i);
    index.setX(i, index.getX(i + 2));
    index.setX(i + 2, a);
  }
  geometry.computeVertexNormals();
  return mesh(parent, geometry, color, 0, y, 0);
}

function emissionMesh(parent, emission) {
  const points = [];
  for (let i = 1; i < emission.vertices.length - 1; i++)
    points.push(...emission.vertices[0], ...emission.vertices[i], ...emission.vertices[i + 1]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
  geometry.computeVertexNormals();
  return mesh(parent, geometry, emission.color, 0, 0, 0);
}

function random(seed) {
  let state = seed | 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) | 0;
    return (state >>> 0) / 4294967296;
  };
}

export function terrainBase(variant = 0) {
  const s = scene();
  surface(s, patchShapes(15)[0], "#948055", 0);
  const rng = random(218 + variant * 73);
  for (let i = 0; i < 5; i++)
    box(
      s,
      ["#99875c", "#8c7850"][i % 2],
      (rng() - 0.5) * 0.7,
      0.002,
      (rng() - 0.5) * 0.7,
      0.06 + rng() * 0.1,
      0.002,
      0.035 + rng() * 0.03,
    );
  return s;
}

export function terrainPatch(kind, mask, variant = 0) {
  const palette = TERRAIN_PALETTES[kind];
  if (!palette) throw new Error("unknown terrain palette");
  if (!Number.isInteger(variant) || variant < 0 || variant > 2)
    throw new Error("terrain variant must be 0..2");
  const s = scene();
  for (const emission of terrainPatchEmissions(kind, mask, variant)) emissionMesh(s, emission);
  return s;
}

// Face normal is +Z before rotation. Top is y=0; one voxel is .54 metres.
// Bare strata repeat vertically; the rooted grass lip is a separate optional part.
export function cliffPart(kind, facing, variant = 0) {
  if (!["earth", "stone", "grass-lip"].includes(kind))
    throw new Error("unknown cliff part");
  if (!Number.isInteger(facing) || facing < 0 || facing > 3)
    throw new Error("invalid cliff facing");
  const s = scene(),
    g = new THREE.Group();
  s.add(g);
  for (const emission of cliffEmissions(kind, facing, variant)) emissionMesh(g, emission);
  return s;
}
