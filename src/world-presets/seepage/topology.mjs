import { MATERIAL } from '../height-caves.mjs';
import { createVolume } from '../../engine/environment/soil/index.js';
import { key, xyz, same, assertVented, pitContacts, requireCondition } from './world-binding.mjs';
import { removalSource } from './source-record.mjs';
const signed = n => n < 0 ? `n${-n}` : `p${n}`;
const columnId = at => `column-${signed(at[0])}-${signed(at[2])}`;

function columnsFrom(world, removed) {
  const groups = new Map();
  for (const cell of removed) {
    const id = columnId(cell.at);
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(cell);
  }
  return [...groups].map(([id, cells]) => {
    cells.sort((a, b) => a.at[1] - b.at[1]);
    requireCondition(cells.every((cell, i) => cell.at[1] === cells[0].at[1] + i),
      'excavated column is one contiguous vertical air run');
    requireCondition(cells.at(-1).kind === 'porous', 'vented columns begin with an owned porous surface cut');
    const at = [...cells[0].at], floor = world.readPoint(xyz([at[0], at[1] - 1, at[2]]));
    requireCondition(floor === MATERIAL.soil || floor === MATERIAL.stone,
      'finite column has an actual soil or stone bottom, not an unmodeled opening');
    return { id, kind: 'vented-pit', at, heightCells: cells.length,
      bottom: floor === MATERIAL.soil ? 'porous' : 'sealed' };
  }).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

function* exposedColumnFaces(world, descriptor, column) {
  const { at, heightCells } = column;
  for (let y = at[1]; y < at[1] + heightCells; y++) {
    for (const face of pitContacts(world, descriptor, [at[0], y, at[2]])) {
      // Vertical faces between air voxels are internal, and the top is vented.
      if (face.axis !== 1 || (y === at[1] && face.sign === -1)) yield face;
    }
  }
}

function columnContacts(world, descriptor, columns, removed) {
  const open = new Set(removed.map(cell => key(cell.at))), ports = [], contacts = [];
  for (const column of columns) {
    const { at, heightCells, id } = column;
    assertVented(world, [at[0], at[1] + heightCells - 1, at[2]]);
    for (const face of exposedColumnFaces(world, descriptor, column)) {
      const floor = face.axis === 1;
      requireCondition(!floor || face.material === (column.bottom === 'porous' ? 'soil' : 'stone'),
        'column bottom binding agrees with actual world material');
      requireCondition(face.material !== 'open' || open.has(key(face.neighbor)),
        'open lateral outlet must belong to another finite column');
      contacts.push({ ...face, reservoirId: id });
      if (face.material === 'soil') ports.push({ cell: face.neighbor,
        side: `${['x', 'y', 'z'][face.axis]}${face.sign < 0 ? '+' : '-'}`, reservoirId: id });
    }
  }
  return { ports, contacts };
}

function surfaceEdges(columns, coefficient) {
  const edges = [];
  for (let i = 0; i < columns.length; i++) for (let j = i + 1; j < columns.length; j++) {
    const a = columns[i], b = columns[j];
    if (Math.abs(a.at[0] - b.at[0]) + Math.abs(a.at[2] - b.at[2]) !== 1) continue;
    requireCondition(a.at[1] + a.heightCells === b.at[1] + b.heightCells,
      'connected vented columns need the same modeled rim; no hidden roof or overflow outlet');
    edges.push({ left: a.id, right: b.id, coefficient });
  }
  return edges;
}

/** Rebuild only derived geometry. Saved terrain owns excavation; the volume
 * owns stock and time. Neither contacts nor reservoir capacity are extra state. */
export function deriveTopology(config, world) {
  const checkpoint = world.save();
  requireCondition(checkpoint.revision === checkpoint.changes.length &&
    checkpoint.changes.every(change => change.material === MATERIAL.air),
    'world edits exactly match single-voxel solid removals');
  const removed = checkpoint.changes.map(change =>
    removalSource(config, world, [change.x, change.y, change.z]));
  const removedKeys = new Set(removed.map(cell => key(cell.at))), remaining = [];
  for (const cell of config.baseSoilGeometry.cells) {
    const material = world.readPoint(xyz(cell.at));
    requireCondition(material === MATERIAL.soil || material === MATERIAL.air,
      'bounded excavation changes original solids only to air');
    requireCondition(material === MATERIAL.soil || removedKeys.has(key(cell.at)),
      'removed porous cells have an actual world edit');
    if (material === MATERIAL.soil) remaining.push(cell);
  }
  const columns = columnsFrom(world, removed);
  const descriptor = { ...config.baseSoilGeometry, revision: checkpoint.revision, cells: remaining,
    reservoirs: columns, surfaceEdges: surfaceEdges(columns, config.surfaceCoefficient) };
  const { ports, contacts } = columnContacts(world, descriptor, columns, removed);
  const owner = createVolume({ ...descriptor, ports });
  return { owner, removed, columns, contacts };
}

export function assertBaseGeometry(world, geometry) {
  requireCondition(world.describe().revision === 0 && geometry.revision === 0 &&
    geometry.reservoirs.length === 0 && geometry.ports.length === 0 &&
    geometry.closedFaces.length === 0 && geometry.surfaceEdges.length === 0,
    'initial generated porous domain has no edits, containers or authored barriers');
  for (const cell of geometry.cells)
    requireCondition(world.readPoint(xyz(cell.at)) === MATERIAL.soil,
      'base porous domain contains actual generated soil');
  requireCondition(same(world.save().changes, []), 'initial world has no authored terrain overlays');
}
