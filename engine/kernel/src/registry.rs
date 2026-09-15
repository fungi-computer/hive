//! The only unsafe boundary: known layout/drop and IDs belonging to one World.
use crate::components::*;
use crate::components::Result;
use bevy_ecs::{
    component::{ComponentCloneBehavior, ComponentDescriptor, ComponentId, StorageType},
    prelude::*,
    ptr::OwningPtr,
};
use std::{
    alloc::Layout,
    collections::{BTreeMap, BTreeSet},
};

pub struct Registry {
    pub schemas: BTreeMap<String, Schema>,
    pub ids: BTreeMap<String, ComponentId>,
}
impl Registry {
    pub fn new(world: &mut World, schemas: Vec<Schema>) -> Result<Self> {
        let mut this = Self {
            schemas: BTreeMap::new(),
            ids: BTreeMap::new(),
        };
        if schemas.len() > 128 {
            return Err("too many schemas".into());
        }
        for schema in schemas {
            if !valid_id(&schema.id)
                || !schema.id.contains('.')
                || schema.version == 0
                || schema.fields.len() > 32
                || schema.fields.keys().any(|n| !valid_id(n))
            {
                return Err("invalid schema".into());
            }
            if this.schemas.insert(schema.id.clone(), schema).is_some() {
                return Err("duplicate schema".into());
            }
        }
        for (name, fields) in [
            ("hive.party", vec![("ownerPlayer", FieldType::String)]),
            ("hive.party-member", vec![("party", FieldType::Entity)]),
            ("hive.owned-by-party", vec![("party", FieldType::Entity)]),
            ("hive.party-receipt", vec![("bindingId", FieldType::String), ("player", FieldType::String), ("party", FieldType::Entity), ("digest", FieldType::String)]),
            ("hive.work-participation", vec![("automatic", FieldType::Boolean)]),
            ("hive.work-policy", vec![("party", FieldType::Entity), ("priority", FieldType::Number), ("enabled", FieldType::Boolean)]),
            ("hive.work-schedule", vec![("nextReviewTick", FieldType::Number), ("lastConsidered", FieldType::Number)]),
            ("hive.job-task-work", vec![("seconds", FieldType::Number)]),
            (
                "hive.position",
                vec![
                    ("x", FieldType::Number),
                    ("y", FieldType::Number),
                    ("z", FieldType::Number),
                    ("facing", FieldType::Number),
                ],
            ),
            ("hive.body", vec![("speed", FieldType::Number)]),
            ("hive.traversal", vec![("clearanceCells", FieldType::Number), ("maxStepCells", FieldType::Number)]),
            ("hive.container", vec![("capacity", FieldType::Number)]),
            ("hive.sealed-container", vec![]),
            ("hive.ground-stock", vec![]),
            (
                "hive.lot",
                vec![
                    ("kind", FieldType::String),
                    ("quantity", FieldType::Number),
                    ("container", FieldType::Entity),
                ],
            ),
            ("hive.lot-water", vec![("waterKg", FieldType::Number)]),
            ("hive.supply-allocation", vec![("requirementOwner", FieldType::Entity), ("requirementRole", FieldType::String), ("requirementGeneration", FieldType::Number), ("party", FieldType::Entity), ("material", FieldType::String), ("portion", FieldType::Entity), ("destination", FieldType::Entity), ("quantity", FieldType::Number), ("state", FieldType::String)]),
            ("hive.staged-process", vec![
                ("version", FieldType::Number), ("definition", FieldType::String), ("definitionVersion", FieldType::Number),
                ("station", FieldType::Entity), ("stageIndex", FieldType::Number), ("progressSeconds", FieldType::Number),
                ("enteredTick", FieldType::Number), ("phase", FieldType::String), ("blockedReason", FieldType::String),
            ]),
            ("hive.process-binding", vec![("process", FieldType::Entity), ("role", FieldType::String), ("lot", FieldType::Entity), ("quantity", FieldType::Number)]),
            ("hive.stockpile-cell", vec![("zone", FieldType::String), ("priority", FieldType::Number), ("filterProfile", FieldType::String)]),
            ("hive.finite-resource", vec![("kind", FieldType::String), ("quantity", FieldType::Number)]),
            ("hive.resource-site", vec![("definition", FieldType::String), ("stage", FieldType::Number), ("nextDue", FieldType::Number)]),
            ("hive.excavation-work", vec![("x", FieldType::Number), ("y", FieldType::Number), ("z", FieldType::Number), ("expected", FieldType::Number), ("replacement", FieldType::Number), ("seconds", FieldType::Number)]),
            ("hive.excavation-order", vec![("cellX", FieldType::Number), ("cellY", FieldType::Number), ("cellZ", FieldType::Number), ("expected", FieldType::Number), ("status", FieldType::String), ("reason", FieldType::String)]),
            ("hive.deconstruction-work", vec![("site", FieldType::Entity), ("contactX", FieldType::Number), ("contactY", FieldType::Number), ("contactZ", FieldType::Number), ("seconds", FieldType::Number), ("requiredSeconds", FieldType::Number)]),
            ("hive.deconstruction-order", vec![("site", FieldType::String), ("contactX", FieldType::Number), ("contactY", FieldType::Number), ("contactZ", FieldType::Number), ("salvageQuantity", FieldType::Number), ("workSeconds", FieldType::Number), ("status", FieldType::String), ("reason", FieldType::String), ("retryKey", FieldType::String)]),
            ("hive.construction-site", vec![
                ("catalog", FieldType::String), ("targetKind", FieldType::String),
                ("targetX", FieldType::Number), ("targetY", FieldType::Number), ("targetZ", FieldType::Number),
                ("targetDirection", FieldType::String),
                ("seconds", FieldType::Number), ("phase", FieldType::String),
            ]),
            ("hive.floor-replacement", vec![("version", FieldType::Number), ("targetFloor", FieldType::Entity), ("expectedCatalog", FieldType::String), ("desiredCatalog", FieldType::String), ("supportX", FieldType::Number), ("supportY", FieldType::Number), ("supportZ", FieldType::Number), ("phase", FieldType::String)]),
            (
                "hive.destination",
                vec![
                    ("x", FieldType::Number),
                    ("y", FieldType::Number),
                    ("z", FieldType::Number),
                    ("facing", FieldType::Number),
                    ("frame", FieldType::NullableEntity),
                ],
            ),
            ("hive.support", vec![("entity", FieldType::Entity)]),
            (
                "hive.surface",
                vec![
                    ("minX", FieldType::Number),
                    ("maxX", FieldType::Number),
                    ("minZ", FieldType::Number),
                    ("maxZ", FieldType::Number),
                    ("height", FieldType::Number),
                ],
            ),
            ("hive.obstacle", vec![("occupied", FieldType::Boolean)]),
            (
                "hive.collider",
                vec![
                    ("shape", FieldType::String),
                    ("radius", FieldType::Number),
                    ("halfX", FieldType::Number),
                    ("halfY", FieldType::Number),
                    ("halfZ", FieldType::Number),
                    ("yaw", FieldType::Number),
                    ("offsetX", FieldType::Number),
                    ("offsetY", FieldType::Number),
                    ("offsetZ", FieldType::Number),
                ],
            ),
            (
                "hive.impact-material",
                vec![
                    ("response", FieldType::String),
                    ("resistance", FieldType::Number),
                    ("restitution", FieldType::Number),
                    ("friction", FieldType::Number),
                    ("embedSpeed", FieldType::Number),
                ],
            ),
            (
                "hive.launcher",
                vec![
                    ("ammoKind", FieldType::String),
                    ("muzzleX", FieldType::Number),
                    ("muzzleY", FieldType::Number),
                    ("muzzleZ", FieldType::Number),
                    ("maxSpeed", FieldType::Number),
                    ("projectileRadius", FieldType::Number),
                    ("maxRange", FieldType::Number),
                    ("maxLifetime", FieldType::Number),
                    ("projectileSprite", FieldType::String),
                    ("projectileLabel", FieldType::String),
                    ("gravity", FieldType::Number),
                    ("penetration", FieldType::Number),
                ],
            ),
            ("hive.emitter", vec![("catalog", FieldType::String)]),
            (
                "hive.projectile",
                vec![
                    ("launcher", FieldType::Entity),
                    ("velocityX", FieldType::Number),
                    ("velocityY", FieldType::Number),
                    ("velocityZ", FieldType::Number),
                    ("radius", FieldType::Number),
                    ("age", FieldType::Number),
                    ("distance", FieldType::Number),
                    ("maxRange", FieldType::Number),
                    ("maxLifetime", FieldType::Number),
                    ("gravity", FieldType::Number),
                    ("penetration", FieldType::Number),
                    ("state", FieldType::String),
                    ("rollNormalX", FieldType::Number),
                    ("rollNormalY", FieldType::Number),
                    ("rollNormalZ", FieldType::Number),
                    ("embedDepth", FieldType::Number),
                    ("rollFriction", FieldType::Number),
                ],
            ),
            (
                "hive.visual",
                vec![("sprite", FieldType::String), ("label", FieldType::String)],
            ),
        ] {
            let schema = Schema {
                id: name.into(),
                version: match name { "hive.construction-site" => 2, "hive.deconstruction-order" => 4, _ => 1 },
                fields: fields.into_iter().map(|(n, t)| (n.into(), t)).collect(),
            };
            if this.schemas.get(name).is_some_and(|s| s != &schema) {
                return Err(format!("reserved schema differs: {name}"));
            }
            this.schemas.insert(name.into(), schema);
        }
        if this.schemas.len() > 128 {
            return Err("too many total schemas".into());
        }
        for name in this.schemas.keys() {
            let id = match name.as_str() {
                "hive.position" => world.register_component::<Position>(),
                "hive.body" => world.register_component::<Body>(),
                "hive.traversal" => world.register_component::<Traversal>(),
                "hive.container" => world.register_component::<Container>(),
                "hive.sealed-container" => world.register_component::<SealedContainer>(),
                "hive.ground-stock" => world.register_component::<GroundStock>(),
                "hive.lot" => world.register_component::<Lot>(),
                "hive.lot-water" => world.register_component::<LotWater>(),
                "hive.supply-allocation" => world.register_component::<SupplyAllocation>(),
                "hive.staged-process" => world.register_component::<crate::staged_process::StagedProcess>(),
                "hive.process-binding" => world.register_component::<crate::staged_process::ProcessBinding>(),
                "hive.stockpile-cell" => world.register_component::<StockpileCell>(),
                "hive.finite-resource" => world.register_component::<FiniteResource>(),
                "hive.resource-site" => world.register_component::<ResourceSite>(),
                "hive.excavation-work" => world.register_component::<ExcavationWork>(),
                "hive.excavation-order" => world.register_component::<ExcavationOrder>(),
                "hive.deconstruction-work" => world.register_component::<DeconstructionWork>(),
                "hive.deconstruction-order" => world.register_component::<DeconstructionOrder>(),
                "hive.construction-site" => world.register_component::<ConstructionSite>(),
                "hive.floor-replacement" => world.register_component::<FloorReplacement>(),
                "hive.destination" => world.register_component::<Destination>(),
                "hive.support" => world.register_component::<Support>(),
                "hive.surface" => world.register_component::<Surface>(),
                "hive.obstacle" => world.register_component::<Obstacle>(),
                "hive.collider" => world.register_component::<Collider>(),
                "hive.impact-material" => world.register_component::<ImpactMaterial>(),
                "hive.launcher" => world.register_component::<Launcher>(),
                "hive.emitter" => world.register_component::<Emitter>(),
                "hive.projectile" => world.register_component::<Projectile>(),
                "hive.visual" => world.register_component::<Visual>(),
                "hive.party" => world.register_component::<Party>(),
                "hive.party-member" => world.register_component::<PartyMember>(),
                "hive.owned-by-party" => world.register_component::<OwnedByParty>(),
                "hive.party-receipt" => world.register_component::<PartyReceipt>(),
                "hive.work-participation" => world.register_component::<crate::work_planner::WorkParticipation>(),
                "hive.work-policy" => world.register_component::<crate::work_planner::WorkPolicy>(),
                "hive.work-schedule" => world.register_component::<crate::work_planner::WorkSchedule>(),
                "hive.job-task-work" => world.register_component::<crate::job::JobTaskWork>(),
                _ => {
                    // All dynamic insertions use AuthoredRecord, a Send+Sync
                    // layout. The destructor matches exactly; no relationships.
                    let descriptor = unsafe {
                        ComponentDescriptor::new_with_layout(
                            name.clone(),
                            StorageType::Table,
                            Layout::new::<AuthoredRecord>(),
                            Some(drop_record),
                            true,
                            ComponentCloneBehavior::Ignore,
                            None,
                        )
                    };
                    world.register_component_with_descriptor(descriptor)
                }
            };
            this.ids.insert(name.clone(), id);
        }
        Ok(this)
    }
    pub fn is_physical(name: &str) -> bool {
        matches!(
            name,
            "hive.position"
                | "hive.body"
                | "hive.traversal"
                | "hive.container"
                | "hive.sealed-container"
                | "hive.ground-stock"
                | "hive.lot"
                | "hive.lot-water"
                | "hive.supply-allocation"
                | "hive.staged-process"
                | "hive.process-binding"
                | "hive.stockpile-cell"
                | "hive.finite-resource"
                | "hive.resource-site"
                | "hive.excavation-work"
                | "hive.excavation-order"
                | "hive.deconstruction-work"
                | "hive.construction-site"
                | "hive.floor-replacement"
                | "hive.destination"
                | "hive.support"
                | "hive.surface"
                | "hive.obstacle"
                | "hive.collider"
                | "hive.impact-material"
                | "hive.launcher"
                | "hive.emitter"
                | "hive.projectile"
                | "hive.visual"
                | "hive.work-schedule"
                | "hive.job-task-work"
        )
    }
    /// Conservative canonical JSON size. Numeric poses can advance without
    /// changing this weight; entity reference IDs have a fixed validated bound.
    pub fn weight(&self, name: &str, value: &Record) -> usize {
        name.len()
            + 8
            + value
                .iter()
                .map(|(key, v)| {
                    let size = match self.schemas[name].fields[key] {
                        FieldType::Entity | FieldType::NullableEntity => 132,
                        FieldType::Number | FieldType::Boolean => 64,
                        FieldType::String => {
                            serde_json::to_string(v).expect("validated string").len()
                        }
                    };
                    key.len() + 8 + size
                })
                .sum::<usize>()
    }
    pub fn validate(&self, name: &str, value: &Record, known: &BTreeSet<String>) -> Result<()> {
        let schema = self
            .schemas
            .get(name)
            .ok_or_else(|| format!("unknown component {name}"))?;
        if schema.fields.len() != value.len() {
            return Err(format!("fields differ for {name}"));
        }
        for (field, ty) in &schema.fields {
            let v = value
                .get(field)
                .ok_or_else(|| format!("missing {name}.{field}"))?;
            let valid = match ty {
                FieldType::Number => v.as_f64().is_some_and(f64::is_finite),
                FieldType::Boolean => v.is_boolean(),
                FieldType::String => v.as_str().is_some_and(|s| s.len() <= 4096),
                FieldType::Entity => v.as_str().is_some_and(|s| known.contains(s)),
                FieldType::NullableEntity => {
                    v.is_null() || v.as_str().is_some_and(|s| known.contains(s))
                }
            };
            if !valid {
                return Err(format!("invalid {name}.{field}"));
            }
        }
        match name {
            "hive.body" => {
                let body: Body = decode(value)?;
                if body.speed <= 0.0 || body.speed > 100.0 {
                    return Err("invalid speed".into());
                }
            }
            "hive.traversal" => {
                let traversal: Traversal = decode(value)?;
                if traversal.clearance_cells == 0 || traversal.clearance_cells > 8 || traversal.max_step_cells != 1 {
                    return Err("invalid traversal capability".into());
                }
            }
            "hive.container" => {
                let _: Container = decode(value)?;
            }
            "hive.ground-stock" => { let _: GroundStock = decode(value)?; }
            "hive.sealed-container" => {
                let _: SealedContainer = decode(value)?;
            }
            "hive.lot" => {
                let lot: Lot = decode(value)?;
                if !valid_id(&lot.kind) {
                    return Err("invalid lot".into());
                }
            }
            "hive.excavation-work" => {
                let work: ExcavationWork = decode(value)?;
                if !work.seconds.is_finite() || work.seconds < 0.0 || work.expected == work.replacement {
                    return Err("invalid excavation progress".into());
                }
            }
            "hive.deconstruction-work" => {
                let work: DeconstructionWork = decode(value)?;
                if !valid_id(&work.site) || !work.seconds.is_finite() || work.seconds < 0.0 || !work.required_seconds.is_finite() || work.required_seconds < 0.0 { return Err("invalid deconstruction progress".into()); }
            }
            "hive.deconstruction-order" => {
                let order: DeconstructionOrder = decode(value)?;
                if !valid_id(&order.site)
                    || ![order.contact_x, order.contact_y, order.contact_z, order.work_seconds].iter().all(|value| value.is_finite())
                    || order.work_seconds < 0.0
                    || !matches!(order.status.as_str(), "queued" | "blocked" | "complete")
                    || order.reason.len() > 512 || order.retry_key.len() > 512
                { return Err("invalid deconstruction order".into()); }
            }
            "hive.construction-site" => {
                let site: ConstructionSite = decode(value)?;
                if !valid_id(&site.catalog) || !site.seconds.is_finite() || site.seconds < 0.0 {
                    return Err("invalid construction site".into());
                }
            }
            "hive.floor-replacement" => { let replacement: FloorReplacement = decode(value)?; if replacement.version != 1 || !valid_id(&replacement.target_floor) || !valid_id(&replacement.expected_catalog) || !valid_id(&replacement.desired_catalog) { return Err("invalid floor replacement".into()); } }
            "hive.lot-water" => {
                let water: LotWater = decode(value)?;
                if !water.water_kg.is_finite() || water.water_kg < 0.0 || water.water_kg > MAX_CARRIED_WATER_KG {
                    return Err("invalid carried water mass".into());
                }
            }
            "hive.supply-allocation" => {
                let allocation: SupplyAllocation = decode(value)?;
                if !valid_id(&allocation.requirement_owner) || !valid_id(&allocation.requirement_role) || allocation.requirement_generation == 0 || !valid_id(&allocation.party)
                    || !valid_id(&allocation.material) || !valid_id(&allocation.portion)
                    || !valid_id(&allocation.destination) || allocation.quantity == 0
                { return Err("invalid supply allocation".into()); }
            }
            "hive.staged-process" => {
                let process: crate::staged_process::StagedProcess = decode(value)?;
                if process.version != crate::staged_process::CURRENT_VERSION
                    || !valid_id(&process.definition) || process.definition_version == 0
                    || !valid_id(&process.station) || !process.progress_seconds.is_finite()
                    || process.progress_seconds < 0.0 || (!process.blocked_reason.is_empty() && !valid_id(&process.blocked_reason))
                    || (process.phase == crate::staged_process::ProcessPhase::Blocked) != !process.blocked_reason.is_empty()
                { return Err("invalid staged process fact".into()); }
            }
            "hive.process-binding" => {
                let binding: crate::staged_process::ProcessBinding = decode(value)?;
                if !valid_id(&binding.process) || !valid_id(&binding.role) || !valid_id(&binding.lot) || binding.quantity == 0 { return Err("invalid process binding fact".into()); }
            }
            "hive.stockpile-cell" => {
                let cell: StockpileCell = decode(value)?;
                if !valid_id(&cell.zone) || !valid_id(&cell.filter_profile) { return Err("invalid stockpile cell".into()); }
            }
            "hive.finite-resource" => {
                let resource: FiniteResource = decode(value)?;
                if !valid_id(&resource.kind) {
                    return Err("invalid finite resource".into());
                }
            }
            "hive.resource-site" => {
                let site: ResourceSite = decode(value)?;
                if !valid_id(&site.definition) || site.stage > 64 || !site.next_due.is_finite() || site.next_due < 0.0 { return Err("invalid resource site".into()); }
            }
            "hive.collider" => {
                let collider: Collider = decode(value)?;
                if !collider.radius.is_finite()
                    || !collider.half_x.is_finite()
                    || !collider.half_y.is_finite()
                    || !collider.half_z.is_finite()
                    || !collider.yaw.is_finite()
                    || !collider.offset_x.is_finite()
                    || !collider.offset_y.is_finite()
                    || !collider.offset_z.is_finite()
                    || collider.radius < 0.0
                    || collider.half_x < 0.0
                    || collider.half_y < 0.0
                    || collider.half_z < 0.0
                {
                    return Err("invalid collider".into());
                }
                match collider.shape {
                    ColliderShape::Ball if collider.radius <= 0.0 => {
                        return Err("ball collider requires radius".into())
                    }
                    ColliderShape::Cuboid
                        if collider.half_x <= 0.0
                            || collider.half_y <= 0.0
                            || collider.half_z <= 0.0 =>
                    {
                        return Err("cuboid collider requires half extents".into())
                    }
                    _ => {}
                }
            }
            "hive.impact-material" => {
                let material: ImpactMaterial = decode(value)?;
                if !matches!(material.response.as_str(), "stop" | "pierce" | "ground")
                    || !material.resistance.is_finite()
                    || !material.restitution.is_finite()
                    || !material.friction.is_finite()
                    || !material.embed_speed.is_finite()
                    || material.resistance < 0.0
                    || material.restitution < 0.0
                    || material.restitution > 1.0
                    || material.friction < 0.0
                    || material.friction > 1.0
                    || material.embed_speed < 0.0
                {
                    return Err("invalid impact material".into());
                }
            }
            "hive.launcher" => {
                let launcher: Launcher = decode(value)?;
                if !valid_id(&launcher.ammo_kind)
                    || !launcher.muzzle_x.is_finite()
                    || !launcher.muzzle_y.is_finite()
                    || !launcher.muzzle_z.is_finite()
                    || !launcher.max_speed.is_finite()
                    || !launcher.projectile_radius.is_finite()
                    || !launcher.max_range.is_finite()
                    || !launcher.max_lifetime.is_finite()
                    || !launcher.gravity.is_finite()
                    || !launcher.penetration.is_finite()
                    || !valid_id(&launcher.projectile_sprite)
                    || launcher.projectile_label.len() > 4096
                    || launcher.max_speed <= 0.0
                    || launcher.projectile_radius <= 0.0
                    || launcher.max_range <= 0.0
                    || launcher.max_lifetime <= 0.0
                    || launcher.max_range > 1000.0
                    || launcher.max_lifetime > 10.0
                    || launcher.penetration < 0.0
                {
                    return Err("invalid launcher".into());
                }
            }
            "hive.emitter" => {
                let emitter: Emitter = decode(value)?;
                if !valid_id(&emitter.catalog) {
                    return Err("invalid emitter".into());
                }
            }
            "hive.projectile" => {
                let projectile: Projectile = decode(value)?;
                if !valid_id(&projectile.launcher)
                    || !projectile.velocity_x.is_finite()
                    || !projectile.velocity_y.is_finite()
                    || !projectile.velocity_z.is_finite()
                    || !projectile.radius.is_finite()
                    || !projectile.age.is_finite()
                    || !projectile.distance.is_finite()
                    || !projectile.max_range.is_finite()
                    || !projectile.max_lifetime.is_finite()
                    || !projectile.gravity.is_finite()
                    || !projectile.penetration.is_finite()
                    || !projectile.roll_normal_x.is_finite()
                    || !projectile.roll_normal_y.is_finite()
                    || !projectile.roll_normal_z.is_finite()
                    || !projectile.embed_depth.is_finite()
                    || !projectile.roll_friction.is_finite()
                    || !matches!(projectile.state.as_str(), "flying" | "rolling" | "embedded" | "resting")
                    || projectile.radius <= 0.0
                    || projectile.age < 0.0
                    || projectile.distance < 0.0
                    || projectile.max_range <= 0.0
                    || projectile.max_lifetime <= 0.0
                    || projectile.max_range > 1000.0
                    || projectile.max_lifetime > 10.0
                    || projectile.penetration < 0.0
                    || projectile.embed_depth < 0.0
                    || projectile.roll_friction < 0.0
                    || projectile.roll_friction > 1.0
                {
                    return Err("invalid projectile".into());
                }
            }
            "hive.work-participation" => { let _: crate::work_planner::WorkParticipation = decode(value)?; }
            "hive.work-policy" => { let policy: crate::work_planner::WorkPolicy = decode(value)?; if !valid_id(&policy.party) { return Err("invalid work policy party".into()); } }
            "hive.work-schedule" => { let schedule: crate::work_planner::WorkSchedule = decode(value)?; if schedule.next_review_tick < schedule.last_considered { return Err("invalid work schedule".into()); } }
            "hive.job-task-work" => { let work: crate::job::JobTaskWork = decode(value)?; if !work.seconds.is_finite() || work.seconds < 0.0 { return Err("invalid job task work".into()); } }
            "hive.excavation-order" => {
                let order: ExcavationOrder = decode(value)?;
                if !matches!(order.status.as_str(), "queued" | "blocked" | "cancelling") || order.reason.len() > 256 { return Err("invalid excavation order".into()); }
            }
            _ => {}
        }
        Ok(())
    }
    pub fn insert(
        &self,
        world: &mut World,
        entity: Entity,
        name: &str,
        value: &Record,
    ) -> Result<()> {
        match name {
            "hive.position" => {
                world.entity_mut(entity).insert(decode::<Position>(value)?);
            }
            "hive.body" => {
                world.entity_mut(entity).insert(decode::<Body>(value)?);
            }
            "hive.traversal" => {
                world.entity_mut(entity).insert(decode::<Traversal>(value)?);
            }
            "hive.container" => {
                world.entity_mut(entity).insert(decode::<Container>(value)?);
            }
            "hive.ground-stock" => { world.entity_mut(entity).insert(decode::<GroundStock>(value)?); }
            "hive.sealed-container" => {
                world.entity_mut(entity).insert(decode::<SealedContainer>(value)?);
            }
            "hive.lot" => {
                world.entity_mut(entity).insert(decode::<Lot>(value)?);
            }
            "hive.excavation-work" => {
                world.entity_mut(entity).insert(decode::<ExcavationWork>(value)?);
            }
            "hive.excavation-order" => { world.entity_mut(entity).insert(decode::<ExcavationOrder>(value)?); }
            "hive.deconstruction-work" => { world.entity_mut(entity).insert(decode::<DeconstructionWork>(value)?); }
            "hive.deconstruction-order" => { world.entity_mut(entity).insert(decode::<DeconstructionOrder>(value)?); }
            "hive.construction-site" => {
                world.entity_mut(entity).insert(decode::<ConstructionSite>(value)?);
            }
            "hive.floor-replacement" => { world.entity_mut(entity).insert(decode::<FloorReplacement>(value)?); }
            "hive.lot-water" => {
                world.entity_mut(entity).insert(decode::<LotWater>(value)?);
            }
            "hive.supply-allocation" => { world.entity_mut(entity).insert(decode::<SupplyAllocation>(value)?); }
            "hive.staged-process" => { world.entity_mut(entity).insert(decode::<crate::staged_process::StagedProcess>(value)?); }
            "hive.process-binding" => { world.entity_mut(entity).insert(decode::<crate::staged_process::ProcessBinding>(value)?); }
            "hive.stockpile-cell" => { world.entity_mut(entity).insert(decode::<StockpileCell>(value)?); }
            "hive.finite-resource" => {
                world.entity_mut(entity).insert(decode::<FiniteResource>(value)?);
            }
            "hive.resource-site" => {
                world.entity_mut(entity).insert(decode::<ResourceSite>(value)?);
            }
            "hive.destination" => {
                world
                    .entity_mut(entity)
                    .insert(decode::<Destination>(value)?);
            }
            "hive.support" => {
                world.entity_mut(entity).insert(decode::<Support>(value)?);
            }
            "hive.surface" => {
                world.entity_mut(entity).insert(decode::<Surface>(value)?);
            }
            "hive.obstacle" => {
                world.entity_mut(entity).insert(decode::<Obstacle>(value)?);
            }
            "hive.collider" => {
                world.entity_mut(entity).insert(decode::<Collider>(value)?);
            }
            "hive.impact-material" => {
                world.entity_mut(entity).insert(decode::<ImpactMaterial>(value)?);
            }
            "hive.launcher" => {
                world.entity_mut(entity).insert(decode::<Launcher>(value)?);
            }
            "hive.emitter" => {
                world.entity_mut(entity).insert(decode::<Emitter>(value)?);
            }
            "hive.projectile" => {
                world.entity_mut(entity).insert(decode::<Projectile>(value)?);
            }
            "hive.visual" => {
                world.entity_mut(entity).insert(decode::<Visual>(value)?);
            }
            "hive.party" => { world.entity_mut(entity).insert(decode::<Party>(value)?); }
            "hive.party-member" => { world.entity_mut(entity).insert(decode::<PartyMember>(value)?); }
            "hive.owned-by-party" => { world.entity_mut(entity).insert(decode::<OwnedByParty>(value)?); }
            "hive.party-receipt" => { world.entity_mut(entity).insert(decode::<PartyReceipt>(value)?); }
            "hive.work-participation" => { world.entity_mut(entity).insert(decode::<crate::work_planner::WorkParticipation>(value)?); }
            "hive.work-policy" => { world.entity_mut(entity).insert(decode::<crate::work_planner::WorkPolicy>(value)?); }
            "hive.work-schedule" => { world.entity_mut(entity).insert(decode::<crate::work_planner::WorkSchedule>(value)?); }
            "hive.job-task-work" => { world.entity_mut(entity).insert(decode::<crate::job::JobTaskWork>(value)?); }
            _ => {
                let id = *self.ids.get(name).ok_or("unknown component")?;
                OwningPtr::make(AuthoredRecord(value.clone()), |ptr| {
                    // Registry's ID and World stay paired throughout lifetime.
                    unsafe {
                        world.entity_mut(entity).insert_by_id(id, ptr);
                    }
                });
            }
        }
        Ok(())
    }
    pub fn read(&self, world: &World, entity: Entity, name: &str) -> Option<Record> {
        match name {
            "hive.party" => world.get::<Party>(entity).map(record),
            "hive.party-member" => world.get::<PartyMember>(entity).map(record),
            "hive.owned-by-party" => world.get::<OwnedByParty>(entity).map(record),
            "hive.party-receipt" => world.get::<PartyReceipt>(entity).map(record),
            "hive.work-participation" => world.get::<crate::work_planner::WorkParticipation>(entity).map(record),
            "hive.work-policy" => world.get::<crate::work_planner::WorkPolicy>(entity).map(record),
            "hive.work-schedule" => world.get::<crate::work_planner::WorkSchedule>(entity).map(record),
            "hive.job-task-work" => world.get::<crate::job::JobTaskWork>(entity).map(record),
            "hive.position" => world.get::<Position>(entity).map(record),
            "hive.body" => world.get::<Body>(entity).map(record),
            "hive.traversal" => world.get::<Traversal>(entity).map(record),
            "hive.container" => world.get::<Container>(entity).map(record),
            "hive.sealed-container" => world.get::<SealedContainer>(entity).map(record),
            "hive.ground-stock" => world.get::<GroundStock>(entity).map(record),
            "hive.lot" => world.get::<Lot>(entity).map(record),
            "hive.lot-water" => world.get::<LotWater>(entity).map(record),
            "hive.supply-allocation" => world.get::<SupplyAllocation>(entity).map(record),
            "hive.staged-process" => world.get::<crate::staged_process::StagedProcess>(entity).map(record),
            "hive.process-binding" => world.get::<crate::staged_process::ProcessBinding>(entity).map(record),
            "hive.stockpile-cell" => world.get::<StockpileCell>(entity).map(record),
            "hive.finite-resource" => world.get::<FiniteResource>(entity).map(record),
            "hive.resource-site" => world.get::<ResourceSite>(entity).map(record),
            "hive.excavation-work" => world.get::<ExcavationWork>(entity).map(record),
            "hive.excavation-order" => world.get::<ExcavationOrder>(entity).map(record),
            "hive.deconstruction-work" => world.get::<DeconstructionWork>(entity).map(record),
            "hive.deconstruction-order" => world.get::<DeconstructionOrder>(entity).map(record),
            "hive.construction-site" => world.get::<ConstructionSite>(entity).map(record),
            "hive.floor-replacement" => world.get::<FloorReplacement>(entity).map(record),
            "hive.destination" => world.get::<Destination>(entity).map(record),
            "hive.support" => world.get::<Support>(entity).map(record),
            "hive.surface" => world.get::<Surface>(entity).map(record),
            "hive.obstacle" => world.get::<Obstacle>(entity).map(record),
            "hive.collider" => world.get::<Collider>(entity).map(record),
            "hive.impact-material" => world.get::<ImpactMaterial>(entity).map(record),
            "hive.launcher" => world.get::<Launcher>(entity).map(record),
            "hive.emitter" => world.get::<Emitter>(entity).map(record),
            "hive.projectile" => world.get::<Projectile>(entity).map(record),
            "hive.visual" => world.get::<Visual>(entity).map(record),
            _ => {
                let id = *self.ids.get(name)?;
                // Every value inserted for this ID has AuthoredRecord layout.
                world
                    .get_by_id(entity, id)
                    .map(|ptr| unsafe { ptr.deref::<AuthoredRecord>().0.clone() })
            }
        }
    }
}
unsafe fn drop_record(ptr: OwningPtr<'_>) {
    unsafe {
        ptr.drop_as::<AuthoredRecord>();
    }
}
