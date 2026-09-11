/** Sound definitions never receive simulation authority. Keep the approved cannon
 * envelopes; ZzFX supplies additional procedural textures under the same owner. */
export const AUDIO_RECIPES = Object.freeze({
  launch: Object.freeze({ type: "tone", wave: "sine", frequency: 82, endFrequency: 42, gain: .16, decay: .42, duration: .45 }),
  impact: Object.freeze({ type: "tone", wave: "triangle", frequency: 145, endFrequency: 72, gain: .08, decay: .16, duration: .18 }),
  footOnDirt: Object.freeze({ type: "zzfx", volume: .025, frequency: 100, attack: .002, release: .06, noise: 1 }),
});

export function createAudioOwner({
  AudioContextCtor = globalThis.AudioContext ?? globalThis.webkitAudioContext,
  loadZzfx = () => import("zzfx"), recipes = AUDIO_RECIPES,
  enabled = true, maxVoices = 4,
} = {}) {
  if (!Number.isInteger(maxVoices) || maxVoices < 1 || maxVoices > 32)
    throw new Error("bounded audio voice count required");
  let context, generator, loading, disposed = false;
  let muted = !enabled;
  const voices = new Map();
  const buffers = new Map();
  async function unlock() {
    if (muted || disposed || !AudioContextCtor) return false;
    try {
      context ??= new AudioContextCtor();
      if (context.state === "suspended") await context.resume();
      if (disposed) return false;
      loading ??= Promise.resolve().then(loadZzfx).then(async ({ ZZFX }) => {
        // Upstream creates an eager playback context. We only use its generator;
        // close it even if this owner was disposed while the import was pending.
        if (ZZFX.audioContext?.state !== "closed") await ZZFX.audioContext?.close?.();
        if (disposed) return false;
        generator = ZZFX.buildSamples.bind({ sampleRate: 44100, volume: ZZFX.volume });
        return true;
      }).catch(() => false);
      return await loading;
    } catch { return false; }
  }
  function cleanup(source) {
    const gain = voices.get(source);
    voices.delete(source);
    source.disconnect();
    gain?.disconnect();
  }
  function play(kind) {
    if (muted || disposed || !context || context.state !== "running" || voices.size >= maxVoices) return false;
    const recipe = recipes[kind];
    if (!recipe) return false;
    let source, gain;
    try {
      gain = context.createGain();
      const now = context.currentTime;
      if (recipe.type === "tone") {
        if (![recipe.frequency, recipe.endFrequency, recipe.gain, recipe.decay, recipe.duration].every(n => Number.isFinite(n) && n > 0) || recipe.duration > 2 || recipe.decay > recipe.duration) return false;
        source = context.createOscillator();
        source.type = recipe.wave;
        source.frequency.setValueAtTime(recipe.frequency, now);
        source.frequency.exponentialRampToValueAtTime(recipe.endFrequency, now + .18);
        gain.gain.setValueAtTime(.0001, now);
        gain.gain.exponentialRampToValueAtTime(recipe.gain, now + .01);
        gain.gain.exponentialRampToValueAtTime(.0001, now + recipe.decay);
      } else if (recipe.type === "zzfx" && generator) {
        let buffer = buffers.get(recipe);
        if (!buffer) {
          const { volume = 1, frequency = 220, attack = 0, release = .1, noise = 0 } = recipe;
          if (![volume, frequency, attack, release, noise].every(Number.isFinite) || volume < 0 || volume > 1 || frequency < 0 || frequency > 20000 || attack < 0 || release <= 0 || attack + release > 2 || noise < 0 || noise > 1) return false;
          const samples = generator(volume, 0, frequency, attack, 0, release, 0, 1, 0, 0, 0, 0, 0, noise);
          buffer = context.createBuffer(1, samples.length, 44100);
          buffer.getChannelData(0).set(samples);
          if (buffers.size < 64) buffers.set(recipe, buffer);
        }
        source = context.createBufferSource();
        source.buffer = buffer;
        gain.gain.value = 1;
      } else return false;
      source.connect(gain).connect(context.destination);
      voices.set(source, gain);
      source.onended = () => cleanup(source);
      source.start(now);
      if (recipe.type === "tone") source.stop(now + recipe.duration);
      return true;
    } catch {
      if (source) { try { source.stop(); } catch {} cleanup(source); }
      gain?.disconnect();
      return false;
    }
  }
  return {
    unlock, play,
    get muted() { return muted; },
    get voiceCount() { return voices.size; },
    setMuted(value) {
      muted = Boolean(value);
      if (!muted) void unlock();
      else void context?.suspend?.().catch(() => {});
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const source of [...voices.keys()]) { try { source.stop(); } catch {} cleanup(source); }
      buffers.clear();
      void context?.close?.().catch(() => {});
      context = undefined;
      generator = undefined;
    },
  };
}
