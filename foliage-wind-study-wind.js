import * as THREE from "three";
import { tree } from "./src/art/clearing.js";
import { scene } from "./src/art/geometry.js";

// Study adapter over the current original tree. A production join should pass
// the crown reference explicitly from its factory, never discover it at runtime.
export function windTree(stage, phase = 0) {
  const s = tree(stage);
  if (stage === "stump") return s;
  const crowns = s.children.filter((child) => child.isGroup);
  if (crowns.length !== 1 || crowns[0].children.length !== 6)
    throw new Error(
      "The accepted tree crown shape changed; review the adapter.",
    );
  const crown = crowns[0];
  crown.name = "wind-canopy";
  const wave = Math.sin(phase * Math.PI * 2);
  const ripple = Math.sin(phase * Math.PI * 4);
  for (const [index, clump] of crown.children.entries()) {
    const height = clump.position.y - 1.45;
    clump.position.x +=
      wave * 0.065 * height + ripple * 0.012 * (index % 2 ? 1 : -1);
    clump.position.z +=
      wave * 0.022 * height + ripple * 0.009 * ((index % 3) - 1);
  }
  return s;
}

const colors = ["#758947", "#8f9e53", "#a7ad60", "#627b46"];
const blades = [
  [-0.12, 0.02, 0.4, -0.95, 0.14],
  [0.12, 0.02, 0.39, 0.95, 0.14],
  [-0.045, -0.06, 0.51, -0.45, 0.13],
  [0.055, -0.055, 0.49, 0.5, 0.135],
  [0, 0.08, 0.57, 0.06, 0.15],
];

// Original tapered ribbons. Roots are fixed; curvature increases towards tips.
// Each fresh scene owns these materials; the study disposes them after baking.
export function grassClump(phase = 0) {
  const s = scene();
  const wave = Math.sin(phase * Math.PI * 2);
  const ripple = Math.sin(phase * Math.PI * 4);
  blades.forEach(([x, z, height, lean, width], index) => {
    const positions = [],
      indices = [];
    for (let segment = 0; segment <= 4; segment++) {
      const t = segment / 4,
        curvature = t * t;
      const tip = Math.pow(t, 1.6);
      const bend =
        lean * height * 0.33 * curvature +
        wave * 0.115 * curvature +
        ripple * 0.022 * tip * (index % 2 ? 1 : -1);
      const half = (width * Math.sin(Math.PI * (0.15 + 0.85 * t))) / 2;
      positions.push(x + bend - half, 0.015 + height * t, z + 0.05 * curvature);
      positions.push(x + bend + half, 0.015 + height * t, z + 0.05 * curvature);
      if (segment < 4) {
        const a = segment * 2;
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const material = new THREE.MeshLambertMaterial({
      color: colors[index % colors.length],
      side: THREE.DoubleSide,
      flatShading: true,
    });
    const blade = new THREE.Mesh(geometry, material);
    blade.name = `grass-blade-${index}`;
    s.add(blade);
  });
  s.userData.ownedMaterials = true;
  return s;
}
