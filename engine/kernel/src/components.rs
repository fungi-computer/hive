use bevy_ecs::prelude::Component;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;
pub type Record = BTreeMap<String, Value>;
pub type Result<T> = std::result::Result<T, String>;

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
#[serde(deny_unknown_fields)]
pub struct Destination {
    pub x: f64,
    pub y: f64,
    pub z: f64,
    pub facing: f64,
}
#[derive(Component, Clone, Copy, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Obstacle {
    pub occupied: bool,
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
    pub scene: Scene,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Write {
    pub entity: String,
    pub component: String,
    pub value: Record,
}
#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Point {
    pub x: f64,
    pub y: f64,
    pub z: f64,
}
#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "kebab-case", deny_unknown_fields)]
pub enum Action {
    Move {
        entity: String,
        destination: Point,
        facing: Option<f64>,
    },
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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
    pub revision: u64,
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
