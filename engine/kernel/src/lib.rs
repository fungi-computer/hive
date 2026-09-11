//! One headless world owner for browser Workers and Durable Objects.
pub mod assign;
pub mod collision;
mod combat;
mod components;
mod navigation;
mod registry;
mod world;
use wasm_bindgen::prelude::*;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
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

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct DirectPredictionRequest {
    position: components::Position,
    speed: f64,
    blocked: Vec<[i32; 3]>,
    bounds: Option<DirectBounds>,
    inputs: Vec<components::DirectInput>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct DirectBounds { min_x: f64, max_x: f64, min_z: f64, max_z: f64 }
#[derive(Serialize)]
struct DirectPredictionResponse { position: components::Position }

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct PreviewProjectileRequest {
    origin: components::Vector3,
    velocity: components::Vector3,
    radius: f64,
    gravity: f64,
    penetration: f64,
    max_range: f64,
    max_lifetime: f64,
    colliders: Vec<PreviewCollider>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct PreviewCollider {
    id: String,
    origin: components::Vector3,
    shape: components::ColliderShape,
    radius: f64,
    half_x: f64,
    half_y: f64,
    half_z: f64,
    yaw: f64,
    offset_x: f64,
    offset_y: f64,
    offset_z: f64,
    velocity: components::Vector3,
    material: PreviewMaterial,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct PreviewMaterial {
    response: String,
    resistance: f64,
    restitution: f64,
    friction: f64,
    embed_speed: f64,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PreviewProjectileResponse {
    trajectory: Vec<PreviewTrajectoryPoint>,
    contacts: Vec<PreviewContact>,
    state: String,
    position: components::Vector3,
    velocity: components::Vector3,
    penetration: f64,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PreviewTrajectoryPoint {
    time: f64,
    position: components::Vector3,
    velocity: components::Vector3,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PreviewContact {
    target_id: String,
    time: f64,
    point: components::Vector3,
    normal: components::Vector3,
    response: String,
}
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

/// Pure direct-control prediction entrypoint. It does not access or mutate a
/// Kernel instance, so browser prediction cannot become a second world owner.
#[wasm_bindgen]
pub fn predict_direct(json: &str) -> Result<String, JsValue> {
    if json.len() > 64 * 1024 { return Err(js_error("direct prediction request too large".into())); }
    let request: DirectPredictionRequest = serde_json::from_str(json).map_err(|e| js_error(e.to_string()))?;
    if request.inputs.len() > navigation::MAX_DIRECT_INPUTS || request.blocked.len() > 4096 {
        return Err(js_error("direct prediction input exceeds bounds".into()));
    }
    let mut blocked = BTreeSet::new();
    for cell in request.blocked {
        if !blocked.insert((cell[0], cell[1], cell[2])) { return Err(js_error("duplicate blocked cell".into())); }
    }
    let bounds = request.bounds.map(|b| navigation::Bounds { min_x: b.min_x, max_x: b.max_x, min_z: b.min_z, max_z: b.max_z });
    let mut position = navigation::direct_step(request.position, 0.0, 0.0, request.speed, &blocked, bounds).map_err(js_error)?;
    let mut expected: Option<u64> = None;
    for input in request.inputs {
        if input.sequence == 0 || input.sequence > 9_007_199_254_740_991 || expected.is_some_and(|value| input.sequence != value.saturating_add(1)) { return Err(js_error("direct prediction sequence gap".into())); }
        expected = Some(input.sequence);
        position = navigation::direct_step(position, input.x, input.z, request.speed, &blocked, bounds).map_err(js_error)?;
    }
    serde_json::to_string(&DirectPredictionResponse { position }).map_err(|e| js_error(e.to_string()))
}

/// Pure native trajectory/contact preview.  It shares the bounded ballistic
/// integrator and Parry sweep with the authoritative projectile owner; the
/// supplied colliders are a labelled current-target estimate and never mutate
/// a Kernel or claim a future hit.
#[wasm_bindgen]
pub fn preview_projectile(json: &str) -> Result<String, JsValue> {
    if json.len() > 256 * 1024 { return Err(js_error("projectile preview request too large".into())); }
    let request: PreviewProjectileRequest = serde_json::from_str(json).map_err(|e| js_error(e.to_string()))?;
    if request.colliders.len() > collision::MAX_CANDIDATE_COLLIDERS
        || [request.radius, request.gravity, request.penetration, request.max_range, request.max_lifetime].iter().any(|value| !value.is_finite())
        || request.radius <= 0.0 || request.penetration < 0.0 || request.max_range <= 0.0 || request.max_lifetime <= 0.0 || request.max_range > 1000.0 || request.max_lifetime > 10.0
        || [request.origin.x, request.origin.y, request.origin.z, request.velocity.x, request.velocity.y, request.velocity.z].iter().any(|value| !value.is_finite())
    { return Err(js_error("invalid projectile preview profile".into())); }
    let mut candidates = Vec::with_capacity(request.colliders.len());
    let mut materials = BTreeMap::new();
    for collider in request.colliders {
        if !valid_assignment_id(&collider.id)
            || ![collider.origin.x, collider.origin.y, collider.origin.z, collider.radius, collider.half_x, collider.half_y, collider.half_z, collider.yaw, collider.offset_x, collider.offset_y, collider.offset_z, collider.velocity.x, collider.velocity.y, collider.velocity.z, collider.material.resistance, collider.material.restitution, collider.material.friction, collider.material.embed_speed].iter().all(|value| value.is_finite())
            || !matches!(collider.material.response.as_str(), "stop" | "pierce" | "ground")
            || collider.radius < 0.0 || collider.half_x < 0.0 || collider.half_y < 0.0 || collider.half_z < 0.0
        { return Err(js_error(format!("invalid preview collider {}", collider.id))); }
        if !materials.insert(collider.id.clone(), collider.material).is_none() { return Err(js_error("duplicate preview collider".into())); }
        candidates.push(collision::Collider {
            id: collider.id,
            shape: match collider.shape { components::ColliderShape::Ball => collision::ColliderShape::Ball { radius: collider.radius }, components::ColliderShape::Cuboid => collision::ColliderShape::Cuboid { half_extents: [collider.half_x, collider.half_y, collider.half_z] } },
            origin: [collider.origin.x + collider.offset_x, collider.origin.y + collider.offset_y, collider.origin.z + collider.offset_z],
            linear_velocity: [collider.velocity.x, collider.velocity.y, collider.velocity.z],
            yaw: collider.yaw,
        });
    }
    candidates.sort_by(|a, b| a.id.cmp(&b.id));
    let mut origin = [request.origin.x, request.origin.y, request.origin.z];
    let mut velocity = [request.velocity.x, request.velocity.y, request.velocity.z];
    let mut roll_friction = 0.5;
    let mut penetration = request.penetration;
    let mut age = 0.0;
    let mut distance = 0.0;
    let mut state = "flying".to_string();
    let mut seen = BTreeSet::new();
    let mut support_seen = BTreeSet::new();
    let mut trajectory = Vec::new();
    let mut contacts = Vec::new();
    let mut iterations = 0usize;
    while age < request.max_lifetime && distance < request.max_range && iterations < 500 {
        iterations += 1;
        let speed = (velocity[0] * velocity[0] + velocity[1] * velocity[1] + velocity[2] * velocity[2]).sqrt();
        if speed <= 1e-9 { state = "resting".into(); break; }
        let step = combat::PROJECTILE_SUBSTEP_SECONDS.min(request.max_lifetime - age).min(((request.max_range - distance) / speed).max(0.0));
        if step <= 1e-9 { break; }
        let (end, average) = combat::ballistic_interval(origin, velocity, request.gravity, step);
        let active_candidates: Vec<_> = candidates.iter().filter(|candidate| {
            if seen.contains(&candidate.id) { return false; }
            if materials.get(&candidate.id).is_some_and(|material| material.response == "ground") { return !support_seen.contains(&candidate.id); }
            true
        }).cloned().collect();
        let hit = collision::sweep_projectile(&collision::Projectile { id: "preview".into(), radius: request.radius, origin, linear_velocity: average }, &active_candidates, step).map_err(|e| js_error(e.to_string()))?;
        let Some(hit) = hit else {
            let previous = origin;
            origin = end;
            velocity = combat::ballistic_velocity(velocity, request.gravity, step);
            if state == "rolling" {
                support_seen.clear();
                let factor = (1.0 - roll_friction * step).max(0.0);
                velocity[0] *= factor;
                velocity[2] *= factor;
                if (velocity[0] * velocity[0] + velocity[2] * velocity[2]).sqrt() < 0.05 {
                    velocity = [0.0; 3];
                    state = "resting".into();
                    break;
                }
            }
            age += step;
            distance += ((end[0] - previous[0]).powi(2) + (end[1] - previous[1]).powi(2) + (end[2] - previous[2]).powi(2)).sqrt();
            if trajectory.len() < 128 && (iterations % 4 == 0 || age >= request.max_lifetime || distance >= request.max_range) {
                trajectory.push(PreviewTrajectoryPoint { time: age, position: components::Vector3 { x: origin[0], y: origin[1], z: origin[2] }, velocity: components::Vector3 { x: velocity[0], y: velocity[1], z: velocity[2] } });
            }
            continue;
        };
        let material = materials.get(&hit.target_id).ok_or_else(|| js_error("preview material disappeared".into()))?;
        if material.response != "ground" && seen.contains(&hit.target_id) { break; }
        let hit_velocity = combat::ballistic_velocity(velocity, request.gravity, hit.time);
        let center = [origin[0] + average[0] * hit.time, origin[1] + average[1] * hit.time, origin[2] + average[2] * hit.time];
        age += hit.time.max(1e-6);
        distance += ((center[0] - origin[0]).powi(2) + (center[1] - origin[1]).powi(2) + (center[2] - origin[2]).powi(2)).sqrt();
        contacts.push(PreviewContact { target_id: hit.target_id.clone(), time: age, point: components::Vector3 { x: hit.point[0], y: hit.point[1], z: hit.point[2] }, normal: components::Vector3 { x: hit.normal[0], y: hit.normal[1], z: hit.normal[2] }, response: material.response.clone() });
        let material_profile = combat::ImpactProfile { response: material.response.clone(), resistance: material.resistance, restitution: material.restitution, friction: material.friction, embed_speed: material.embed_speed };
        let mut motion = combat::ProjectileMotion { velocity: hit_velocity, penetration, state: state.clone(), embed_depth: 0.0, normal: [0.0, 1.0, 0.0], friction: roll_friction };
        let settled = combat::resolve_contact(&mut motion, hit.normal, &material_profile, request.radius);
        penetration = motion.penetration;
        state = motion.state;
        velocity = motion.velocity;
        roll_friction = motion.friction;
        origin = [center[0] + motion.normal[0] * 1e-5, center[1] + motion.normal[1] * 1e-5, center[2] + motion.normal[2] * 1e-5];
        if material.response != "ground" { seen.insert(hit.target_id.clone()); }
        if material.response == "ground" && state == "rolling" { support_seen.insert(hit.target_id.clone()); }
        if settled { break; }
    }
    let response = PreviewProjectileResponse { trajectory, contacts, state, position: components::Vector3 { x: origin[0], y: origin[1], z: origin[2] }, velocity: components::Vector3 { x: velocity[0], y: velocity[1], z: velocity[2] }, penetration };
    serde_json::to_string(&response).map_err(|e| js_error(e.to_string()))
}

impl Default for WasmKernel {
    fn default() -> Self {
        Self::new()
    }
}
