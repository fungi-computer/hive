import { requireCondition } from './soil.mjs';
import { canonicalAnchors, elevation, validHead } from './state.mjs';

export function pressureGuess(g, massKg, work) {
  const anchors = canonicalAnchors(g, massKg), source = new Int16Array(g.nodes.length).fill(-1);
  const heads = new Float64Array(g.nodes.length), totalHead = new Float64Array(g.nodes.length), queue = [];
  // canonicalAnchors explicitly sorts actual seed IDs, not caller insertion.
  for (const a of anchors) {
    source[a.node] = a.node; totalHead[a.node] = a.totalHeadM; heads[a.node] = a.headM; queue.push(a.node);
  }
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const from = queue[cursor];
    for (const edge of g.adjacency[from]) {
      work.guessEdgeVisits++;
      if (source[edge.node] !== -1) continue;
      source[edge.node] = source[from]; queue.push(edge.node);
    }
  }
  requireCondition(queue.length === g.nodes.length, 'all graph pressure guesses reach a physical anchor');
  for (const [i, node] of g.nodes.entries()) {
    work.guessNodeReads++;
    if (source[i] === i) continue;
    const raw = totalHead[source[i]] - elevation(node);
    // Numerical initial iterate only: no stock or accepted head is clamped.
    heads[i] = node.kind === 'soil' ? Math.min(node.maxHeadM, Math.max(0, raw)) :
      Math.max(node.minHeadM, Math.min(0, raw));
    if (heads[i] !== raw) work.guessProjections++;
    requireCondition(validHead(node, heads[i]), 'initial pressure branch/envelope');
  }
  return heads;
}
