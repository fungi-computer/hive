//! Native owner for the identity and lifecycle of one unit of work.
//!
//! Physical operations remain owned by their domain modules.  This module only
//! owns the association, generation and retained terminal result.
use bevy_ecs::prelude::Component;
use crate::components::{Point, WorkExecution};
use serde::{Deserialize, Serialize};

pub const CURRENT_VERSION: u16 = 2;

#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AttemptKey { pub task: String, pub generation: u64 }

#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct OperationKey { pub attempt: AttemptKey, pub sequence: u32 }

#[derive(Component, Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WorkAttempt {
    pub version: u16,
    pub key: AttemptKey,
    pub worker: String,
    pub execution: WorkExecution,
    pub phase: AttemptPhase,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "kind", deny_unknown_fields)]
pub enum AttemptPhase {
    Ready,
    Executing { operation: OperationKey, activity: ActivityRef },
    Outcome { operation: OperationKey, activity: ActivityRef, result: WorkOutcome },
    Settling { operation: OperationKey, cause: InterruptCause },
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "kind", deny_unknown_fields)]
pub enum ActivityRef {
    Route { destination: Point },
    Construction { site: String, contact: Point, mode: ConstructionMode },
    #[serde(rename = "excavation")]
    Excavation {
        cell: [i32; 3],
        #[serde(rename = "expectedMaterial")]
        expected_material: u16,
        #[serde(rename = "replacementMaterial")]
        replacement_material: u16,
    },
    #[serde(rename = "deconstruction")]
    Deconstruction { site: String, contact: Point },
    #[serde(rename = "process-attendance")]
    ProcessAttendance { process: String, contact: Point },
    #[serde(rename = "material-transfer")]
    MaterialTransfer { lot: String, from: String, to: String, quantity: u32 },
    #[serde(rename = "material-drop")]
    MaterialDrop { lot: String },
    #[serde(rename = "resource-establish")]
    ResourceEstablish { site: String, definition: String, cell: [i32; 3] },
    #[serde(rename = "resource-tend")]
    ResourceTend { site: String, vessel: String },
    #[serde(rename = "resource-extract")]
    ResourceExtract { source: String },
    #[serde(rename = "field-water")]
    FieldWater { vessel: String, cell: [i32; 3], direction: WaterDirection, portions: u8 },
    /// A generic Job Task's committed physical transform. The Task entity
    /// remains the operation identity; its source is resolved by the job
    /// owner when this activity is admitted.
    #[serde(rename = "job-transform")]
    JobTransform { task: String, contact: Point },
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum WaterDirection { Withdraw, Deposit }

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ConstructionMode { Bind, Work }

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
