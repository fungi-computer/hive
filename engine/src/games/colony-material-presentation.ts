/** Content-owned presentation for loose physical ground stock. The renderer
 * receives only the selected visual identity and never infers inventory. */
export const colonyGroundMaterialVisual = new Map<string, string>([
  ["soil-spoil", "soil"],
  ["stone-spoil", "stone"],
  ["wood-felled", "colony.tree.felled"],
  ["wood", "colony.material.wood"],
  ["bread", "colony.material.bread"],
  ["mugwort", "colony.material.mugwort"],
]);
