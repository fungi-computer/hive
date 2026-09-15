//! Bounded, deterministic candidate/index mechanics used by the native planner.
use crate::assign::{self, Assignment, Candidate};
use crate::components::{Body, PartyMember, Position, Traversal};
use crate::work_planner::{PlannerState, WorkParticipation, WorkPolicy, WorkSchedule, DEFAULT_REVIEW_INTERVAL, MAX_ASSIGNMENTS, MAX_CANDIDATE_PAIRS, MAX_ELIGIBLE_WORKERS, MAX_TASK_REVIEWS};
use bevy_ecs::prelude::{Entity, World};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};

#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WorkerCandidate {
    pub id: String,
    pub party: String,
}

#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TaskCandidate {
    pub id: String,
    pub party: String,
    pub priority: u8,
    pub last_considered: u64,
    pub due_tick: u64,
}

#[derive(Clone, Debug, PartialEq)]
pub struct PlanningWindow {
    pub workers: Vec<WorkerCandidate>,
    pub tasks: Vec<TaskCandidate>,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct NativeIndexes {
    pub workers_by_party: BTreeMap<String, Vec<WorkerCandidate>>,
    pub tasks_by_party: BTreeMap<String, Vec<TaskCandidate>>,
}

/// Build only the two membership indexes needed by the first planning window.
/// Each vector is sorted, making rebuilds after restore replayable.
pub fn rebuild_indexes(world: &World, ids: &BTreeMap<String, Entity>) -> NativeIndexes {
    let mut indexes = NativeIndexes::default();
    for (id, entity) in ids {
        if let Some(worker) = world.get::<PartyMember>(*entity)
            && world.get::<Body>(*entity).is_some()
            && world.get::<Position>(*entity).is_some()
            && world.get::<Traversal>(*entity).is_some()
            && world.get::<WorkParticipation>(*entity).is_some_and(|participation| participation.automatic)
        {
            indexes.workers_by_party.entry(worker.party.clone()).or_default().push(WorkerCandidate { id: id.clone(), party: worker.party.clone() });
        }
        if let Some(policy) = world.get::<WorkPolicy>(*entity) {
            if policy.enabled {
                let schedule = world.get::<WorkSchedule>(*entity);
                let Some(schedule) = schedule else { continue; };
                indexes.tasks_by_party.entry(policy.party.clone()).or_default().push(TaskCandidate { id: id.clone(), party: policy.party.clone(), priority: policy.priority, last_considered: schedule.last_considered, due_tick: schedule.next_review_tick });
            }
        }
    }
    for values in indexes.workers_by_party.values_mut() { values.sort(); }
    for values in indexes.tasks_by_party.values_mut() { values.sort_by(|a, b| b.priority.cmp(&a.priority).then(a.last_considered.cmp(&b.last_considered)).then(a.id.cmp(&b.id))); }
    indexes
}


/// Read native component membership directly.  Results are stable by external
/// identity and capped before any candidate expansion occurs.
pub fn eligible_workers(indexes: &NativeIndexes, party: &str, limit: usize) -> Vec<WorkerCandidate> {
    let mut result = indexes.workers_by_party.get(party).cloned().unwrap_or_default();
    result.truncate(limit.min(MAX_ELIGIBLE_WORKERS));
    result
}

pub fn due_tasks_from_index(indexes: &NativeIndexes, party: &str, tick: u64, limit: usize) -> Vec<TaskCandidate> {
    due_tasks(indexes.tasks_by_party.get(party).into_iter().flatten().cloned(), tick, limit)
}

/// Select directly from the rebuilt by-party indexes. The worker cap is applied
/// after party rotation, so a later party cannot be starved by an earlier one.
pub fn next_fair_indexed_window(state: &mut PlannerState, indexes: &NativeIndexes, tick: u64) -> PlanningWindow {
    let mut parties = indexes.workers_by_party.keys().cloned().collect::<BTreeSet<_>>();
    parties.extend(indexes.tasks_by_party.keys().cloned());
    let parties = parties.into_iter().collect::<Vec<_>>();
    let party = parties.get((state.party_cursor as usize) % parties.len().max(1)).cloned().unwrap_or_default();
    if !parties.is_empty() { state.party_cursor = state.party_cursor.wrapping_add(1) % parties.len() as u64; }
    let workers = eligible_workers(indexes, &party, MAX_ELIGIBLE_WORKERS);
    let tasks = due_tasks_from_index(indexes, &party, tick, MAX_TASK_REVIEWS);
    state.review_tick = tick.checked_add(DEFAULT_REVIEW_INTERVAL).unwrap_or(u64::MAX);
    PlanningWindow { workers, tasks }
}

pub fn due_tasks(tasks: impl IntoIterator<Item = TaskCandidate>, tick: u64, limit: usize) -> Vec<TaskCandidate> {
    let mut result = tasks.into_iter().filter(|task| task.due_tick <= tick).collect::<Vec<_>>();
    result.sort_by(|a, b| b.priority.cmp(&a.priority).then(a.last_considered.cmp(&b.last_considered)).then(a.id.cmp(&b.id)));
    result.truncate(limit.min(MAX_TASK_REVIEWS));
    result
}

/// Rotate parties and then stable-sort within the selected fairness window.
/// The cursor advances even when no pairs can be formed, preventing starvation.
pub fn next_fair_window(state: &mut PlannerState, workers: &[WorkerCandidate], tasks: &[TaskCandidate], tick: u64) -> PlanningWindow {
    let mut parties = workers.iter().map(|w| w.party.clone()).collect::<BTreeSet<_>>();
    parties.extend(tasks.iter().map(|t| t.party.clone()));
    let parties = parties.into_iter().collect::<Vec<_>>();
    let party = parties.get((state.party_cursor as usize) % parties.len().max(1)).cloned();
    if !parties.is_empty() { state.party_cursor = state.party_cursor.wrapping_add(1) % parties.len() as u64; }
    let mut selected_workers = workers.iter().filter(|w| party.as_deref().is_none_or(|p| w.party == p)).cloned().collect::<Vec<_>>();
    let mut selected_tasks = tasks.iter().filter(|t| party.as_deref().is_none_or(|p| t.party == p)).cloned().collect::<Vec<_>>();
    selected_workers.sort();
    selected_tasks.sort_by(|a, b| b.priority.cmp(&a.priority).then(a.last_considered.cmp(&b.last_considered)).then(a.id.cmp(&b.id)));
    selected_workers.truncate(MAX_ELIGIBLE_WORKERS);
    selected_tasks.truncate(MAX_TASK_REVIEWS);
    state.review_tick = tick.checked_add(DEFAULT_REVIEW_INTERVAL).unwrap_or(u64::MAX);
    PlanningWindow { workers: selected_workers, tasks: selected_tasks }
}

pub fn match_window(window: &PlanningWindow, pairs: &[Candidate]) -> Result<Vec<Assignment>, assign::AssignmentError> {
    if pairs.len() > MAX_CANDIDATE_PAIRS { return Err(assign::AssignmentError::EdgeLimitExceeded { count: pairs.len(), limit: MAX_CANDIDATE_PAIRS }); }
    let allowed_workers = window.workers.iter().map(|w| w.id.as_str()).collect::<BTreeSet<_>>();
    let allowed_tasks = window.tasks.iter().map(|t| t.id.as_str()).collect::<BTreeSet<_>>();
    let filtered = pairs.iter().filter(|p| allowed_workers.contains(p.worker.as_str()) && allowed_tasks.contains(p.task.as_str())).cloned().collect::<Vec<_>>();
    let mut result = assign::optimize(&filtered, MAX_CANDIDATE_PAIRS)?;
    result.truncate(MAX_ASSIGNMENTS);
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::work_planner::PlannerState;
    #[test]
    fn fairness_rotates_parties_and_advances_on_empty_window() {
        let workers = vec![WorkerCandidate { id: "w-a".into(), party: "a".into() }, WorkerCandidate { id: "w-b".into(), party: "b".into() }];
        let tasks = vec![TaskCandidate { id: "t-a".into(), party: "a".into(), priority: 1, last_considered: 0, due_tick: 0 }, TaskCandidate { id: "t-b".into(), party: "b".into(), priority: 1, last_considered: 0, due_tick: 0 }];
        let mut state = PlannerState::default();
        assert_eq!(next_fair_window(&mut state, &workers, &tasks, 0).tasks[0].party, "a");
        assert_eq!(next_fair_window(&mut state, &workers, &tasks, 1).tasks[0].party, "b");
        let before = state.party_cursor;
        assert!(next_fair_window(&mut state, &workers, &[], 2).tasks.is_empty());
        assert_ne!(state.party_cursor, before);
        assert_eq!(state.review_tick, 10);
    }

    #[test]
    fn matching_filters_window_and_keeps_hungarian_cardinality() {
        let window = PlanningWindow {
            workers: vec![WorkerCandidate { id: "w".into(), party: "p".into() }],
            tasks: vec![TaskCandidate { id: "t".into(), party: "p".into(), priority: 2, last_considered: 0, due_tick: 0 }],
        };
        let pairs = vec![Candidate { worker: "w".into(), task: "t".into(), cost: 3.0 }, Candidate { worker: "other".into(), task: "t".into(), cost: 0.0 }];
        assert_eq!(match_window(&window, &pairs).unwrap(), vec![Assignment { worker: "w".into(), task: "t".into(), cost: 3.0 }]);
    }

    #[test]
    fn direct_ecs_index_caps_within_party_and_filters_due_tasks() {
        let mut world = World::new();
        let mut ids = BTreeMap::new();
        let party = "late-party";
        for number in 0..300 {
            let id = format!("worker-{number:03}");
            let entity = world.spawn((PartyMember { party: party.into() }, Body { speed: 1.0 }, Position { x: 0.0, y: 0.0, z: 0.0, facing: 0.0 }, Traversal { clearance_cells: 1, max_step_cells: 1 }, WorkParticipation { automatic: true })).id();
            ids.insert(id, entity);
        }
        let task = world.spawn((WorkPolicy { party: party.into(), priority: 7, enabled: true }, WorkSchedule { next_review_tick: 4, last_considered: 2 })).id();
        ids.insert("task".into(), task);
        let indexes = rebuild_indexes(&world, &ids);
        assert_eq!(eligible_workers(&indexes, party, usize::MAX).len(), MAX_ELIGIBLE_WORKERS);
        let indexed_window = next_fair_indexed_window(&mut PlannerState::default(), &indexes, 4);
        assert_eq!(indexed_window.workers.len(), MAX_ELIGIBLE_WORKERS);
        assert_eq!(indexed_window.tasks[0].id, "task");
        assert_eq!(due_tasks_from_index(&indexes, party, 3, 32).len(), 0);
        assert_eq!(due_tasks_from_index(&indexes, party, 4, 32)[0].id, "task");
    }
}
