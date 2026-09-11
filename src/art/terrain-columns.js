import { terrainFaces } from "./terrain-faces.js";
import * as THREE from "three";
import { scene, mesh } from "./geometry.js";

// Original clearing palette, shared by generated terrain and asset authoring.
const colours = { grass: "#758947", soil: "#9a744f", stone: "#777b68" };

/** Presentation geometry only. Inputs are already-authorized exterior surfaces.
 * Cell coordinates denote voxel centres; y is scaled by the supplied metric.
 * No world generation, groundwater, inventory or hidden cells live here.
 */
export function terrainColumnsScene(surfaces, { verticalMetres, soilMaterial = 1 } = {}) {
  if (!Number.isFinite(verticalMetres) || verticalMetres <= 0 ||
      !Array.isArray(surfaces) || surfaces.length > 4096)
    throw new Error("invalid terrain art input");
  const columns = new Map();
  for (const surface of surfaces) {
    if (!surface || !Array.isArray(surface.cell) || surface.cell.length !== 3 ||
        !surface.cell.every(Number.isSafeInteger) || !Number.isInteger(surface.material))
      throw new Error("invalid terrain art surface");
    const [x, , z] = surface.cell;
    const key = `${x},${z}`;
    if (columns.has(key)) throw new Error("duplicate terrain art column");
    columns.set(key, surface);
  }
  const result = scene();
  const buckets = new Map();
  function quad(colour, vertices) {
    let points = buckets.get(colour);
    if (!points) buckets.set(colour, points = []);
    for (const index of [0, 1, 2, 0, 2, 3]) points.push(...vertices[index]);
  }
  for (const face of terrainFaces(surfaces, verticalMetres)) {
    const soil = face.surface.material === soilMaterial;
    quad(soil ? face.top ? colours.grass : colours.soil : colours.stone, face.vertices);
  }
  for (const [colour, points] of buckets) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
    geometry.computeVertexNormals();
    mesh(result, geometry, colour, 0, 0, 0);
  }
  return result;
}
