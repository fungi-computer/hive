// Original content arrangement over the approved timber shelf and item meshes.
// This is a bounded visual profile, not physical inventory/capacity ownership.
import { box, cylinder, group, scene } from "./geometry.js";
import { shelf } from "./shelf.js";
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
  // Keep each cut face solid and broad: tiny concentric rings look like straw.
  cylinder(parent, "#65452e", 0, 0, 0, 0.162, 0.17, 0.49, 7)
    .rotation.x = Math.PI / 2;
  cylinder(parent, "#deb477", 0, 0, 0.25, 0.14, 0.14, 0.016, 7)
    .rotation.x = Math.PI / 2;
  box(parent, "#996d3d", 0.053, 0.053, 0.261, 0.023, 0.115, 0.006)
    .rotation.z = -0.65;
}

function stackedWood(parent, count, mixed) {
  const seats = mixed
    ? [[-0.19, 0.826], [-0.19, 1.102]]
    : count === 1
      ? [[0, 0.826]]
      : [[-0.17, 0.826], [0.17, 0.826], [0, 1.102]];
  for (const [x, y] of seats.slice(0, count)) {
    const holder = group(parent, x, y, 0.018);
    log(holder);
  }
}

function mixedHerbs(parent, count) {
  for (let index = 0; index < count; index++) {
    const holder = group(parent, 0.19, 0.65 + index * 0.16, 0.025);
    holder.scale.setScalar(0.72);
    mugwortBundle(holder);
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
  if (profile.wood > 0) {
    stackedWood(model, profile.wood, profile.herbs > 0);
    mixedHerbs(model, profile.herbs);
    return s;
  }
  for (let index = 0; index < profile.herbs; index++) {
    const scale = profile.herbs === 2 ? 0.78 : 0.61;
    const x = (index - (profile.herbs - 1) / 2) * (profile.herbs === 2 ? 0.39 : 0.26);
    const holder = group(model, x, 0.65, 0.025);
    holder.scale.setScalar(scale);
    mugwortBundle(holder);
  }
  return s;
}
