//! Native owner for the identity and lifecycle of one unit of work.
//!
//! Physical operations remain owned by their domain modules.  This module only
//! owns the association, generation and retained terminal result.
use bevy_ecs::prelude::Component;
use crate::components::Point;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AttemptKey { pub task: String, pub generation: u64 }

#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct OperationKey { pub attempt: AttemptKey, pub sequence: u32 }

#[derive(Component, Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WorkAttempt {
    pub key: AttemptKey,
    pub worker: String,
    pub party: String,
    pub phase: AttemptPhase,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "kind", deny_unknown_fields)]
pub enum AttemptPhase {
    Ready,
    Executing { operation: OperationKey, activity: ActivityRef },
    Outcome { operation: OperationKey, result: WorkOutcome },
    Settling { operation: OperationKey, cause: InterruptCause },
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "kind", deny_unknown_fields)]
pub enum ActivityRef { Route { destination: Point } }

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "kind", deny_unknown_fields)]
pub enum WorkOutcome { Completed, Blocked { reason: WorkBlockReason }, Interrupted { cause: InterruptCause } }

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum WorkBlockReason { AccessLost, MissingInputs, CapacityUnavailable, UnsupportedStructure, WorkerUnavailable }

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum InterruptCause { Drafted, Cancelled, WorkerUnavailable, AccessLost }

impl WorkAttempt {
    pub fn current_operation(&self) -> Option<&OperationKey> {
        match &self.phase {
            AttemptPhase::Executing { operation, .. } | AttemptPhase::Outcome { operation, .. } | AttemptPhase::Settling { operation, .. } => Some(operation),
            AttemptPhase::Ready => None,
        }
    }
}
