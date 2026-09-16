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
#[derive(Component, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Party {
    pub owner_player: String,
}
#[derive(Component, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PartyMember {
    pub party: String,
}
#[derive(Component, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct OwnedByParty {
    pub party: String,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PartyBinding {
    pub binding_id: String,
    pub sequence: u64,
    pub player: String,
    pub party: String,
    pub people: Vec<String>,
    pub digest: String,
}
#[derive(Component, Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
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
/// A declared capability of a physical vessel. Content definitions attach this
/// to compatible lots; water work never infers capability from an item name.
#[derive(Component, Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct VesselCapability {
    pub accepts_water: bool,
}
/// A custody boundary installed by a native completion owner. Presence is
/// the capability and is saved as an empty record.
#[derive(Component, Clone, Copy, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SealedContainer {}

/// Finite stock resting at a physical position, not carried by an actor.
#[derive(Component, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct GroundStock {}
/// A physical authored storage provider whose destination policy is resolved
/// from painted stockpile cells at its position.
#[derive(Component, Clone, Copy, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct StorageProvider {}
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

/// Whether a lot can satisfy a material requirement. Water is a material with
/// an attached finite mass; a positive water field on another material marks
/// wet spoil and cannot satisfy a dry requirement.
pub(crate) fn lot_matches_material(lot: &Lot, water: Option<&LotWater>, material: &str) -> bool {
    if lot.quantity == 0 || lot.kind != material {
        return false;
    }
    if material == "water" {
        water.is_some_and(|value| value.water_kg.is_finite() && value.water_kg > 0.0)
    } else {
        water.is_none_or(|value| value.water_kg == 0.0)
    }
}
/// Native supply reservation. The lot and container remain the sole physical
/// custody owners; this record accounts only for an admitted portion and its
/// incoming destination capacity.
#[derive(Component, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SupplyAllocation {
    pub requirement_owner: String,
    pub requirement_role: String,
    pub requirement_generation: u64,
    pub party: String,
    pub material: String,
    pub portion: String,
    pub destination: String,
    pub quantity: u32,
    pub state: SupplyAllocationState,
}
/// Native intent for one discrete field-water portion needed by a process.
/// Once withdrawal commits, `lot` names the exact generated water lot and this
/// record is replaced by the ordinary SupplyAllocation on the same entity.
#[derive(Component, Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FieldWaterWork {
    pub process: String,
    pub role: String,
    pub generation: u64,
    pub party: String,
    pub destination: String,
    pub material: String,
    pub retain_in_vessel: bool,
    pub portions: u8,
    pub vessel: Option<String>,
    pub cell_x: i32,
    pub cell_y: i32,
    pub cell_z: i32,
    pub lot: Option<String>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum SupplyAllocationState { Reserved, Delivered, Cancelled }
#[derive(Component, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StockpileCell {
    pub zone: String,
    pub priority: u32,
    pub filter_profile: String,
}
#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StockpileDesignation { pub x: i32, pub y: i32, pub z: i32, pub priority: u32, pub filter_profile: String }
#[derive(Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct StockpileCellCoordinate { pub x: i32, pub y: i32, pub z: i32 }
/// Finite authored stock whose kind and remaining quantity are native-owned.
#[derive(Component, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct FiniteResource {
    pub kind: String,
    pub quantity: u32,
}
/// Native lifecycle state for a sparse, data-defined tended resource site.
#[derive(Component, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ResourceSite {
    pub definition: String,
    pub stage: u8,
    pub next_due: f64,
}
/// Durable player intent for one tended resource lifecycle. Growth timing and
/// finite output stay on ResourceSite/FiniteResource; this record owns only
/// designation state and earned labor between physical transitions.
#[derive(Component, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ResourceOrder {
    pub definition: String,
    pub cell_x: i32,
    pub cell_y: i32,
    pub cell_z: i32,
    pub status: String,
    pub reason: String,
    pub progress_seconds: f64,
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
/// Durable player excavation intent.  The shared native planner owns worker
/// selection and retry; this record only retains the designation projection.
#[derive(Component, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ExcavationOrder {
    pub cell_x: i32,
    pub cell_y: i32,
    pub cell_z: i32,
    pub expected: u16,
    pub status: String,
    pub reason: String,
}
/// Native saved deconstruction progress owned by the task entity.
#[derive(Component, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DeconstructionWork {
    pub site: String,
    pub contact_x: f64,
    pub contact_y: f64,
    pub contact_z: f64,
    pub seconds: f64,
    pub required_seconds: f64,
}
/// Durable deconstruction intent. The shared planner owns attendance while
/// `DeconstructionWork` owns any earned physical progress.
#[derive(Component, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DeconstructionOrder {
    pub site: String,
    pub contact_x: f64,
    pub contact_y: f64,
    pub contact_z: f64,
    pub salvage_quantity: u32,
    pub work_seconds: f64,
    pub status: String,
    pub reason: String,
    pub retry_key: String,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "kebab-case", deny_unknown_fields)]
pub enum ConstructionTarget {
    Cell {
        cell: crate::generation::Cell,
        orientation: Cardinal,
    },
    Edge {
        edge: crate::structure_geometry::Face,
    },
}
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ExcavationArea { pub start: [i32; 3], pub end: [i32; 3] }

impl ConstructionTarget {
    pub const fn cell(self) -> crate::generation::Cell {
        match self {
            Self::Cell { cell, .. } => cell,
            Self::Edge { edge } => edge.cell,
        }
    }

}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ConstructionSiteWire {
    catalog: String,
    target_kind: String,
    target_x: i64,
    target_y: i32,
    target_z: i64,
    target_direction: String,
    seconds: f64,
    phase: ConstructionPhase,
}

#[derive(Component, Clone)]
pub struct ConstructionSite {
    pub catalog: String,
    pub target: ConstructionTarget,
    pub seconds: f64,
    pub phase: ConstructionPhase,
}

impl Serialize for ConstructionSite {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        let cell = self.target.cell();
        let (target_kind, target_direction) = match self.target {
            ConstructionTarget::Cell { orientation, .. } => (
                "cell",
                match orientation {
                    Cardinal::North => "north",
                    Cardinal::East => "east",
                    Cardinal::South => "south",
                    Cardinal::West => "west",
                },
            ),
            ConstructionTarget::Edge { edge } => (
                "edge",
                match edge.axis {
                    crate::structure_geometry::FaceAxis::X => "x",
                    crate::structure_geometry::FaceAxis::Z => "z",
                    crate::structure_geometry::FaceAxis::Y => return Err(serde::ser::Error::custom("construction edge must be vertical")),
                },
            ),
        };
        ConstructionSiteWire {
            catalog: self.catalog.clone(),
            target_kind: target_kind.into(),
            target_x: cell.x,
            target_y: cell.y,
            target_z: cell.z,
            target_direction: target_direction.into(),
            seconds: self.seconds,
            phase: self.phase,
        }
        .serialize(serializer)
    }
}

impl<'de> Deserialize<'de> for ConstructionSite {
    fn deserialize<D>(deserializer: D) -> std::result::Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let wire = ConstructionSiteWire::deserialize(deserializer)?;
        let cell = crate::generation::Cell { x: wire.target_x, y: wire.target_y, z: wire.target_z };
        let target = match (wire.target_kind.as_str(), wire.target_direction.as_str()) {
            ("cell", "north") => ConstructionTarget::Cell { cell, orientation: Cardinal::North },
            ("cell", "east") => ConstructionTarget::Cell { cell, orientation: Cardinal::East },
            ("cell", "south") => ConstructionTarget::Cell { cell, orientation: Cardinal::South },
            ("cell", "west") => ConstructionTarget::Cell { cell, orientation: Cardinal::West },
            ("edge", "x") => ConstructionTarget::Edge { edge: crate::structure_geometry::Face { cell, axis: crate::structure_geometry::FaceAxis::X } },
            ("edge", "z") => ConstructionTarget::Edge { edge: crate::structure_geometry::Face { cell, axis: crate::structure_geometry::FaceAxis::Z } },
            _ => return Err(serde::de::Error::custom("invalid construction target")),
        };
        Ok(Self { catalog: wire.catalog, target, seconds: wire.seconds, phase: wire.phase })
    }
}
#[derive(Component, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FloorReplacement {
    pub version: u32,
    pub target_floor: String,
    pub expected_catalog: String,
    pub desired_catalog: String,
    pub support_x: i64,
    pub support_y: i64,
    pub support_z: i64,
    pub phase: FloorReplacementPhase,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum FloorReplacementPhase { Queued, Working, Completed, Cancelled }
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
#[serde(deny_unknown_fields)]
pub struct Emitter {
    pub catalog: String,
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
    #[serde(default)]
    pub actors: Vec<ActorTemplate>,
    #[serde(rename = "materialCatalog")]
    pub material_catalog: Vec<crate::material_catalog::Definition>,
    #[serde(default, rename = "stockpileProfiles")]
    pub stockpile_profiles: Vec<crate::stockpile_definition::StockpileProfileDefinition>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ActorParameterType {
    Number,
    Boolean,
    String,
    Entity,
    NullableEntity,
    ActorReference,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ActorParameterDefinition {
    pub name: String,
    #[serde(rename = "type")]
    pub parameter_type: ActorParameterType,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "kebab-case", deny_unknown_fields)]
pub enum ActorFieldBinding {
    Value { value: Value },
    Parameter { parameter: String },
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ActorCapabilityTemplate {
    pub component: String,
    pub fields: BTreeMap<String, ActorFieldBinding>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ActorTemplate {
    pub id: String,
    pub version: u32,
    pub parameters: Vec<ActorParameterDefinition>,
    pub components: Vec<ActorCapabilityTemplate>,
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
    pub next_work_generation: u64,
    pub next_party_sequence: u64,
    pub party_bindings: Vec<PartyBinding>,
    pub work_attempts: Vec<crate::work_attempt::WorkAttempt>,
    pub planner: crate::work_planner::PlannerState,
    /// Canonical typed ECS records are kept in dedicated arrays because the
    /// authored registry schema only describes primitive fields.
    #[serde(default)]
    pub jobs: Vec<JobSnapshot>,
    #[serde(default)]
    pub tasks: Vec<TaskSnapshot>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct JobSnapshot { pub id: String, pub job: crate::job::Job }
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TaskSnapshot { pub id: String, pub task: crate::job::Task }
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
    EstablishParty { #[serde(rename = "bindingId")] binding_id: String, #[serde(rename = "expectedSequence")] expected_sequence: u64, records: Vec<EntityRecord> },
    BeginWorkAttempt { task: String, worker: String, party: String, operation: crate::work_attempt::ActivityRef },
    RetargetWorkAttempt { task: String, generation: u64, sequence: u32, destination: Point },
    InterruptWorkAttempt { task: String, generation: u64, sequence: u32, cause: crate::work_attempt::InterruptCause },
    AcknowledgeWorkAttempt { task: String, generation: u64, sequence: u32 },
    ContinueWorkAttempt { task: String, generation: u64, sequence: u32, #[serde(rename = "nextActivity")] next_activity: crate::work_attempt::ActivityRef },
    CreateJob { id: String, plan: crate::job::JobPlan },
    ResumeJob { id: String, plan: crate::job::JobPlan },
    CancelJob { id: String },
    RequestProcess { definition: String, station: String },
    AdmitProcess { process: String, definition: String, station: String },
    ExchangeFieldWater { operation: String, worker: String, vessel: String, x: i32, y: i32, z: i32, direction: crate::terrain_water::WaterExchangeDirection, portions: u8 },
    DesignateStockpile { party: String, zone: String, cells: Vec<StockpileDesignation> },
    UpdateStockpile { party: String, zone: String, #[serde(rename = "filterProfile")] filter_profile: String, priority: u32 },
    ClearStockpile { party: String, zone: String, cells: Vec<StockpileCellCoordinate> },
    CancelWork { entity: String },
    Deconstruct { worker: String, site: String },
    PlanConstructions { party: String, plans: Vec<ConstructionPlan> },
    PlanExcavation { party: String, prefix: String, start: [i32; 3], end: [i32; 3] },
    CancelExcavation { party: String, area: Option<ExcavationArea>, workers: Vec<String> },
    PlanDeconstruction { site: String, party: String },
    ReplaceFloor { #[serde(rename = "orderId")] order_id: String, #[serde(rename = "existingFloorId")] existing_floor_id: String, #[serde(rename = "desiredCatalog")] desired_catalog: String },
    BindConstructionStage { site: String, contact: Point },
    Move {
        entity: String,
        destination: Point,
        facing: Option<f64>,
    },
    BeginDirect { entity: String, stream: String },
    BeginEmission { worker: String, station: String },
    SetStructureOpen { worker: String, site: String, open: bool },
    DirectInput { entity: String, stream: String, inputs: Vec<DirectInput> },
    DropLot { entity: String, lot: String },
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
    ExtractResource { operation: String, worker: String, source: String },
    EstablishResourceSite { operation: String, worker: String, site: String, definition: String, x: i32, y: i32, z: i32 },
    TendResourceSite { operation: String, worker: String, site: String, vessel: String },
    DesignateResource { order: String, party: String, definition: String, x: i32, y: i32, z: i32 },
    RequestFieldWater { party: String, material: String, portions: u8 },
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

#[derive(Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ConstructionPlan {
    pub catalog: String,
    pub site: String,
    pub target: ConstructionTarget,
}
#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "kebab-case", deny_unknown_fields)]
pub enum ActionScope {
    Host,
    Party { party: String },
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ScopedAction {
    pub scope: ActionScope,
    pub request: Action,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ScopedCreate {
    pub scope: ActionScope,
    pub record: EntityRecord,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ScopedRemove {
    pub scope: ActionScope,
    pub entity: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Batch {
    pub delta: f64,
    #[serde(default)]
    pub creates: Vec<ScopedCreate>,
    #[serde(default)]
    pub removes: Vec<ScopedRemove>,
    pub writes: Vec<Write>,
    pub actions: Vec<ScopedAction>,
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
    #[serde(rename = "entityId", skip_serializing_if = "Option::is_none")]
    pub entity_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub attempt: Option<crate::work_attempt::AttemptKey>,
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
