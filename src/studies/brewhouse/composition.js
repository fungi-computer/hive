import { group, box, ball, scene } from "../../art/geometry.js";
import { building } from "../../art/home.js";
import { figure } from "../../art/figures.js";
import { STOREY_HEIGHT } from "../../art/scale.js";
import { buildProp } from "./props.js";
import { shell } from "./shell.js";
import { BREWHOUSE } from "./template.js";
import { cutaway } from "./cutaway.js";

// Extract only model geometry from retained asset scenes; keep one scene light rig.
function attachModel(parent, source) {
  for (const child of [...source.children])
    if (!child.isLight) parent.add(child);
}
export function brewhouseScene(mode = "dollhouse", facing = 0, phase = 0) {
  const s = scene(),
    root = group(s);
  root.rotation.y = (facing * Math.PI) / 2;
  const cut = cutaway(mode, facing);
  shell(root, mode, facing);
  for (const prop of BREWHOUSE.props) {
    const [x, z, level] = prop.cell;
    if (level > 0 && cut.hidesUpper(x, z)) continue;
    const y =
      level * STOREY_HEIGHT +
      (mode === "exploded" && level > 0 ? 2.5 : 0) +
      (prop.height ?? 0);
    buildProp(
      prop.asset,
      group(root, x + (prop.offset?.[0] ?? 0), y, z + (prop.offset?.[1] ?? 0)),
    );
  }
  if (!cut.hidesUpper(-2, -1)) {
    const y = STOREY_HEIGHT + (mode === "exploded" ? 2.5 : 0);
    attachModel(group(root, -2, y, -1.2), building("bed", "finished", 0));
    // Plum runner, stitched border and copper dots beside the bed.
    box(root, "#715368", -0.9, y + 0.007, -0.4, 0.63, 0.012, 1.85);
    for (const z of [-1.25, 0.4])
      box(root, "#c4a56c", -0.9, y + 0.016, z, 0.59, 0.008, 0.045);
    attachModel(
      group(root, -2, y + 0.37, -0.2),
      figure("cat", phase, Math.PI / 2, "sleep"),
    );
  }
  attachModel(
    group(root, 0.1, 0, -0.65),
    figure("witch-runner", phase, Math.PI / 2, "idle"),
  );
  attachModel(
    group(root, 1.3, 0, 1.3),
    figure("rowan", phase, Math.PI, "idle"),
  );
  // Steam puffs are art-only, not proof of heat/gas/brewing completion.
  for (let i = 0; i < 5; i++) {
    const t = (phase + i * 0.19) % 1;
    const puff = ball(
      root,
      "#c1c8b2",
      -2 + Math.sin(i * 2.3 + t * 3) * 0.12,
      1.42 + t * 0.65,
      -1,
      0.07 + t * 0.065,
      0.05 + t * 0.045,
      0.06 + t * 0.04,
    );
    puff.visible = mode !== "exterior";
  }
  return s;
}
