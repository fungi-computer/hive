export const AUDIO_RECIPES = Object.freeze({
  launch: Object.freeze([,,82,.18,.32,.12,1,1.1,,0]),
  impact: Object.freeze([,,145,.08,.16,.08,2,.8,,0]),
});

/** Shared client audio owner around the maintained MIT ZzFX API. */
export function createAudioOwner({
  AudioContextCtor = globalThis.AudioContext ?? globalThis.webkitAudioContext,
  loadZzfx = () => import("zzfx"),
  recipes = AUDIO_RECIPES,
  enabled = true,
  maxVoices = 4,
} = {}) {
  let context;
  let zzfx;
  let loading;
  let muted = !enabled;
  const voices = new Set();
  function unlock() {
    if (muted || !AudioContextCtor) return loading;
    context ??= new AudioContextCtor();
    if (context.state === "suspended") context.resume?.();
    loading ??= Promise.resolve(loadZzfx()).then(({ ZZFX }) => { ZZFX.audioContext = context; zzfx = ZZFX; });
    return loading;
  }
  function play(kind) {
    if (muted || !zzfx || voices.size >= maxVoices) return false;
    const recipe = recipes[kind];
    if (!Array.isArray(recipe)) return false;
    const source = zzfx.play(...recipe);
    if (!source) return false;
    voices.add(source);
    source.addEventListener?.("ended", () => voices.delete(source), { once: true });
    return true;
  }
  return {
    unlock,
    play,
    get muted() { return muted; },
    setMuted(value) { muted = Boolean(value); if (!muted) unlock(); else context?.suspend?.(); },
    get voiceCount() { return voices.size; },
    dispose() { for (const source of voices) source.stop?.(); voices.clear(); context?.close?.(); context = undefined; zzfx = undefined; loading = undefined; },
  };
}
