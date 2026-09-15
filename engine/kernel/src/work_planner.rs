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

#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case", tag = "kind", content = "entity", deny_unknown_fields)]
pub enum WorkRef {
    Excavate(String), Construct(String), ReplaceFinish(String), Deconstruct(String),
    Extract(String), Establish(String), Tend(String), Attend(String), Deliver(String),
    FillVessel(String),
}

#[derive(Component, Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WorkParticipation {
    pub automatic: bool,
}

#[derive(Component, Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WorkPolicy {
    pub party: String,
    pub priority: u8,
    pub enabled: bool,
}

#[derive(Component, Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
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
    pub party: String,
    pub priority: u8,
    pub schedule: WorkSchedule,
    pub contacts: Vec<Point>,
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
        }
    }
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PlannerState {
    pub party_cursor: u64,
    pub task_cursor: u64,
    pub review_tick: u64,
}

impl PlannerState {
    pub fn validate(&self) -> Result<(), &'static str> {
        if self.review_tick > u64::MAX - DEFAULT_REVIEW_INTERVAL { return Err("planner tick overflow"); }
        Ok(())
    }
}
