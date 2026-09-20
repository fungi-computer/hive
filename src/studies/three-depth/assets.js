import * as THREE from "three";
import { tree } from "../../art/clearing.js";
import { building } from "../../art/home.js";
import { figure } from "../../art/figures.js";

function moveGeometryOnly(source) {
  const root = new THREE.Group();
  for (const child of [...source.children]) if (!child.isLight) root.add(child);
  return root;
}

function disposeObject(root, geometries) {
  root.traverse(item => { if (item.geometry) geometries.add(item.geometry); });
}

export function createAssetBank() {
  const owned = new Set();
  const prototypes = new Map();
  const make = (key, factory) => {
    if (!prototypes.has(key)) {
      const source = factory();
      const root = moveGeometryOnly(source);
      disposeObject(root, owned);
      prototypes.set(key, root);
    }
    return prototypes.get(key).clone(true);
  };
  return {
    model(kind, direction = 0) {
      if (kind === "tree") return make("tree", () => tree("standing"));
      if (kind === "bed") return make(`bed:${direction}`, () => building("bed", "finished", direction));
      if (kind === "stair") return make(`stair:${direction}`, () => building("stair", "finished", direction));
      if (kind === "door") return make(`door:${direction}`, () => building("door", "finished", direction));
      throw new Error(`Unknown depth-study asset: ${kind}`);
    },
    actor(kind = "goblin", direction = 0) {
      const poses = [];
      for (let i = 0; i < 8; i++) poses.push(make(`actor:${kind}:${direction}:${i}`, () => figure(kind, i / 8, direction, "walk")));
      const root = new THREE.Group();
      poses.forEach((pose, i) => { pose.visible = i === 0; pose.userData.poseIndex = i; root.add(pose); });
      return root;
    },
    dispose() { for (const geometry of owned) geometry.dispose(); owned.clear(); prototypes.clear(); },
    inspect() { return { prototypes: prototypes.size, geometries: owned.size }; },
  };
}
