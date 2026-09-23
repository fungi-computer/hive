// Original travel ration: coarse bread and a cheese wedge on folded linen.
// One geometry provider supplies loose goods and the carried meal.
import * as THREE from "three";
import { scene, group, box, ball, mesh } from "./geometry.js";

export function rationParcel(parent) {
  const parcel = group(parent);
  box(parcel, "#7e927a", 0, 0.035, 0, 0.46, 0.06, 0.34);
  const fold = box(parcel, "#bdc5a0", -0.19, 0.07, 0, 0.08, 0.045, 0.3);
  fold.rotation.z = 0.3;
  ball(parcel, "#a56e3e", -0.075, 0.15, 0.015, 0.17, 0.12, 0.135);
  ball(parcel, "#d7a960", -0.075, 0.185, 0.02, 0.135, 0.07, 0.105);
  for (const x of [-0.14, -0.055]) {
    const score = box(parcel, "#f2d29a", x, 0.244, 0.018, 0.022, 0.012, 0.11);
    score.rotation.y = -0.22;
  }
  const wedge = new THREE.Shape();
  wedge.moveTo(0, 0);
  wedge.lineTo(0.18, 0);
  wedge.lineTo(0.04, 0.17);
  wedge.closePath();
  const cheese = mesh(
    parcel,
    new THREE.ExtrudeGeometry(wedge, { depth: 0.07, bevelEnabled: false }),
    "#e4bf6c",
    0.075,
    0.15,
    0.085,
  );
  cheese.rotation.x = -Math.PI / 2;
  return parcel;
}

export function rationPile(amount) {
  const result = scene();
  const count = Math.min(3, amount);
  for (let i = 0; i < count; i++) {
    const parcel = rationParcel(result);
    parcel.position.set((i - (count - 1) / 2) * 0.15, i * 0.12, -i * 0.045);
    parcel.rotation.y = (i % 2 ? 1 : -1) * 0.15;
  }
  return result;
}
