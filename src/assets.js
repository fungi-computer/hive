// assets.js — the ONLY file that maps Kenney tile indices to sprites.
//
// Levi is naming the tiles (tile_0000..0131, the pack ships NO manifest). Until
// the names land, every `idx` is null and the renderer draws honest colored
// fallbacks (the POC's squares). When the manifest arrives, ONLY the `idx`
// values in this file change — hive.js/main.js never touch sprite identity again.
//
// Entry shape: { idx, scale } — idx = tile_XXXX index, scale = display scale
// (tiles are 16×16; workers want ~2x on a 960×600 pane).
// Fallback shape (paint when idx is null): { w, h, color }.

export const TILES = {
  // workers — Kenney farm villagers. Front-facing frame + an optional walk frame.
  worker: { idx: null, scale: 2.0 }, // villager front (bob + sway are soul)
  workerWalk: { idx: null, scale: 2.0 }, // villager walk-frame 2 (2-frame cycle)
  // sites
  tree: { idx: null, scale: 2.0 }, // chop site (Kenney tree)
  well: { idx: null, scale: 2.0 }, // fetch site
  plotSoil: { idx: null, scale: 2.0 }, // tilth under a plot
  den: { idx: null, scale: 2.0 }, // the hive-house / colony home
  outcrop: { idx: null, scale: 2.0 }, // stone DORMANT — drawn, never worked
  // wheat: one frame per stage table row (seed → sprout → tall → gold) + stubble
  wheat: {
    seed: { idx: null, scale: 1.0 },
    sprout: { idx: null, scale: 1.0 },
    tall: { idx: null, scale: 1.0 },
    gold: { idx: null, scale: 1.0 },
    stubble: { idx: null, scale: 1.0 },
  },
  // the soul-loop animal (one rooster)
  rooster: { idx: null, scale: 2.0 },
  // piles (§4.4): pool IS the pile, the counter chip never lies
  woodLog: { idx: null, scale: 1.6 },
  waterBarrel: { idx: null, scale: 1.6 },
  grainSack: { idx: null, scale: 1.6 },
};

// Fallback paint per key (used while idx is null — visible, honest, no secrets).
export const FALLBACK = {
  worker: () => ({ w: 22, h: 26 }),
  workerWalk: () => ({ w: 22, h: 26 }),
  tree: () => ({ w: 34, h: 34, color: 0x155c31 }),
  well: () => ({ w: 30, h: 26, color: 0x5b7c99 }),
  plotSoil: () => ({ w: 30, h: 22, color: 0x8a6b3f }),
  den: () => ({ w: 40, h: 30, color: 0x90433a }),
  outcrop: () => ({ w: 26, h: 20, color: 0x6f7280 }),
  wheat: {
    seed: () => ({ w: 8, h: 8, color: 0xc9a06b }),
    sprout: () => ({ w: 10, h: 12, color: 0x4c944c }),
    tall: () => ({ w: 12, h: 18, color: 0x84c46c }),
    gold: () => ({ w: 12, h: 18, color: 0xe8c34a }),
    stubble: () => ({ w: 12, h: 6, color: 0xc9a06b }),
  },
  rooster: () => ({ w: 14, h: 14, color: 0xf5f5f5 }),
  woodLog: () => ({ w: 12, h: 10, color: 0x8a5a33 }),
  waterBarrel: () => ({ w: 12, h: 14, color: 0x3e8fb5 }),
  grainSack: () => ({ w: 12, h: 12, color: 0xdcae6a }),
};

// Resolve an entry to a URL the dev server will serve, or null if unmapped.
export function tileUrl(entry) {
  if (!entry || entry.idx === null || entry.idx === undefined) return null;
  return `/assets/kenney-tiny-farm/Tiles/tile_${String(entry.idx).padStart(4, "0")}.png`;
}

// Flatten every tile entry so main can preload just the mapped files.
export function allTileTargets() {
  const out = [];
  const walk = (o) => {
    for (const k of Object.keys(o)) {
      const v = o[k];
      if (v && typeof v === "object" && "idx" in v) out.push(v);
      else if (v && typeof v === "object") walk(v);
    }
  };
  walk(TILES);
  return out;
}
