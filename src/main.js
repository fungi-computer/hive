// hive POC — plain Pixi.js + Vite. Colored squares only.
// Two states, and only two: SETTLED (sitting in the party group) / EXECUTING (beside a tree).
// Deterministic in-page ticker emulating BirdDog (POC only, wired to nothing real).

import { Application, Graphics } from "pixi.js";

// ---------------------------------------------------------------- constants
const GLADE = 0x2f6b3f; // the empty glade is the canvas background
const WIDTH = 960;
const HEIGHT = 600;

const PARTY_SIZE = 6;
const COLONIST_SIZE = 26;
const COLONIST_COLORS = [
  0xff5b4d, // red
  0x4da6ff, // blue
  0xffd23f, // yellow
  0xb06aff, // purple
  0xff8c3b, // orange
  0x3fe0d0, // cyan
];

const TREE_COUNT = 8;
const TREE_SIZE = 34;
const TREE_COLOR = 0x155c31; // darker green than the glade

const TICK_MS = 1000; // one tick event per second
const WALK_MS = 700; // how long a square takes to move
const DWELL = 3; // a dispatched colonist stands by its tree for 3 ticks
const N_TASKS = 14; // tasks per schedule cycle
const SEED = 42;

// ---------------------------------------------------------------- helpers
// mulberry32 — seeded PRNG so every load plays the exact same schedule.
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function square(size, color) {
  const g = new Graphics();
  g.rect(-size / 2, -size / 2, size, size).fill(color);
  return g;
}

// ---------------------------------------------------------------- app / glade
const app = new Application();
await app.init({
  width: WIDTH,
  height: HEIGHT,
  background: GLADE,
  antialias: false,
});
document.getElementById("stage").prepend(app.canvas);

// ---------------------------------------------------------------- trees
// Fixed scattered squares (kept clear of the party area and canvas edges).
const TREES = [
  { x: 90, y: 110 },
  { x: 262, y: 74 },
  { x: 520, y: 96 },
  { x: 852, y: 96 },
  { x: 744, y: 232 },
  { x: 888, y: 384 },
  { x: 736, y: 500 },
  { x: 470, y: 524 },
];
const treeSquares = TREES.map((t) => {
  const s = square(TREE_SIZE, TREE_COLOR);
  s.position.set(t.x, t.y);
  app.stage.addChild(s);
  return s;
});

// ---------------------------------------------------------------- party
// A group of colonist squares sitting together in a small cluster.
const GAP = 40;
const groupX = 168; // party cluster center
const groupY = 436;
const homes = PARTY_SIZE.map((_, i) => {
  const col = i % 3;
  const row = Math.floor(i / 3);
  return {
    x: groupX + (col - 1) * GAP,
    y: groupY + (row - 0.5) * GAP,
  };
});

const colonists = PARTY_SIZE.map((_, i) => {
  const gfx = square(COLONIST_SIZE, COLONIST_COLORS[i]);
  gfx.position.set(homes[i].x, homes[i].y);
  app.stage.addChild(gfx);
  return {
    id: i,
    gfx,
    state: "SETTLED", // the only two states: "SETTLED" | "EXECUTING"
    tree: -1, // tree index when EXECUTING
    busy: false, // an in-flight walk is happening
  };
});

// Beside-position: stand just to the left of the tree square.
function beside(treeIndex) {
  const t = TREES[treeIndex];
  return {
    x: t.x - (TREE_SIZE / 2 + COLONIST_SIZE / 2 + 8),
    y: t.y,
  };
}

// ---------------------------------------------------------------- schedule
// Deterministic: a seeded RNG builds the same dispatch/return script every
// load. Tick N dispatches a colonist to a tree; a return event at tick N+3
// sends the same square back to the group.
const rand = mulberry32(SEED);
const eventsByTick = new Map();
let cursor = 1;
for (let k = 0; k < N_TASKS; k++) {
  const ci = k % PARTY_SIZE; // round-robin colonist pick
  const ti = Math.floor(rand() * TREE_COUNT); // seeded tree pick
  const push = (tick, ev) => {
    if (!eventsByTick.has(tick)) eventsByTick.set(tick, []);
    eventsByTick.get(tick).push(ev);
  };
  push(cursor, { kind: "dispatch", colonist: ci, tree: ti });
  push(cursor + DWELL, { kind: "return", colonist: ci });
  cursor += 1;
}
const TOTAL_TICKS = cursor - 1 + DWELL; // schedule loops forever after this

// ---------------------------------------------------------------- motions
function tweenTo(colonist, toX, toY, ms, onDone) {
  const fromX = colonist.gfx.x;
  const fromY = colonist.gfx.y;
  let t = 0;
  const step = (ticker) => {
    t += ticker.deltaMS;
    const k = Math.min(t / ms, 1);
    colonist.gfx.x = fromX + (toX - fromX) * k;
    colonist.gfx.y = fromY + (toY - fromY) * k;
    if (k >= 1) {
      app.ticker.remove(step);
      colonist.busy = false;
      onDone();
    }
  };
  colonist.busy = true;
  app.ticker.add(step);
}

// ---------------------------------------------------------------- referee (no secrets)
const refereeEl = document.getElementById("referee");
const tickerEl = document.getElementById("tick");
let lastEvent = "idle";

function updateReferee() {
  let settled = 0;
  for (const c of colonists) if (c.state === "SETTLED") settled++;
  const executing = PARTY_SIZE - settled;
  refereeEl.textContent = `settled ${settled} / executing ${executing}`;
}

function applyEvent(ev) {
  const c = colonists[ev.colonist];
  if (ev.kind === "dispatch") {
    // A tick event picks a colonist to execute → they move over and stand
    // beside a tree. As of this moment they are NOT sitting with the group,
    // so the two-state rule makes them EXECUTING until they sit back down.
    c.state = "EXECUTING";
    c.tree = ev.tree;
    const target = beside(ev.tree);
    lastEvent = `dispatch colonist ${c.id + 1} → tree ${ev.tree + 1}`;
    tweenTo(c, target.x, target.y, WALK_MS, () => {});
    updateReferee();
  } else if (ev.kind === "return") {
    // Completion: the same square comes back and sits with the group.
    lastEvent = `colonist ${c.id + 1} returns to the party`;
    tweenTo(c, homes[c.id].x, homes[c.id].y, WALK_MS, () => {
      c.state = "SETTLED";
      c.tree = -1;
      updateReferee();
    });
  }
}

// ---------------------------------------------------------------- ticker (POC)
let tickNumber = 0;
setInterval(() => {
  tickNumber += 1;
  const n = ((tickNumber - 1) % TOTAL_TICKS) + 1; // loop the script forever
  const evs = eventsByTick.get(n) || [];
  for (const ev of evs) applyEvent(ev);
  tickerEl.textContent = `tick ${tickNumber} — ${lastEvent}`;
}, TICK_MS);

updateReferee();

// Debug handle so a headless smoke test can read the exact same state.
window.__HIVEPOC = {
  seed: SEED,
  ticksPerLoop: TOTAL_TICKS,
  colonists: colonists.map((c) => ({
    id: c.id + 1,
    state: c.state,
    tree: c.tree + 1,
    x: Math.round(c.gfx.x),
    y: Math.round(c.gfx.y),
  })),
  get count() {
    let settled = 0;
    for (const c of colonists) if (c.state === "SETTLED") settled++;
    return { settled, executing: PARTY_SIZE - settled };
  },
  get tick() {
    return tickNumber;
  },
};
