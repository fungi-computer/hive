//! Bounded, deterministic candidate/index mechanics used by the native planner.
use crate::assign::{self, Assignment, Candidate};
use crate::components::{Body, Position, Traversal};
use crate::relations::RelationIndex;
use crate::world::route_query::SearchOutcome;
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

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PlanningWindow {
    pub workers: Vec<WorkerCandidate>,
    pub tasks: Vec<TaskCandidate>,
}

const ACCEPTED_DETOUR_RATIO: f64 = 1.5;
const ACCEPTED_DETOUR_METRES: f64 = 4.0;
const MAX_ROUTE_VALIDATIONS: usize = 32;
const MAX_MATCH_PASSES: usize = 8;

#[derive(Debug, PartialEq)]
pub enum PlanningError {
    Assignment(assign::AssignmentError),
    PairOutsideWindow { worker: String, task: String },
    DuplicatePair { worker: String, task: String },
    InvalidLowerBound { worker: String, task: String },
    InvalidExactCost { worker: String, task: String },
    ExactBelowLowerBound { worker: String, task: String },
    Route(String),
}

impl From<assign::AssignmentError> for PlanningError {
    fn from(value: assign::AssignmentError) -> Self { Self::Assignment(value) }
}

#[derive(Debug, PartialEq)]
pub struct VerifiedAssignment<Witness> {
    pub worker: String,
    pub task: String,
    pub cost: f64,
    pub witness: Witness,
}

#[derive(Debug, PartialEq)]
pub struct PlanningResult<Witness> {
    pub assignments: Vec<VerifiedAssignment<Witness>>,
    pub deferred: Vec<(String, String)>,
    pub route_validations: usize,
    pub match_passes: usize,
}

enum ExactCost<Witness> {
    Unverified,
    Reachable { cost: f64, witness: Option<Witness> },
    Excluded,
    Deferred,
}

struct CostState<Witness> {
    bound: f64,
    exact: ExactCost<Witness>,
}

fn materially_worse(bound: f64, exact: f64) -> bool {
    exact > (bound * ACCEPTED_DETOUR_RATIO).max(bound + ACCEPTED_DETOUR_METRES)
}

fn proposed_costs<Witness>(pairs: &BTreeMap<(String, String), CostState<Witness>>) -> Vec<Candidate> {
    pairs.iter().filter_map(|((worker, task), state)| match state.exact {
        ExactCost::Excluded | ExactCost::Deferred => None,
        ExactCost::Unverified => Some(Candidate { worker: worker.clone(), task: task.clone(), cost: state.bound }),
        ExactCost::Reachable { cost, .. } => Some(Candidate { worker: worker.clone(), task: task.clone(), cost }),
    }).collect()
}

/// Run the same bounded lazy Hungarian correction that formerly lived in the
/// TypeScript work system. Route validation remains a caller-supplied query of
/// the one native movement owner; the returned witness can be admitted without
/// repeating that search when its dependencies are still current.
/// A bounded retained Hungarian result. This is a proposal, never a worker claim.
/// Route checks and physical admission remain the caller's responsibility.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AssignmentEpisode {
    candidates: Vec<Candidate>,
    proposed: Vec<Assignment>,
}

impl AssignmentEpisode {
    pub fn new(window: &PlanningWindow, candidates: &[Candidate]) -> Result<Self, PlanningError> {
        validate_candidates(window, candidates)?;
        Ok(Self { candidates: candidates.to_vec(), proposed: assign::optimize(candidates, MAX_CANDIDATE_PAIRS)? })
    }

    pub fn is_empty(&self) -> bool { self.proposed.is_empty() }

    pub fn candidates(&self) -> &[Candidate] { &self.candidates }

    pub fn validate(&self, window: &PlanningWindow) -> Result<(), PlanningError> {
        validate_candidates(window, &self.candidates)?;
        let mut workers = BTreeSet::new();
        let mut tasks = BTreeSet::new();
        for proposed in &self.proposed {
            if !proposed.cost.is_finite() || proposed.cost < 0.0
                || !workers.insert(&proposed.worker) || !tasks.insert(&proposed.task)
                || !self.candidates.iter().any(|candidate| candidate.worker == proposed.worker && candidate.task == proposed.task)
            {
                return Err(PlanningError::Route("invalid retained matching".into()));
            }
        }
        Ok(())
    }

    pub fn advance<Witness>(
        &mut self,
        window: &PlanningWindow,
        mut verify: impl FnMut(&Candidate) -> Result<SearchOutcome<(f64, Witness)>, String>,
    ) -> Result<PlanningResult<Witness>, PlanningError> {
        // Stable proposals need only the next eight route checks. Preserve the
        // matrix in place; rebuild solver working state only for a real route
        // rejection or material cost correction.
        let mut checked = BTreeMap::new();
        let mut stable = true;
        for proposed in self.proposed.iter().take(MAX_ASSIGNMENTS) {
            let candidate = self.candidates.iter().find(|candidate| candidate.worker == proposed.worker && candidate.task == proposed.task)
                .ok_or_else(|| PlanningError::Route("retained proposal has no candidate".into()))?;
            let outcome = verify(candidate).map_err(PlanningError::Route)?;
            stable &= matches!(&outcome, SearchOutcome::Reachable((cost, _))
                if cost.is_finite() && *cost >= candidate.cost && !materially_worse(candidate.cost, *cost));
            checked.insert((candidate.worker.clone(), candidate.task.clone()), outcome);
            if !stable { break; }
        }
        if stable {
            let assignments = self.proposed.iter().take(MAX_ASSIGNMENTS).map(|proposed| {
                let SearchOutcome::Reachable((cost, witness)) = checked.remove(&(proposed.worker.clone(), proposed.task.clone())).expect("checked proposal") else { unreachable!() };
                VerifiedAssignment { worker: proposed.worker.clone(), task: proposed.task.clone(), cost, witness }
            }).collect::<Vec<_>>();
            let used_workers = assignments.iter().map(|assignment| assignment.worker.as_str()).collect::<BTreeSet<_>>();
            let used_tasks = assignments.iter().map(|assignment| assignment.task.as_str()).collect::<BTreeSet<_>>();
            self.candidates.retain(|candidate| !used_workers.contains(candidate.worker.as_str()) && !used_tasks.contains(candidate.task.as_str()));
            self.proposed.retain(|proposed| !used_workers.contains(proposed.worker.as_str()) && !used_tasks.contains(proposed.task.as_str()));
            return Ok(PlanningResult { route_validations: assignments.len(), assignments, deferred: Vec::new(), match_passes: 0 });
        }
        let (result, remaining) = run_verified(window, &self.candidates, Some(&self.proposed), |candidate| {
            match checked.remove(&(candidate.worker.clone(), candidate.task.clone())) {
                Some(outcome) => Ok(outcome),
                None => verify(candidate),
            }
        })?;
        *self = remaining;
        Ok(result)
    }
}

fn validate_candidates(window: &PlanningWindow, candidates: &[Candidate]) -> Result<(), PlanningError> {
    if candidates.len() > MAX_CANDIDATE_PAIRS {
        return Err(assign::AssignmentError::EdgeLimitExceeded { count: candidates.len(), limit: MAX_CANDIDATE_PAIRS }.into());
    }
    let mut seen = BTreeSet::new();
    for candidate in candidates {
        if !window.workers.iter().any(|worker| worker.id == candidate.worker)
            || !window.tasks.iter().any(|task| task.id == candidate.task) {
            return Err(PlanningError::PairOutsideWindow { worker: candidate.worker.clone(), task: candidate.task.clone() });
        }
        if !candidate.cost.is_finite() || candidate.cost < 0.0 {
            return Err(PlanningError::InvalidLowerBound { worker: candidate.worker.clone(), task: candidate.task.clone() });
        }
        if !seen.insert((&candidate.worker, &candidate.task)) {
            return Err(PlanningError::DuplicatePair { worker: candidate.worker.clone(), task: candidate.task.clone() });
        }
    }
    Ok(())
}

pub fn assign_verified<Witness>(
    window: &PlanningWindow,
    candidates: &[Candidate],
    verify: impl FnMut(&Candidate) -> Result<SearchOutcome<(f64, Witness)>, String>,
) -> Result<PlanningResult<Witness>, PlanningError> {
    run_verified(window, candidates, None, verify).map(|(result, _)| result)
}

fn run_verified<Witness>(
    window: &PlanningWindow,
    candidates: &[Candidate],
    retained: Option<&[Assignment]>,
    mut verify: impl FnMut(&Candidate) -> Result<SearchOutcome<(f64, Witness)>, String>,
) -> Result<(PlanningResult<Witness>, AssignmentEpisode), PlanningError> {
    if candidates.len() > MAX_CANDIDATE_PAIRS {
        return Err(assign::AssignmentError::EdgeLimitExceeded { count: candidates.len(), limit: MAX_CANDIDATE_PAIRS }.into());
    }
    let allowed_workers = window.workers.iter().map(|worker| worker.id.as_str()).collect::<BTreeSet<_>>();
    let allowed_tasks = window.tasks.iter().map(|task| task.id.as_str()).collect::<BTreeSet<_>>();
    let task_order = window.tasks.iter().enumerate().map(|(index, task)| (task.id.as_str(), index)).collect::<BTreeMap<_, _>>();
    let mut pairs = BTreeMap::new();
    for candidate in candidates {
        if !allowed_workers.contains(candidate.worker.as_str()) || !allowed_tasks.contains(candidate.task.as_str()) {
            return Err(PlanningError::PairOutsideWindow { worker: candidate.worker.clone(), task: candidate.task.clone() });
        }
        if !candidate.cost.is_finite() || candidate.cost < 0.0 {
            return Err(PlanningError::InvalidLowerBound { worker: candidate.worker.clone(), task: candidate.task.clone() });
        }
        let key = (candidate.worker.clone(), candidate.task.clone());
        if pairs.insert(key.clone(), CostState { bound: candidate.cost, exact: ExactCost::Unverified }).is_some() {
            return Err(PlanningError::DuplicatePair { worker: key.0, task: key.1 });
        }
    }

    let initial_costs = proposed_costs(&pairs);
    let mut proposed = if let Some(retained) = retained { retained.to_vec() } else if initial_costs.is_empty() { Vec::new() } else { assign::optimize(&initial_costs, MAX_CANDIDATE_PAIRS)? };
    let mut route_validations = 0;
    let mut match_passes = usize::from(retained.is_none() && !initial_costs.is_empty());
    while route_validations < MAX_ROUTE_VALIDATIONS {
        let reachable = proposed.iter().filter(|assignment| matches!(pairs.get(&(assignment.worker.clone(), assignment.task.clone())).map(|state| &state.exact), Some(ExactCost::Reachable { .. }))).count();
        if reachable >= MAX_ASSIGNMENTS { break; }
        let next = proposed.iter().filter(|assignment| matches!(pairs.get(&(assignment.worker.clone(), assignment.task.clone())).map(|state| &state.exact), Some(ExactCost::Unverified)))
            .min_by(|left, right| task_order.get(left.task.as_str()).cmp(&task_order.get(right.task.as_str())).then(left.worker.cmp(&right.worker)).then(left.task.cmp(&right.task)))
            .cloned();
        let Some(next) = next else { break; };
        let key = (next.worker.clone(), next.task.clone());
        let candidate = Candidate { worker: next.worker, task: next.task, cost: pairs[&key].bound };
        let outcome = verify(&candidate).map_err(PlanningError::Route)?;
        route_validations += 1;
        let state = pairs.get_mut(&key).expect("selected candidate remains indexed");
        let requires_rematch = match outcome {
            SearchOutcome::Reachable((cost, witness)) => {
                if !cost.is_finite() || cost < 0.0 {
                    return Err(PlanningError::InvalidExactCost { worker: key.0, task: key.1 });
                }
                if cost < state.bound {
                    return Err(PlanningError::ExactBelowLowerBound { worker: key.0, task: key.1 });
                }
                let corrected = materially_worse(state.bound, cost);
                state.exact = ExactCost::Reachable { cost, witness: Some(witness) };
                corrected
            }
            SearchOutcome::NoPath(_) => { state.exact = ExactCost::Excluded; true }
            SearchOutcome::Deferred(_) => { state.exact = ExactCost::Deferred; true }
        };
        if requires_rematch {
            if match_passes == MAX_MATCH_PASSES { break; }
            let costs = proposed_costs(&pairs);
            proposed = if costs.is_empty() { Vec::new() } else { assign::optimize(&costs, MAX_CANDIDATE_PAIRS)? };
            if !costs.is_empty() { match_passes += 1; }
        }
    }
    let mut assignments = Vec::new();
    for assignment in &proposed {
        if assignments.len() == MAX_ASSIGNMENTS { break; }
        let Some(state) = pairs.get_mut(&(assignment.worker.clone(), assignment.task.clone())) else { continue; };
        let ExactCost::Reachable { cost, witness } = &mut state.exact else { continue; };
        let Some(witness) = witness.take() else { continue; };
        assignments.push(VerifiedAssignment { worker: assignment.worker.clone(), task: assignment.task.clone(), cost: *cost, witness });
    }
    let used_workers = assignments.iter().map(|assignment| assignment.worker.as_str()).collect::<BTreeSet<_>>();
    let used_tasks = assignments.iter().map(|assignment| assignment.task.as_str()).collect::<BTreeSet<_>>();
    let remaining = AssignmentEpisode {
        candidates: pairs.iter().filter(|((worker, task), state)| !used_workers.contains(worker.as_str()) && !used_tasks.contains(task.as_str()) && !matches!(state.exact, ExactCost::Excluded | ExactCost::Deferred))
            .map(|((worker, task), state)| Candidate { worker: worker.clone(), task: task.clone(), cost: state.bound }).collect(),
        proposed: proposed.into_iter().filter(|assignment| !used_workers.contains(assignment.worker.as_str()) && !used_tasks.contains(assignment.task.as_str()) && pairs.get(&(assignment.worker.clone(), assignment.task.clone())).is_some_and(|state| !matches!(state.exact, ExactCost::Excluded | ExactCost::Deferred))).collect(),
    };
    let deferred = pairs.into_iter().filter_map(|(key, state)| matches!(state.exact, ExactCost::Deferred).then_some(key)).collect();
    Ok((PlanningResult { assignments, deferred, route_validations, match_passes }, remaining))
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct NativeIndexes {
    pub workers_by_party: BTreeMap<String, Vec<WorkerCandidate>>,
    pub tasks_by_pool: BTreeMap<String, Vec<TaskCandidate>>,
    worker_party_by_id: BTreeMap<String, String>,
    task_pool_by_id: BTreeMap<String, String>,
    task_due_by_id: BTreeMap<String, u64>,
    tasks_due_at: BTreeMap<u64, BTreeSet<String>>,
    rebuilds: u64,
}

impl NativeIndexes {
    pub(crate) fn task_ids(&self) -> impl Iterator<Item = &str> {
        self.task_pool_by_id.keys().map(String::as_str)
    }
    #[cfg(test)]
    pub(crate) fn rebuild_count(&self) -> u64 { self.rebuilds }

    pub(crate) fn has_due_task(&self, tick: u64) -> bool {
        self.next_due_tick().is_some_and(|due| due <= tick)
    }

    pub(crate) fn next_due_tick(&self) -> Option<u64> {
        self.tasks_due_at.first_key_value().map(|(due, _)| *due)
    }

    fn remove_id(&mut self, id: &str) {
        if let Some(party) = self.worker_party_by_id.remove(id) {
            if let Some(values) = self.workers_by_party.get_mut(&party) { values.retain(|candidate| candidate.id != id); }
            if self.workers_by_party.get(&party).is_some_and(Vec::is_empty) { self.workers_by_party.remove(&party); }
        }
        if let Some(pool) = self.task_pool_by_id.remove(id) {
            if let Some(values) = self.tasks_by_pool.get_mut(&pool) { values.retain(|candidate| candidate.id != id); }
            if self.tasks_by_pool.get(&pool).is_some_and(Vec::is_empty) { self.tasks_by_pool.remove(&pool); }
            let due = self.task_due_by_id.remove(id).expect("indexed task has due tick");
            let tasks = self.tasks_due_at.get_mut(&due).expect("indexed due tick exists");
            tasks.remove(id);
            if tasks.is_empty() { self.tasks_due_at.remove(&due); }
        }
    }

    fn sort(&mut self) {
        for values in self.workers_by_party.values_mut() { values.sort(); }
        for values in self.tasks_by_pool.values_mut() {
            values.sort_by(|a, b| b.priority.cmp(&a.priority).then(a.last_considered.cmp(&b.last_considered)).then(a.id.cmp(&b.id)));
        }
    }

    fn sort_worker_party(&mut self, party: &str) {
        if let Some(values) = self.workers_by_party.get_mut(party) { values.sort(); }
    }

    fn sort_task_pool(&mut self, pool: &str) {
        if let Some(values) = self.tasks_by_pool.get_mut(pool) {
            values.sort_by(|a, b| b.priority.cmp(&a.priority).then(a.last_considered.cmp(&b.last_considered)).then(a.id.cmp(&b.id)));
        }
    }

    /// Refresh only one externally identified entity after a canonical mutation.
    /// Removal is represented by an absent id/entity and clears old membership.
    pub fn refresh_entity(&mut self, relations: &RelationIndex, world: &World, id: &str, entity: Option<Entity>) {
        let old_worker_party = self.worker_party_by_id.get(id).cloned();
        let old_task_pool = self.task_pool_by_id.get(id).cloned();
        self.remove_id(id);
        let Some(entity) = entity else { return; };
        if let Some(party) = relations.target("hive.party-member", id)
            && world.get::<Body>(entity).is_some()
            && world.get::<Position>(entity).is_some()
            && world.get::<Traversal>(entity).is_some()
            && world.get::<WorkParticipation>(entity).is_some_and(|participation| participation.automatic)
        {
            self.worker_party_by_id.insert(id.to_owned(), party.to_owned());
            self.workers_by_party.entry(party.to_owned()).or_default().push(WorkerCandidate { id: id.to_owned(), party: party.to_owned() });
        }
        if let Some(policy) = world.get::<WorkPolicy>(entity) && policy.enabled
            && let Some(schedule) = world.get::<WorkSchedule>(entity)
        {
            self.task_pool_by_id.insert(id.to_owned(), policy.pool.clone());
            self.task_due_by_id.insert(id.to_owned(), schedule.next_review_tick);
            self.tasks_due_at.entry(schedule.next_review_tick).or_default().insert(id.to_owned());
            self.tasks_by_pool.entry(policy.pool.clone()).or_default().push(TaskCandidate {
                id: id.to_owned(), party: policy.pool.clone(), priority: policy.priority,
                last_considered: schedule.last_considered, due_tick: schedule.next_review_tick,
            });
        }
        if let Some(party) = old_worker_party.as_deref() { self.sort_worker_party(party); }
        if let Some(party) = old_task_pool.as_deref() { self.sort_task_pool(party); }
        if let Some(party) = self.worker_party_by_id.get(id).cloned() { self.sort_worker_party(&party); }
        if let Some(pool) = self.task_pool_by_id.get(id).cloned() { self.sort_task_pool(&pool); }
    }

    /// Rebuild once after initial load/reset/restore. Steady-state callers use
    /// refresh_entity so planning queries never scan the entity registry.
    pub fn rebuild(&mut self, relations: &RelationIndex, world: &World, ids: &BTreeMap<String, Entity>) {
        self.workers_by_party.clear(); self.tasks_by_pool.clear();
        self.worker_party_by_id.clear(); self.task_pool_by_id.clear();
        self.task_due_by_id.clear(); self.tasks_due_at.clear();
        self.rebuilds = self.rebuilds.saturating_add(1);
        for (id, entity) in ids {
            if let Some(party) = relations.target("hive.party-member", id)
                && world.get::<Body>(*entity).is_some() && world.get::<Position>(*entity).is_some()
                && world.get::<Traversal>(*entity).is_some()
                && world.get::<WorkParticipation>(*entity).is_some_and(|participation| participation.automatic)
            {
                self.worker_party_by_id.insert(id.clone(), party.to_owned());
                self.workers_by_party.entry(party.to_owned()).or_default().push(WorkerCandidate { id: id.clone(), party: party.to_owned() });
            }
            if let Some(policy) = world.get::<WorkPolicy>(*entity) && policy.enabled
                && let Some(schedule) = world.get::<WorkSchedule>(*entity)
            {
                self.task_pool_by_id.insert(id.clone(), policy.pool.clone());
                self.task_due_by_id.insert(id.clone(), schedule.next_review_tick);
                self.tasks_due_at.entry(schedule.next_review_tick).or_default().insert(id.clone());
                self.tasks_by_pool.entry(policy.pool.clone()).or_default().push(TaskCandidate { id: id.clone(), party: policy.pool.clone(), priority: policy.priority, last_considered: schedule.last_considered, due_tick: schedule.next_review_tick });
            }
        }
        self.sort();
    }
}

/// Build only the two membership indexes needed by the first planning window.
pub fn rebuild_indexes(relations: &RelationIndex, world: &World, ids: &BTreeMap<String, Entity>) -> NativeIndexes {
    let mut indexes = NativeIndexes::default();
    indexes.rebuild(relations, world, ids);
    indexes
}

/// Read native component membership directly.  Results are stable by external
/// identity and capped before any candidate expansion occurs.
pub fn eligible_workers(indexes: &NativeIndexes, party: &str, limit: usize) -> Vec<WorkerCandidate> {
    let mut result = indexes.workers_by_party.get(party).cloned().unwrap_or_default();
    result.truncate(limit.min(MAX_ELIGIBLE_WORKERS));
    result
}

pub fn due_tasks_from_index(indexes: &NativeIndexes, pool: &str, tick: u64, limit: usize) -> Vec<TaskCandidate> {
    due_tasks(indexes.tasks_by_pool.get(pool).into_iter().flatten().cloned(), tick, limit)
}

/// Select directly from the rebuilt by-party indexes. The worker cap is applied
/// after party rotation, so a later party cannot be starved by an earlier one.
pub fn next_fair_indexed_window(state: &mut PlannerState, indexes: &NativeIndexes, tick: u64) -> PlanningWindow {
    let mut parties = indexes.workers_by_party.keys().cloned().collect::<BTreeSet<_>>();
    parties.extend(indexes.tasks_by_pool.keys().cloned());
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
    use crate::components::{ExternalId, Party, PartyMember};
    use crate::registry::Registry;
    use crate::work_planner::PlannerState;
    #[test]
    fn retained_matching_dispatches_thirty_two_in_four_slices_across_reload() {
        let window = PlanningWindow {
            workers: (0..32).map(|n| WorkerCandidate { id: format!("w-{n:02}"), party: "p".into() }).collect(),
            tasks: (0..32).map(|n| TaskCandidate { id: format!("t-{n:02}"), party: "p".into(), priority: 0, last_considered: 0, due_tick: 0 }).collect(),
        };
        let candidates = window.workers.iter().enumerate().flat_map(|(wi, worker)| window.tasks.iter().enumerate().map(move |(ti, task)| Candidate {
            worker: worker.id.clone(), task: task.id.clone(), cost: wi.abs_diff(ti) as f64,
        })).collect::<Vec<_>>();
        let mut episode = AssignmentEpisode::new(&window, &candidates).unwrap();
        let mut workers = BTreeSet::new();
        let mut tasks = BTreeSet::new();
        for _ in 0..4 {
            let result = episode.advance(&window, |candidate| Ok(SearchOutcome::Reachable((candidate.cost, ())))).unwrap();
            assert_eq!(result.assignments.len(), 8);
            assert_eq!(result.route_validations, 8);
            assert_eq!(result.match_passes, 0, "dispatch must reuse the initial Hungarian result");
            for assignment in result.assignments {
                assert!(workers.insert(assignment.worker));
                assert!(tasks.insert(assignment.task));
            }
            episode = serde_json::from_str(&serde_json::to_string(&episode).unwrap()).unwrap();
            episode.validate(&window).unwrap();
        }
        assert!(episode.is_empty());
        assert_eq!(workers.len(), 32);
        assert_eq!(tasks.len(), 32);
    }

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
    fn native_lazy_matching_removes_no_path_and_reassigns_jointly() {
        let window = PlanningWindow {
            workers: vec![WorkerCandidate { id: "w1".into(), party: "p".into() }, WorkerCandidate { id: "w2".into(), party: "p".into() }],
            tasks: vec![
                TaskCandidate { id: "t1".into(), party: "p".into(), priority: 2, last_considered: 0, due_tick: 0 },
                TaskCandidate { id: "t2".into(), party: "p".into(), priority: 1, last_considered: 0, due_tick: 0 },
            ],
        };
        let candidates = vec![
            Candidate { worker: "w1".into(), task: "t1".into(), cost: 1.0 },
            Candidate { worker: "w1".into(), task: "t2".into(), cost: 2.0 },
            Candidate { worker: "w2".into(), task: "t1".into(), cost: 1.0 },
            Candidate { worker: "w2".into(), task: "t2".into(), cost: 100.0 },
        ];
        let result = assign_verified(&window, &candidates, |candidate| {
            if candidate.worker == "w2" && candidate.task == "t1" {
                Ok(SearchOutcome::NoPath("sealed".into()))
            } else {
                Ok(SearchOutcome::Reachable((candidate.cost, format!("{}:{}", candidate.worker, candidate.task))))
            }
        }).unwrap();
        assert_eq!(result.assignments.len(), 2);
        assert!(result.assignments.iter().any(|assignment| assignment.worker == "w1" && assignment.task == "t1"));
        assert!(result.assignments.iter().any(|assignment| assignment.worker == "w2" && assignment.task == "t2"));
        assert_eq!(result.route_validations, 3);
        assert_eq!(result.match_passes, 2);
    }

    #[test]
    fn deferred_route_stays_distinct_and_exact_cost_cannot_beat_its_bound() {
        let window = PlanningWindow {
            workers: vec![WorkerCandidate { id: "w".into(), party: "p".into() }],
            tasks: vec![TaskCandidate { id: "t".into(), party: "p".into(), priority: 1, last_considered: 0, due_tick: 0 }],
        };
        let candidates = vec![Candidate { worker: "w".into(), task: "t".into(), cost: 3.0 }];
        let deferred: PlanningResult<()> = assign_verified(&window, &candidates, |_| Ok::<_, String>(SearchOutcome::Deferred("budget".into()))).unwrap();
        assert!(deferred.assignments.is_empty());
        assert_eq!(deferred.deferred, vec![("w".into(), "t".into())]);
        assert_eq!(deferred.route_validations, 1);
        let invalid = assign_verified(&window, &candidates, |_| Ok::<_, String>(SearchOutcome::Reachable((2.0, ())))).unwrap_err();
        assert_eq!(invalid, PlanningError::ExactBelowLowerBound { worker: "w".into(), task: "t".into() });
    }

    #[test]
    fn direct_ecs_index_caps_within_party_and_filters_due_tasks() {
        let mut world = World::new();
        let registry = Registry::new(&mut world, vec![], vec![]).unwrap();
        let mut ids = BTreeMap::new();
        let party = "late-party";
        let party_entity = world.spawn((ExternalId(party.into()), Party {}, crate::components::OwnedBy { player: "player".into() })).id();
        ids.insert(party.into(), party_entity);
        for number in 0..300 {
            let id = format!("worker-{number:03}");
            let entity = world.spawn((ExternalId(id.clone()), PartyMember { party: party.into() }, Body { speed: 1.0 }, Position { x: 0.0, y: 0.0, z: 0.0, facing: 0.0 }, Traversal { clearance_cells: 1, max_step_cells: 1 }, WorkParticipation { automatic: true })).id();
            ids.insert(id, entity);
        }
        let task = world.spawn((WorkPolicy { pool: party.into(), priority: 7, enabled: true }, WorkSchedule { next_review_tick: 4, last_considered: 2 })).id();
        ids.insert("task".into(), task);
        let mut relations = RelationIndex::default();
        relations.rebuild(&registry, &world, &ids).unwrap();
        let indexes = rebuild_indexes(&relations, &world, &ids);
        assert_eq!(eligible_workers(&indexes, party, usize::MAX).len(), MAX_ELIGIBLE_WORKERS);
        let stable_workers = indexes.workers_by_party.get(party).unwrap();
        assert_eq!(stable_workers.first().map(|worker| worker.id.as_str()), Some("worker-000"));
        assert_eq!(stable_workers.get(1).map(|worker| worker.id.as_str()), Some("worker-001"));
        let indexed_window = next_fair_indexed_window(&mut PlannerState::default(), &indexes, 4);
        assert_eq!(indexed_window.workers.len(), MAX_ELIGIBLE_WORKERS);
        assert_eq!(indexed_window.tasks[0].id, "task");
        assert_eq!(due_tasks_from_index(&indexes, party, 3, 32).len(), 0);
        assert_eq!(due_tasks_from_index(&indexes, party, 4, 32)[0].id, "task");
    }
}

#[cfg(test)]
mod index_refresh_tests {
    use super::*;
    use crate::components::{ExternalId, Party, PartyMember};
    use crate::registry::Registry;

    fn worker(world: &mut World, id: &str, party: &str, automatic: bool) -> Entity {
        world.spawn((ExternalId(id.into()), PartyMember { party: party.into() }, Body { speed: 1.0 }, Position { x: 0.0, y: 0.0, z: 0.0, facing: 0.0 }, Traversal { clearance_cells: 1, max_step_cells: 1 }, WorkParticipation { automatic })).id()
    }

    #[test]
    fn refresh_moves_party_and_removes_membership_without_rebuild() {
        let mut world = World::new();
        let registry = Registry::new(&mut world, vec![], vec![]).unwrap();
        let party_a = world.spawn((ExternalId("a".into()), Party {}, crate::components::OwnedBy { player: "player-a".into() })).id();
        let party_b = world.spawn((ExternalId("b".into()), Party {}, crate::components::OwnedBy { player: "player-b".into() })).id();
        let entity = worker(&mut world, "worker", "a", true);
        let mut ids = BTreeMap::from([("a".to_owned(), party_a), ("b".to_owned(), party_b), ("worker".to_owned(), entity)]);
        let mut relations = RelationIndex::default();
        relations.rebuild(&registry, &world, &ids).unwrap();
        let mut indexes = NativeIndexes::default();
        indexes.rebuild(&relations, &world, &ids);
        assert_eq!(indexes.rebuilds, 1);
        assert_eq!(eligible_workers(&indexes, "a", 10)[0].id, "worker");
        world.entity_mut(entity).insert(PartyMember { party: "b".into() });
        relations.refresh_source(&registry, &world, &ids, "worker").unwrap();
        indexes.refresh_entity(&relations, &world, "worker", Some(entity));
        assert!(eligible_workers(&indexes, "a", 10).is_empty());
        assert_eq!(eligible_workers(&indexes, "b", 10)[0].party, "b");
        ids.remove("worker");
        relations.refresh_source(&registry, &world, &ids, "worker").unwrap();
        indexes.refresh_entity(&relations, &world, "worker", None);
        assert!(eligible_workers(&indexes, "b", 10).is_empty());
        assert_eq!(indexes.rebuilds, 1);
    }

    #[test]
    fn refresh_reorders_task_and_repeated_windows_do_not_rebuild() {
        let mut world = World::new();
        let entity = world.spawn((WorkPolicy { pool: "p".into(), priority: 1, enabled: true }, WorkSchedule { next_review_tick: 0, last_considered: 0 })).id();
        let ids = BTreeMap::from([("task".to_owned(), entity)]);
        let relations = RelationIndex::default();
        let mut indexes = NativeIndexes::default();
        indexes.rebuild(&relations, &world, &ids);
        let mut state = PlannerState::default();
        let _ = next_fair_indexed_window(&mut state, &indexes, 0);
        let before = indexes.rebuilds;
        world.entity_mut(entity).insert(WorkPolicy { pool: "p".into(), priority: 9, enabled: true });
        indexes.refresh_entity(&relations, &world, "task", Some(entity));
        assert_eq!(indexes.rebuilds, before);
        assert_eq!(due_tasks_from_index(&indexes, "p", 0, 10)[0].priority, 9);
    }

    #[test]
    fn due_index_tracks_accepted_schedule_edits_and_removal() {
        let mut world = World::new();
        let first = world.spawn((WorkPolicy { pool: "p".into(), priority: 1, enabled: true }, WorkSchedule { next_review_tick: 3, last_considered: 0 })).id();
        let second = world.spawn((WorkPolicy { pool: "p".into(), priority: 1, enabled: true }, WorkSchedule { next_review_tick: 5, last_considered: 0 })).id();
        let mut ids = BTreeMap::from([("first".to_owned(), first), ("second".to_owned(), second)]);
        let relations = RelationIndex::default();
        let mut indexes = NativeIndexes::default();
        indexes.rebuild(&relations, &world, &ids);
        assert_eq!(indexes.next_due_tick(), Some(3));
        assert!(!indexes.has_due_task(2));
        assert!(indexes.has_due_task(3));

        world.entity_mut(first).insert(WorkSchedule { next_review_tick: 8, last_considered: 3 });
        indexes.refresh_entity(&relations, &world, "first", Some(first));
        assert_eq!(indexes.next_due_tick(), Some(5));
        ids.remove("second");
        indexes.refresh_entity(&relations, &world, "second", None);
        assert_eq!(indexes.next_due_tick(), Some(8));
        world.entity_mut(first).insert(WorkPolicy { pool: "p".into(), priority: 1, enabled: false });
        indexes.refresh_entity(&relations, &world, "first", Some(first));
        assert_eq!(indexes.next_due_tick(), None);
        indexes.rebuild(&relations, &world, &ids);
        assert_eq!(indexes.next_due_tick(), None);
    }
}
