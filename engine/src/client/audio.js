/** Small client-only audio owner. It never receives runtime or world access. */
export function createAudioOwner({ AudioContextCtor = globalThis.AudioContext ?? globalThis.webkitAudioContext, enabled = true } = {}) {
  let context;
  let muted = !enabled;
  const voices = new Set();
  function unlock() {
    if (muted || !AudioContextCtor) return;
    context ??= new AudioContextCtor();
    if (context.state === "suspended") context.resume?.();
  }
  function play(kind) {
    if (muted || !context || context.state === "closed" || voices.size >= 4) return;
    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = kind === "launch" ? "sine" : "triangle";
    oscillator.frequency.setValueAtTime(kind === "launch" ? 82 : 145, now);
    oscillator.frequency.exponentialRampToValueAtTime(kind === "launch" ? 42 : 72, now + 0.18);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(kind === "launch" ? 0.16 : 0.08, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + (kind === "launch" ? 0.42 : 0.16));
    oscillator.connect(gain).connect(context.destination);
    voices.add(oscillator);
    oscillator.onended = () => { voices.delete(oscillator); oscillator.disconnect(); gain.disconnect(); };
    oscillator.start(now);
    oscillator.stop(now + (kind === "launch" ? 0.45 : 0.18));
  }
  return {
    unlock,
    play,
    get muted() { return muted; },
    setMuted(value) { muted = Boolean(value); if (muted) context?.suspend?.(); else unlock(); },
    dispose() { for (const voice of voices) voice.stop?.(); voices.clear(); context?.close?.(); context = undefined; },
  };
}
