/** Join local Whistle binding metadata to canonical server command targets. */
export function projectContextualPresentation({ facts, controls, targets, selectedIds, latestFacts = [], currentIds = [] }) {
  const selected = new Set(selectedIds);
  const current = new Set(currentIds);
  const targetMap = new Map(targets.map(target => [target.commandId, target.subjects]));
  const visibleFacts = facts.filter(fact => fact.subjects === undefined || fact.subjects.some(id => selected.has(id)));
  const selectionFacts = visibleFacts.filter(fact => fact.subjects?.some(id => selected.has(id)));
  const worldFacts = visibleFacts.filter(fact => fact.subjects === undefined || !fact.subjects.some(id => selected.has(id)));
  const selectionControls = [];
  const worldControls = [];
  for (const control of controls) {
    const subjects = targetMap.get(control.commandId);
    if (subjects === undefined) {
      if (control.selection === "entities") {
        if (control.availability?.status === "unavailable" && selected.size > 0)
          selectionControls.push({ ...control, subjects: [] });
        continue;
      }
      worldControls.push(control);
      continue;
    }
    const scoped = subjects.filter(id => current.has(id));
    if (control.selection && typeof control.selection === "object" && control.selection.cardinality === "one"
      ? scoped.filter(id => selected.has(id)).length === 1
      : scoped.some(id => selected.has(id))) selectionControls.push({ ...control, subjects: scoped });
  }
  const selectedLabels = selectedIds.map(id => latestFacts.find(fact => fact.id === id)?.label || id).filter(Boolean);
  const selectionLabel = selectedLabels.length ? selectedLabels.join(", ") : "Selection";
  return {
    world: { facts: worldFacts, controls: worldControls },
    selection: { facts: selectionFacts, controls: selectionControls, label: selectionLabel },
  };
}
