// ZzFX parameters retain the original cannon envelopes: launch is a low sine
// with a .42s release; impact is a short triangle with a .16s release.
export const AUDIO_RECIPES = Object.freeze({
  launch: Object.freeze([.16, 0, 82, .01, 0, .42, 0, 1]),
  impact: Object.freeze([.08, 0, 145, .01, 0, .16, 2, .8]),
});

/** ZzFX sample generation on one owner-controlled AudioContext. */
export function createAudioOwner({
  AudioContextCtor = globalThis.AudioContext ?? globalThis.webkitAudioContext,
  loadZzfx = () => import("zzfx"),
  recipes = AUDIO_RECIPES,
  enabled = true,
  maxVoices = 4,
} = {}) {
  let context, buildSamples, loading, disposed = false;
  let muted = !enabled;
  const voices = new Set();
  async function unlock() {
    if (muted || disposed || !AudioContextCtor) return false;
    context ??= new AudioContextCtor();
    if (context.state === "suspended") await context.resume?.();
    if (!loading) loading = Promise.resolve(loadZzfx()).then(({ ZZFX }) => {
      if (disposed) return false;
      // The official module eagerly creates a singleton only to expose the
      // generator. Close that singleton and retain its pure sample builder.
      const eager = ZZFX.audioContext;
      buildSamples = ZZFX.buildSamples.bind(ZZFX);
      eager?.close?.();
      return true;
    }).catch(() => false);
    return (await loading) === true;
  }
  function play(kind) {
    if (muted || disposed || !buildSamples || !context || voices.size >= maxVoices) return false;
    const recipe = recipes[kind];
    if (!Array.isArray(recipe)) return false;
    let samples;
    try { samples = buildSamples(...recipe); } catch { return false; }
    const buffer = context.createBuffer(1, samples.length, 44100);
    buffer.getChannelData(0).set(samples);
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer;
    gain.gain.value = 1;
    source.connect(gain).connect(context.destination);
    voices.add(source);
    source.addEventListener?.("ended", () => { voices.delete(source); source.disconnect?.(); gain.disconnect?.(); }, { once: true });
    source.start();
    return true;
  }
  return {
    unlock,
    play,
    get muted() { return muted; },
    setMuted(value) { muted = Boolean(value); if (!muted) unlock(); else context?.suspend?.(); },
    get voiceCount() { return voices.size; },
    dispose() { disposed = true; for (const source of voices) source.stop?.(); voices.clear(); context?.close?.(); context = undefined; buildSamples = undefined; loading = undefined; },
  };
}
