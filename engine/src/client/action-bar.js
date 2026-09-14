/** Pure action-bar grouping shared by game-specific presentation composition. */
export function actionBarGroups(controls, buildIds) {
  const builds = [];
  const work = [];
  const zones = [];
  for (const control of controls) {
    if (buildIds.has(control.id)) builds.push(control);
    else if (control.category === "Storage") zones.push(control);
    else work.push(control);
  }
  return { builds, work, zones };
}

export function toggleActionCategory(current, next) {
  return current === next ? null : next;
}

/**
 * Controls explicitly owned by the persistent action dock. Selection remains
 * ordinary client state; the dock only becomes actionable once something is
 * selected and still submits the owning semantic command.
 */
export function selectedActionBarControls(controls, selectedIds) {
  if (!Array.isArray(selectedIds) || selectedIds.length === 0) return [];
  return (controls ?? []).filter((control) =>
    control.placement === "action-bar" &&
    control.selection === "entities" &&
    control.availability?.status !== "unavailable",
  );
}
