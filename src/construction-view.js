import { Container, Graphics, Sprite, Text } from "pixi.js";
import { project } from "./art/scale.js";
import { SIZE, cellKey, neighbors } from "./world.js";
import {
  BUILDINGS,
  footprint,
  placementProblem,
  indoors,
} from "./construction.js";
export function dragCells(start, end) {
  if (!start) return [end];
  const horizontal = Math.abs(end.x - start.x) >= Math.abs(end.z - start.z);
  const length = horizontal ? end.x - start.x : end.z - start.z;
  return Array.from(
    { length: Math.min(SIZE, Math.abs(length) + 1) },
    (_, i) => ({
      x: start.x + (horizontal ? Math.sign(length) * i : 0),
      z: start.z + (horizontal ? 0 : Math.sign(length) * i),
      level: 0,
    }),
  );
}
function tile(graphics, cell, color, alpha) {
  const points = [
    [-0.5, -0.5],
    [0.5, -0.5],
    [0.5, 0.5],
    [-0.5, 0.5],
  ].flatMap(([x, z]) => {
    const p = project(cell.x + x, cell.z + z, 0.02);
    return [p.x, p.y];
  });
  graphics
    .poly(points)
    .fill({ color, alpha })
    .stroke({ width: 1, color, alpha: Math.min(1, alpha + 0.25) });
}
function wallMask(site, sites) {
  let mask = 0;
  neighbors(site).forEach((cell, index) => {
    if (
      sites.some(
        (s) =>
          (s.type === "wall" || s.type === "door") &&
          cellKey(s) === cellKey(cell),
      )
    )
      mask |= 1 << index;
  });
  return mask || (site.direction ? 10 : 5);
}
export function createConstructionView(world, art, bodies) {
  const grid = new Graphics(),
    bars = new Graphics(),
    ghostLayer = new Container();
  grid.eventMode = bars.eventMode = ghostLayer.eventMode = "none";
  world.addChildAt(grid, 1);
  world.addChild(ghostLayer, bars);
  const sites = new Map();
  const caption = new Text({
    text: "",
    style: { fontFamily: "sans-serif", fontSize: 8, fill: 0xf1dfab },
  });
  caption.anchor.set(0.5);
  caption.eventMode = "none";
  world.addChild(caption);
  let ghosts = [];
  function sprite(texture) {
    const s = new Sprite(texture);
    s.eventMode = "none";
    s.anchor.set(art.propAnchor.x, art.propAnchor.y);
    return s;
  }
  function drawSites(state, selection) {
    for (const [id, view] of sites)
      if (!state.sites.some((s) => s.id === id)) {
        view.destroy();
        sites.delete(id);
      }
    const pawnIndoors = indoors(state).has(cellKey(state.pawn));
    for (const site of state.sites) {
      if (!sites.has(site.id)) {
        const s = sprite(art.buildings[site.type].stakes[site.direction]);
        sites.set(site.id, s);
        bodies.addChild(s);
      }
      const view = sites.get(site.id),
        at = project(site.x, site.z),
        finished = site.finishedAt !== null;
      const stage = finished ? "finished" : site.work > 0 ? "frame" : "stakes";
      view.texture =
        site.type === "wall"
          ? art.wallJoints[stage][wallMask(site, state.sites)]
          : art.buildings[site.type][stage][site.direction];
      view.position.set(at.x, at.y);
      view.zIndex = site.x + site.z + (site.type === "roof" ? 50 : 0.15);
      view.alpha = finished ? 1 : site.delivered ? 0.85 : 0.42;
      view.tint = finished || site.delivered ? 0xffffff : 0xc6e9dd;
      if (
        site.type === "wall" &&
        selection.cutaway &&
        pawnIndoors &&
        finished &&
        site.x + site.z >= state.pawn.x + state.pawn.z &&
        Math.abs(at.x - project(state.pawn.x, state.pawn.z).x) < 45
      )
        view.alpha = 0.28;
      if (site.type === "roof" && selection.cutaway)
        view.alpha = finished ? 0.12 : 0.24;
      if (!finished) {
        for (const cell of footprint(site))
          tile(grid, cell, site.delivered ? 0xdfc486 : 0x9ccbc1, 0.12);
        bars.rect(at.x - 10, at.y + 7, 20, 3).fill(0x21362e);
        bars
          .rect(
            at.x - 10,
            at.y + 7,
            (20 * site.work) / BUILDINGS[site.type].ticks,
            2,
          )
          .fill(0xe0be74);
      }
    }
  }
  return {
    render(state, selection) {
      grid.clear();
      bars.clear();
      drawSites(state, selection);
      ghostLayer.visible = caption.visible = !!selection.tool;
      if (!selection.tool) return;
      for (let x = 0; x < SIZE; x++)
        for (let z = 0; z < SIZE; z++) tile(grid, { x, z }, 0xb3c696, 0.025);
      const cells =
        selection.tool === "bed"
          ? [selection.at]
          : dragCells(selection.drag, selection.at);
      while (ghosts.length < cells.length) {
        const s = sprite(art.buildings[selection.tool].finished[0]);
        ghostLayer.addChild(s);
        ghosts.push(s);
      }
      ghosts.forEach((s, i) => (s.visible = i < cells.length));
      let valid = 0;
      cells.forEach((cell, i) => {
        const at = {
          ...cell,
          type: selection.tool,
          direction: selection.direction,
        };
        const problem = placementProblem(state, at),
          color = problem ? 0xe48b78 : 0xbee0aa;
        if (!problem) valid++;
        for (const p of footprint(at)) tile(grid, p, color, 0.3);
        const ghost = ghosts[i],
          projected = project(cell.x, cell.z);
        ghost.texture =
          art.buildings[selection.tool].finished[selection.direction];
        ghost.position.set(projected.x, projected.y);
        ghost.alpha = 0.45;
        ghost.tint = color;
      });
      const at = project(selection.at.x, selection.at.z);
      caption.text = valid
        ? `${valid * BUILDINGS[selection.tool].wood} WOOD · RELEASE TO ORDER`
        : "FOOTPRINT OCCUPIED";
      caption.position.set(
        Math.max(90, Math.min(550, at.x)),
        Math.min(370, at.y + 27),
      );
    },
  };
}
