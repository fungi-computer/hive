function matchesSelection(item, selected) {
  return item.subjects === undefined || item.subjects.some((id) => selected.has(id));
}

/**
 * Projects presentation metadata for the current display context. Subjects
 * only filter what is shown; command admission remains runtime-owned.
 * `latestFacts` is the most recently accepted world view, so selection labels
 * do not depend on an older rendered/interpolated frame.
 */
export function projectContextualPresentation({
  facts,
  controls,
  selectedIds,
  latestFacts,
  currentIds = latestFacts.map((fact) => fact.id),
}) {
  const current = new Set(currentIds);
  const selected = new Set(selectedIds.filter((id) => current.has(id)));
  const worldFacts = facts.filter((fact) => fact.subjects === undefined);
  const worldControls = controls.filter((control) => control.subjects === undefined);
  const selectionFacts = facts.filter((fact) => fact.subjects !== undefined && matchesSelection(fact, selected));
  const selectionControls = controls.filter((control) => control.subjects !== undefined && matchesSelection(control, selected));
  const labels = latestFacts
    .filter((fact) => selected.has(fact.id) && typeof fact.label === "string" && fact.label.length > 0)
    .map((fact) => fact.label);
  const selectionLabel = [...new Set(labels)].join(", ") || "Selected";
  return {
    world: { facts: worldFacts, controls: worldControls },
    selection: { facts: selectionFacts, controls: selectionControls, label: selectionLabel },
  };
}
