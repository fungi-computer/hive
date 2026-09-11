// Presentation-only level and cover policy. The server remains authoritative
// for facts; this module only consumes the already authorized view projection.
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
    // Entries are presented by the observation producer. They are not client
    // authority and an empty list means no cover metadata is available.
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

/**
 * Facts may carry view metadata from an already authorized observation:
 * { level, covered, surfaceId, pickable }. Untagged facts retain current
 * behavior, which keeps flat demos at layer 0 until terrain joins.
 */
export function projectWorldFact(fact, view) {
  const info = metadata(fact);
  if (!info) return { visible: true, pickable: true };
  if (info.level !== undefined && (!integer(info.level) || info.level !== view.level))
    return { visible: false, pickable: false };
  const coverPresented = info.surfaceId !== undefined && view.presentedSurfaces.has(info.surfaceId);
  if (info.covered === true && !(view.cutaway && coverPresented))
    return { visible: false, pickable: false };
  return {
    // A hidden fact can never be pickable, even when malformed metadata says
    // otherwise. The same projected result feeds rendering and selection.
    visible: info.visible !== false,
    pickable: info.visible !== false && info.pickable !== false,
  };
}

export function visibleWorldFacts(facts, view) {
  return facts.filter((fact) => projectWorldFact(fact, view).visible);
}
