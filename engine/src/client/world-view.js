// Presentation-only level and cover policy. The server remains authoritative
// for facts; this module only consumes the already filtered view projection.
const integer = (value) => Number.isSafeInteger(value);

export function createWorldView(options = {}) {
  const range = options.range ?? { min: 0, max: 0 };
  if (!integer(range.min) || !integer(range.max) || range.min > range.max)
    throw new Error("world view requires an ordered integer level range");
  const current = options.level ?? range.min;
  if (!integer(current) || current < range.min || current > range.max)
    throw new Error("world view level is outside its range");
  return {
    range: { min: range.min, max: range.max },
    level: current,
    cutaway: Boolean(options.cutaway),
    presentedSurfaces: new Set(options.presentedSurfaces ?? []),
  };
}

export function setWorldViewLevel(view, level) {
  if (!integer(level) || level < view.range.min || level > view.range.max)
    return view;
  return { ...view, level };
}

export function toggleWorldCutaway(view, cutaway) {
  return { ...view, cutaway: Boolean(cutaway) };
}

function metadata(fact) {
  return fact?.view && typeof fact.view === "object" ? fact.view : null;
}

export function projectWorldFact(fact, view) {
  const info = metadata(fact);
  if (!info) return { visible: true, pickable: true };
  if (info.level !== undefined && (!integer(info.level) || info.level !== view.level))
    return { visible: false, pickable: false };
  const coverPresented = info.surfaceId !== undefined && view.presentedSurfaces.has(info.surfaceId);
  if (info.covered === true && !(view.cutaway && coverPresented))
    return { visible: false, pickable: false };
  return {
    visible: info.visible !== false,
    pickable: info.visible !== false && info.pickable !== false,
  };
}

export function visibleWorldFacts(facts, view) {
  return facts.filter((fact) => projectWorldFact(fact, view).visible);
}
