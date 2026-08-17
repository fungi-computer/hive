// hive.js — the Pixi RENDER layer. Fern's three disciplines, applied: the sim is
// a plain data table; THIS file is a read-only projection of derived() every
// frame; no sprite ever holds truth (mode/pos/crop all come from the sim).
// Soul loops live here too (bob, tend-sway, chop wiggle, glance, bloom, blip).
//
// Nothing in this file knows a tile index: it reads assets.js, and ONLY the
// values in assets.js change when the tile manifest lands. Until then every
// sprite is an honest colored fallback (the POC's squares) — visible, no secrets.

import { Application, Assets, Sprite, Graphics, Container } from "pixi.js";
import { TILES, tileUrl, FALLBACK } from "./assets.js";

export const WIDTH = 960;
export const HEIGHT = 600;
export const GLADE = 0x2f6b3f;

// the POC's six colonist colors — worker fallback bodies
const WORKER_COLORS = [0xff5b4d, 0x4da6ff, 0xffd23f, 0xb06aff, 0xff8c3b, 0x3fe0d0];

// pile sites by the den (stores: wood · water · grain)
const PILE_POS = { wood: { x: 236, y: 388 }, water: { x: 264, y: 388 }, grain: { x: 292, y: 388 } };
const PILE_POOL = 10;

// phase → honest tint (the date only shades; it never credits)
const PHASE_TINT = {
  dawn: { color: 0xffd9a0, alpha: 0.10 },
  day: { color: 0xffffff, alpha: 0.0 },
  dusk: { color: 0xd98a3a, alpha: 0.12 },
  night: { color: 0x16264d, alpha: 0.30 },
};

// ---------------------------------------------------------------- boot
export async function createHive({ parent, sites, workerCount }) {
  const app = new Application();
  await app.init({
    width: WIDTH,
    height: HEIGHT,
    background: GLADE,
    antialias: false,
    resolution: Math.min(globalThis.devicePixelRatio || 1, 2),
  });
  app.ticker.maxFPS = 60;
  parent.prepend(app.canvas);
  console.log("[hive] canvas mounted, width=" + WIDTH + " height=" + HEIGHT);

  const loaded = await preload();

  // layers: bg → thread → bodies → fx → tint (bodies always above their thread)
  const layers = {};
  for (const name of ["bg", "thread", "bodies", "fx", "tint"]) {
    layers[name] = new Container();
    app.stage.addChild(layers[name]);
  }

  // metrics are DOM, rendered by main.js into #metrics (same method as the
  // referee chip — the page's proven text path). Nothing in-scene for them.
  app.stage.eventMode = "static";

  const hive = {
    app,
    loaded,
    layers,
    steps: 0,
    lastThreadKey: null,
    prevPileRows: { wood: 0, water: 0, grain: 0 },
    gpSeq: 0,
    workerViews: [],
    plotViews: {},
    pileViews: {},
    roosterView: null,
    tintView: null,
    fxLive: new Map(), // id → { f, g, onFrame }
  };

  buildEnv(hive, sites);
  buildWorkers(hive, workerCount);
  buildRooster(hive);
  buildPiles(hive);
  buildTint(hive);

  return hive;
}

async function preload() {
  const seen = new Set();
  const walk = (o) => {
    for (const k of Object.keys(o)) {
      const v = o[k];
      if (v && typeof v === "object" && "idx" in v) {
        const u = tileUrl(v);
        if (u) seen.add(u);
      } else if (v && typeof v === "object") walk(v);
    }
  };
  walk(TILES);
  const loaded = {};
  await Promise.all(
    [...seen].map(async (u) => {
      try {
        loaded[u] = await Assets.load(u);
      } catch {
        /* unmappable → fallback paint handles it */
      }
    })
  );
  return loaded;
}

// ---------------------------------------------------------------- body factory
function makeBody(entry, fallback, { color } = {}) {
  const c = new Container();
  const shadow = new Graphics();
  shadow.ellipse(0, 8, 7, 3).fill({ color: 0x000000, alpha: 0.28 });
  c.addChild(shadow);
  c._shadow = shadow;
  const vis = makeVis(c, entry, fallback, color);
  c._vis = vis;
  c.addChild(vis);
  return c;
}

// attach a mapped sprite or a fallback rect as the visible child of `slot`
function makeVis(slot, entry, fallback, color) {
  const url = tileUrl(entry);
  if (url) {
    const s = new Sprite(url);
    s.anchor.set(0.5, 0.85);
    s.scale.set(entry.scale, entry.scale);
    return s;
  }
  const fb = typeof fallback === "function" ? fallback() : fallback;
  const g = new Graphics();
  g.roundRect(-fb.w / 2, -fb.h * 0.85, fb.w, fb.h, 3).fill(color || fb.color || 0x888888);
  return g;
}

// ---------------------------------------------------------------- static scene
function buildEnv(hive, sites) {
  const bg = hive.layers.bg;
  for (const site of sites) {
    if (site.kind === "den") {
      const b = makeBody(TILES.den, FALLBACK.den, { color: 0x90433a });
      b.position.set(site.x, site.y);
      bg.addChild(b);
    } else if (site.kind === "well") {
      const b = makeBody(TILES.well, FALLBACK.well, { color: 0x5b7c99 });
      b.position.set(site.x, site.y);
      bg.addChild(b);
    } else if (site.kind === "plot") {
      const slot = new Container();
      slot.position.set(site.x, site.y);
      const soil = makeVis(slot, TILES.plotSoil, FALLBACK.plotSoil, 0x8a6b3f);
      slot.addChild(soil);
      // five phenotype children = the wheat stage table rows (+ stubble)
      const stages = ["seed", "sprout", "tall", "gold", "stubble"];
      const cropChildren = {};
      for (const st of stages) {
        const entry = TILES.wheat[st];
        const child = makeVis(slot, entry, FALLBACK.wheat[st], null);
        child.visible = false;
        child.position.set(0, -6);
        slot.addChild(child);
        cropChildren[st] = child;
      }
      bg.addChild(slot);
      hive.plotViews[site.id] = { cropChildren };
    } else if (site.kind === "tree") {
      const b = makeBody(TILES.tree, FALLBACK.tree, { color: 0x155c31 });
      b.position.set(site.x, site.y);
      bg.addChild(b);
    } else if (site.kind === "outcrop") {
      const b = makeBody(TILES.outcrop, FALLBACK.outcrop, { color: 0x6f7280 });
      b.position.set(site.x, site.y);
      bg.addChild(b);
    }
  }
}

// ---------------------------------------------------------------- workers
function buildWorkers(hive, count) {
  for (let i = 0; i < count; i++) {
    const color = WORKER_COLORS[i % WORKER_COLORS.length];
    const view = makeBody(TILES.worker, FALLBACK.worker, { color });
    // aura ring: the state tint rides on the body (derived, never stored)
    const aura = new Graphics();
    aura.circle(0, -2, 13).fill({ color: 0xffffff, alpha: 0.0 });
    view.addChild(aura);
    view._aura = aura;
    hive.layers.bodies.addChild(view);
    hive.workerViews.push({ view, idx: i, color });
  }
}

function buildRooster(hive) {
  const view = makeBody(TILES.rooster, FALLBACK.rooster, { color: 0xf5f5f5 });
  hive.layers.bodies.addChild(view);
  hive.roosterView = view;
}

// ---------------------------------------------------------------- piles (pool = pile)
function buildPiles(hive) {
  const defs = [
    ["wood", TILES.woodLog, FALLBACK.woodLog, 0x8a5a33],
    ["water", TILES.waterBarrel, FALLBACK.waterBarrel, 0x3e8fb5],
    ["grain", TILES.grainSack, FALLBACK.grainSack, 0xdcae6a],
  ];
  for (const [cls, entry, fallback, color] of defs) {
    const pos = PILE_POS[cls];
    const pool = [];
    for (let i = 0; i < PILE_POOL; i++) {
      const slot = new Container();
      const child = makeVis(slot, entry, fallback, color);
      slot.addChild(child);
      slot.position.set(pos.x, pos.y);
      slot.visible = false;
      hive.layers.bg.addChild(slot);
      pool.push(slot);
    }
    // overflow base: the pile may cap; the counter chip never lies
    const baseG = new Graphics();
    baseG.rect(pos.x - 8, pos.y + 1, 16, 6).fill({ color: 0x000000, alpha: 0.35 });
    baseG.visible = false;
    hive.layers.bg.addChild(baseG);
    hive.pileViews[cls] = { pool, pos, base: baseG };
  }
}

function buildTint(hive) {
  const g = new Graphics();
  g.rect(0, 0, WIDTH, HEIGHT).fill(0xffffff);
  g.alpha = 0;
  hive.layers.tint.addChild(g);
  hive.tintView = g;
}

// ---------------------------------------------------------------- render
export function renderHive(hive, d, meta) {
  hive.steps = meta.steps;
  renderBodies(hive, d, meta);
  renderRooster(hive, d);
  renderThreads(hive, d);
  renderPiles(hive, d);
  renderFx(hive, d);
  renderTint(hive, d);
  // y-sort bodies (painter's order) — n is tiny
  hive.layers.bodies.children.sort((a, b) => a.y - b.y);
}

function renderBodies(hive, d, meta) {
  const t = meta.steps;
  const byId = new Map(d.workers.map((w) => [w.id, w]));
  for (const v of hive.workerViews) {
    const w = byId.get("w" + (v.idx + 1));
    if (!w) continue;
    const atPlot = w.siteId && w.siteId.startsWith("plot");
    const dx = atPlot ? 10 : 0; // stand beside the crop row while working a plot
    const bobAmp = w.mode === "WALK" || w.mode === "RETURN" ? 1.6 : 0.7;
    const bob = Math.sin((t + w.bob * 13) * 0.22) * bobAmp;
    v.view.position.set(w.pos.x + dx, w.pos.y + bob);

    const vis = v.view._vis;
    // mode soul
    if (w.mode === "TEND") vis.rotation = Math.sin(t * 0.35 + w.bob * 6) * 0.12;
    else if (w.mode === "CHOP") {
      v.view.x += Math.sin(t * 0.9) * 1.6;
      vis.rotation = 0;
    } else if (w.mode === "SOW") vis.rotation = 0.07;
    else if (w.mode === "HARVEST") vis.rotation = -0.07;
    else vis.rotation = 0;
    // 2-frame walk cycle (only when the manifest maps a second frame)
    if ((w.mode === "WALK" || w.mode === "RETURN") && tileUrl(TILES.workerWalk)) {
      const swap = Math.floor(t / 6) % 2 === 0;
      const url = swap ? tileUrl(TILES.workerWalk) : tileUrl(TILES.worker);
      if (vis._url !== url) {
        const tex = hive.loaded[url];
        if (tex) vis.texture = tex;
        vis._url = url;
      }
    }

    // the honesty grammar: state tint rides on the body (derived, never stored)
    const aura = v.view._aura;
    const rs = w.row.state;
    aura.clear();
    if (rs === "executing") {
      aura.circle(0, -2, 13).fill({ color: 0xff8c3b, alpha: 0.22 + 0.08 * Math.sin(t * 0.15) });
    } else if (rs === "requeued") {
      const flash = t % 10 < 5; // amber micro-flash after the blip
      aura.circle(0, -2, 13).fill({ color: 0xffd23f, alpha: flash ? 0.5 : 0.12 });
    } else if (rs === "settled") {
      aura.circle(0, -2, 13).fill({ color: 0xbfe8d8, alpha: 0.10 });
    }

    // plot phenotype + watering droplet (renderer-only flourish on a sim fact)
    const pv = hive.plotViews[w.siteId];
    if (pv) {
      const p = d.plots[w.siteId];
      for (const key of Object.keys(pv.cropChildren)) pv.cropChildren[key].visible = false;
      if (p && p.stubble) pv.cropChildren.stubble.visible = true;
      else if (p && p.crop) pv.cropChildren[p.crop.stage].visible = true;
      if (w.mode === "TEND") {
        const cyc = (t * 3) % 14;
        if (!pv._dropG) {
          pv._dropG = new Graphics();
          hive.layers.fx.addChild(pv._dropG);
        }
        pv._dropG.clear();
        pv._dropG.position.set(w.pos.x + 10, w.pos.y - 2);
        pv._dropG.circle(-2, -12 - cyc, 2.4).fill({ color: 0x9fd8ff, alpha: 0.85 });
      } else if (pv._dropG) {
        pv._dropG.destroy();
        pv._dropG = null;
      }
    }
  }
}

function renderRooster(hive, d) {
  const r = d.rooster;
  const view = hive.roosterView;
  const bob = Math.sin((hive.steps + r.phase * 20) * 0.12) * 1.2;
  view.position.set(r.x, r.y + bob);
  // the verdict's glance: 4-frame head rotate driven by the sim's glance fx
  let rot = 0;
  for (const f of d.fx) {
    if (f.kind === "glance") {
      const FRAMES = [0, -0.4, -0.15, 0.35, 0.5, 0.2, 0.0, 0.0];
      const fi = Math.min(FRAMES.length - 1, Math.floor((f.age / f.dur) * FRAMES.length));
      rot = FRAMES[fi];
    }
  }
  view._vis.rotation = rot;
}

function renderThreads(hive, d) {
  const key = d.threads.map((th) => `${th.rowId}@${th.cls}`).join("|");
  if (key === hive.lastThreadKey && hive.layers.thread.children.length > 0) return; // redraw only on claim-set change
  hive.lastThreadKey = key;
  const g = new Graphics();
  const CLS = { wood: 0xffb36b, water: 0x7fd4ff, sow: 0xa8e6a0, harvest: 0xffe082, stone: 0xcfd8dc };
  for (const th of d.threads) {
    if (!th.from || !th.to) continue;
    g.moveTo(th.from.x, th.from.y);
    g.lineTo(th.to.x, th.to.y);
    g.stroke({ width: 1.3, color: CLS[th.cls] || 0xffffff, alpha: 0.4 });
  }
  hive.layers.thread.removeChildren();
  hive.layers.thread.addChild(g);
}

function renderPiles(hive, d) {
  for (const cls of ["wood", "water", "grain"]) {
    const pv = hive.pileViews[cls];
    const rows = d.piles[cls].rows;
    const show = Math.min(rows, PILE_POOL);
    let n = 0;
    for (const slot of pv.pool) {
      slot.visible = n < show;
      if (slot.visible) {
        slot.y = pv.pos.y - n * 2; // newest on top
        slot.scale.set(Math.min(1, 0.8 + n * 0.06), Math.min(1, 0.8 + n * 0.06));
      }
      n++;
    }
    pv.base.visible = rows > PILE_POOL; // pile may cap; the chip never lies
    if (rows > (hive.prevPileRows[cls] || 0)) {
      spawnFx(hive, { _id: "gp" + ++hive.gpSeq, kind: "grainpop", x: pv.pos.x, y: pv.pos.y - 6, age: 0, dur: 26 });
    }
    hive.prevPileRows[cls] = rows;
  }
}

function renderFx(hive, d) {
  const active = new Set();
  for (const f of d.fx) {
    active.add(f.id);
    let rec = hive.fxLive.get(f.id);
    if (!rec) {
      rec = spawnFx(hive, f);
      if (!rec) continue;
    }
    rec.f = f; // age/graphic redrawn from the sim's own fx clock below
  }
  for (const [id, rec] of hive.fxLive) {
    if (!active.has(id) && !rec.persist) {
      rec.g.destroy();
      hive.fxLive.delete(id);
    } else if (rec.persist) {
      // renderer-local fx (grain pops): age them on our own clock
      rec.f.age += 1;
      if (rec.f.age >= rec.f.dur) {
        rec.g.destroy();
        hive.fxLive.delete(id);
      } else redrawFx(rec);
    } else if (rec.f) {
      redrawFx(rec);
    }
  }
}

// create a display object for one fx (returns null when the kind is only a sim signal)
function spawnFx(hive, f) {
  if (f.kind === "glance") return null; // rendered via the rooster's rotation
  const g = new Graphics();
  g.position.set(f.x, f.y);
  hive.layers.fx.addChild(g);
  const rec = { f, g, persist: !!f._id && f._id.startsWith("gp"), onFrame: fxDraw(f.kind) };
  redrawFx(rec);
  hive.fxLive.set(f._id ?? f.id, rec);
  return rec;
}

function fxDraw(kind) {
  if (kind === "bloom") return (gg, k) => {
    gg.clear();
    gg.circle(0, 0, 6 + k * 22).stroke({ width: 2, color: 0xbfe8d8, alpha: 0.6 * (1 - k) });
  };
  if (kind === "blip") return (gg, k) => {
    gg.clear();
    gg.circle(0, 0, 8 + k * 10).stroke({ width: 2, color: 0xffd23f, alpha: 0.7 * (1 - k) });
  };
  if (kind === "grainpop") return (gg, k) => {
    gg.clear();
    gg.circle(0, -k * 10, 3 + k * 2).fill({ color: 0xffe082, alpha: 0.8 * (1 - k) });
  };
  return null;
}

function redrawFx(rec) {
  const f = rec.f;
  if (!rec.onFrame) {
    rec.g.visible = false;
    return;
  }
  rec.onFrame(rec.g, Math.min(1, f.age / f.dur));
}

function renderTint(hive, d) {
  const p = PHASE_TINT[d.counter.phase] || PHASE_TINT.day;
  const g = hive.tintView;
  g.clear();
  g.rect(0, 0, WIDTH, HEIGHT).fill(p.color);
  g.alpha = p.alpha;
}
