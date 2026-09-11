const STEP_MS = 20;
const MAX_PENDING = 50;
/** Bounded display prediction; the server alone acknowledges physical movement. */
export function createDirectControl({ entity, send, predict, makeStream = () => crypto.randomUUID(), onError = () => {}, now = () => performance.now() }) {
  let stream, base, pending = [], sequence = 0, sent = 0, active = false;
  let beganAt = 0;
  let lastNow, accumulator = 0, sinceSend = 0, predicted, enabled = true;
  const keys = new Set();
  const axes = () => ({ x: Number(keys.has('d') || keys.has('arrowright')) - Number(keys.has('a') || keys.has('arrowleft')), z: Number(keys.has('s') || keys.has('arrowdown')) - Number(keys.has('w') || keys.has('arrowup')) });
  function reset() {
    stream = undefined; base = undefined; pending = []; sequence = 0; sent = 0;
    active = false; lastNow = undefined; accumulator = 0; sinceSend = 0; predicted = undefined; keys.clear();
  }
  function begin() {
    beganAt = now();
    stream = makeStream(); pending = []; sequence = 0; sent = 0;
    try { send({ type: 'action', action: { kind: 'begin-direct', entity, stream } }); }
    catch (error) { reset(); onError(error); }
  }
  function replay() {
    if (!base?.direct || base.direct.stream !== stream) { predicted = undefined; return; }
    const local = base.local ?? base.pose;
    const result = predict({ position: { ...local.position, facing: local.facing }, speed: base.direct.speed, blocked: base.direct.blocked, bounds: base.direct.bounds, inputs: pending });
    predicted = { ...base, local: { position: { x: result.position.x, y: result.position.y, z: result.position.z }, facing: result.position.facing }, pose: { position: { x: result.position.x, y: result.position.y, z: result.position.z }, facing: result.position.facing } };
  }
  function observe(facts) {
    const next = facts.find(f => f.id === entity);
    if (!next?.pose || next.support) { reset(); return; }
    base = next;
    if (!stream) { begin(); return; }
    if (next.direct?.stream !== stream) {
      predicted = undefined;
      const wasActive = active;
      active = false;
      if (wasActive || now() - beganAt > 3000) { reset(); base = next; begin(); }
      return;
    }
    active = true;
    pending = pending.filter(input => input.sequence > next.direct.lastProcessed);
    replay();
  }
  function flush() {
    while (pending.some(input => input.sequence > sent)) {
      const inputs = pending.filter(input => input.sequence > sent).slice(0, 5);
      try { send({ type: 'action', action: { kind: 'direct-input', entity, stream, inputs } }); }
      catch (error) { reset(); onError(error); return; }
      sent = inputs.at(-1).sequence;
    }
    sinceSend = 0;
  }
  return {
    observe, reset,
    key(key, down) { key = key.toLowerCase(); if (!['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].includes(key)) return false; if (down) keys.add(key); else keys.delete(key); return true; },
    release() { keys.clear(); },
    setPrediction(value) { enabled = Boolean(value); },
    get predictionEnabled() { return enabled; },
    tick(now, paused = false) {
      if (paused || !active) { lastNow = now; accumulator = 0; return; }
      const elapsed = lastNow === undefined ? 0 : Math.max(0, Math.min(100, now - lastNow));
      lastNow = now; accumulator += elapsed; sinceSend += elapsed;
      let changed = false;
      while (accumulator >= STEP_MS) {
        accumulator -= STEP_MS;
        if (pending.length >= MAX_PENDING) continue;
        const axis = axes();
        if (axis.x === 0 && axis.z === 0) continue;
        pending.push({ sequence: ++sequence, ...axis }); changed = true;
      }
      if (changed) replay();
      if (sinceSend >= 100) flush();
    },
    display(facts) { return enabled && predicted ? facts.map(f => f.id === entity ? predicted : f) : facts; },
    get pendingCount() { return pending.length; },
  };
}
