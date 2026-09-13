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
