//! One headless world owner for browser Workers and Durable Objects.
pub mod assign;
mod components;
mod navigation;
mod registry;
mod world;
use wasm_bindgen::prelude::*;
use serde::{Deserialize, Serialize};
pub use world::Kernel;

const ASSIGNMENT_MAX_BYTES: usize = 4096;
const ASSIGNMENT_MAX_EDGES: usize = 128;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct AssignmentRequest {
    candidates: Vec<AssignmentCandidateWire>,
    max_edges: usize,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct AssignmentCandidateWire {
    worker: String,
    task: String,
    cost: f64,
}

#[derive(Serialize)]
struct AssignmentResponse {
    assignments: Vec<AssignmentWire>,
}

#[derive(Serialize)]
struct AssignmentWire {
    worker: String,
    task: String,
    cost: f64,
}

#[wasm_bindgen]
pub struct WasmKernel(Kernel);
fn js_error(error: String) -> JsValue {
    JsValue::from_str(&error)
}

fn valid_assignment_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 128
        && id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || b"._:-".contains(&byte))
}

fn assignment_error(error: impl std::fmt::Display) -> JsValue {
    js_error(format!("assignment rejected: {error}"))
}
#[wasm_bindgen]
impl WasmKernel {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self(Kernel::new())
    }
    pub fn load(&mut self, json: &str) -> Result<(), JsValue> {
        self.0.load(json).map_err(js_error)
    }
    pub fn query(&mut self, json: &str) -> Result<String, JsValue> {
        self.0.query_json(json).map_err(js_error)
    }
    pub fn advance(&mut self, json: &str) -> Result<String, JsValue> {
        self.0.advance_json(json).map_err(js_error)
    }
    pub fn snapshot(&self) -> Result<String, JsValue> {
        self.0.snapshot_json().map_err(js_error)
    }
    pub fn restore(&mut self, json: &str) -> Result<(), JsValue> {
        self.0.restore_json(json).map_err(js_error)
    }
    pub fn render_facts(&self) -> Result<String, JsValue> {
        self.0.render_json().map_err(js_error)
    }
    pub fn world_pose(&self, json: &str) -> Result<String, JsValue> {
        self.0.world_pose_json(json).map_err(js_error)
    }

    /// Run the native bounded joint assignment owner through a JSON wire
    /// boundary. The JSON is deliberately bounded before deserialization so a
    /// malformed host request cannot cause unbounded candidate allocation.
    pub fn assign(&self, json: &str) -> Result<String, JsValue> {
        if json.len() > ASSIGNMENT_MAX_BYTES {
            return Err(assignment_error("request exceeds 4096 bytes"));
        }
        let request: AssignmentRequest =
            serde_json::from_str(json).map_err(|error| assignment_error(error))?;
        if request.max_edges == 0 || request.max_edges > ASSIGNMENT_MAX_EDGES {
            return Err(assignment_error("max_edges must be between 1 and 128"));
        }
        if request.candidates.len() > ASSIGNMENT_MAX_EDGES {
            return Err(assignment_error("candidate edge count exceeds 128"));
        }

        let mut candidates = Vec::with_capacity(request.candidates.len());
        for candidate in request.candidates {
            if !valid_assignment_id(&candidate.worker) || !valid_assignment_id(&candidate.task) {
                return Err(assignment_error("worker and task IDs must be stable bounded IDs"));
            }
            if !candidate.cost.is_finite() || candidate.cost < 0.0 {
                return Err(assignment_error("cost must be finite and non-negative"));
            }
            candidates.push(assign::Candidate {
                worker: candidate.worker,
                task: candidate.task,
                cost: candidate.cost,
            });
        }

        let assignments = assign::optimize(&candidates, request.max_edges)
            .map_err(|error| assignment_error(format!("{error:?}")))?;
        let response = AssignmentResponse {
            assignments: assignments
                .into_iter()
                .map(|assignment| AssignmentWire {
                    worker: assignment.worker,
                    task: assignment.task,
                    cost: assignment.cost,
                })
                .collect(),
        };
        serde_json::to_string(&response).map_err(assignment_error)
    }
}
impl Default for WasmKernel {
    fn default() -> Self {
        Self::new()
    }
}
