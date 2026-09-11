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

export function terrainLevelRange(frame) {
  const levels = (frame?.surfaces ?? []).map(({ cell }) => cell[1]).filter(integer);
  if (!levels.length) return { min: 0, max: 0 };
  return { min: Math.min(...levels), max: Math.max(...levels) };
}

function filterTerrain(frame, view) {
  if (!frame) return frame;
  if (!view.cutaway) return frame;
  const surfaces = frame.surfaces.filter(({ cell }) => cell[1] <= view.level);
  const columns = new Set(surfaces.map(({ cell }) => `${cell[0]},${cell[2]}`));
  return {
    ...frame,
    surfaces,
    water: frame.water.filter(({ at }) => at[1] <= view.level && columns.has(`${at[0]},${at[2]}`)),
  };
}

export function displayedTerrain(frame, view) { return filterTerrain(frame, view); }

export function createTerrainProjectionCache() {
  let key;
  let surfaces;
  let columns;
  let result;
  let lastFrame;
  return {
    update(frame, view, epoch) {
      if (!frame) {
        key = undefined;
        surfaces = undefined;
        columns = undefined;
        result = undefined;
        lastFrame = undefined;
        return undefined;
      }
      const nextKey = `${epoch ?? "none"}:${frame.revision}:${view.cutaway ? view.level : "full"}:${view.cutaway ? 1 : 0}`;
      if (nextKey === key && result && frame === lastFrame) return result;
      if (nextKey === key && result && view.cutaway) {
        lastFrame = frame;
        result = { ...frame, surfaces, water: frame.water.filter(({ at }) => at[1] <= view.level && columns.has(`${at[0]},${at[2]}`)) };
        return result;
      }
      key = nextKey;
      if (!view.cutaway) {
        surfaces = frame.surfaces;
        columns = undefined;
        lastFrame = frame;
        result = frame;
        return result;
      }
      const filtered = filterTerrain(frame, view);
      surfaces = filtered.surfaces;
      columns = new Set(surfaces.map(({ cell }) => `${cell[0]},${cell[2]}`));
      lastFrame = frame;
      result = filtered;
      return result;
    },
  };
}

export function setTerrainLevelRange(view, range, preferredLevel) {
  const level = integer(preferredLevel) ? preferredLevel : view.level;
  return { ...view, range, level: Math.min(range.max, Math.max(range.min, level)) };
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
