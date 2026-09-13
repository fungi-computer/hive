/** Pure action-bar grouping shared by game-specific presentation composition. */
export function actionBarGroups(controls, buildIds) {
  const builds = [];
  const work = [];
  for (const control of controls) {
    if (buildIds.has(control.id)) builds.push(control);
    else work.push(control);
  }
  return { builds, work };
}

export function toggleActionCategory(current, next) {
  return current === next ? null : next;
}
