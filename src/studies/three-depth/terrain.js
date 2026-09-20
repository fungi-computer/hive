import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { grassCover, terrainBody } from "../../art/living-terrain.js";
import { fixtureConstants } from "./fixture.js";

const { SCALE, CHUNK } = fixtureConstants;
const chunkKey = (x, z) => `${Math.floor(x / CHUNK)},${Math.floor(z / CHUNK)}`;

function addPickMetadata(root, target) {
  root.traverse(mesh => { if (mesh.isMesh) { mesh.userData.pickTarget = target; if (root.userData.batchKind) mesh.userData.batchKind = root.userData.batchKind; } });
}

function batchGroup(group) {
  group.updateMatrixWorld(true);
  const batches = new Map();
  const originals = [];
  group.traverse(mesh => {
    if (!mesh.isMesh || !mesh.material || Array.isArray(mesh.material)) return;
    originals.push(mesh);
    const bucketKey = `${mesh.userData.batchKind ?? "body"}:${mesh.material.uuid}`;
    if (!batches.has(bucketKey)) batches.set(bucketKey, { material: mesh.material, kind: mesh.userData.batchKind ?? "body", parts: [] });
    const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    geometry.applyMatrix4(mesh.matrixWorld);
    const target = mesh.userData.pickTarget;
    batches.get(bucketKey).parts.push({ geometry, target, triangles: geometry.getAttribute("position").count / 3 });
  });
  const merged = [];
  for (const { material, kind, parts } of batches.values()) {
    const ranges = []; let firstTriangle = 0;
    const geometry = mergeGeometries(parts.map(part => part.geometry));
    if (!geometry) throw new Error("Unable to merge terrain geometry");
    for (const part of parts) { ranges.push({ firstTriangle, triangleCount: part.triangles, target: part.target }); firstTriangle += part.triangles; part.geometry.dispose(); }
    const mesh = new THREE.Mesh(geometry, material); mesh.userData.batchKind = kind; mesh.userData.pickRanges = ranges;
    if (firstTriangle !== geometry.getAttribute("position").count / 3) throw new Error("Terrain pick range mismatch");
    merged.push(mesh);
  }
  for (const child of [...group.children]) child.removeFromParent();
  for (const source of originals) source.geometry.dispose();
  for (const mesh of merged) group.add(mesh);
  return merged;
}

function surfaceRoots(scene, cutLevel, findCell) {
  const roots = new Map();
  for (const surface of scene.cells) {
    if (!surface.grass || surface.y > cutLevel) continue;
    for (const [dx, dz] of [[0, 0], [-1, 0], [-1, -1], [0, -1]]) {
      const x = surface.x + dx, z = surface.z + dz;
      const cells = [[x, z], [x + 1, z], [x + 1, z + 1], [x, z + 1]].map(([cx, cz]) => findCell(cx, cz));
      const same = cells.filter(item => item && item.y === surface.y && item.grass && item.condition === surface.condition && item.height === surface.height);
      let mask = 0;
      cells.forEach((item, index) => { if (item && item.y === surface.y && item.grass && item.condition === surface.condition && item.height === surface.height) mask |= 1 << index; });
      if (mask) roots.set(`${x},${surface.y},${z},${surface.condition},${surface.height}`, { x, z, surface, mask, supports: same });
    }
  }
  return roots.values();
}

export function createTerrainOwner(sceneData) {
  let currentScene = sceneData, currentCut = null;
  let cellIndex = new Map();
  for (const item of currentScene.cells) { const key = `${item.x},${item.z}`; if (!cellIndex.has(key) || item.y > cellIndex.get(key).y) cellIndex.set(key, item); }
  const findCell = (x, z) => cellIndex.get(`${x},${z}`) ?? null;
  const root = new THREE.Group();
  const chunks = new Map();
  const stats = { builds: 0, evictions: 0, triangles: 0 };
  function disposeGroup(group) {
    group.traverse(item => { if (item.geometry) item.geometry.dispose(); });
    group.removeFromParent();
  }
  function buildChunk(cx, cz) {
    const key = `${cx},${cz}`;
    const group = new THREE.Group();
    group.name = `terrain-chunk:${key}`;
    const cut = currentCut ?? currentScene.bounds.maxY;
    for (const cell of currentScene.cells) {
      if (Math.floor(cell.x / CHUNK) !== cx || Math.floor(cell.z / CHUNK) !== cz || cell.y > cut) continue;
      const neighbors = [[1, 0, "east"], [-1, 0, "west"], [0, 1, "south"], [0, -1, "north"]];
      for (const [dx, dz, part] of neighbors) {
        const neighbor = findCell(cell.x + dx, cell.z + dz);
        if (neighbor && neighbor.y <= cut && neighbor.y >= cell.y) continue;
        const side = terrainBody({ kind: cell.kind, variant: cell.variant, part });
        side.position.set(cell.x, (cell.y + 0.5) * SCALE, cell.z);
        side.userData.batchKind = "body";
        addPickMetadata(side, { kind: "terrain", cell: [cell.x, cell.y, cell.z], face: part });
        group.add(side);
      }
      const top = terrainBody({ kind: cell.kind, variant: cell.variant, part: "top" });
      top.position.set(cell.x, (cell.y + 0.5) * SCALE, cell.z);
      top.userData.batchKind = "body";
      addPickMetadata(top, { kind: "terrain", cell: [cell.x, cell.y, cell.z], cap: cell.y === cut });
      group.add(top);
    }
    for (const patch of surfaceRoots(currentScene, cut, findCell)) {
      if (Math.floor(patch.x / CHUNK) !== cx || Math.floor(patch.z / CHUNK) !== cz) continue;
      const model = grassCover({ mask: patch.mask, variant: Math.abs(patch.x * 11 + patch.z * 7) % 3, height: patch.surface.height, condition: patch.surface.condition });
      model.position.set(patch.x + 0.5, (patch.surface.y + 0.5) * SCALE, patch.z + 0.5);
      model.userData.batchKind = "cover";
      addPickMetadata(model, { kind: "cover", cell: [patch.surface.x, patch.surface.y, patch.surface.z] });
      group.add(model);
    }
    batchGroup(group);
    group.userData.chunkKey = key;
    group.traverse(item => { if (item.isMesh) stats.triangles += (item.geometry.index?.count ?? item.geometry.getAttribute("position")?.count ?? 0) / 3; });
    stats.builds++;
    chunks.set(key, group); root.add(group);
    return group;
  }
  function rebuild() {
    for (const group of chunks.values()) disposeGroup(group);
    chunks.clear(); stats.triangles = 0;
    const keys = new Set(currentScene.cells.map(cell => chunkKey(cell.x, cell.z)));
    for (const patch of surfaceRoots(currentScene, currentCut ?? currentScene.bounds.maxY, findCell)) keys.add(chunkKey(patch.x, patch.z));
    for (const key of keys) { const [cx, cz] = key.split(",").map(Number); buildChunk(cx, cz); }
  }
  rebuild();
  return {
    root,
    setScene(value) { currentScene = value; cellIndex = new Map(); for (const item of currentScene.cells) { const key = `${item.x},${item.z}`; if (!cellIndex.has(key) || item.y > cellIndex.get(key).y) cellIndex.set(key, item); } rebuild(); },
    setCut(level) { if (currentCut === level) return; currentCut = level; rebuild(); },
    evictAll() { for (const group of chunks.values()) { disposeGroup(group); stats.evictions++; } chunks.clear(); },
    rebuild,
    getCut() { return currentCut; },
    inspect() { return { chunks: chunks.size, ...stats }; },
    dispose() { for (const group of chunks.values()) disposeGroup(group); chunks.clear(); },
  };
}
