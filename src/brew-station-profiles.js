/**
 * Presentation-only keys for the fixed station art bank. These values describe
 * already-resolved station facts; they never decide a recipe or a job.
 */
export const STATION_VISUAL_PROFILES = Object.freeze([
  "empty",
  "stock-w0-b0-k0",
  "stock-w1-b0-k0",
  "stock-w0-b1-k0",
  "stock-w1-b1-k0",
  "stock-w0-b0-k1",
  "stock-w1-b0-k1",
  "stock-w0-b1-k1",
  "stock-w1-b1-k1",
  "prepare",
  "prepare-attended",
  "ferment",
  "ferment-burning",
  "keg",
  "settled",
]);

export function stationVisualProfile({
  finished,
  slots,
  process,
  attending,
  burning,
}) {
  if (!finished) return "empty";
  if (process?.phase === "prepare")
    return attending ? "prepare-attended" : "prepare";
  if (process?.phase === "ferment")
    return burning ? "ferment-burning" : "ferment";
  if (process?.phase === "keg") return "keg";
  if (slots.tray.spentGrain > 0) return "settled";
  const water = slots.kettle.water > 0 ? 1 : 0;
  const barm = slots.barm.barm > 0 ? 1 : 0;
  const keg = slots.keg.keg > 0 ? 1 : 0;
  return water || barm || keg ? `stock-w${water}-b${barm}-k${keg}` : "empty";
}

export function stationProfileOptions(profile) {
  if (!STATION_VISUAL_PROFILES.includes(profile))
    throw new Error(`Unknown brew station visual profile: ${profile}`);
  if (profile === "prepare-attended")
    return {
      liquid: "water",
      barm: true,
      keg: true,
      tray: false,
      stirring: true,
      fire: false,
      steam: false,
    };
  if (profile === "prepare")
    return {
      liquid: "water",
      barm: true,
      keg: true,
      tray: false,
      stirring: false,
      fire: false,
      steam: false,
    };
  if (["ferment", "ferment-burning", "keg"].includes(profile))
    return {
      liquid: "wort",
      barm: true,
      keg: true,
      tray: false,
      stirring: false,
      fire: profile === "ferment-burning",
      steam: profile === "ferment-burning",
    };
  if (profile === "settled")
    return {
      liquid: null,
      barm: true,
      keg: true,
      tray: true,
      stirring: false,
      fire: false,
      steam: false,
    };
  const [, water, barm, keg] = /^stock-w([01])-b([01])-k([01])$/.exec(
    profile,
  ) ?? [null, "0", "0", "0"];
  return {
    liquid: water === "1" ? "water" : null,
    barm: barm === "1",
    keg: keg === "1",
    tray: false,
    stirring: false,
    fire: false,
    steam: false,
  };
}
