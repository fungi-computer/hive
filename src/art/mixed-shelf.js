// Original content arrangement over the approved timber shelf and item meshes.
// This is a bounded visual profile, not physical inventory/capacity ownership.
import { group, scene } from "./geometry.js";
import { shelf } from "./shelf.js";
import { woodPile } from "./home.js";
import { mugwortBundle } from "./herbs.js";

export const PROFILES = Object.freeze([
  { key: "empty", wood: 0, herbs: 0 },
  { key: "wood", wood: 1, herbs: 0 },
  { key: "herb", wood: 0, herbs: 1 },
  { key: "two-wood", wood: 2, herbs: 0 },
  { key: "wood-herb", wood: 1, herbs: 1 },
  { key: "two-herbs", wood: 0, herbs: 2 },
  { key: "three-wood", wood: 3, herbs: 0 },
  { key: "two-wood-herb", wood: 2, herbs: 1 },
  { key: "wood-two-herbs", wood: 1, herbs: 2 },
  { key: "three-herbs", wood: 0, herbs: 3 },
].map((profile) => Object.freeze(profile)));

function log(parent) {
  const source = woodPile(1);
  // Reuse actual approved log/end-grain meshes, removing only pile positioning.
  // Lighting stays with the destination scene. No second stock representation.
  for (const child of [...source.children]) {
    if (!child.isMesh) continue;
    child.position.x += 0.18;
    child.position.y -= 0.12;
    parent.add(child);
  }
}

export function mixedShelf(key, direction) {
  const profile = PROFILES.find((candidate) => candidate.key === key);
  if (!profile || ![0, 1].includes(direction))
    throw new Error("Unknown mixed-shelf visual profile or direction");
  const s = scene();
  const model = group(s);
  model.rotation.y = direction * Math.PI / 2;
  // Retain the exact approved single-bundle silhouette as a compatibility case.
  if (profile.wood === 0 && profile.herbs === 1) {
    shelf(model, "filled");
    return s;
  }
  shelf(model, "finished");
  const items = [
    ...Array(profile.wood).fill("wood"),
    ...Array(profile.herbs).fill("mugwort"),
  ];
  items.forEach((kind, index) => {
    const one = items.length === 1;
    const scale = one ? 1 : items.length === 2 ? 0.78 : 0.61;
    const x = one ? 0 : (index - (items.length - 1) / 2) * (items.length === 2 ? 0.39 : 0.26);
    const holder = group(model, x, kind === "wood" ? 0.67 + 0.09 * scale : 0.65, 0.025);
    holder.scale.setScalar(scale);
    if (one) holder.rotation.y = Math.PI / 2;
    if (kind === "wood") log(holder);
    else mugwortBundle(holder);
  });
  return s;
}
