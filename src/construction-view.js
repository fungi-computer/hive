import { structureDepth } from "./visual-order.js";
import { Container, Graphics, Sprite, Text } from "pixi.js";
import { projectCell } from "./art/scale.js";
import { SIZE, placementOccupant } from "./world.js";
import {
  placementKey,
  insidePlacement,
  placementFooting,
  worldView,
} from "./game-space.ts";
import { visualPosition } from "./movement.ts";
import {
  BUILDINGS,
  footprint,
  buildingVisualPlacement,
  placementProblem,
  indoors,
  constructionBuffer,
  shelfContainer,
} from "./construction.js";
import { containerContents, containerQuantity } from "./materials.ts";
import { singlePlacementTool } from "./ui-actions.ts";
import { brewStationPresentation } from "./brew-station-presentation.js";
import { wallMask } from "./wall-appearance.js";

function shelfProfile(contents) {
  const wood = contents
    .filter((lot) => lot.material === "wood")
    .reduce((total, lot) => total + lot.quantity, 0);
  const herbs = contents
    .filter((lot) => lot.material === "mugwort")
    .reduce((total, lot) => total + lot.quantity, 0);
  if (!wood && !herbs) return "empty";
  const shownWood = Math.min(wood, herbs ? 2 : 3);
  const shownHerbs = Math.min(herbs, 3 - shownWood);
  return (
    {
      "0/1": "herb",
      "0/2": "two-herbs",
      "0/3": "three-herbs",
      "1/0": "wood",
      "2/0": "two-wood",
      "3/0": "three-wood",
      "1/1": "wood-herb",
      "2/1": "two-wood-herb",
      "1/2": "wood-two-herbs",
    }[`${shownWood}/${shownHerbs}`] ?? "wood"
  );
}
export function dragCells(start, end) {
  if (!start) return [end];
  const horizontal = Math.abs(end.x - start.x) >= Math.abs(end.z - start.z);
  const length = horizontal ? end.x - start.x : end.z - start.z;
  return Array.from(
    { length: Math.min(SIZE, Math.abs(length) + 1) },
    (_, i) => ({
      x: start.x + (horizontal ? Math.sign(length) * i : 0),
      z: start.z + (horizontal ? 0 : Math.sign(length) * i),
      level: start.level ?? 0,
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
    const p = projectCell(
      { x: cell.x + x, z: cell.z + z, level: cell.level },
      0.02,
    );
    return [p.x, p.y];
  });
  graphics
    .poly(points)
    .fill({ color, alpha })
    .stroke({ width: 1, color, alpha: Math.min(1, alpha + 0.25) });
}
export function createConstructionView(world, art, bodies, input, picking) {
  const grid = new Graphics(),
    bars = new Graphics(),
    ghostLayer = new Container(),
    herbPreview = new Graphics();
  grid.eventMode = bars.eventMode = ghostLayer.eventMode = "none";
  world.addChildAt(grid, 1);
  world.addChild(ghostLayer, bars);
  ghostLayer.addChild(herbPreview);
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
        picking.remove(view);
        view.destroy();
        sites.delete(id);
      }
    const followActors = (selection.followActorIds || ["rowan"])
      .map((id) => state.actors[id])
      .filter(Boolean);
    const interiors = new Map(
      [...new Set(followActors.map((actor) => worldView(actor).level))].map(
        (level) => [level, indoors(state, level)],
      ),
    );
    const indoorActors = followActors
      .map((actor) => ({
        footing: worldView(actor),
        position: worldView(visualPosition(actor)),
      }))
      .filter(({ footing }) =>
        interiors.get(footing.level)?.has(placementKey(footing)),
      );
    for (const site of state.sites) {
      if (!sites.has(site.id)) {
        const s = sprite(art.buildings[site.type].stakes[site.direction]);
        const target = {
          kind: "site",
          id: site.id,
          level: site.level,
          action: "inspect-site",
        };
        s.on("pointerdown", (event) => {
          if (!input.groundPointerOwns()) event.stopPropagation();
        });
        s.on("pointertap", (event) => {
          if (input.groundPointerOwns()) return;
          const dispatched = picking.recordFor(s)?.target;
          if (!dispatched) return;
          event.stopPropagation();
          input.site(dispatched.id, event.global);
        });
        s.on("rightclick", (event) => {
          if (input.groundPointerOwns()) return;
          const dispatched = picking.recordFor(s)?.target;
          if (!dispatched) return;
          event.stopPropagation();
          input.site(dispatched.id, event.global);
        });
        s.visualTarget = target;
        sites.set(site.id, s);
        bodies.addChild(s);
      }
      const view = sites.get(site.id),
        at = projectCell(buildingVisualPlacement(site)),
        finished = site.finishedAt !== null;
      const activeLevel = site.level === selection.level;
      const supportContext = site.level === selection.level - 1;
      const cutawayWall =
        site.type === "wall" &&
        selection.cutaway &&
        finished &&
        indoorActors.some(
          ({ position }) =>
            site.x + site.z >= position.x + position.z &&
            Math.abs(at.x - projectCell(position).x) < 45,
        );
      const cutawayCover =
        cutawayWall || (site.type === "roof" && selection.cutaway && finished);
      const contents = containerContents(
        state.materials,
        shelfContainer(site.id).id,
      );
      const profile = site.type === "shelf" ? shelfProfile(contents) : null;
      const station =
        site.type === "brew-station" && finished
          ? brewStationPresentation(state, site)
          : null;
      const delivered = containerQuantity(
        state.materials,
        constructionBuffer(site).id,
        "wood",
      );
      const stage = finished ? "finished" : site.work > 0 ? "frame" : "stakes";
      const jointMask =
        site.type === "wall" ? wallMask(site, state.sites) : null;
      const texture =
        jointMask !== null
          ? art.wallJoints[stage][jointMask]
          : profile && profile !== "empty"
            ? art.mixedShelf[profile][site.direction]
            : station && finished
              ? (() => {
                  const frames =
                    art.buildings[site.type].profiles[station.visualProfile][
                      site.direction
                    ];
                  return frames[Math.floor(state.tick / 2) % frames.length];
                })()
              : art.buildings[site.type][stage][site.direction];
      view.texture = texture;
      picking.bind(view, {
        texture,
        anchor: art.propAnchor,
        orientation: `${stage}:${site.direction}${jointMask === null ? "" : `:joint-${jointMask}`}${profile ? `:${profile}` : ""}${station ? `:${station.visualProfile}` : ""}`,
        target: { ...view.visualTarget, level: site.level },
      });
      view.visible = activeLevel || supportContext;
      view.position.set(at.x, at.y);
      view.eventMode =
        finished && activeLevel && !cutawayCover ? "static" : "none";
      view.cursor = finished ? "pointer" : "default";
      view.zIndex = structureDepth(site);
      view.waterOrderSite = site;
      view.alpha = !activeLevel
        ? site.type === "roof" || site.type === "floor"
          ? selection.cutaway
            ? 0.08
            : 0.2
          : 0.24
        : finished
          ? 1
          : delivered
            ? 0.85
            : 0.42;
      view.tint = finished || delivered ? 0xffffff : 0xc6e9dd;
      if (cutawayWall) view.alpha = 0.28;
      if (site.type === "roof" && selection.cutaway)
        view.alpha = finished ? 0.12 : 0.24;
      if (!finished) {
        for (const cell of footprint(site))
          tile(grid, cell, delivered ? 0xdfc486 : 0x9ccbc1, 0.12);
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
      if (selection.tool === "herb") {
        ghosts.forEach((ghost) => (ghost.visible = false));
        herbPreview.clear();
        const cell = selection.at;
        const problem =
          !cell ||
          !insidePlacement(cell) ||
          !!placementOccupant(state, placementFooting(cell));
        if (cell) tile(grid, cell, problem ? 0xe48b78 : 0xbee0aa, 0.3);
        if (cell) {
          const projected = projectCell(cell);
          herbPreview
            .moveTo(projected.x, projected.y)
            .lineTo(projected.x, projected.y - 17)
            .stroke({ width: 2, color: problem ? 0xe48b78 : 0xb7c77d });
          herbPreview.ellipse(projected.x, projected.y, 8, 4).fill({
            color: problem ? 0xe48b78 : 0x8cae7d,
            alpha: 0.35,
          });
          caption.text = problem
            ? "GROUND OCCUPIED"
            : "PLANT MUGWORT · RELEASE TO SOW";
          caption.position.set(
            Math.max(90, Math.min(550, projected.x)),
            Math.min(370, projected.y + 27),
          );
        }
        return;
      }
      herbPreview.clear();
      for (let x = 0; x < SIZE; x++)
        for (let z = 0; z < SIZE; z++)
          tile(grid, { x, z, level: selection.level }, 0xb3c696, 0.025);
      const cells = singlePlacementTool(selection.tool)
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
          projected = projectCell(buildingVisualPlacement(at));
        ghost.texture =
          art.buildings[selection.tool].finished[selection.direction];
        ghost.position.set(projected.x, projected.y);
        ghost.alpha = 0.45;
        ghost.tint = color;
      });
      const at = projectCell(selection.at);
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
