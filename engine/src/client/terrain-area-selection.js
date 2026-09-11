const integer = (value) => Number.isSafeInteger(value);
export const MAX_TERRAIN_SELECTION_AREA = 4096;

function cell(value) {
  if (!Array.isArray(value) || value.length !== 3 || !value.every(integer))
    throw new Error("terrain selection cell must contain three safe integers");
  return [value[0], value[1], value[2]];
}

/** Return a deterministic x/z rectangle on one published voxel level. */
export function rectangleCells(startValue, endValue, maxArea = 256) {
  const start = cell(startValue), end = cell(endValue);
  if (!integer(maxArea) || maxArea < 1 || maxArea > MAX_TERRAIN_SELECTION_AREA)
    throw new Error("terrain selection area limit is invalid");
  if (start[1] !== end[1]) throw new Error("terrain selection must stay on one level");
  const width = Math.abs(end[0] - start[0]) + 1;
  const depth = Math.abs(end[2] - start[2]) + 1;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(depth) || !Number.isSafeInteger(width * depth) || width > maxArea || depth > maxArea || width * depth > maxArea)
    throw new Error("terrain selection exceeds area limit");
  const cells = [];
  for (let z = Math.min(start[2], end[2]); z <= Math.max(start[2], end[2]); z++)
    for (let x = Math.min(start[0], end[0]); x <= Math.max(start[0], end[0]); x++)
      cells.push([x, start[1], z]);
  return cells;
}

/** Keep only authored exterior surfaces already present in the published frame. */
export function visibleTerrainAreaPreview(frame, start, end, maxArea = 256) {
  if (!frame || !Array.isArray(frame.surfaces)) return [];
  const byCell = new Map(frame.surfaces.map((surface) => [surface.cell.join(","), surface]));
  return rectangleCells(start, end, maxArea)
    .map((at) => byCell.get(at.join(",")))
    .filter(Boolean);
}

export function beginTerrainArea(cellValue) { return { start: cell(cellValue), current: cell(cellValue) }; }
export function updateTerrainArea(state, cellValue) {
  if (!state?.start) throw new Error("terrain selection has not begun");
  return { ...state, current: cell(cellValue) };
}
export function commitTerrainArea(state, maxArea = 256) {
  if (!state?.start || !state.current) return [];
  return rectangleCells(state.start, state.current, maxArea);
}
export function cancelTerrainArea() { return { start: null, current: null }; }
