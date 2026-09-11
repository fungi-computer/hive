// Original timber stair: four horizontal cells for a four-voxel storey.
// Local entrance (0,0,0), upper landing (0,STOREY_HEIGHT,4).
import { box, group } from "./geometry.js";
import { STOREY_HEIGHT } from "./scale.js";

const RUN = 4;
const slope = Math.atan2(STOREY_HEIGHT, RUN);

function incline(parent, color, x, width, thickness) {
  const beam = box(
    parent,
    color,
    x,
    STOREY_HEIGHT / 2 - (Math.cos(slope) * thickness) / 2,
    RUN / 2 + (Math.sin(slope) * thickness) / 2,
    width,
    thickness,
    Math.hypot(RUN, STOREY_HEIGHT),
  );
  beam.rotation.x = -slope;
  return beam;
}

function landing(parent, height, z) {
  for (let i = 0; i < 5; i++)
    box(
      parent,
      i % 2 ? "#b18a59" : "#bd9665",
      -0.34 + i * 0.17,
      height - 0.04,
      z,
      0.165,
      0.08,
      0.46,
    );
}

function side(parent, x) {
  for (const z of [0.08, RUN / 2, RUN + 0.18]) {
    const surface = Math.min(z / RUN, 1) * STOREY_HEIGHT;
    box(parent, "#8d6943", x, surface + 0.29, z, 0.085, 0.68, 0.085);
    box(parent, "#bd9665", x, surface + 0.64, z, 0.105, 0.045, 0.105);
  }
  const handrail = group(parent, 0, 0.64, 0);
  incline(handrail, "#bc945f", x, 0.085, 0.075);
  box(parent, "#bc945f", x, STOREY_HEIGHT + 0.6, RUN + 0.2, 0.085, 0.075, 0.4);
}

export function stair(parent, stage) {
  if (stage === "stakes") {
    for (const z of [0, 1, 2, 3, 4]) {
      for (const x of [-0.43, 0.43])
        box(parent, "#b49a65", x, 0.14, z, 0.075, 0.28, 0.075);
      box(parent, "#c6b783", 0, 0.14, z, 0.86, 0.018, 0.018);
    }
    for (const x of [-0.43, 0.43])
      box(parent, "#c6b783", x, 0.14, RUN / 2, 0.018, 0.018, RUN);
    return;
  }
  for (const x of [-0.43, 0.43]) {
    incline(parent, "#795838", x, 0.12, 0.17);
    box(
      parent,
      "#795838",
      x,
      STOREY_HEIGHT / 2,
      RUN + 0.2,
      0.12,
      STOREY_HEIGHT,
      0.12,
    );
  }
  for (const z of [0.18, RUN / 2, RUN - 0.18])
    box(
      parent,
      "#8d6943",
      0,
      (z / RUN) * STOREY_HEIGHT - 0.1,
      z,
      0.84,
      0.1,
      0.095,
    );
  if (stage === "frame") return;
  for (let i = 0; i < 5; i++)
    incline(
      parent,
      i % 2 ? "#b18a59" : "#bd9665",
      -0.34 + i * 0.17,
      0.165,
      0.075,
    );
  // Shallow cross-cleats read as treads; feet follow the continuous ramp plane.
  for (let i = 1; i < RUN / 0.2; i++) {
    const z = i * 0.2;
    const cleat = box(
      parent,
      "#cea875",
      0,
      (z / RUN) * STOREY_HEIGHT + 0.008,
      z,
      0.82,
      0.032,
      0.065,
    );
    cleat.rotation.x = -slope;
  }
  landing(parent, 0, -0.23);
  landing(parent, STOREY_HEIGHT, RUN + 0.23);
  for (const x of [-0.43, 0.43]) side(parent, x);
}
