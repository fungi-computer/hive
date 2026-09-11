//! One headless world owner for browser Workers and Durable Objects.
pub mod assign;
pub mod collision;
pub mod generation;
pub mod terrain;
pub mod terrain_water;
pub mod terrain_atmosphere;
#[cfg(test)]
mod terrain_atmosphere_tests;
pub mod terrain_traversal;
pub mod structure_geometry;
pub mod structure_support;
mod terrain_route;
pub mod environment_definition;
pub mod finite_release;
pub mod emission_definition;
pub mod water;
mod quantity;
mod combat;
mod components;
mod navigation;
mod registry;
mod world;
mod record_bundle;
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

/// Detached, bounded save bytes. This handle never mutates a live world.
/// The JS caller frees captures after copying; restore_records consumes its input.
#[wasm_bindgen]
pub struct WasmKernelRecords(record_bundle::RecordBundle);

#[wasm_bindgen]
impl WasmKernelRecords {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self { Self(record_bundle::RecordBundle::new()) }
    pub fn insert(&mut self, key: &str, bytes: &[u8]) -> Result<(), JsValue> {
        self.0.insert(key, bytes).map_err(js_error)
    }
    pub fn keys(&self) -> Result<String, JsValue> {
        serde_json::to_string(&self.0.keys()).map_err(|error| js_error(error.to_string()))
    }
    pub fn read(&self, key: &str) -> Result<Vec<u8>, JsValue> {
        self.0.read(key).map_err(js_error)
    }
}

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
    muzzle: components::Vector3,
    inherited_velocity: components::Vector3,
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
    pub fn entity_membership(&self, json: &str) -> Result<String, JsValue> {
        self.0.entity_membership_json(json).map_err(js_error)
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
    pub fn load_environment(&mut self, definition: &str) -> Result<(), JsValue> {
        self.0.load_environment(definition).map_err(js_error)
    }
    pub fn terrain_surfaces(&mut self, input: &str) -> Result<String, JsValue> {
        self.0.terrain_surfaces_json(input).map_err(js_error)
    }
    pub fn structure_surfaces(&mut self, input: &str) -> Result<String, JsValue> {
        self.0.structure_surfaces_json(input).map_err(js_error)
    }
    pub fn terrain_materials(&mut self, input: &str) -> Result<String, JsValue> {
        self.0.terrain_materials_json(input).map_err(js_error)
    }
    pub fn physical_contacts(&mut self, input: &str) -> Result<String, JsValue> {
        self.0.physical_contacts_json(input).map_err(js_error)
    }
    pub fn route_costs(&mut self, input: &str) -> Result<String, JsValue> {
        self.0.route_costs_json(input).map_err(js_error)
    }
    pub fn atmosphere_samples(&self, input: &str) -> Result<String, JsValue> {
        self.0.atmosphere_samples_json(input).map_err(js_error)
    }
    pub fn environment_facts(&self) -> Result<String, JsValue> {
        self.0.environment_facts_json().map_err(js_error)
    }
    pub fn capture_records(&self) -> Result<WasmKernelRecords, JsValue> {
        let records = self.0.save_records().map_err(js_error)?;
        record_bundle::RecordBundle::from_records(records).map(WasmKernelRecords).map_err(js_error)
    }
    pub fn restore_records(&mut self, records: WasmKernelRecords) -> Result<(), JsValue> {
        let records = records.0.into_records().map_err(js_error)?;
        self.0.restore_records(&records).map_err(js_error)
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
        || request.radius <= 0.0 || request.penetration < 0.0 || request.max_range <= 0.0 || request.max_lifetime <= 0.0 || request.max_lifetime > 10.0 || request.max_range > 1000.0 || request.max_lifetime > 10.0
        || [request.muzzle.x, request.muzzle.y, request.muzzle.z, request.inherited_velocity.x, request.inherited_velocity.y, request.inherited_velocity.z, request.origin.x, request.origin.y, request.origin.z, request.velocity.x, request.velocity.y, request.velocity.z].iter().any(|value| !value.is_finite())
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
    let muzzle=combat::muzzle_origin([request.origin.x,request.origin.y,request.origin.z],[request.muzzle.x,request.muzzle.y,request.muzzle.z],[request.velocity.x,request.velocity.y,request.velocity.z]);
    let mut position=components::Position{x:muzzle[0],y:muzzle[1],z:muzzle[2],facing:0.0};
    let mut projectile=components::Projectile {launcher:"preview-launcher".into(),velocity_x:request.velocity.x+request.inherited_velocity.x,velocity_y:request.velocity.y+request.inherited_velocity.y,velocity_z:request.velocity.z+request.inherited_velocity.z,radius:request.radius,age:0.0,distance:0.0,max_range:request.max_range,max_lifetime:request.max_lifetime,gravity:request.gravity,penetration:request.penetration,state:"flying".into(),roll_normal_x:0.0,roll_normal_y:1.0,roll_normal_z:0.0,embed_depth:0.0,roll_friction:0.0};
    let mut victims=BTreeSet::new();
    let mut trajectory=vec![PreviewTrajectoryPoint{time:0.0,position:components::Vector3{x:muzzle[0],y:muzzle[1],z:muzzle[2]},velocity:components::Vector3{x:projectile.velocity_x,y:projectile.velocity_y,z:projectile.velocity_z}}];
    let mut contacts=Vec::new();
    for _ in 0..10 {
        let start=projectile.age;
        let result=combat::advance_motion("preview",&mut projectile,&mut position,&mut victims,1.0,|elapsed,_step,_origin,_velocity| {
            candidates.iter().map(|candidate| {
                let mut geometry=candidate.clone();
                for axis in 0..3 {geometry.origin[axis]+=geometry.linear_velocity[axis]*(start+elapsed);}
                let material=materials.get(&geometry.id).ok_or("preview material disappeared")?;
                Ok(combat::ContactCollider{geometry,material:combat::ImpactProfile{response:material.response.clone(),resistance:material.resistance,restitution:material.restitution,friction:material.friction,embed_speed:material.embed_speed}})
            }).collect()
        }).map_err(js_error)?;
        for (index,(elapsed,p,v)) in result.samples.iter().enumerate() {
            if index%5==0 && trajectory.len()<127 {trajectory.push(PreviewTrajectoryPoint{time:start+elapsed,position:components::Vector3{x:p[0],y:p[1],z:p[2]},velocity:components::Vector3{x:v[0],y:v[1],z:v[2]}});}
        }
        for contact in result.contacts {
            if contacts.len()>=128 {return Err(js_error("preview contact budget exceeded".into()));}
            contacts.push(PreviewContact{target_id:contact.hit.target_id,time:start+contact.elapsed,point:components::Vector3{x:contact.hit.point[0],y:contact.hit.point[1],z:contact.hit.point[2]},normal:components::Vector3{x:contact.hit.normal[0],y:contact.hit.normal[1],z:contact.hit.normal[2]},response:contact.response});
        }
        if result.expired || !matches!(projectile.state.as_str(),"flying"|"rolling") {break;}
    }
    let end=components::Vector3{x:position.x,y:position.y,z:position.z};
    let velocity=components::Vector3{x:projectile.velocity_x,y:projectile.velocity_y,z:projectile.velocity_z};
    trajectory.push(PreviewTrajectoryPoint{time:projectile.age,position:end,velocity});
    let response=PreviewProjectileResponse{trajectory,contacts,state:projectile.state,position:end,velocity,penetration:projectile.penetration};
    serde_json::to_string(&response).map_err(|e| js_error(e.to_string()))
}

impl Default for WasmKernel {
    fn default() -> Self {
        Self::new()
    }
}

// Shared native atmosphere owner; game content supplies its bounded definition.
pub mod atmosphere;
