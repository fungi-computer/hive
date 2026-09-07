import { scene, box, cylinder, group } from "./geometry.js";

function timberFrame(s) {
  for (const x of [-0.82, 0.82])
    for (const z of [-0.8, 0.8]) {
      const h = z < 0 ? 1.72 : 1.15;
      box(s, "#80603c", x, h / 2, z, 0.13, h, 0.13);
      for (const dy of [-0.08, -0.03, 0.02])
        box(s, "#c5ad71", x, h + dy - 0.12, z, 0.15, 0.025, 0.15);
    }
  for (const z of [-0.8, 0.8])
    box(s, "#a17a49", 0, z < 0 ? 1.64 : 1.07, z, 1.95, 0.13, 0.15);
  for (const x of [-0.8, 0.8]) {
    const beam = box(s, "#ad8751", x, 1.38, 0, 0.13, 0.12, 1.92);
    beam.rotation.x = 0.342;
    const brace = box(s, "#8e693e", x, 0.92, 0.53, 0.09, 0.68, 0.11);
    brace.rotation.x = -0.65;
  }
}
export function shelter(stage) {
  const s = scene();
  // Small stakes and the actual committed timbers remain visible before work.
  if (stage === "stakes") {
    for (const x of [-0.86, 0.86])
      for (const z of [-0.86, 0.86])
        box(s, "#b59459", x, 0.17, z, 0.07, 0.34, 0.07);
    for (let i = 0; i < 6; i++) {
      const log = cylinder(
        s,
        "#ad8050",
        ((i % 3) - 1) * 0.18,
        0.1 + Math.floor(i / 3) * 0.15,
        0,
        0.09,
        0.09,
        1.3,
        7,
      );
      log.rotation.x = Math.PI / 2;
    }
    return s;
  }
  timberFrame(s);
  // A wooden platform and a low rear windbreak make the finished volume legible.
  for (let i = 0; i < 7; i++)
    box(
      s,
      i % 2 ? "#b38c52" : "#c19a61",
      0,
      0.085,
      -0.78 + i * 0.26,
      1.8,
      0.13,
      0.24,
    );
  if (stage === "frame") return s;
  for (let i = 0; i < 4; i++)
    box(
      s,
      i % 2 ? "#a27d48" : "#b68f53",
      0,
      0.25 + i * 0.21,
      -0.84,
      1.73,
      0.19,
      0.075,
    );
  const roof = group(s, 0, 1.47, 0);
  roof.rotation.x = 0.342;
  for (let i = 0; i < 9; i++) {
    box(
      roof,
      ["#c6a367", "#d0ad72", "#ba975a"][i % 3],
      -0.96 + i * 0.24,
      0,
      0,
      0.226,
      0.1,
      2.1,
    );
    for (const z of [-0.8, 0.8])
      box(roof, "#6a6040", -0.96 + i * 0.24, 0.056, z, 0.033, 0.015, 0.04);
  }
  for (const z of [-0.83, 0.83])
    box(roof, "#9b7a47", 0, 0.095, z, 2.22, 0.07, 0.08);
  return s;
}
