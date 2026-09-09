import { MATERIAL } from '../height-caves.mjs';
import { createVolume } from '../../engine/environment/soil/volume.mjs';
import { createVolumeGeometry } from '../../engine/environment/soil/geometry.mjs';
import { balanceTolerance } from '../../engine/environment/soil/state.mjs';
import { compensatedSum, requireCondition } from '../../engine/environment/soil/soil.mjs';
import { key, xyz, same, ordered, immutable, exactFields, coordinate, restoreWorld,
  assertRegionWorld, pitContacts, assertVented, excavateWorld, metric, worldSnapshot } from './world-binding.mjs';

const LEGACY_VERSION = 'one-vented-soil-excavation-with-finite-pit-v1';
const VERSION = 'height-caves-finite-seepage-v2';
const PIT_ID = 'excavation-pit';
const MAX_ENCODED = 1048576;
const STATE_FIELDS = ['version', 'identity', 'world', 'soilGeometry', 'soilState',
  'initialWaterKg', 'pit', 'exports', 'excavation'];
const identifier = value => typeof value === 'string' && /^[a-z][a-z0-9-]{0,95}$/.test(value);
const nodeId = at => `cell:${key(at)}`;
const own = value => immutable(structuredClone(value));
const encodedSize = value => new TextEncoder().encode(value).byteLength;
const matchesAt = (change, at) => change.x === at[0] && change.y === at[1] && change.z === at[2];

function commandInput(input) {
  exactFields(input, ['operationId', 'expectedWorldRevision', 'at'], 'exact excavation command fields');
  requireCondition(identifier(input.operationId) && Number.isSafeInteger(input.expectedWorldRevision) &&
    input.expectedWorldRevision >= 0 && Number.isSafeInteger(input.expectedWorldRevision + 1),
    'bounded excavation operation identity and revision');
  return { operationId: input.operationId, expectedWorldRevision: input.expectedWorldRevision,
    at: coordinate(input.at) };
}

function validateLedger(state, facts, voxelM3) {
  requireCondition(Array.isArray(state.exports) && state.exports.length <= 1, 'at most one wet-spoil export');
  for (const entry of state.exports) {
    exactFields(entry, ['id', 'fromNodeId', 'soilId', 'waterKg', 'sourceVoxelM3'], 'wet-spoil export fields');
    requireCondition(typeof entry.id === 'string' && typeof entry.fromNodeId === 'string' &&
      identifier(entry.soilId) && Number.isFinite(entry.waterKg) && entry.waterKg > 0 &&
      entry.sourceVoxelM3 === voxelM3, 'finite named wet-spoil water and source volume');
  }
  const exportWaterKg = compensatedSum(state.exports.map(entry => entry.waterKg));
  const pitWaterKg = facts.nodes.find(node => node.kind === 'pit')?.massKg ?? 0;
  const totalWaterKg = compensatedSum([facts.totalMassKg, exportWaterKg]);
  requireCondition(Number.isFinite(state.initialWaterKg) && state.initialWaterKg > 0 &&
    Math.abs(totalWaterKg - state.initialWaterKg) <= balanceTolerance(state.initialWaterKg),
    'soil plus finite spoil plus pit must retain the original water total');
  return { retainedWaterKg: facts.totalMassKg - pitWaterKg, exportWaterKg, pitWaterKg,
    totalWaterKg, residualKg: totalWaterKg - state.initialWaterKg };
}

function rebuildSoil(descriptor, stocks, clock) {
  const owner = createVolume(descriptor), initial = owner.initial({ stocks });
  const state = owner.decode(JSON.stringify({ ...initial, timeS: clock.timeS, steps: clock.steps }));
  return { owner, state };
}

function validateExcavationHistory(config, state, facts, legacy) {
  exactFields(state.pit, ['at', 'mode', 'reservoirId'], 'finite pit binding fields');
  exactFields(state.excavation, ['command', 'previousWorldTarget', 'previousSoilIdentity'],
    'one accepted excavation receipt');
  const command = commandInput(state.excavation.command), at = command.at;
  requireCondition(same(coordinate(state.pit.at), at) && state.pit.mode === 'open-vented-integrated-seepage' &&
    state.pit.reservoirId === PIT_ID && state.exports.length === 1 &&
    state.world.revision === command.expectedWorldRevision + 1, 'one finite unlined pit at accepted revision');
  const pitNodes = facts.nodes.filter(node => node.kind === 'pit');
  requireCondition(pitNodes.length === 1 && pitNodes[0].nodeId === `reservoir:${PIT_ID}` &&
    same(pitNodes[0].at, at), 'pit water lives only in its actual shared soil-boundary node');
  const entry = state.exports[0];
  requireCondition(entry.id === `wet-spoil:${command.operationId}` && entry.fromNodeId === nodeId(at) &&
    !state.soilGeometry.cells.some(cell => same(cell.at, at)), 'excavated water has exactly one export owner');
  const currentTarget = state.world.changes.find(change => matchesAt(change, at));
  // A generated soil target cannot be base-equal air after excavation. A prior
  // authored soil overlay may be removed instead, which the replay below proves.
  if (currentTarget) requireCondition(currentTarget.material === MATERIAL.air && currentTarget.revision === state.world.revision,
    'current target overlay agrees with its accepted air edit');
  const previousTarget = state.excavation.previousWorldTarget;
  if (previousTarget !== null) {
    exactFields(previousTarget, ['x', 'y', 'z', 'material', 'revision'], 'previous target overlay fields');
    requireCondition(matchesAt(previousTarget, at) && previousTarget.material === MATERIAL.soil,
      'previous target overlay described this soil');
  }
  const previousCheckpoint = { ...state.world, revision: command.expectedWorldRevision,
    changes: [...state.world.changes.filter(change => !matchesAt(change, at)),
      ...(previousTarget === null ? [] : [previousTarget])] };
  const previousWorld = restoreWorld(config.worldIdentity, previousCheckpoint);
  requireCondition(previousWorld.readPoint(xyz(at)) === MATERIAL.soil, 'recorded edit must actually remove world soil');
  excavateWorld(previousWorld, command);
  requireCondition(same(worldSnapshot(previousWorld, legacy), state.world), 'one replayed material edit exactly explains current world');

  const descriptor = { ...state.soilGeometry, version: 'rigid-soil-voxel-graph-v1',
    revision: command.expectedWorldRevision,
    cells: [...state.soilGeometry.cells, { at, soilId: entry.soilId }],
    reservoirs: state.soilGeometry.reservoirs.filter(r => r.id !== PIT_ID),
    ports: state.soilGeometry.ports.filter(p => p.reservoirId !== PIT_ID) };
  const previous = createVolume(descriptor), previousGeometry = createVolumeGeometry(descriptor);
  const sourceNode = previousGeometry.nodes.find(node => node.id === entry.fromNodeId);
  requireCondition(previous.identity === state.excavation.previousSoilIdentity &&
    entry.waterKg >= sourceNode.minMassKg && entry.waterKg <= sourceNode.maxMassKg,
    'previous geometry identity and exported source pore-capacity bounds');
}

function validate(config, identity, state, legacy = false) {
  exactFields(state, STATE_FIELDS, 'combined excavation checkpoint fields');
  requireCondition(encodedSize(JSON.stringify(state)) <= MAX_ENCODED, 'bounded complete excavation input');
  requireCondition(state.version === (legacy ? LEGACY_VERSION : VERSION) && state.identity === identity, 'excavation world/region/policy identity');
  requireCondition(state.soilGeometry.regionId === config.regionId, 'bound regional soil identity');
  const physical = metric(config.worldIdentity);
  requireCondition(same(state.soilGeometry.spacingM, physical.spacingM), 'soil uses the bound world metric');
  requireCondition(state.world.schema === (legacy ? 2 : 1), 'world codec matches combined checkpoint version');
  const world = restoreWorld(config.worldIdentity, state.world), owner = createVolume(state.soilGeometry);
  // Use the public codec so all existing strict canonical/relational laws apply.
  const soil = owner.decode(JSON.stringify(state.soilState)), facts = owner.read(soil);
  requireCondition(same(owner.geometry, state.soilGeometry) && same(worldSnapshot(world, legacy), state.world),
    'canonical world and soil descriptor ordering');
  assertRegionWorld(world, owner.geometry);
  let contacts = [];
  if (state.excavation === null) {
    requireCondition(state.pit === null && Array.isArray(state.exports) && state.exports.length === 0 &&
      state.initialWaterKg === soil.initialTotalKg && !facts.nodes.some(node => node.kind === 'pit'),
      'initial adapter has no excavation/export or changed baseline');
  } else {
    validateExcavationHistory(config, state, facts, legacy);
    assertVented(world, state.pit.at);
    contacts = pitContacts(world, owner.geometry, state.pit.at);
    const expected = pitPorts(contacts);
    const actual = owner.geometry.ports.filter(port => port.reservoirId === PIT_ID);
    requireCondition(same(ordered([...actual].sort(portOrder)), ordered([...expected].sort(portOrder))),
      'all actual unlined soil contacts bind the one physical pit');
  }
  const balance = validateLedger(state, facts, physical.voxelM3);
  return { world, owner, soil, facts, contacts, balance };
}

function admitTarget(checked, command) {
  requireCondition(checked.world.describe().revision === command.expectedWorldRevision,
    'stale excavation world revision');
  const descriptor = checked.owner.geometry;
  const target = descriptor.cells.find(cell => same(cell.at, command.at));
  requireCondition(target && checked.world.readPoint(xyz(command.at)) === MATERIAL.soil, 'excavation targets one owned world-soil voxel');
  requireCondition(!descriptor.ports.some(port => same(port.cell, command.at)),
    'cannot remove a finite-reservoir attachment in this transaction');
  const contacts = pitContacts(checked.world, descriptor, command.at);
  requireCondition(!descriptor.reservoirs.some(r => r.id === PIT_ID || r.kind === 'vented-pit'),
    'one available explicit excavation reservoir identity');
  pitPorts(contacts);
  requireCondition(!contacts.some(contact => descriptor.closedFaces.includes(contact.faceId)),
    'first unlined excavation cannot remove an authored closed interior face');
  assertVented(checked.world, command.at);
  const stock = checked.facts.nodes.find(node => node.nodeId === nodeId(command.at));
  requireCondition(stock && stock.massKg > 0, 'existing finite wet-soil stock required');
  return { target, stock, contacts };
}

const portOrder = (a, b) => {
  const left = `${key(a.cell)}:${a.side}`, right = `${key(b.cell)}:${b.side}`;
  return left < right ? -1 : left > right ? 1 : 0;
};
function pitPorts(contacts) {
  const floor = contacts.find(face => face.axis === 1 && face.sign === -1);
  requireCondition(floor.material === 'soil', 'first pit needs its actual porous floor');
  requireCondition(contacts.filter(face => face.axis !== 1).every(face => face.material !== 'open'),
    'an open lateral outlet needs actual spill routing, not fictitious basin walls');
  return contacts.filter(face => face.material === 'soil').map(face => ({ cell: face.neighbor,
    side: `${['x', 'y', 'z'][face.axis]}${face.sign < 0 ? '+' : '-'}`, reservoirId: PIT_ID }));
}

export function createExcavationAdapter(input) {
  exactFields(input, ['worldIdentity', 'regionId'], 'explicit adapter binding');
  requireCondition(identifier(input.regionId), 'bound region ID');
  const config = own({ worldIdentity: ordered(input.worldIdentity), regionId: input.regionId });
  const identity = JSON.stringify({ version: VERSION, ...config });
  const legacyIdentity = JSON.stringify({ version: LEGACY_VERSION, ...config });
  metric(config.worldIdentity); // Admit the recipe before exposing operations.

  function initial(input) {
    exactFields(input, ['world', 'soilGeometry', 'soilState'], 'initial canonical world/soil inputs');
    const owner = createVolume(input.soilGeometry), soil = owner.decode(JSON.stringify(input.soilState));
    const world = restoreWorld(config.worldIdentity, input.world);
    const state = own({ version: VERSION, identity, world: world.save(), soilGeometry: owner.geometry,
      soilState: soil, initialWaterKg: soil.initialTotalKg, pit: null, exports: [], excavation: null });
    validate(config, identity, state); return state;
  }

  function excavate(input, rawCommand) {
    const checked = validate(config, identity, input), command = commandInput(rawCommand);
    if (input.excavation !== null) {
      requireCondition(same(command, input.excavation.command), 'second or conflicting excavation is unsupported');
      return { state: own(input), replayed: true, balance: checked.balance, contacts: checked.contacts };
    }
    const { target, stock, contacts } = admitTarget(checked, command);
    const previousWorldTarget = input.world.changes.find(change => matchesAt(change, command.at)) ?? null;
    excavateWorld(checked.world, command); // Private candidate; never the caller's world.
    const descriptor = { ...checked.owner.geometry, version: 'rigid-soil-voxel-pit-graph-v1',
      revision: command.expectedWorldRevision + 1,
      cells: checked.owner.geometry.cells.filter(cell => !same(cell.at, command.at)),
      reservoirs: [...checked.owner.geometry.reservoirs, { id: PIT_ID, kind: 'vented-pit', at: command.at }],
      ports: [...checked.owner.geometry.ports, ...pitPorts(contacts)] };
    const retained = checked.facts.nodes.filter(node => node.nodeId !== stock.nodeId)
      .map(node => ({ nodeId: node.nodeId, massKg: node.massKg }));
    retained.push({ nodeId: `reservoir:${PIT_ID}`, massKg: 0 });
    const rebuilt = rebuildSoil(descriptor, retained, checked.soil);
    const state = own({ ...input, world: checked.world.save(), soilGeometry: rebuilt.owner.geometry,
      soilState: rebuilt.state, pit: { at: command.at, mode: 'open-vented-integrated-seepage', reservoirId: PIT_ID },
      exports: [{ id: `wet-spoil:${command.operationId}`, fromNodeId: stock.nodeId,
        soilId: target.soilId, waterKg: stock.massKg, sourceVoxelM3: metric(config.worldIdentity).voxelM3 }],
      excavation: { command, previousWorldTarget, previousSoilIdentity: checked.owner.identity } });
    const accepted = validate(config, identity, state);
    return { state, replayed: false, balance: accepted.balance, contacts: accepted.contacts };
  }

  return Object.freeze({ identity, initial, excavate,
    read: state => {
      const checked = validate(config, identity, state);
      return { balance: checked.balance, contacts: checked.contacts, soil: checked.facts,
        hydraulicStatus: state.pit === null ? 'original-volume-owner' : 'unlined-pit-finite-storage',
        finiteGas: false, timeS: checked.soil.timeS, steps: checked.soil.steps };
    },
    encode: state => {
      validate(config, identity, state); const raw = JSON.stringify(state);
      requireCondition(encodedSize(raw) <= MAX_ENCODED, 'bounded encoded excavation checkpoint'); return raw;
    },
    decode: raw => {
      requireCondition(typeof raw === 'string' && raw.length <= MAX_ENCODED && encodedSize(raw) <= MAX_ENCODED,
        'bounded encoded excavation checkpoint');
      let state = JSON.parse(raw);
      if (state.version === LEGACY_VERSION) {
        // Validate original custody, history and balance BEFORE conversion.
        validate(config, legacyIdentity, state, true);
        state = { ...state, version: VERSION, identity,
          world: restoreWorld(config.worldIdentity, state.world).save() };
      }
      validate(config, identity, state); return own(state);
    },
    advance: (state, intervalS, options = {}) => {
      const checked = validate(config, identity, state);
      const result = checked.owner.advance(checked.soil, intervalS, options);
      const next = own({ ...state, soilState: result.state });
      const accepted = validate(config, identity, next);
      return { state: next, receipt: result.receipt, work: result.work, balance: accepted.balance };
    },
    backfill: state => {
      validate(config, identity, state);
      throw new Error('backfill is not admitted: displaced finite water needs an owned destination and capacity');
    },
  });
}
