// Original loft decking. The finished walking surface is exactly local y=0.
// Isolated art source; production integration remains with game-delivery.
import { box } from "./geometry.js";

function joists(parent) {
  for (const x of [-0.36, 0.36])
    box(parent, "#725437", x, -0.115, 0, 0.12, 0.15, 0.98);
  for (const z of [-0.41, 0.41])
    box(parent, "#947049", 0, -0.08, z, 0.98, 0.1, 0.1);
}

export function floor(parent, stage) {
  if (stage === "stakes") {
    for (const x of [-0.4, 0.4])
      for (const z of [-0.4, 0.4])
        box(parent, "#b49a65", x, -0.02, z, 0.065, 0.16, 0.065);
    for (const x of [-0.4, 0.4])
      box(parent, "#c6b783", x, 0.025, 0, 0.018, 0.018, 0.8);
    for (const z of [-0.4, 0.4])
      box(parent, "#c6b783", 0, 0.025, z, 0.8, 0.018, 0.018);
    return;
  }
  joists(parent);
  if (stage === "frame") return;
  for (let i = 0; i < 5; i++) {
    const x = -0.4 + i * 0.2;
    box(parent, i % 2 ? "#b18a59" : "#bd9665", x, -0.025, 0, 0.196, 0.05, 0.99);
    // Grain and nail heads are flush with the surface, never floating above it.
    box(
      parent,
      "#927047",
      x + 0.045,
      -0.0015,
      ((i % 3) - 1) * 0.15,
      0.012,
      0.003,
      0.43,
    );
    for (const z of [-0.39, 0.39])
      box(parent, "#66513d", x, -0.002, z, 0.028, 0.004, 0.028);
  }
}
