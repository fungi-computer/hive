const DEFAULTS = Object.freeze({ maxEffects: 32, maxSprites: 128, ttl: 4000 });

function finite(value, name) {
  if (!Number.isFinite(value)) throw new Error(`${name} must be finite`);
  return value;
}

/** Bounded, reconnect-safe cursor for committed presentation cues. */
export function createCueCursor({ now = () => performance.now(), ttl = 4000 } = {}) {
  const seen = new Map();
  let epoch;
  let highWater = -1;
  let baseline = true;
  if (!Number.isFinite(ttl) || ttl <= 0) throw new Error("cue TTL must be positive");
  function prune(stamp) {
    for (const [id, at] of seen) if (stamp - at > ttl) seen.delete(id);
  }
  return {
    accept(frame) {
      const cues = Array.isArray(frame?.cues) ? frame.cues : [];
      const stamp = now();
      prune(stamp);
      if (frame?.epoch !== undefined && frame.epoch !== epoch) {
        epoch = frame.epoch;
        baseline = true;
        seen.clear();
        highWater = -1;
      }
      if (baseline) {
        for (const cue of cues) if (Number.isSafeInteger(cue?.sequence)) highWater = Math.max(highWater, cue.sequence);
        baseline = false;
        return [];
      }
      const fresh = [];
      for (const cue of cues) {
        if (!Number.isSafeInteger(cue?.sequence)) continue;
        if (cue.sequence <= highWater || seen.has(cue.sequence)) continue;
        seen.set(cue.sequence, stamp);
        highWater = Math.max(highWater, cue.sequence);
        fresh.push(cue);
      }
      return fresh;
    },
    reset({ fresh = true } = {}) { seen.clear(); baseline = fresh; epoch = undefined; highWater = -1; },
    dispose() { seen.clear(); },
  };
}

/**
 * Client-only effect lifetime owner. `spawn` and `update` are renderer hooks;
 * neither receives a runtime capability, so effects cannot issue commands.
 */
export function createEffectOwner({ spawn = () => {}, update = () => {}, destroy = () => {}, now = () => performance.now(), ...limits } = {}) {
  const config = { ...DEFAULTS, ...limits };
  if (!Number.isSafeInteger(config.maxEffects) || config.maxEffects < 1) throw new Error("invalid effect limit");
  if (!Number.isSafeInteger(config.maxSprites) || config.maxSprites < 1) throw new Error("invalid sprite limit");
  const active = new Map();
  let sprites = 0, nextId = 0;
  function dispose(id) {
    const entry = active.get(id);
    if (!entry) return;
    active.delete(id);
    sprites -= entry.sprites;
    destroy(entry.value, entry.definition);
  }
  return {
    play(definition, cue = {}) {
      if (!definition || typeof definition !== "object") throw new Error("effect definition required");
      const lifetime = finite(definition.lifetime ?? 500, "effect lifetime");
      const count = Math.max(1, Math.floor(definition.sprites ?? 1));
      if (lifetime <= 0 || count > config.maxSprites) return null;
      while (active.size >= config.maxEffects || sprites + count > config.maxSprites)
        dispose(active.keys().next().value);
      const id = ++nextId;
      const value = spawn(definition, cue);
      active.set(id, { value, definition, cue, expires: now() + lifetime, started: now(), sprites: count });
      sprites += count;
      return id;
    },
    tick(time = now(), context) {
      for (const [id, entry] of active) {
        if (time >= entry.expires) { dispose(id); continue; }
        const elapsed = Math.max(0, time - entry.started);
        update(entry.value, Math.max(0, Math.min(1, (entry.expires - time) / (entry.definition.lifetime ?? 1))), context, entry.cue, elapsed);
      }
    },
    clear() { for (const id of [...active.keys()]) dispose(id); },
    get size() { return active.size; },
    get spriteCount() { return sprites; },
  };
}
