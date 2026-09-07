import { Container, Graphics, Sprite, Text } from "pixi.js";
import { project } from "./art.js";
import { blockedCells } from "./clearing.js";
import { footprint, placementProblem, BUILD_TICKS } from "./construction.js";

function tile(graphics, cell, color, alpha) {
  const points = [
    [-0.5, -0.5],
    [0.5, -0.5],
    [0.5, 0.5],
    [-0.5, 0.5],
  ].flatMap(([x, z]) => {
    const p = project(cell.x + x, cell.z + z, 0.025);
    return [p.x, p.y];
  });
  graphics
    .poly(points)
    .fill({ color, alpha })
    .stroke({ width: 1, color, alpha: Math.min(1, alpha + 0.3) });
}
function centeredSprite(texture, art) {
  const sprite = new Sprite(texture);
  sprite.anchor.set(art.treeAnchor.x, art.treeAnchor.y);
  return sprite;
}
export function createConstructionView(app, art, bodies) {
  const ground = new Graphics(),
    progress = new Graphics();
  app.stage.addChildAt(ground, 2);
  const preview = new Container(),
    ghost = centeredSprite(art.shelter.finished, art);
  ghost.alpha = 0.42;
  const label = new Text({
    text: "2 × 2 · 6 WOOD",
    style: {
      fontFamily: "sans-serif",
      fontSize: 7,
      fill: 0xf2dfac,
      align: "center",
    },
  });
  label.anchor.set(0.5);
  label.y = 15;
  const caption = new Graphics();
  preview.addChild(ghost, caption, label);
  app.stage.addChild(preview, progress);
  const sites = new Map();
  function renderSites(state) {
    for (const [id, sprite] of sites)
      if (!state.shelters.some((site) => site.id === id)) {
        sprite.destroy();
        sites.delete(id);
      }
    for (const site of state.shelters) {
      if (!sites.has(site.id)) {
        const sprite = centeredSprite(art.shelter.stakes, art);
        sites.set(site.id, sprite);
        bodies.addChild(sprite);
      }
      const sprite = sites.get(site.id),
        at = project(site.x + 0.5, site.z + 0.5);
      sprite.position.set(at.x, at.y);
      sprite.zIndex = at.y;
      sprite.texture =
        art.shelter[
          site.finishedAt !== null
            ? "finished"
            : site.work >= BUILD_TICKS * 0.3
              ? "frame"
              : "stakes"
        ];
      if (site.finishedAt !== null) continue;
      for (const cell of footprint(site)) tile(ground, cell, 0xe0c888, 0.12);
      progress.roundRect(at.x - 23, at.y - 57, 46, 5, 1).fill(0x24392d);
      progress
        .rect(at.x - 22, at.y - 56, (44 * site.work) / BUILD_TICKS, 3)
        .fill(0xefcc7d);
    }
  }
  return {
    render(state, selection) {
      ground.clear();
      progress.clear();
      renderSites(state);
      preview.visible = selection.placing;
      if (!selection.placing) return;
      for (let x = 0; x < 7; x++)
        for (let z = 0; z < 7; z++) tile(ground, { x, z }, 0xbacd96, 0.025);
      const problem = placementProblem(
          state,
          selection.at,
          blockedCells(state),
        ),
        color = problem ? 0xee8c77 : 0xb4d993;
      for (const cell of footprint(selection.at))
        tile(ground, cell, color, 0.42);
      const at = project(selection.at.x + 0.5, selection.at.z + 0.5);
      preview.position.set(at.x, at.y);
      ghost.tint = problem ? 0xe69778 : 0xdcf5b1;
      label.text = problem
        ? "CAN'T BUILD HERE"
        : "2 × 2 · 6 WOOD · CLICK TO BUILD";
      caption
        .clear()
        .roundRect(-label.width / 2 - 6, 8, label.width + 12, 14, 2)
        .fill({ color: 0x21372b, alpha: 0.96 })
        .stroke({ width: 1, color });
    },
  };
}
