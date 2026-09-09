import { requireCondition } from './soil.mjs';
import { changeMass, validateState, freezeState } from './state.mjs';
import { assertWorldRecord as exactRecord } from '../../world/data-contract.mjs';

/** A domain-boundary transfer, not a source of new game inventory. The caller
 * must commit its material counterpart in the same detached owner transaction. */
export function exchangeMass(g, identity, input, command) {
  validateState(g, identity, input);
  exactRecord(command, ['nodeId', 'direction', 'massKg'], 'canonical finite exchange command');
  requireCondition(typeof command.nodeId === 'string' &&
    (command.direction === 'withdraw' || command.direction === 'deposit') &&
    Number.isFinite(command.massKg) && command.massKg > 0, 'finite positive directed exchange');
  const index = g.nodes.findIndex(node => node.id === command.nodeId), node = g.nodes[index];
  requireCondition(node && node.kind !== 'soil', 'exchange needs a live free-water node');
  const beforeKg = input.massKg[index], withdrawal = command.direction === 'withdraw';
  requireCondition(command.massKg <= (withdrawal ? beforeKg - node.minMassKg : node.maxMassKg - beforeKg),
    withdrawal ? 'insufficient finite water' : 'finite water capacity exceeded');
  const delta = withdrawal ? -command.massKg : command.massKg;
  const afterKg = changeMass(beforeKg, delta), boundaryKg = changeMass(input.boundaryKg, delta);
  const massKg = [...input.massKg]; massKg[index] = afterKg;
  const state = freezeState({ ...input, massKg, boundaryKg });
  validateState(g, identity, state);
  const receipt = Object.freeze({ nodeId: node.id, direction: command.direction, massKg: command.massKg,
    beforeKg, afterKg, boundaryBeforeKg: input.boundaryKg, boundaryAfterKg: boundaryKg, timeS: input.timeS });
  return Object.freeze({ state, receipt });
}
