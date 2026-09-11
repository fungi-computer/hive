use bevy_ecs::prelude::Component;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;
use crate::structure_geometry::Cardinal;
pub type Record = BTreeMap<String, Value>;
pub type Result<T> = std::result::Result<T, String>;
/// Safety bound for one carried-water field; canonical state capacity remains
/// the aggregate storage bound.
pub const MAX_CARRIED_WATER_KG: f64 = 1.0e12;

#[derive(Component, Clone)]
pub struct ExternalId(pub String);
#[derive(Component, Clone, Copy, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Position {
    pub x: f64,
    pub y: f64,
    pub z: f64,
    pub facing: f64,
}
#[derive(Component, Clone, Copy, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Body {
    pub speed: f64,
}
#[derive(Component, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Traversal {
    pub clearance_cells: u8,
    pub max_step_cells: u8,
}
#[derive(Component, Clone, Copy, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Container {
    pub capacity: u32,
}
/// A custody boundary installed by a native completion owner. Presence is
/// the capability and is saved as an empty record.
#[derive(Component, Clone, Copy, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SealedContainer {}
#[derive(Component, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Lot {
    pub kind: String,
    pub quantity: u32,
    pub container: String,
}
#[derive(Component, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LotWater {
    pub water_kg: f64,
}
/// Native earned work; authored systems may request work, never write progress.
#[derive(Component, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ExcavationWork {
    pub x: i32,
    pub y: i32,
    pub z: i32,
    pub expected: u16,
    pub replacement: u16,
    pub seconds: f64,
}
#[derive(Component, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ConstructionSite {
    pub catalog: String,
    pub x: i64,
    pub y: i32,
    pub z: i64,
    pub orientation: Cardinal,
    pub contact_x: f64,
    pub contact_y: f64,
    pub contact_z: f64,
    pub worker: Option<String>,
    pub seconds: f64,
    pub phase: ConstructionPhase,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ConstructionPhase {
    Planned,
    Working,
    Finished,
}
#[derive(Component, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Destination {
    pub x: f64,
    pub y: f64,
    pub z: f64,
    pub facing: f64,
    pub frame: Option<String>,
}
#[derive(Component, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Support {
    pub entity: String,
}
#[derive(Component, Clone, Copy, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct Surface {
    pub min_x: f64,
    pub max_x: f64,
    pub min_z: f64,
    pub max_z: f64,
    pub height: f64,
}
#[derive(Component, Clone, Copy, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Obstacle {
    pub occupied: bool,
}
#[derive(Component, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct Collider {
    pub shape: ColliderShape,
    pub radius: f64,
    pub half_x: f64,
    pub half_y: f64,
    pub half_z: f64,
    pub yaw: f64,
    pub offset_x: f64,
    pub offset_y: f64,
    pub offset_z: f64,
}
#[derive(Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ColliderShape {
    Ball,
    Cuboid,
}
#[derive(Component, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct ImpactMaterial {
    pub response: String,
    pub resistance: f64,
    pub restitution: f64,
    pub friction: f64,
    pub embed_speed: f64,
}
#[derive(Component, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct Launcher {
    pub ammo_kind: String,
    pub muzzle_x: f64,
    pub muzzle_y: f64,
    pub muzzle_z: f64,
    pub max_speed: f64,
    pub projectile_radius: f64,
    pub max_range: f64,
    pub max_lifetime: f64,
    pub projectile_sprite: String,
    pub projectile_label: String,
    pub gravity: f64,
    pub penetration: f64,
}
#[derive(Component, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct Projectile {
    pub launcher: String,
    pub velocity_x: f64,
    pub velocity_y: f64,
    pub velocity_z: f64,
    pub radius: f64,
    pub age: f64,
    pub distance: f64,
    pub max_range: f64,
    pub max_lifetime: f64,
    pub gravity: f64,
    pub penetration: f64,
    pub state: String,
    pub roll_normal_x: f64,
    pub roll_normal_y: f64,
    pub roll_normal_z: f64,
    pub embed_depth: f64,
    pub roll_friction: f64,
}
#[derive(Component, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Visual {
    pub sprite: String,
    pub label: String,
}

// Each authored schema gets a distinct world-local Bevy ComponentId for this
// known layout. There is no map of all authored components on each entity.
#[derive(Clone)]
pub struct AuthoredRecord(pub Record);
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum FieldType {
    Number,
    Boolean,
    String,
    Entity,
    NullableEntity,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Schema {
    pub id: String,
    pub version: u32,
    pub fields: BTreeMap<String, FieldType>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct EntityRecord {
    pub id: String,
    pub components: BTreeMap<String, Record>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Scene {
    pub format: String,
    pub version: u32,
    pub game: String,
    pub components: Vec<Schema>,
    pub initial: Vec<EntityRecord>,
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Snapshot {
    pub format: String,
    pub version: u32,
    pub revision: u64,
    pub time: f64,
    pub next_lot: u64,
    pub next_projectile: u64,
    pub next_impact: u64,
    pub scene: Scene,
    pub routes: Vec<RouteSnapshot>,
    pub direct: Vec<DirectSnapshot>,
    pub projectile_contacts: Vec<ProjectileContactsSnapshot>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ProjectileContactsSnapshot {
    pub projectile_id: String,
    pub targets: Vec<String>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DirectInput {
    pub sequence: u64,
    pub x: f64,
    pub z: f64,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DirectState {
    pub entity: String,
    pub stream: String,
    pub last_queued: u64,
    pub last_processed: u64,
    pub queue: Vec<DirectInput>,
    pub remainder: f64,
}
pub type DirectSnapshot = DirectState;
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RouteSnapshot {
    pub entity: String,
    pub path: Vec<Point>,
    pub terrain_path: Option<Vec<crate::generation::Cell>>,
    pub terrain_waiting: bool,
    pub terrain_suspended: bool,
    pub terrain_origin: Option<Point>,
    pub terrain_target: Option<Point>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Write {
    pub entity: String,
    pub component: String,
    pub value: Record,
}
#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Vector3 {
    pub x: f64,
    pub y: f64,
    pub z: f64,
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Point {
    pub x: f64,
    pub y: f64,
    pub z: f64,
    #[serde(deserialize_with = "required_nullable_frame")]
    pub frame: Option<String>,
}
fn required_nullable_frame<'de, D>(deserializer: D) -> std::result::Result<Option<String>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    Option::<String>::deserialize(deserializer)
}
#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "kebab-case", deny_unknown_fields)]
pub enum Action {
    Excavate { entity: String, x: i32, y: i32, z: i32, expected: u16, replacement: u16 },
    CancelWork { entity: String },
    PlanConstruction {
        catalog: String,
        site: String,
        x: i64,
        y: i32,
        z: i64,
        orientation: Cardinal,
        contact: Point,
    },
    AttendConstruction { worker: String, site: String },
    Move {
        entity: String,
        destination: Point,
        facing: Option<f64>,
    },
    BeginDirect { entity: String, stream: String },
    DirectInput { entity: String, stream: String, inputs: Vec<DirectInput> },
    Transfer {
        lot: String,
        from: String,
        to: String,
        quantity: u32,
    },
    Consume {
        entity: String,
        lot: String,
        quantity: u32,
    },
    Launch {
        launcher: String,
        ammunition: String,
        velocity: Vector3,
    },
    Displace {
        entity: String,
        delta: Vector3,
    },
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Batch {
    pub delta: f64,
    #[serde(default)]
    pub creates: Vec<EntityRecord>,
    #[serde(default)]
    pub removes: Vec<String>,
    pub writes: Vec<Write>,
    pub actions: Vec<Action>,
}
#[derive(Serialize)]
pub struct ActionResult {
    pub accepted: bool,
    pub reason: Option<String>,
    pub revision: u64,
    #[serde(rename = "projectileId", skip_serializing_if = "Option::is_none")]
    pub projectile_id: Option<String>,
    #[serde(rename = "launchPoint", skip_serializing_if = "Option::is_none")]
    pub launch_point: Option<Vector3>,
}
pub fn valid_id(s: &str) -> bool {
    !s.is_empty()
        && s.len() <= 128
        && s.bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"._:-".contains(&b))
}
pub fn record<T: Serialize>(value: &T) -> Record {
    serde_json::from_value(serde_json::to_value(value).expect("physical serialization"))
        .expect("physical record")
}
pub fn decode<T: for<'a> Deserialize<'a>>(value: &Record) -> Result<T> {
    serde_json::from_value(serde_json::to_value(value).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())
}
