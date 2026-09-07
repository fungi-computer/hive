// Wood has one owner at a time: a ground pile, Rowan's hands, or a build site.
export function looseWood(state) {
  return state.piles.reduce((total, pile) => total + pile.amount, 0);
}
export function dropWood(state, at, amount) {
  if (!amount) return;
  let pile = state.piles.find(
    (p) => p.x === at.x && p.z === at.z && p.level === (at.level ?? 0),
  );
  if (!pile) {
    pile = {
      id: `wood-${state.nextId++}`,
      x: at.x,
      z: at.z,
      level: at.level ?? 0,
      amount: 0,
    };
    state.piles.push(pile);
  }
  pile.amount += amount;
}
export function dropCarried(state) {
  dropWood(state, state.pawn, state.pawn.carry);
  state.pawn.carry = 0;
  state.pawn.carryTo = null;
}
