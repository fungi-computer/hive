use bevy_ecs::prelude::Component;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;
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
#[serde(deny_unknown_fields)]
pub struct Container {
    pub capacity: u32,
}
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
#[derive(Clone, Debug, Serialize, Deserialize)]
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
