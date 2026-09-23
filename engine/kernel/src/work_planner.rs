//! Private native scheduling records for automatic work.
//!
//! This module owns planner policy and bounded fairness state only.  WorkAttempt
//! remains the sole worker-to-operation association and domain components remain
//! the owners of progress and physical effects.
use bevy_ecs::prelude::Component;
use crate::components::Point;
use crate::work_attempt::ActivityRef;
use serde::{Deserialize, Serialize};

pub const DEFAULT_REVIEW_INTERVAL: u64 = 8;
pub const MAX_TASK_REVIEWS: usize = 32;
pub const MAX_ELIGIBLE_WORKERS: usize = 256;
pub const MAX_CANDIDATE_PAIRS: usize = 4096;
pub const MAX_ASSIGNMENTS: usize = 8;
pub const POLICY_CONSTRUCTION: &str = "construction";
pub const POLICY_DECONSTRUCTION: &str = "deconstruction";
pub const POLICY_EXCAVATION: &str = "excavation";
pub const POLICY_RESOURCE: &str = "resource";
pub const POLICY_STOCKPILE: &str = "stockpile";
pub const POLICY_PROCESS: &str = "process";
pub const POLICY_JOB: &str = "job";
pub const POLICY_FIELD_WATER: &str = "field-water";

#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case", tag = "kind", content = "entity", deny_unknown_fields)]
pub enum WorkRef {
    Excavate(String), Construct(String), ReplaceFinish(String), Deconstruct(String),
    Extract(String), Establish(String), Tend(String), Attend(String), Deliver(String),
    FillVessel(String),
}

#[derive(Component, Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[component(immutable)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WorkParticipation {
    pub automatic: bool,
}

#[derive(Component, Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[component(immutable)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WorkPolicy {
    pub pool: String,
    pub priority: u8,
    pub enabled: bool,
}

#[derive(Component, Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[component(immutable)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WorkSchedule {
    pub next_review_tick: u64,
    pub last_considered: u64,
}

/// A domain-owned contribution to the shared labor planner.
///
/// This is a derived view of one existing task.  It carries no worker claim,
/// route, progress, or reservation; the shared planner consumes it when it
/// builds a bounded assignment window. `operation` materializes the exact
/// typed activity after a worker reaches the selected supplied contact.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct WorkRequirement {
    pub task: String,
    pub pool: String,
    pub priority: u8,
    pub schedule: WorkSchedule,
    pub contacts: Vec<Point>,
    /// Optional exact worker affinity, enforced by the one shared matcher.
    pub required_worker: Option<String>,
    pub free_capacity_required: u32,
    pub operation: WorkOperation,
}

/// The domain operation to perform after reaching a selected contact.
///
/// Keeping the contact out of this value is deliberate: the shared matcher
/// selects a legal contact after contribution, then asks this constructor for
/// the exact activity witness.  A requirement therefore cannot accidentally
/// dispatch to a different contact than the one it priced.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields, tag = "kind")]
pub(crate) enum WorkOperation {
    Construction { site: String, mode: crate::work_attempt::ConstructionMode },
    ProcessAttendance { process: String },
    Deconstruction { site: String },
    Excavation { cell: [i32; 3], expected: u16, replacement: u16 },
    ResourceEstablish { site: String, definition: String, cell: [i32; 3] },
    ResourceTend { site: String, vessel: String },
    ResourceExtract { source: String },
    /// Execute the closed operation admitted by a durable Job/Task after the
    /// worker has reached the task's currently resolved physical source.
    JobTransform { task: String },
    SupplyAllocation { allocation: String },
}

impl WorkOperation {
    pub(crate) fn activity_for_contact(&self, contact: &Point) -> ActivityRef {
        match self {
            Self::Construction { site, mode } => ActivityRef::Construction {
                site: site.clone(),
                contact: contact.clone(),
                mode: mode.clone(),
            },
            Self::ProcessAttendance { process } => ActivityRef::ProcessAttendance {
                process: process.clone(),
                contact: contact.clone(),
            },
            Self::Deconstruction { site } => ActivityRef::Deconstruction {
                site: site.clone(),
                contact: contact.clone(),
            },
            Self::Excavation { cell, expected, replacement } => ActivityRef::Excavation {
                cell: *cell,
                expected_material: *expected,
                replacement_material: *replacement,
            },
            Self::ResourceEstablish { site, definition, cell } => ActivityRef::ResourceEstablish {
                site: site.clone(), definition: definition.clone(), cell: *cell,
            },
            Self::ResourceTend { site, vessel } => ActivityRef::ResourceTend { site: site.clone(), vessel: vessel.clone() },
            Self::ResourceExtract { source } => ActivityRef::ResourceExtract { source: source.clone() },
            Self::JobTransform { task } => ActivityRef::JobTransform { task: task.clone(), contact: contact.clone() },
            Self::SupplyAllocation { .. } => ActivityRef::Route { destination: contact.clone() },
        }
    }
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PlannerState {
    pub party_cursor: u64,
    pub task_cursor: u64,
    pub review_tick: u64,
    /// Identity of the latest admitted planning computation.
    pub assignment_generation: u64,
    pub(crate) route_searches: crate::terrain_route::SearchBank,
    pub(crate) continuation: Option<crate::world::native_work_planner::NativeAssignmentContinuation>,
}

impl PlannerState {
    pub fn validate(&self) -> Result<(), &'static str> {
        self.route_searches.validate()?;
        if self.review_tick > u64::MAX - DEFAULT_REVIEW_INTERVAL { return Err("planner tick overflow"); }
        if let Some(continuation) = &self.continuation {
            continuation.validate()?;
            if continuation.generation() != self.assignment_generation { return Err("retained assignment generation mismatch"); }
        }
        Ok(())
    }
}
