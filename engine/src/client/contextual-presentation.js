/** Join local Whistle binding metadata to canonical server command targets. */
export function projectContextualPresentation({
  facts,
  controls,
  targets,
  selectedIds,
  latestFacts = [],
  currentIds = [],
}) {
  const selected = new Set(selectedIds);
  const current = new Set(currentIds);
  const { selectionFacts, worldFacts } = partitionFacts(facts, selected);
  const { selectionControls, worldControls } = partitionControls(
    controls,
    targets,
    selected,
    current,
  );
  const selectedLabels = selectedIds
    .map((id) => latestFacts.find((fact) => fact.id === id)?.label || id)
    .filter(Boolean);
  const selectionLabel = selectedLabels.length
    ? selectedLabels.join(", ")
    : "Selection";
  return {
    world: { facts: worldFacts, controls: worldControls },
    selection: {
      facts: selectionFacts,
      controls: selectionControls,
      label: selectionLabel,
    },
  };
}

/** Keep a semantic command in its owning catalog instead of duplicating it in a sidebar. */
export function omitControlsById(controls, omittedIds) {
  const omitted = new Set(omittedIds ?? []);
  return (controls ?? []).filter((control) => !omitted.has(control.id));
}

function partitionFacts(facts, selected) {
  const visible = facts.filter(
    (fact) =>
      fact.subjects === undefined ||
      fact.subjects.some((id) => selected.has(id)),
  );
  return {
    selectionFacts: visible.filter((fact) =>
      fact.subjects?.some((id) => selected.has(id)),
    ),
    worldFacts: visible.filter(
      (fact) =>
        fact.subjects === undefined ||
        !fact.subjects.some((id) => selected.has(id)),
    ),
  };
}

function isSelectionControl(control) {
  return (
    control.selection === "entities" ||
    (control.selection && typeof control.selection === "object")
  );
}

function unavailableSelection(control, selected) {
  return isSelectionControl(control) &&
    control.availability?.status === "unavailable" &&
    selected.size > 0
    ? { ...control, subjects: [] }
    : null;
}

function acceptsSelectedSubjects(control, subjects, selected) {
  const scoped = subjects.filter((id) => selected.has(id));
  return control.selection &&
    typeof control.selection === "object" &&
    control.selection.cardinality === "one"
    ? scoped.length === 1
    : scoped.length > 0;
}

function partitionControls(controls, targets, selected, current) {
  const targetMap = new Map();
  for (const target of targets) {
    const subjects = targetMap.get(target.commandId) ?? [];
    const known = new Set(subjects);
    for (const subject of target.subjects)
      if (!known.has(subject)) { known.add(subject); subjects.push(subject); }
    targetMap.set(target.commandId, subjects);
  }
  const selectionControls = [];
  const worldControls = [];
  for (const control of controls) {
    const subjects = targetMap.get(control.commandId);
    if (subjects === undefined) {
      const unavailable = unavailableSelection(control, selected);
      if (unavailable) selectionControls.push(unavailable);
      else if (!isSelectionControl(control)) worldControls.push(control);
      continue;
    }
    const scoped = subjects.filter((id) => current.has(id));
    if (acceptsSelectedSubjects(control, scoped, selected))
      selectionControls.push({ ...control, subjects: scoped });
  }
  return { selectionControls, worldControls };
}
