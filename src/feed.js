// Explicitly simulated storyteller intent. No SSE connection, model or backend.
// This seeded local event is applied by the simulation on its own fixed tick.
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
export function nextEvent(feed, tick, completed = 0) {
  if (feed.sequence === 1 && completed > 0) {
    const event = {
      kind: "approval",
      name: feed.last.name,
      tick,
      text: "A roof! Fine. You may remain inconveniently alive.",
    };
    feed.sequence++;
    feed.last = event;
    return event;
  }
  if (feed.sequence || tick < feed.nextAt) return null;
  const random = mulberry32(feed.seed);
  const names = ["Morel", "Bramble", "Nettle", "Mallow", "Tansy", "Fern"];
  const event = {
    kind: "demand",
    name: names[Math.floor(random() * names.length)],
    tick,
    text: "A roof before supper, human. Or you're supper.",
  };
  feed.sequence++;
  feed.last = event;
  return event;
}
