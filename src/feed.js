// Explicitly fake Shiitake arrivals. No I/O, model call or real feed is connected.
// mulberry32 is retained verbatim from Hive 14cfa809 src/feed.js.
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function createFeed(seed = 42) {
  return { seed, sequence: 0, nextAt: 50, last: null };
}
export function nextGuest(feed, tick, tableFree) {
  if (!tableFree || tick < feed.nextAt) return null;
  const random = mulberry32(feed.seed + feed.sequence);
  const names = ["Morel", "Bramble", "Nettle", "Mallow", "Tansy", "Fern"];
  const event = {
    id: `guest-${++feed.sequence}`,
    name: names[Math.floor(random() * names.length)],
    tick,
    order: "Mushroom soup",
  };
  feed.nextAt = tick + 240 + Math.floor(random() * 80);
  feed.last = event;
  return event;
}
