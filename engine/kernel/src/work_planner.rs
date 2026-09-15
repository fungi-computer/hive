//! Private native scheduling records for automatic work.
//!
//! This module owns planner policy and bounded fairness state only.  WorkAttempt
//! remains the sole worker-to-operation association and domain components remain
//! the owners of progress and physical effects.
use bevy_ecs::prelude::Component;
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
