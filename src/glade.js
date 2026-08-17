// glade.js — the WORLDBOX RENDER layer: 12–16px tiny bodies on a painted god-view
// world (Worldbox scale-dissonance, RULING 4). A read-only projection of
// derived(world) every frame; the fixed-step ticker drives ONLY animation
// (soul-loops + the chop montage) — it NEVER calls advanceWorld. World state
// moves only on COMPLETED days (main.js).
//
// Reuses the POC's pixi v8 discipline verbatim: pooled containers, the
// assets.js tile seam (UNTOUCHED — tileUrl when a manifest maps a tile, honest
// painted fallbacks until then), Graphics for ground/fx, y-sort, maxFPS cap.

import { Application, Sprite, Graphics, Container } from "pixi.js";
import { TILES, tileUrl } from "./assets.js";
import { GRID, TILE, STACK, SLOP, POPULATION } from "./tables.js";

export const WIDTH = GRID.W * GRID.TILE;  // 768
export const HEIGHT = GRID.H * GRID.TILE; // 480

const TILE_COLORS = {
  [TILE.water]: 0x3e8fb5,
  [TILE.grass]: 0x5c9e4f,
  [TILE.dirt]: 0x8a6b3f,
  [TILE.path]: 0xb8a173,
  [TILE.rock]: 0x6f7280,
  [TILE.weed]: 0x5c9e4f, // weeds drawn as tufts above the green
};

const TIER_TINT = {
  paradise: { color: 0xffd98c, alpha: 0.06 },
  thriving: { color: 0xffcf6a, alpha: 0.04 },
  steady: { color: 0xffffff, alpha: 0 },
  strained: { color: 0x9aa8a0, alpha: 0.10 },
  overgrown: { color: 0x64726a, alpha: 0.22 },
};

const VILLAGER_COLORS = [0xff5b4d, 0x4da6ff, 0xffd23f, 0xb06aff, 0xff8c3b, 0x3fe0d0, 0x8fe0a0, 0xff9ecb];
const GLANCE_SEC = 0.4; // the verdict's glance: 4-frame head-rotate (~half second), idle-only

const WALK_T = 0.9, CHOP_T = 1.3, FALL_T = 0.45, BACK_T = 0.7, POP_T = 0.55;

const ease = (k) => k * k * (3 - 2 * k);

// ---------------------------------------------------------------- builders
function buildGround(grid) {
  const g = new Graphics();
  for (let r = 0; r < GRID.H; r++) {
    for (let c = 0; c < GRID.W; c++) {
      const v = grid[r * GRID.W + c];
      // subtle 2-tone checker so the painted god-view reads at 8px tiles
      const tone = ((c + r) & 1) ? (TILE_COLORS[v] ?? 0x5c9e4f) : shadeTile(TILE_COLORS[v] ?? 0x5c9e4f);
      g.rect(c * GRID.TILE, r * GRID.TILE, GRID.TILE + 0.25, GRID.TILE + 0.25).fill({ color: tone });
    }
  }
  return g;
}
function shadeTile(c) {
  // darken/lighten every other tile by a fixed step — pure arithmetic, no RNG
  const r = ((c >> 16) & 0xff) - 6, g2 = ((c >> 8) & 0xff) - 6, b = (c & 0xff) - 6;
  return (Math.max(0, r) << 16) | (Math.max(0, g2) << 8) | Math.max(0, b);
}

function redrawWeeds(gr, grid) {
  gr.clear();
  for (let r = 0; r < GRID.H; r++) {
    for (let c = 0; c < GRID.W; c++) {
      if (grid[r * GRID.W + c] === TILE.weed) {
        const x = c * GRID.TILE, y = r * GRID.TILE;
        gr.rect(x + 1, y + 2, 1, 2).fill({ color: 0x4f8a44 });
        gr.rect(x + 4, y + 3, 1, 3).fill({ color: 0x5aa34e });
        gr.rect(x + 6, y + 2, 1, 2).fill({ color: 0x63a855 });
      }
    }
  }
}

// cheap full-grid hash: weeds redraw only when the pattern actually changed
function weedKey(grid) {
  let k = 5381;
  for (let i = 0; i < grid.length; i++) k = ((k << 5) + k + grid[i]) >>> 0;
  return k;
}

function buildTreeView(parent, x, y) {
  const c = new Container();
  c.position.set(x, y);
  const shadow = new Graphics();
  shadow.ellipse(0, 4, 4, 1.6).fill({ color: 0x000000, alpha: 0.22 });
  const standing = new Graphics();
  standing.rect(-1, -2, 2, 5).fill({ color: 0x6b4226 });   // trunk
  standing.circle(0, -6, 5).fill({ color: 0x155c31 });     // canopy ~10px wide
  standing.circle(-2, -7.5, 2).fill({ color: 0x1d7439 });
  const stump = new Graphics();
  stump.rect(-2, -2, 4, 3).fill({ color: 0x8a5a33 });
  stump.ellipse(0, -2, 3, 1.5).fill({ color: 0xc9a06b });
  const sapling = new Graphics();
  sapling.rect(-0.5, -0.5, 1, 3).fill({ color: 0x6b4226 });
  sapling.circle(0, -3, 2.5).fill({ color: 0x4c944c });
  c.addChild(shadow, standing, stump, sapling);
  c._v = { standing, stump, sapling, shadow };
  parent.addChild(c);
  return c;
}

function buildPile(parent, x, y) {
  const c = new Container();
  c.position.set(x, y);
  const base = new Graphics();
  base.ellipse(0, 4, 13, 3).fill({ color: 0x000000, alpha: 0.25 });
  c.addChild(base);
  const slots = [];
  for (let i = 0; i < STACK.pool; i++) {
    const s = new Container();
    let vis;
    const url = tileUrl(TILES.woodLog);
    if (url) {
      const sp = new Sprite(url);
      sp.anchor.set(0.5, 0.9);
      sp.scale.set(0.65, 0.65); // small sticks at the ant scale
      vis = sp;
    } else {
      const g = new Graphics();
      g.roundRect(-STACK.perLog.w / 2, -STACK.perLog.h, STACK.perLog.w, STACK.perLog.h, 1).fill({ color: 0x8a5a33 });
      g.rect(-STACK.perLog.w / 2 + 1, -STACK.perLog.h * 0.7, 2, 1).fill({ color: 0xc9a06b });
      vis = g;
    }
    s.addChild(vis);
    s.visible = false;
    c.addChild(s);
    slots.push(s);
  }
  c._slots = slots;
  c._base = base;
  parent.addChild(c);
  return c;
}

// deterministic arrangement: the COUNT is truth, the SLOP is dress (tier-scaled)
function stackPos(i, slop) {
  const col = i % 2, row = Math.floor(i / 2);
  const wob = slop * (i % 3) - slop;
  return { x: (col - 0.5) * 7 + wob, y: -row * 4 - 1 + (col ? slop : 0), rot: slop ? (i % 2 ? 1 : -1) * slop * 0.06 : 0 };
}

function buildDen(parent, x, y) {
  // a small hut so the ant-crowd anchors — scenery at the new scale
  const c = new Container();
  c.position.set(x, y);
  const shadow = new Graphics();
  shadow.ellipse(0, 4, 6, 2).fill({ color: 0x000000, alpha: 0.25 });
  const hut = new Graphics();
  hut.rect(-5, -3, 10, 7).fill({ color: 0x90433a });   // walls
  hut.rect(-6, -5, 12, 2).fill({ color: 0x6b3b2f });   // roof
  hut.rect(-1.5, -1, 3, 4).fill({ color: 0xffd23f });   // lit door
  c.addChild(shadow, hut);
  c._vis = hut;
  parent.addChild(c);
  return c;
}

// 6–8px ant-class bodies (Levi's exact scale), varied per guy; `_bscale` keeps the
// variation through montage poses (chop squash, walk etc. must not flatten it).
function buildVillager(parent, color, idx) {
  const c = new Container();
  const shadow = new Graphics();
  shadow.ellipse(0, 3, 2.4, 1).fill({ color: 0x000000, alpha: 0.28 });
  c.addChild(shadow);
  const g = new Graphics();
  g.rect(-1.2, -1.5, 2.4, 2.6).fill({ color });              // body
  g.rect(-1.1, 1.1, 1, 2).fill({ color: 0x2b2b2b });        // legs
  g.rect(0.1, 1.1, 1, 2).fill({ color: 0x2b2b2b });
  g.circle(0, -2.6, 1.3).fill({ color: 0xf2cf9f });         // head
  const antScale = 0.7 + 0.15 * (idx % 3); // ~6–8px class, varied: 0.7 / 0.85 / 1.0
  g.scale.set(antScale, antScale);
  c.addChild(g);
  c._vis = g;
  c._bscale = antScale;
  c._shadow = shadow;
  c.visible = false;
  parent.addChild(c);
  return c;
}

// ---------------------------------------------------------------- boot
export async function createGlade(parent) {
  const app = new Application();
  await app.init({
    width: WIDTH,
    height: HEIGHT,
    background: 0x2f6b3f,
    antialias: false,
    resolution: Math.min(globalThis.devicePixelRatio || 1, 2),
  });
  app.ticker.maxFPS = 60;
  parent.prepend(app.canvas);

  const layers = {};
  for (const name of ["ground", "weeds", "trees", "bodies", "fx", "tint"]) {
    layers[name] = new Container();
    app.stage.addChild(layers[name]);
  }

  return {
    app,
    layers,
    ground: null,
    weedG: null,
    weedKey: -1,
    treeViews: [],
    villagerViews: [],
    pileView: null,
    tintView: null,
    fxLive: new Map(),
    fxSeq: 0,
    montage: null, // { phase, t, treeIdx, treeId, from, to, actorIdx }
    busy: false,
  };
}

export function initWorld(glade, world) {
  if (glade.ground) return;
  glade.ground = buildGround(world.grid);
  glade.layers.ground.addChild(glade.ground);
  glade.weedG = new Graphics();
  glade.layers.weeds.addChild(glade.weedG);
  glade.weedKey = -1;
  for (const t of world.trees) glade.treeViews.push(buildTreeView(glade.layers.trees, t.x, t.y));
  glade.pileView = buildPile(glade.layers.trees, world.pile.x, world.pile.y);
  glade.denView = buildDen(glade.layers.trees, world.den.x, world.den.y);
  for (let i = 0; i < 10; i++) glade.villagerViews.push(buildVillager(glade.layers.bodies, VILLAGER_COLORS[i % VILLAGER_COLORS.length], i));
  const tg = new Graphics();
  tg.rect(0, 0, WIDTH, HEIGHT).fill(0xffffff);
  tg.alpha = 0;
  glade.layers.tint.addChild(tg);
  glade.tintView = tg;
}

// ---------------------------------------------------------------- montage (theater on truth)
// The sim state (stumps, pile count) is correct from the first paint; the montage
// dramatizes ≤ `budget` chops as the week's representative moment. It never adds
// or subtracts a log — the pile renders the derived count regardless.
export function playChop(glade, world, chore) {
  const treeIdx = world.trees.findIndex((t) => t.id === chore.treeId);
  const tree = world.trees[treeIdx];
  glade.montage = {
    phase: "walk",
    t: 0,
    treeIdx: treeIdx === -1 ? 0 : treeIdx,
    treeId: chore.treeId,
    from: { x: world.den.x, y: world.den.y },
    to: tree ? { x: tree.x, y: tree.y } : { x: world.den.x + 60, y: world.den.y },
    actorIdx: 0,
    tree,
  };
  glade.busy = true;
}

function stepMontage(glade, dt, d) {
  const m = glade.montage;
  if (!m) return;
  m.t += dt;
  if (m.phase === "walk" && m.t >= WALK_T) { m.phase = "chop"; m.t = 0; }
  else if (m.phase === "chop" && m.t >= CHOP_T) {
    m.phase = "fall"; m.t = 0;
    if (m.tree) spawnFx(glade, { kind: "dust", x: m.tree.x, y: m.tree.y - 8, dur: 0.5 });
  }
  else if (m.phase === "fall" && m.t >= FALL_T) { m.phase = "back"; m.t = 0; }
  else if (m.phase === "back" && m.t >= BACK_T) { m.phase = "pop"; m.t = 0; spawnFx(glade, { kind: "logpop", x: d.pile.x, y: d.pile.y - 4, dur: 0.6 }); }
  else if (m.phase === "pop" && m.t >= POP_T) { glade.montage = null; glade.busy = false; }
}

function applyMontagePose(v, m, t) {
  if (m.phase === "walk") {
    const k = ease(Math.min(1, m.t / WALK_T));
    v.position.set(m.from.x + (m.to.x - m.from.x) * k, m.from.y + (m.to.y - m.from.y) * k - 2);
    v._vis.rotation = Math.sin(t * 14) * 0.04;
  } else if (m.phase === "chop") {
    v.position.set(m.to.x, m.to.y - 2);
    v._vis.rotation = Math.sin(t * 22) * 0.18 + 0.1; // chop wiggle (POC's CHOP soul)
    v._vis.scale.y = v._bscale * (1 + Math.sin(t * 22) * 0.08); // squash around the ant's own size
  } else if (m.phase === "fall") {
    v.position.set(m.to.x, m.to.y - 2);
    v._vis.rotation = 0.25;
  } else if (m.phase === "back" || m.phase === "pop") {
    const from = m.tree ? { x: m.tree.x, y: m.tree.y } : { x: m.to.x, y: m.to.y };
    const k = ease(Math.min(1, m.t / BACK_T));
    v.position.set(from.x + (m.from.x - from.x) * k, from.y + (m.from.y - from.y) * k - 1);
    v._vis.rotation = 0;
    v._vis.scale.y = v._bscale;
  }
}

// ---------------------------------------------------------------- fx (POC pattern)
function spawnFx(glade, f) {
  const g = new Graphics();
  g.position.set(f.x, f.y);
  glade.layers.fx.addChild(g);
  const rec = { f: { age: 0, ...f }, g };
  glade.fxLive.set(++glade.fxSeq, rec);
  return rec;
}

function renderFx(glade, dt) {
  for (const [id, rec] of glade.fxLive) {
    rec.f.age += dt;
    if (rec.f.age >= rec.f.dur) {
      rec.g.destroy();
      glade.fxLive.delete(id);
      continue;
    }
    const k = rec.f.age / rec.f.dur;
    const g = rec.g;
    g.clear();
    if (rec.f.kind === "ring") g.circle(0, 0, 4 + k * 16).stroke({ width: 2, color: 0xbfe8d8, alpha: 0.6 * (1 - k) });
    else if (rec.f.kind === "dust") g.circle(0, 0, 2 + k * 7).fill({ color: 0xd8c9a8, alpha: 0.5 * (1 - k) });
    else if (rec.f.kind === "logpop") {
      const rise = k * 20;
      g.rect(-8, -rise - 8, 6, 5).fill({ color: 0x8a5a33, alpha: 1 });
      g.rect(-1, -rise - 12, 6, 5).fill({ color: 0x8a5a33, alpha: 0.9 });
      g.rect(5, -rise - 6, 6, 5).fill({ color: 0x8a5a33, alpha: 0.8 });
    }
  }
}

// ---------------------------------------------------------------- render
export function renderGlade(glade, d, ctx) {
  const t = ctx.t;
  const dt = ctx.dt;
  const grid = ctx.grid;

  // weeds — redraw only when the pattern changed (day-roll dress, never per-frame)
  const wk = weedKey(grid);
  if (wk !== glade.weedKey) {
    redrawWeeds(glade.weedG, grid);
    glade.weedKey = wk;
  }

  stepMontage(glade, dt, d);

  // trees: state swap, with the montage tree standing (and falling) as theater
  d.trees.forEach((tr, i) => {
    const v = glade.treeViews[i];
    if (!v) return;
    const m = glade.montage;
    const isMontageTree = m && m.treeIdx === i && (m.phase === "walk" || m.phase === "chop" || m.phase === "fall");
    v._v.standing.visible = isMontageTree || tr.state === "standing";
    v._v.stump.visible = !isMontageTree && tr.state === "stump";
    v._v.sapling.visible = !isMontageTree && tr.state === "sapling";
    if (isMontageTree) {
      // the fall: tip over 0 → ~90° with a little hop, then the stump (truth) snaps in
      const fk = m.phase === "fall" ? Math.min(1, m.t / FALL_T) : 0;
      v.rotation = ease(fk) * 1.35;
      v._v.shadow.alpha = 1 - fk * 0.5;
    } else {
      v.rotation = 0;
      v._v.shadow.alpha = 1;
    }
  });

  // pile: count from derived (truth) — the arrangement by tier slop (dress)
  const sl = SLOP[d.tier] ?? 0;
  const n = Math.min(d.logs, STACK.pool);
  let i = 0;
  for (const s of glade.pileView._slots) {
    s.visible = i < n;
    if (i < n) {
      const p = stackPos(i, sl);
      s.position.set(p.x, p.y);
      s.rotation = p.rot;
    }
    i++;
  }
  glade.pileView._base.alpha = d.logs > STACK.pool ? 0.45 : 0.25;

  // villagers: population by tier + the montage actor
  const active = POPULATION[d.tier] ?? 1;
  const den = d.den;
  const actorIdx = glade.montage ? glade.montage.actorIdx : -1;
  glade.villagerViews.forEach((v, idx) => {
    const shown = idx < active;
    v.visible = shown;
    v._vis.scale.y = v._bscale;
    if (!shown) return;
    if (idx === actorIdx && glade.montage) {
      applyMontagePose(v, glade.montage, t);
      return;
    }
    // ant-crowd around the den: tight spacing so the little guys read as a group
    const hx = den.x - 14 + (idx % 4) * 9, hy = den.y + 3 + Math.floor(idx / 4) * 7;
    const bob = Math.sin(t * 1.1 + idx * 1.7) * 0.7;
    v.position.set(hx, hy + bob);
    const slump = d.tier === "strained" || d.tier === "overgrown";
    let rot = slump ? 0.12 : Math.sin(t * 0.7 + idx) * 0.03;
    if (v._glanceT > 0) {
      v._glanceT -= dt;
      const gk = Math.max(0, v._glanceT / GLANCE_SEC);
      rot += Math.sin(gk * Math.PI) * 0.5; // head-rotate arc on a fate-changing pop
    }
    v._vis.rotation = rot;
    v._shadow.alpha = 1;
  });

  // a glance beat on fate-changing pops (the verdict's head-rotate; pooled, idle-only)
  for (const [, rec] of glade.fxLive) {
    if (rec.f.kind === "logpop" && !rec._glanced) {
      rec._glanced = true;
      const idle = glade.villagerViews.find((x) => x.visible && x !== (glade.villagerViews[actorIdx] || null));
      if (idle) idle._glanceT = GLANCE_SEC;
    }
  }

  // tier tint (dress; honest because tier is law)
  const tt = TIER_TINT[d.tier] || TIER_TINT.steady;
  glade.tintView.clear();
  glade.tintView.rect(0, 0, WIDTH, HEIGHT).fill(tt.color);
  glade.tintView.alpha = tt.alpha;

  // y-sort bodies (painter's order) — tiny n
  glade.layers.bodies.children.sort((a, b) => a.y - b.y);
}
