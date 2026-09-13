/** Small client-only projections for the retained Clearing interaction shape. */
export function selectedBrewStation(facts, selectedIds) {
  const selected = new Set(selectedIds ?? []);
  return (facts ?? []).find((fact) =>
    selected.has(fact.id) &&
    typeof fact.visual === "string" &&
    fact.visual.startsWith("colony.brew-station")
  ) ?? null;
}

export function colonyControl(controls, id) {
  return (controls ?? []).find((control) => control.id === id) ?? null;
}
