use crate::{collision, combat, components::*, navigation, registry::Registry};
#[path = "material_output.rs"]
mod material_output;
#[path = "excavation_work.rs"]
mod excavation_work;
use material_output::{MaterialOutputSpec, PreparedMaterialOutput};
use bevy_ecs::{
    prelude::{Entity, World},
    query::{QueryBuilder, QueryState},
};
use serde::Serialize;
use serde_json::json;
use std::collections::{BTreeMap, BTreeSet, VecDeque};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ImpactEvent {
    id: String,
    sequence: u64,
    projectile_id: String,
    source_id: String,
    target_id: String,
    time: f64,
    point: Vector3,
    normal: Vector3,
    velocity: Vector3,
}

fn segment_intersects_cell(start: &Point, end: &Point, cell: navigation::Cell) -> bool {
    let bounds = [
        (cell.0 as f64 - 0.5, cell.0 as f64 + 0.5),
        (cell.2 as f64 - 0.5, cell.2 as f64 + 0.5),
    ];
    let coordinates = [(start.x, end.x), (start.z, end.z)];
    let mut minimum: f64 = 0.0;
    let mut maximum: f64 = 1.0;
    for (axis, (from, to)) in coordinates.into_iter().enumerate() {
        let delta = to - from;
        if delta.abs() <= f64::EPSILON {
            if from < bounds[axis].0 || from > bounds[axis].1 {
                return false;
            }
            continue;
        }
        let mut entry = (bounds[axis].0 - from) / delta;
        let mut exit = (bounds[axis].1 - from) / delta;
        if entry > exit {
            std::mem::swap(&mut entry, &mut exit);
        }
        minimum = minimum.max(entry);
        maximum = maximum.min(exit);
        if minimum > maximum {
            return false;
        }
    }
    true
}

pub struct KernelRecords {
    pub entities: String,
    pub environment: Option<(String, crate::terrain_water::TerrainWaterRecords)>,
}
struct KernelEnvironment {
    definition: String,
    world: crate::terrain_water::TerrainWater,
    excavation_rules: BTreeMap<u16, crate::environment_definition::ExcavationRule>,
}
struct TerrainRouteState {
    path: Vec<crate::generation::Cell>,
    revision: Option<u64>,
    waiting: bool,
    origin: Point,
    target: Option<Point>,
}

pub struct Kernel {
    ecs: World,
    environment: Option<KernelEnvironment>,
    discard_required: bool,
    registry: Registry,
    ids: BTreeMap<String, Entity>,
    known: BTreeSet<String>,
    queries: BTreeMap<Vec<String>, QueryState<Entity>>,
    contents: BTreeMap<String, BTreeSet<Entity>>,
    blocked_by_frame: BTreeMap<Option<String>, BTreeSet<navigation::Cell>>,
    routes: BTreeMap<Entity, VecDeque<Point>>,
    terrain_routes: BTreeMap<Entity, TerrainRouteState>,
    direct: BTreeMap<Entity, DirectState>,
    game: String,
    revision: u64,
    time: f64,
    next_lot: u64,
    next_projectile: u64,
    next_impact: u64,
    projectile_count: usize,
    projectile_contacts: BTreeMap<String, BTreeSet<String>>,
    collider_ids: BTreeSet<String>,
    state_weight: usize,
}
const STATE_BYTES: usize = 8 * 1024 * 1024;

impl Kernel {
    pub fn new() -> Self {
        let mut ecs = World::new();
        let registry = Registry::new(&mut ecs, vec![]).expect("builtin schemas");
        Self {
            ecs,
            environment: None,
            discard_required: false,
            registry,
            ids: BTreeMap::new(),
            known: BTreeSet::new(),
            queries: BTreeMap::new(),
            contents: BTreeMap::new(),
            blocked_by_frame: BTreeMap::new(),
            routes: BTreeMap::new(),
            terrain_routes: BTreeMap::new(),
            direct: BTreeMap::new(),
            game: String::new(),
            revision: 0,
            time: 0.0,
            next_lot: 1,
            next_projectile: 1,
            next_impact: 1,
            projectile_count: 0,
            projectile_contacts: BTreeMap::new(),
            collider_ids: BTreeSet::new(),
            state_weight: 0,
        }
    }
    fn ensure_ready(&self) -> Result<()> {
        if self.discard_required { return Err("kernel attempt requires durable restore".into()); }
        Ok(())
    }
    pub fn load(&mut self, input: &str) -> Result<()> {
        if input.len() > 8 * 1024 * 1024 {
            return Err("scene too large".into());
        }
        let scene: Scene = serde_json::from_str(input).map_err(|e| e.to_string())?;
        *self = Self::from_scene(scene)?;
        Ok(())
    }
    fn from_scene(scene: Scene) -> Result<Self> {
        Self::from_scene_mode(scene, true)
    }
    fn from_scene_mode(scene: Scene, build_routes: bool) -> Result<Self> {
        if scene.format != "hive-game"
            || scene.version != 1
            || !valid_id(&scene.game)
            || scene.initial.len() > 16384
        {
            return Err("unsupported or oversized scene".into());
        }
        let mut world = Self::new();
        world.registry = Registry::new(&mut world.ecs, scene.components)?;
        world.game = scene.game;
        for row in &scene.initial {
            if !valid_id(&row.id) || !world.known.insert(row.id.clone()) {
                return Err("invalid or duplicate entity".into());
            }
            world.ids.insert(
                row.id.clone(),
                world.ecs.spawn(ExternalId(row.id.clone())).id(),
            );
        }
        for row in scene.initial {
            let entity = world.ids[&row.id];
            for (name, value) in row.components {
                world.registry.validate(&name, &value, &world.known)?;
                world
                    .registry
                    .insert(&mut world.ecs, entity, &name, &value)?;
            }
        }
        world.rebuild_physical_indexes(build_routes)?;
        world.projectile_count = world
            .ids
            .values()
            .filter(|entity| world.ecs.get::<Projectile>(**entity).is_some_and(|p| p.state == "flying" || p.state == "rolling"))
            .count();
        world.collider_ids = world
            .ids
            .iter()
            .filter(|(_, entity)| world.ecs.get::<Collider>(**entity).is_some())
            .map(|(id, _)| id.clone())
            .collect();
        world.state_weight = 1024
            + serde_json::to_vec(&world.registry.schemas.values().collect::<Vec<_>>())
                .map_err(|e| e.to_string())?
                .len();
        for (id, e) in &world.ids {
            world.state_weight += id.len() + 128;
            for name in world.registry.schemas.keys() {
                if let Some(value) = world.registry.read(&world.ecs, *e, name) {
                    world.state_weight += world.registry.weight(name, &value);
                }
            }
        }
        world.refresh_projectile_contact_weight();
        if world.state_weight > STATE_BYTES {
            return Err("region canonical state capacity".into());
        }
        Ok(world)
    }
    fn support_id(&self, entity: Entity) -> Option<String> {
        self.ecs
            .get::<Support>(entity)
            .map(|support| support.entity.clone())
    }
    fn refresh_state_weight(&mut self) {
        let mut weight = 1024
            + serde_json::to_vec(&self.registry.schemas.values().collect::<Vec<_>>())
                .expect("physical schemas")
                .len();
        for (id, entity) in &self.ids {
            weight += id.len() + 128;
            for name in self.registry.schemas.keys() {
                if let Some(value) = self.registry.read(&self.ecs, *entity, name) {
                    weight += self.registry.weight(name, &value);
                }
            }
        }
        weight = weight.saturating_add(
            self.projectile_contacts
                .iter()
                .map(|(id, targets)| id.len() + targets.iter().map(String::len).sum::<usize>() + targets.len() * 16 + 32)
                .sum::<usize>(),
        );
        self.state_weight = weight;
    }
    fn refresh_projectile_contact_weight(&mut self) {
        self.state_weight = self.state_weight.saturating_add(
            self.projectile_contacts
                .iter()
                .map(|(id, targets)| id.len() + targets.iter().map(String::len).sum::<usize>() + targets.len() * 16 + 32)
                .sum::<usize>(),
        );
    }
    fn direct_weight(state: &DirectState) -> usize {
        serde_json::to_vec(state).map_or(usize::MAX, |bytes| bytes.len())
    }
    fn surface(&self, id: &str) -> Result<Surface> {
        let entity = self.entity(id)?;
        self.ecs
            .get::<Surface>(entity)
            .copied()
            .ok_or_else(|| format!("support {id} has no surface"))
    }
    fn support_chain(&self, id: &str) -> Result<()> {
        let mut current = id.to_string();
        let mut seen = BTreeSet::new();
        for depth in 0..=16 {
            let entity = self.entity(&current)?;
            if !seen.insert(current.clone()) {
                return Err("cyclic support reference".into());
            }
            let Some(support) = self.ecs.get::<Support>(entity) else {
                return Ok(());
            };
            if depth == 16 {
                return Err("support chain exceeds depth 16".into());
            }
            if seen.contains(&support.entity) {
                return Err("cyclic support reference".into());
            }
            self.surface(&support.entity)?;
            current = support.entity.clone();
        }
        Err("support chain exceeds depth 16".into())
    }
    fn world_pose_entity(&self, entity: Entity, depth: usize) -> Result<Position> {
        if depth > 16 {
            return Err("support chain exceeds depth 16".into());
        }
        let local = *self.ecs.get::<Position>(entity).ok_or("no position")?;
        let Some(support_id) = self.support_id(entity) else {
            return Ok(local);
        };
        let support = self.entity(&support_id)?;
        let parent = self.world_pose_entity(support, depth + 1)?;
        let radians = parent.facing * std::f64::consts::FRAC_PI_2;
        let (sin, cos) = radians.sin_cos();
        Ok(Position {
            x: parent.x + cos * local.x - sin * local.z,
            y: parent.y + local.y,
            z: parent.z + sin * local.x + cos * local.z,
            facing: parent.facing + local.facing,
        })
    }
    fn world_pose(&self, id: &str) -> Result<Position> {
        self.world_pose_entity(self.entity(id)?, 0)
    }
    fn frame_bounds(&self, frame: Option<&str>) -> Result<Option<navigation::Bounds>> {
        frame
            .map(|id| {
                let surface = self.surface(id)?;
                Ok(navigation::Bounds {
                    min_x: surface.min_x,
                    max_x: surface.max_x,
                    min_z: surface.min_z,
                    max_z: surface.max_z,
                })
            })
            .transpose()
    }
    fn route_for(
        &mut self,
        entity: Entity,
        start: Position,
        destination: &Point,
    ) -> Result<VecDeque<Point>> {
        let frame = self.support_id(entity);
        if destination.frame.as_deref() != frame.as_deref() {
            return Err("destination frame does not match actor support".into());
        }
        if let Some(frame_id) = frame.as_deref() {
            let surface = self.surface(frame_id)?;
            if (start.y - surface.height).abs() > 1e-9
                || (destination.y - surface.height).abs() > 1e-9
            {
                return Err("position is not on support surface".into());
            }
        }
        let blocked = self
            .blocked_by_frame
            .get(&frame)
            .cloned()
            .ok_or("missing obstacle frame index")?;
        if frame.is_none() {
            if let Some(capability) = self.ecs.get::<Traversal>(entity).copied() {
                let environment = self.environment.as_mut().ok_or("terrain traversal needs environment")?;
                let spacing = environment.world.cell_spacing_m();
                let to_cell = |point: &Point| -> Result<crate::generation::Cell> {
                    let values = [point.x / spacing[0], point.y / spacing[1] - 0.5, point.z / spacing[2]];
                    if !values.iter().all(|value| value.is_finite()) {
                        return Err("terrain route metric position is not finite".into());
                    }
                    Ok(crate::generation::Cell { x: values[0].round() as i64, y: values[1].round() as i32, z: values[2].round() as i64 })
                };
                let start_point = navigation::point(start);
                let start_cell = to_cell(&start_point)?;
                let destination_cell = to_cell(destination)?;
                let config = crate::terrain_traversal::TraversalConfig {
                    spacing,
                    clearance_cells: capability.clearance_cells,
                    max_step_cells: capability.max_step_cells,
                };
                let mut query = |cell| match environment.world.material(cell) {
                    Ok(material) => Ok(crate::terrain_traversal::TraversalMaterial {
                        solid: !environment.world.is_open_material(material),
                        outside: false,
                    }),
                    Err(error) if error == "cell outside world bounds" => {
                        Ok(crate::terrain_traversal::TraversalMaterial { solid: false, outside: true })
                    }
                    Err(error) => Err(error),
                };
                let obstacle = |cell: crate::generation::Cell| {
                    i32::try_from(cell.x).ok().zip(i32::try_from(cell.z).ok()).is_some_and(|(x, z)| {
                        let y = ((f64::from(cell.y) + 0.5) * spacing[1]).round() as i32;
                        blocked.contains(&(x, y, z))
                    })
                };
                let path = crate::terrain_route::search_with_blocked(start_cell, destination_cell, config, &mut query, &obstacle)?;
                let mut points = crate::terrain_route::waypoints(&path, config)?;
                if points.len() > 4096 { return Err("terrain route waypoint budget exceeded".into()); }
                if let Some(first) = points.first_mut() { *first = start_point; }
                let terrain_revision = environment.world.terrain_revision();
                self.terrain_routes.insert(entity, TerrainRouteState {
                    path,
                    revision: Some(terrain_revision),
                    waiting: false,
                    origin: start_point,
                    target: points.get(1).cloned(),
                });
                return Ok(points.into_iter().collect());
            }
        }
        let route = navigation::route(
            navigation::point(start),
            destination.clone(),
            &blocked,
            self.frame_bounds(frame.as_deref())?,
        )?;
        Ok(route)
    }
    fn restore_routes(&mut self, saved: Vec<RouteSnapshot>) -> Result<()> {
        if saved.len() > self.ids.len() {
            return Err("too many saved routes".into());
        }
        let mut restored = BTreeMap::new();
        self.terrain_routes.clear();
        for route in saved {
            if route.path.len() > 4096 {
                return Err("saved route exceeds bound".into());
            }
            let entity = self.entity(&route.entity)?;
            if restored.insert(entity, VecDeque::from(route.path.clone())).is_some() {
                return Err("duplicate saved route".into());
            }
            let destination = self
                .ecs
                .get::<Destination>(entity)
                .ok_or("saved route has no destination")?;
            let frame = self.support_id(entity);
            if destination.frame.as_deref() != frame.as_deref() {
                return Err("saved route frame mismatch".into());
            }
            let bounds = self.frame_bounds(frame.as_deref())?;
            let blocked = self
                .blocked_by_frame
                .get(&frame)
                .expect("rebuilt obstacle frame index");
            let start = *self.ecs.get::<Position>(entity).ok_or("saved route has no position")?;
            if route.terrain_path.is_none() {
                navigation::validate_saved_path(
                    navigation::point(start),
                    &route.path,
                    Point {
                        x: destination.x,
                        y: destination.y,
                        z: destination.z,
                        frame: destination.frame.clone(),
                    },
                    blocked,
                    bounds,
                )?;
            }
            if let Some(path) = route.terrain_path {
                if self.ecs.get::<Support>(entity).is_some()
                    || self.ecs.get::<Traversal>(entity).is_none()
                    || path.is_empty() || path.len() > 4097
                    || (!route.terrain_waiting && route.path.is_empty())
                    || route.terrain_origin.is_none() || route.terrain_target.is_none()
                {
                    return Err("invalid saved terrain route capability".into());
                }
                if !route.terrain_waiting && route.terrain_target.as_ref() != route.path.first() {
                    return Err("saved terrain route target witness mismatch".into());
                }
                self.terrain_routes.insert(entity, TerrainRouteState {
                    path,
                    revision: None,
                    waiting: route.terrain_waiting,
                    origin: route.terrain_origin.unwrap_or_else(|| navigation::point(start)),
                    target: route.terrain_target.or_else(|| route.path.first().cloned()),
                });
            } else if self.ecs.get::<Traversal>(entity).is_some() && self.ecs.get::<Support>(entity).is_none() && !route.terrain_waiting {
                return Err("terrain route is missing saved support witness".into());
            }
        }
        let expected = self
            .ids
            .values()
            .filter(|entity| self.ecs.get::<Destination>(**entity).is_some())
            .count();
        if expected != restored.len() {
            return Err("saved route set does not match destinations".into());
        }
        self.routes = restored;
        if self.environment.is_some() {
            let route_count = self.routes.len();
            let waiting_before = self.terrain_routes.values().filter(|state| state.waiting).count();
            self.invalidate_terrain_routes()?;
            if self.routes.len() != route_count || self.terrain_routes.values().filter(|state| state.waiting).count() != waiting_before {
                return Err("saved terrain route witness is stale".into());
            }
        }
        Ok(())
    }
    fn rebuild_physical_indexes(&mut self, build_routes: bool) -> Result<()> {
        self.blocked_by_frame.clear();
        self.routes.clear();
        self.terrain_routes.clear();
        for (id, entity) in &self.ids {
            let position = self.ecs.get::<Position>(*entity);
            if let Some(surface) = self.ecs.get::<Surface>(*entity) {
                if !surface.min_x.is_finite()
                    || !surface.max_x.is_finite()
                    || !surface.min_z.is_finite()
                    || !surface.max_z.is_finite()
                    || !surface.height.is_finite()
                    || surface.min_x > surface.max_x
                    || surface.min_z > surface.max_z
                {
                    return Err("invalid support surface".into());
                }
                if position.is_none() {
                    return Err("surface needs position".into());
                }
            }
            if let Some(support) = self.ecs.get::<Support>(*entity) {
                self.entity(&support.entity)?;
                self.surface(&support.entity)?;
                self.support_chain(id)?;
                let local = position.ok_or("supported entity needs position")?;
                let surface = self.surface(&support.entity)?;
                if (local.y - surface.height).abs() > 1e-9
                    || local.x < surface.min_x
                    || local.x > surface.max_x
                    || local.z < surface.min_z
                    || local.z > surface.max_z
                {
                    return Err("position is outside support surface".into());
                }
            }
            if let Some(p) = position {
                if [p.x, p.y, p.z, p.facing]
                    .iter()
                    .any(|v| !v.is_finite() || v.abs() > 1_000_000.0)
                {
                    return Err("invalid position".into());
                }
            }
            if (self.ecs.get::<Body>(*entity).is_some()
                || self.ecs.get::<Container>(*entity).is_some())
                && position.is_none()
            {
                return Err("body/container needs position".into());
            }
            if self
                .ecs
                .get::<Obstacle>(*entity)
                .is_some_and(|o| o.occupied)
            {
                if self.ecs.get::<Body>(*entity).is_some() {
                    return Err("static obstacle cannot also be a movable body".into());
                }
                let p = position.ok_or("obstacle needs position")?;
                let frame = self.support_id(*entity);
                self.blocked_by_frame
                    .entry(frame)
                    .or_default()
                    .insert(navigation::cell(navigation::point(*p)));
            }
            if let Some(lot) = self.ecs.get::<Lot>(*entity) {
                let owner = self.entity(&lot.container)?;
                if self.ecs.get::<Container>(owner).is_none() {
                    return Err("lot owner is not a container".into());
                }
                self.contents
                    .entry(lot.container.clone())
                    .or_default()
                    .insert(*entity);
            }
            if let Some(water) = self.ecs.get::<LotWater>(*entity) {
                if self.ecs.get::<Lot>(*entity).is_none()
                    || !water.water_kg.is_finite()
                    || water.water_kg < 0.0
                    || water.water_kg > MAX_CARRIED_WATER_KG
                    || (self.ecs.get::<Lot>(*entity).is_some_and(|lot| lot.quantity == 0) && water.water_kg > 0.0)
                {
                    return Err("carried water requires a finite nonnegative material lot".into());
                }
            }
            if self.ecs.get::<Container>(*entity).is_some() {
                self.contents.entry(id.clone()).or_default();
            }
        }
        self.blocked_by_frame.entry(None).or_default();
        for (id, entity) in &self.ids {
            if self.ecs.get::<Surface>(*entity).is_some() {
                self.blocked_by_frame.entry(Some(id.clone())).or_default();
            }
        }
        for (id, entity) in &self.ids {
            if let Some(container) = self.ecs.get::<Container>(*entity) {
                if self.quantity(id) > u64::from(container.capacity) {
                    return Err("container over capacity".into());
                }
            }
            if let Some(target) = self.ecs.get::<Destination>(*entity) {
                if !target.facing.is_finite() || target.facing.abs() > 1_000_000.0 {
                    return Err("invalid destination facing".into());
                }
                let p = *self
                    .ecs
                    .get::<Position>(*entity)
                    .ok_or("destination needs body position")?;
                if self.ecs.get::<Body>(*entity).is_none() {
                    return Err("destination needs body".into());
                }
                if build_routes {
                    self.routes.insert(
                        *entity,
                        self.route_for(
                            *entity,
                            p,
                            &Point {
                                x: target.x,
                                y: target.y,
                                z: target.z,
                                frame: target.frame.clone(),
                            },
                        )?,
                    );
                }
            }
        }
        Ok(())
    }
    pub fn query_json(&mut self, input: &str) -> Result<String> {
        self.ensure_ready()?;
        let mut names: Vec<String> = serde_json::from_str(input).map_err(|e| e.to_string())?;
        if names.is_empty() || names.len() > 32 {
            return Err("invalid query size".into());
        }
        names.sort();
        names.dedup();
        let ids = names
            .iter()
            .map(|n| {
                self.registry
                    .ids
                    .get(n)
                    .copied()
                    .ok_or_else(|| format!("unknown query component {n}"))
            })
            .collect::<Result<Vec<_>>>()?;
        if !self.queries.contains_key(&names) {
            if self.queries.len() >= 256 {
                self.queries.clear();
            }
            let mut builder = QueryBuilder::<Entity>::new(&mut self.ecs);
            for id in ids {
                builder.with_id(id);
            }
            self.queries.insert(names.clone(), builder.build());
        }
        let mut entities = self
            .queries
            .get_mut(&names)
            .expect("query exists")
            .iter(&self.ecs)
            .collect::<Vec<_>>();
        entities.sort_by(|a, b| {
            self.ecs
                .get::<ExternalId>(*a)
                .unwrap()
                .0
                .cmp(&self.ecs.get::<ExternalId>(*b).unwrap().0)
        });
        let rows = entities
            .into_iter()
            .map(|e| EntityRecord {
                id: self.ecs.get::<ExternalId>(e).unwrap().0.clone(),
                components: names
                    .iter()
                    .map(|n| {
                        (
                            n.clone(),
                            self.registry
                                .read(&self.ecs, e, n)
                                .expect("query membership"),
                        )
                    })
                    .collect(),
            })
            .collect::<Vec<_>>();
        serde_json::to_string(&rows).map_err(|e| e.to_string())
    }
    pub fn entity_membership_json(&self, input: &str) -> Result<String> {
        self.ensure_ready()?;
        if input.len() > 16 * 1024 {
            return Err("entity membership query too large".into());
        }
        let ids: Vec<String> = serde_json::from_str(input).map_err(|e| e.to_string())?;
        if ids.is_empty() || ids.len() > 128 {
            return Err("invalid entity membership query size".into());
        }
        if ids.iter().any(|id| !valid_id(id)) {
            return Err("invalid entity membership ID".into());
        }
        let membership = ids.iter().map(|id| self.ids.contains_key(id)).collect::<Vec<_>>();
        serde_json::to_string(&membership).map_err(|e| e.to_string())
    }
    pub fn load_environment(&mut self, definition: &str) -> Result<()> {
        self.ensure_ready()?;
        if self.revision != 0 || self.environment.is_some() {
            return Err("environment initialization requires a new world".into());
        }
        let built = crate::environment_definition::build_from_json(definition)?;
        self.environment = Some(KernelEnvironment { definition: definition.to_owned(), world: built.world, excavation_rules: built.excavation_rules });
        Ok(())
    }
    /// Trusted host query. Player visibility must be applied before publishing
    /// these facts; this endpoint is not itself an exploration permission.
    pub fn terrain_surfaces_json(&mut self, input: &str) -> Result<String> {
        self.ensure_ready()?;
        if input.len() > 8 * 1024 { return Err("surface query exceeds input budget".into()); }
        let coordinates: Vec<[i32; 2]> = serde_json::from_str(input).map_err(|error| error.to_string())?;
        if coordinates.is_empty() || coordinates.len() > 64 { return Err("surface query exceeds column budget".into()); }
        let columns: Vec<_> = coordinates.into_iter().map(|[x, z]| (i64::from(x), i64::from(z))).collect();
        let environment = self.environment.as_mut().ok_or("world has no environment")?;
        let surfaces = environment.world.surface_cells(&columns)?;
        let facts: Vec<_> = surfaces.into_iter().map(|surface| surface.map(|surface| json!({
            "cell": [surface.cell.x, surface.cell.y, surface.cell.z], "material": surface.material,
        }))).collect();
        serde_json::to_string(&facts).map_err(|error| error.to_string())
    }
    pub fn terrain_materials_json(&mut self, input: &str) -> Result<String> {
        self.ensure_ready()?;
        if input.len() > 32 * 1024 { return Err("terrain query exceeds input budget".into()); }
        let coordinates: Vec<[i32; 3]> = serde_json::from_str(input).map_err(|error| error.to_string())?;
        if coordinates.len() > 256 { return Err("terrain query exceeds cell budget".into()); }
        let cells: Vec<_> = coordinates.into_iter().map(|[x, y, z]| crate::generation::Cell {
            x: i64::from(x), y, z: i64::from(z),
        }).collect();
        let environment = self.environment.as_mut().ok_or("world has no environment")?;
        serde_json::to_string(&environment.world.materials(&cells)?).map_err(|error| error.to_string())
    }
    pub fn environment_facts_json(&self) -> Result<String> {
        self.ensure_ready()?;
        let environment = self.environment.as_ref().ok_or("world has no environment")?;
        let mut facts = serde_json::to_value(environment.world.facts()?).map_err(|error| error.to_string())?;
        facts["terrainRevision"] = json!(environment.world.terrain_revision());
        serde_json::to_string(&facts).map_err(|error| error.to_string())
    }
    pub fn save_records(&self) -> Result<KernelRecords> {
        self.ensure_ready()?;
        let environment = self.environment.as_ref().map(|environment| {
            Ok::<_, String>((environment.definition.clone(), environment.world.save_records()?))
        }).transpose()?;
        Ok(KernelRecords { entities: self.snapshot_entities_json()?, environment })
    }
    pub fn restore_records(&mut self, records: &KernelRecords) -> Result<()> {
        let mut candidate = Self::new();
        candidate.restore_json(&records.entities)?;
        if let Some((definition, records)) = &records.environment {
            let prepared = crate::environment_definition::prepare_definition(definition)?;
            let world = crate::terrain_water::TerrainWater::restore_records(
                prepared.geometry, prepared.terrain, records)?;
            candidate.environment = Some(KernelEnvironment { definition: definition.clone(), world, excavation_rules: prepared.excavation_rules });
        }
        let route_count = candidate.routes.len();
        candidate.invalidate_terrain_routes()?;
        if candidate.routes.len() != route_count {
            return Err("saved terrain route witness is stale".into());
        }
        candidate.validate_excavation_work()?;
        *self = candidate;
        Ok(())
    }
    pub fn snapshot_json(&self) -> Result<String> {
        self.ensure_ready()?;
        if self.environment.is_some() { return Err("environment worlds require save_records".into()); }
        self.snapshot_entities_json()
    }
    fn snapshot_entities_json(&self) -> Result<String> {
        let initial = self
            .ids
            .iter()
            .map(|(id, e)| EntityRecord {
                id: id.clone(),
                components: self
                    .registry
                    .schemas
                    .keys()
                    .filter_map(|name| {
                        self.registry
                            .read(&self.ecs, *e, name)
                            .map(|r| (name.clone(), r))
                    })
                    .collect(),
            })
            .collect();
        let mut routes: Vec<RouteSnapshot> = self
            .routes
            .iter()
            .map(|(entity, path)| RouteSnapshot {
                entity: self.ecs.get::<ExternalId>(*entity).unwrap().0.clone(),
                path: path.iter().cloned().collect(),
                terrain_path: self.terrain_routes.get(entity).map(|state| state.path.clone()),
                terrain_waiting: self.terrain_routes.get(entity).is_some_and(|state| state.waiting),
                terrain_origin: self.terrain_routes.get(entity).map(|state| state.origin.clone()),
                terrain_target: self.terrain_routes.get(entity).and_then(|state| state.target.clone()),
            })
            .collect();
        routes.sort_by(|a: &RouteSnapshot, b: &RouteSnapshot| a.entity.cmp(&b.entity));
        let route_bytes = serde_json::to_vec(&routes).map_err(|e| e.to_string())?.len();
        if self.state_weight.saturating_add(route_bytes) > STATE_BYTES {
            return Err("route state exceeds canonical capacity".into());
        }
        let mut direct: Vec<DirectSnapshot> = self.direct.values().cloned().collect();
        direct.sort_by(|a, b| a.entity.cmp(&b.entity));
        let direct_bytes = serde_json::to_vec(&direct).map_err(|e| e.to_string())?.len();
        if self.state_weight.saturating_add(route_bytes).saturating_add(direct_bytes) > STATE_BYTES {
            return Err("direct state exceeds canonical capacity".into());
        }
        let state = Snapshot {
            format: "hive-kernel".into(),
            version: 6,
            revision: self.revision,
            time: self.time,
            next_lot: self.next_lot,
            next_projectile: self.next_projectile,
            next_impact: self.next_impact,
            scene: Scene {
                format: "hive-game".into(),
                version: 1,
                game: self.game.clone(),
                components: self.registry.schemas.values().cloned().collect(),
                initial,
            },
            routes,
            direct,
            projectile_contacts: self.projectile_contacts.iter().map(|(projectile_id, targets)| ProjectileContactsSnapshot {
                projectile_id: projectile_id.clone(),
                targets: targets.iter().cloned().collect(),
            }).collect(),
        };
        serde_json::to_string(&state).map_err(|e| e.to_string())
    }
    pub fn restore_json(&mut self, input: &str) -> Result<()> {
        if self.environment.is_some() { return Err("environment worlds require restore_records".into()); }
        if input.len() > 8 * 1024 * 1024 {
            return Err("snapshot too large".into());
        }
        let state: Snapshot = serde_json::from_str(input).map_err(|e| e.to_string())?;
        if state.format != "hive-kernel"
            || state.version != 6
            || !state.time.is_finite()
            || state.time < 0.0
            || state.next_lot == 0
            || state.next_projectile == 0
            || state.next_impact == 0
            || state.next_projectile > 9_007_199_254_740_991
            || state.next_impact > 9_007_199_254_740_991
            || state.revision > 9_007_199_254_740_991
        {
            return Err("invalid current snapshot".into());
        }
        let mut candidate = Self::from_scene_mode(state.scene, false)?;
        let route_bytes = serde_json::to_vec(&state.routes)
            .map_err(|e| e.to_string())?
            .len();
        if candidate.state_weight.saturating_add(route_bytes) > STATE_BYTES {
            return Err("route state exceeds canonical capacity".into());
        }
        candidate.restore_routes(state.routes)?;
        let mut direct = BTreeMap::new();
        if state.direct.len() > 16384 { return Err("too many direct streams".into()); }
        for saved in state.direct {
            let entity = candidate.entity(&saved.entity)?;
            if candidate.ecs.get::<Body>(entity).is_none() || candidate.ecs.get::<Position>(entity).is_none()
                || candidate.ecs.get::<Support>(entity).is_some() || !valid_id(&saved.stream)
                || saved.stream.len() > 64 || saved.queue.len() > navigation::MAX_DIRECT_INPUTS
                || saved.last_processed > saved.last_queued || !saved.remainder.is_finite()
                || saved.last_queued > 9_007_199_254_740_991
                || saved.queue.len() as u64 > saved.last_queued.saturating_sub(saved.last_processed)
                || saved.last_queued != saved.last_processed.saturating_add(saved.queue.len() as u64)
                || saved.remainder < 0.0 || saved.remainder >= navigation::DIRECT_STEP_SECONDS
                || (saved.queue.is_empty() && saved.remainder != 0.0)
                || (saved.queue.is_empty() && saved.last_processed != saved.last_queued)
                || saved.queue.iter().enumerate().any(|(i, input)| input.sequence != saved.last_processed.checked_add(i as u64 + 1).unwrap_or(0)
                    || !input.x.is_finite() || !input.z.is_finite() || input.x.abs() > 1.0 || input.z.abs() > 1.0)
            { return Err("invalid direct stream snapshot".into()); }
            if candidate.ecs.get::<Destination>(entity).is_some() || candidate.routes.contains_key(&entity) || direct.insert(entity, saved).is_some() { return Err("invalid direct stream ownership".into()); }
        }
        if candidate.state_weight.saturating_add(direct.values().map(Self::direct_weight).sum::<usize>()) > STATE_BYTES { return Err("direct snapshot capacity".into()); }
        candidate.direct = direct;
        let mut contacts = BTreeMap::new();
        if state.projectile_contacts.len() > 16384 {
            return Err("too many projectile contact sets".into());
        }
        for saved in state.projectile_contacts {
            let projectile = candidate.entity(&saved.projectile_id)?;
            if candidate.ecs.get::<Projectile>(projectile).is_none()
                || saved.targets.len() > 128
                || saved.targets.iter().any(|target| candidate.entity(target).is_err())
                || saved.targets.windows(2).any(|pair| pair[0] >= pair[1])
                || contacts.insert(saved.projectile_id, saved.targets.into_iter().collect()).is_some()
            {
                return Err("invalid projectile contact snapshot".into());
            }
        }
        candidate.projectile_contacts = contacts;
        candidate.refresh_state_weight();
        if candidate.state_weight > STATE_BYTES {
            return Err("projectile contact state exceeds canonical capacity".into());
        }
        candidate.revision = state.revision;
        candidate.time = state.time;
        candidate.next_lot = state.next_lot;
        candidate.next_projectile = state.next_projectile;
        candidate.next_impact = state.next_impact;
        for id in candidate.ids.keys() {
            if let Some(sequence) = id.strip_prefix("shot.").and_then(|value| value.parse::<u64>().ok()) {
                if sequence >= candidate.next_projectile {
                    return Err("snapshot projectile counter collides with entity".into());
                }
            }
        }
        for entity in candidate.ids.values() {
            if let Some(projectile) = candidate.ecs.get::<Projectile>(*entity) {
                let launcher = candidate.entity(&projectile.launcher)?;
                if candidate.ecs.get::<Launcher>(launcher).is_none() {
                    return Err("snapshot projectile launcher lacks launcher capability".into());
                }
            }
        }
        candidate.projectile_count = candidate.ids.values().filter(|entity| candidate.ecs.get::<Projectile>(**entity).is_some_and(|p| p.state == "flying" || p.state == "rolling")).count();
        *self = candidate;
        Ok(())
    }
    pub fn render_json(&self) -> Result<String> {
        self.ensure_ready()?;
        let mut facts = Vec::new();
        for (id, e) in &self.ids {
            let Some(local) = self.ecs.get::<Position>(*e) else {
                continue;
            };
            let p = self.world_pose_entity(*e, 0)?;
            let visual=self.ecs.get::<Visual>(*e);
            let launcher=self.ecs.get::<Launcher>(*e);
            let collider=self.ecs.get::<Collider>(*e);
            let launcher_velocity=if launcher.is_some() {self.world_linear_velocity(*e, 0.02)?} else {[0.0;3]};
            let launcher_radians=p.facing * std::f64::consts::FRAC_PI_2;
            let (launcher_sin, launcher_cos)=launcher_radians.sin_cos();
            facts.push(json!({
                "id":id,
                "pose":{"position":{"x":p.x,"y":p.y,"z":p.z},"facing":p.facing},
                "local":{"position":{"x":local.x,"y":local.y,"z":local.z},"facing":local.facing},
                "support":self.support_id(*e),
                "surface":self.ecs.get::<Surface>(*e),
                "visual":visual.map(|v|&v.sprite),
                "label":visual.map(|v|&v.label),
                "aim":launcher.map(|launcher| json!({
                    "origin":{"x":p.x,"y":p.y,"z":p.z},
                    "muzzle":{"x":launcher.muzzle_x,"y":launcher.muzzle_y,"z":launcher.muzzle_z},
                    "inheritedVelocity":{"x":launcher_velocity[0],"y":launcher_velocity[1],"z":launcher_velocity[2]},
                    "radius":launcher.projectile_radius,
                    "gravity":launcher.gravity,
                    "penetration":launcher.penetration,
                    "maxRange":launcher.max_range,
                    "maxLifetime":launcher.max_lifetime,
                    "speed":launcher.max_speed,
                })),
                "collision":collider.map(|collider| json!({
                    "id":id,
                    "origin":{"x":p.x,"y":p.y,"z":p.z},
                    "shape":collider.shape,
                    "radius":collider.radius,
                    "halfX":collider.half_x,
                    "halfY":collider.half_y,
                    "halfZ":collider.half_z,
                    "yaw":launcher_radians+collider.yaw,
                    "offsetX":launcher_cos*collider.offset_x-launcher_sin*collider.offset_z,
                    "offsetY":collider.offset_y,
                    "offsetZ":launcher_sin*collider.offset_x+launcher_cos*collider.offset_z,
                    "velocity":{"x":0.0,"y":0.0,"z":0.0},
                    "material":self.ecs.get::<ImpactMaterial>(*e).map(|m|json!(m)).unwrap_or(json!({"response":"stop","resistance":0.0,"restitution":0.0,"friction":1.0,"embedSpeed":0.0})),
                })),
                "projectile":self.ecs.get::<Projectile>(*e).map(|projectile| json!({
                    "velocity":{"x":projectile.velocity_x,"y":projectile.velocity_y,"z":projectile.velocity_z},
                    "gravity":projectile.gravity,
                    "state":&projectile.state,
                    "embedDepth":projectile.embed_depth,
                    "rollFriction":projectile.roll_friction,
                    "rollNormal":{"x":projectile.roll_normal_x,"y":projectile.roll_normal_y,"z":projectile.roll_normal_z},
                    "penetration":projectile.penetration,
                })),
                "direct": self.direct.get(e).map(|state| json!({
                    "stream": state.stream,
                    "lastQueued": state.last_queued,
                    "lastProcessed": state.last_processed,
                    "speed": self.ecs.get::<Body>(*e).map(|body| body.speed),
                    "blocked": self.blocked_by_frame.get(&None).into_iter().flatten().map(|(x,y,z)| json!([x,y,z])).collect::<Vec<_>>(),
                    "bounds": self.frame_bounds(None).ok().flatten().map(|b| json!({"min_x":b.min_x,"max_x":b.max_x,"min_z":b.min_z,"max_z":b.max_z})),
                }))
            }));
        }
        serde_json::to_string(&facts).map_err(|e| e.to_string())
    }
    pub fn world_pose_json(&self, input: &str) -> Result<String> {
        self.ensure_ready()?;
        if input.len() > 16 * 1024 {
            return Err("world pose query too large".into());
        }
        let ids: Vec<String> = serde_json::from_str(input).map_err(|e| e.to_string())?;
        if ids.is_empty() || ids.len() > 128 {
            return Err("invalid world pose query size".into());
        }
        let mut rows = Vec::with_capacity(ids.len());
        for id in ids {
            let entity = self.entity(&id)?;
            let local = *self.ecs.get::<Position>(entity).ok_or("no position")?;
            let world = self.world_pose(&id)?;
            rows.push(json!({
                "id": id,
                "local": local,
                "world": world,
                "support": self.support_id(entity),
                "surface": self.ecs.get::<Surface>(entity),
            }));
        }
        serde_json::to_string(&rows).map_err(|e| e.to_string())
    }
    pub fn advance_json(&mut self, input: &str) -> Result<String> {
        self.ensure_ready()?;
        if input.len() > 1024 * 1024 {
            return Err("batch too large".into());
        }
        let batch: Batch = serde_json::from_str(input).map_err(|error| error.to_string())?;
        let needs_staging = self.projectile_count > 0 || !self.direct.is_empty()
            || batch.actions.iter().any(|action| {
                matches!(action, Action::Launch { .. } | Action::Displace { .. }
                    | Action::BeginDirect { .. } | Action::DirectInput { .. })
            });
        if needs_staging {
            let before = self.save_records()?;
            let result = self.advance_batch(batch);
            if result.is_err() {
                self.restore_records(&before)?;
            }
            return result;
        }
        let result = self.advance_batch(batch);
        if result.is_err() && self.environment.is_some() { self.discard_required = true; }
        result
    }

    fn advance_batch(&mut self, batch: Batch) -> Result<String> {
        if !batch.delta.is_finite()
            || !(0.0..=1.0).contains(&batch.delta)
            || batch.writes.len() > 4096
            || batch.actions.len() > 256
            || self.revision >= 9_007_199_254_740_991
            || !(self.time + batch.delta).is_finite()
        {
            return Err("invalid advancement budget".into());
        }
        // Every potentially failing authored write is validated before mutation.
        for write in &batch.writes {
            self.entity(&write.entity)?;
            if Registry::is_physical(&write.component) {
                return Err("physical component is not game-writable".into());
            }
            self.registry
                .validate(&write.component, &write.value, &self.known)?;
        }
        let mut weights = BTreeMap::new();
        let mut projected = self.state_weight;
        for write in &batch.writes {
            let key = (write.entity.clone(), write.component.clone());
            let old = *weights.entry(key.clone()).or_insert_with(|| {
                self.registry
                    .read(&self.ecs, self.ids[&write.entity], &write.component)
                    .map_or(0, |v| self.registry.weight(&write.component, &v))
            });
            let new = self.registry.weight(&write.component, &write.value);
            projected = projected - old + new;
            weights.insert(key, new);
        }
        if projected > STATE_BYTES {
            return Err("region canonical state capacity".into());
        }
        for write in batch.writes {
            self.registry
                .insert(
                    &mut self.ecs,
                    self.ids[&write.entity],
                    &write.component,
                    &write.value,
                )
                .expect("validated authored write");
        }
        self.state_weight = projected;
        self.revision += 1;
        let results = batch
            .actions
            .into_iter()
            .map(|action| {
                let result = self.apply_action(action, batch.delta);
                ActionResult {
                    accepted: result.is_ok(),
                    projectile_id: result.as_ref().ok().and_then(|id| id.as_ref().map(|value| value.0.clone())),
                    launch_point: result.as_ref().ok().and_then(|id| id.as_ref().map(|value| value.1)),
                    reason: result.err(),
                    revision: self.revision,
                }
            })
            .collect::<Vec<_>>();
        let impacts = self.advance_projectiles(batch.delta)?;
        self.advance_direct(batch.delta)?;
        if self.state_weight.saturating_add(self.direct.values().map(Self::direct_weight).sum::<usize>()) > STATE_BYTES { return Err("region canonical state capacity".into()); }
        // Work sees the pre-movement occupation. Arriving this tick does not
        // retroactively earn a full tick of effort after spending it travelling.
        self.advance_excavation(batch.delta)?;
        self.advance_movement(batch.delta)?;
        let environment_work = self.environment.as_mut().map(|environment| environment.world.advance(batch.delta)).transpose()?;
        self.time += batch.delta;
        let mut output = json!({"revision":self.revision,"results":results,"impacts":impacts});
        if let Some(work) = environment_work { output["environmentWork"] = serde_json::to_value(work).map_err(|e| e.to_string())?; }
        serde_json::to_string(&output).map_err(|e| e.to_string())
    }
    fn entity(&self, id: &str) -> Result<Entity> {
        self.ids
            .get(id)
            .copied()
            .ok_or_else(|| format!("unknown entity {id}"))
    }
    fn prepare_material_output(&self, spec: MaterialOutputSpec) -> Result<PreparedMaterialOutput> {
        self.ensure_ready()?;
        if self.ids.len() >= 16384 { return Err("region entity capacity".into()); }
        let container = self.entity(&spec.container)?;
        let capacity = self.ecs.get::<Container>(container).ok_or("not a container")?.capacity;
        let quantity = self.quantity(&spec.container);
        let lot = Lot { kind: spec.kind.clone(), quantity: spec.quantity, container: spec.container.clone() };
        let water = spec.water_kg.map(|mass| LotWater { water_kg: mass });
        let added_weight = 128
            + self.registry.weight("hive.lot", &record(&lot))
            + water.as_ref().map(|value| self.registry.weight("hive.lot-water", &record(value))).unwrap_or(0);
        let prepared = material_output::prepare(
            spec,
            self.revision,
            self.next_lot,
            |id| self.known.contains(id),
            capacity,
            quantity,
            self.state_weight,
            added_weight,
            STATE_BYTES,
        )?;
        Ok(prepared)
    }
    // Private tokens are prepared and consumed within one synchronous Kernel
    // completion. No public caller can retain them across another mutation.
    fn publish_material_output(&mut self, prepared: PreparedMaterialOutput) -> String {
        let entity = if let Some(water) = prepared.water {
            self.ecs.spawn((ExternalId(prepared.lot_id.clone()), prepared.lot, water)).id()
        } else {
            self.ecs.spawn((ExternalId(prepared.lot_id.clone()), prepared.lot)).id()
        };
        self.next_lot = prepared.next_lot;
        self.state_weight = prepared.state_weight;
        self.ids.insert(prepared.lot_id.clone(), entity);
        self.known.insert(prepared.lot_id.clone());
        self.contents.entry(prepared.container).or_default().insert(entity);
        prepared.lot_id
    }
    #[cfg(test)]
    fn complete_material_output(&mut self, spec: MaterialOutputSpec) -> Result<String> {
        let prepared = self.prepare_material_output(spec)?;
        Ok(self.publish_material_output(prepared))
    }
    // Work/reach and the material definition are admitted by the native work
    // caller. Water credit is always derived from the opaque geometry token.
    fn complete_excavation(&mut self, excavation: crate::terrain_water::PreparedExcavation,
        container: String) -> Result<String> {
        let rule = self.environment.as_ref().ok_or("world has no environment")?
            .excavation_rules.get(&excavation.removed()).ok_or("material has no excavation yield")?;
        let output = self.prepare_material_output(MaterialOutputSpec {
            container, kind: rule.output_kind.clone(), quantity: rule.units_per_cell, water_kg: (excavation.water_kg() > 0.0).then_some(excavation.water_kg()),
        })?;
        let environment = self.environment.as_mut().ok_or("world has no environment")?;
        environment.world.apply_excavation(excavation)?;
        // All material admission precedes the terrain commit. There is no
        // fallible material operation between this point and publication.
        Ok(self.publish_material_output(output))
    }
    fn quantity(&self, id: &str) -> u64 {
        self.contents
            .get(id)
            .into_iter()
            .flatten()
            .map(|e| u64::from(self.ecs.get::<Lot>(*e).expect("indexed lot").quantity))
            .sum()
    }
    fn contact(&self, a: Entity, b: Entity) -> Result<()> {
        let a = self.world_pose_entity(a, 0)?;
        let b = self.world_pose_entity(b, 0)?;
        if navigation::distance(navigation::point(a), navigation::point(b)) > 1.5 {
            return Err("out of reach".into());
        }
        Ok(())
    }
    fn apply_action(&mut self, action: Action, delta: f64) -> Result<Option<(String, Vector3)>> {
        match action {
            Action::Excavate { entity, x, y, z, expected, replacement } => {
                self.request_excavation(&entity, ExcavationWork { x, y, z, expected, replacement, seconds: 0.0 })?;
                Ok(None)
            }
            Action::CancelWork { entity } => {
                let actor = self.entity(&entity)?;
                self.ecs.entity_mut(actor).remove::<ExcavationWork>();
                self.refresh_state_weight();
                Ok(None)
            }
            Action::Move {
                entity,
                destination,
                facing,
            } => {
                let e = self.entity(&entity)?;
                let p = *self.ecs.get::<Position>(e).ok_or("no position")?;
                self.ecs.get::<Body>(e).ok_or("not movable")?;
                let facing = facing.unwrap_or(p.facing);
                if !facing.is_finite() || facing.abs() > 1_000_000.0 {
                    return Err("invalid facing".into());
                }
                if let Some(existing) = self.ecs.get::<Destination>(e).cloned()
                    && existing.x == destination.x
                    && existing.y == destination.y
                    && existing.z == destination.z
                    && existing.frame == destination.frame
                    && self.routes.contains_key(&e)
                    && !self.terrain_routes.get(&e).is_some_and(|state| state.waiting)
                {
                    self.ecs.entity_mut(e).insert(Destination {
                        x: existing.x,
                        y: existing.y,
                        z: existing.z,
                        facing,
                        frame: existing.frame,
                    });
                    return Ok(None);
                }
                let target = Destination {
                    x: destination.x,
                    y: destination.y,
                    z: destination.z,
                    facing,
                    frame: destination.frame,
                };
                let extra = if self.ecs.get::<Destination>(e).is_some() {
                    0
                } else {
                    self.registry.weight("hive.destination", &record(&target))
                };
                if self.state_weight + extra > STATE_BYTES {
                    return Err("region canonical state capacity".into());
                }
                let path = self.route_for(e, p, &destination)?;
                self.direct.remove(&e);
                self.ecs.entity_mut(e).insert(target);
                self.state_weight += extra;
                self.routes.insert(e, path);
                Ok(None)
            }
            Action::BeginDirect { entity, stream } => {
                if !valid_id(&stream) || stream.len() > 64 { return Err("invalid direct stream".into()); }
                let e = self.entity(&entity)?;
                if self.ecs.get::<Body>(e).is_none() || self.ecs.get::<Position>(e).is_none() {
                    return Err("direct control requires body and position".into());
                }
                if self.ecs.get::<Support>(e).is_some() { return Err("direct control does not support boarded actors".into()); }
                if self.ecs.get::<ExcavationWork>(e).is_some() { return Err("cancel work before taking direct control".into()); }
                if let Some(existing) = self.direct.get(&e) {
                    if existing.stream == stream { return Ok(None); }
                }
                let replacement = DirectState { entity: entity.clone(), stream, last_queued: 0, last_processed: 0, queue: Vec::new(), remainder: 0.0 };
                let old_weight = self.direct.get(&e).map(Self::direct_weight).unwrap_or(0);
                let new_weight = Self::direct_weight(&replacement);
                if self.state_weight.saturating_add(self.direct.values().map(Self::direct_weight).sum::<usize>()).saturating_sub(old_weight).saturating_add(new_weight) > STATE_BYTES { return Err("region canonical state capacity".into()); }
                self.clear_destination(e);
                self.direct.insert(e, replacement);
                Ok(None)
            }
            Action::DirectInput { entity, stream, inputs } => {
                if inputs.is_empty() || inputs.len() > navigation::MAX_DIRECT_INPUTS { return Err("invalid direct input batch".into()); }
                let e = self.entity(&entity)?;
                let direct_bytes = self.direct.values().map(Self::direct_weight).sum::<usize>();
                let state = self.direct.get_mut(&e).ok_or("direct stream is not active")?;
                if state.stream != stream || state.queue.len() + inputs.len() > navigation::MAX_DIRECT_INPUTS { return Err("direct input stream is unavailable".into()); }
                for (index, input) in inputs.iter().enumerate() {
                    let expected = state.last_queued.checked_add(index as u64 + 1).ok_or("direct input sequence exhausted")?;
                    if input.sequence != expected || !input.x.is_finite() || !input.z.is_finite() || input.x.abs() > 1.0 || input.z.abs() > 1.0 {
                        return Err("direct input sequence or axis is invalid".into());
                    }
                    if input.sequence > 9_007_199_254_740_991 { return Err("direct input sequence exhausted".into()); }
                }
                let old_weight = Self::direct_weight(state);
                let mut proposed = state.clone();
                proposed.last_queued = inputs.last().unwrap().sequence;
                proposed.queue.extend(inputs.iter().cloned());
                let new_weight = Self::direct_weight(&proposed);
                if self.state_weight.saturating_add(direct_bytes).saturating_sub(old_weight).saturating_add(new_weight) > STATE_BYTES { return Err("region canonical state capacity".into()); }
                state.last_queued = inputs.last().unwrap().sequence;
                state.queue.extend(inputs);
                Ok(None)
            }
            Action::Transfer {
                lot,
                from,
                to,
                quantity,
            } => self
                .transfer(&lot, &from, &to, quantity)
                .map(|()| None),
            Action::Consume {
                entity,
                lot,
                quantity,
            } => {
                self.entity(&entity)?;
                let e = self.entity(&lot)?;
                let mut stock = self
                    .ecs
                    .get::<Lot>(e)
                    .cloned()
                    .ok_or("not a material lot")?;
                if quantity == 0 || stock.quantity < quantity || stock.container != entity {
                    return Err("consumption requires held stock".into());
                }
                if self.ecs.get::<LotWater>(e).is_some_and(|water| water.water_kg > 0.0) {
                    return Err("wet lot consumption is not admitted".into());
                }
                stock.quantity -= quantity;
                self.ecs.entity_mut(e).insert(stock);
                Ok(None)
            }
            Action::Launch {
                launcher,
                ammunition,
                velocity,
            } => self.launch(&launcher, &ammunition, velocity, delta),
            Action::Displace { entity, delta } => {
                self.displace(&entity, delta)?;
                Ok(None)
            }
        }
    }
    fn clear_destination(&mut self, entity: Entity) {
        self.direct.remove(&entity);
        if let Some(destination) = self.ecs.get::<Destination>(entity).cloned() {
            self.state_weight = self.state_weight.saturating_sub(self.registry.weight("hive.destination", &record(&destination)));
            self.ecs.entity_mut(entity).remove::<Destination>();
            self.routes.entry(entity).or_default().clear();
            self.terrain_routes.remove(&entity);
        }
    }
    fn projectile_ids(&self) -> Vec<String> {
        self.ids
            .iter()
            .filter(|(_, entity)| self.ecs.get::<Projectile>(**entity).is_some())
            .map(|(id, _)| id.clone())
            .collect()
    }
    fn launch(
        &mut self,
        launcher_id: &str,
        ammunition: &str,
        velocity: Vector3,
        delta: f64,
    ) -> Result<Option<(String, Vector3)>> {
        let launcher_entity = self.entity(launcher_id)?;
        let launcher = self
            .ecs
            .get::<Launcher>(launcher_entity)
            .cloned()
            .ok_or("entity is not a launcher")?;
        let launcher_position = self.world_pose(launcher_id)?;
        let lot_entity = self.entity(ammunition)?;
        let mut lot = self
            .ecs
            .get::<Lot>(lot_entity)
            .cloned()
            .ok_or("ammunition is not a lot")?;
        if lot.container != launcher_id || lot.kind != launcher.ammo_kind || lot.quantity == 0 {
            return Err("ammunition is not held by launcher".into());
        }
        if [velocity.x, velocity.y, velocity.z]
            .iter()
            .any(|value| !value.is_finite())
        {
            return Err("invalid launch velocity".into());
        }
        let speed = (velocity.x * velocity.x + velocity.y * velocity.y + velocity.z * velocity.z).sqrt();
        if !speed.is_finite() || speed <= 0.0 || speed > launcher.max_speed {
            return Err("launch velocity exceeds launcher limit".into());
        }
        if self.projectile_count >= combat::MAX_ACTIVE_PROJECTILES || self.ids.len() >= 16384 {
            return Err("projectile capacity exhausted".into());
        }
        let radians = velocity.z.atan2(velocity.x);
        let muzzle = combat::muzzle_origin([launcher_position.x,launcher_position.y,launcher_position.z],[launcher.muzzle_x,launcher.muzzle_y,launcher.muzzle_z],[velocity.x,velocity.y,velocity.z]);
        let support_velocity = self.world_linear_velocity(launcher_entity, delta)?;
        let projectile_id = format!("shot.{}", self.next_projectile);
        let next_projectile = self.next_projectile.checked_add(1).ok_or("projectile ID exhausted")?;
        if self.known.contains(&projectile_id) {
            return Err("projectile ID collides with existing entity".into());
        }
        let projected_weight = self.state_weight
            + projectile_id.len()
            + 128
            + self.registry.weight(
                "hive.position",
                &record(&Position { x: 0.0, y: 0.0, z: 0.0, facing: 0.0 }),
            )
            + self.registry.weight(
                "hive.projectile",
                &record(&Projectile {
                    launcher: launcher_id.into(),
                    velocity_x: velocity.x,
                    velocity_y: velocity.y,
                    velocity_z: velocity.z,
                    radius: launcher.projectile_radius,
                    age: 0.0,
                    distance: 0.0,
                    max_range: launcher.max_range,
                    max_lifetime: launcher.max_lifetime,
                    gravity: launcher.gravity,
                    penetration: launcher.penetration,
                    state: "flying".into(),
                    roll_normal_x: 0.0,
                    roll_normal_y: 1.0,
                    roll_normal_z: 0.0,
                    embed_depth: 0.0,
                    roll_friction: 0.5,
                }),
            )
            + self.registry.weight(
                "hive.visual",
                &record(&Visual {
                    sprite: launcher.projectile_sprite.clone(),
                    label: launcher.projectile_label.clone(),
                }),
            );
        if projected_weight > STATE_BYTES {
            return Err("region canonical state capacity".into());
        }
        self.next_projectile = next_projectile;
        lot.quantity -= 1;
        self.ecs.entity_mut(lot_entity).insert(lot);
        if let Some(mut local)=self.ecs.get_mut::<Position>(launcher_entity) {
            local.facing += radians/std::f64::consts::FRAC_PI_2-launcher_position.facing;
        }
        let projectile_entity = self.ecs.spawn((
            ExternalId(projectile_id.clone()),
            Position {
                x: muzzle[0],
                y: muzzle[1],
                z: muzzle[2],
                facing: launcher_position.facing,
            },
            Projectile {
                launcher: launcher_id.into(),
                velocity_x: velocity.x + support_velocity[0],
                velocity_y: velocity.y + support_velocity[1],
                velocity_z: velocity.z + support_velocity[2],
                radius: launcher.projectile_radius,
                age: 0.0,
                distance: 0.0,
                max_range: launcher.max_range,
                max_lifetime: launcher.max_lifetime,
                gravity: launcher.gravity,
                penetration: launcher.penetration,
                state: "flying".into(),
                roll_normal_x: 0.0,
                roll_normal_y: 1.0,
                roll_normal_z: 0.0,
                embed_depth: 0.0,
                roll_friction: 0.5,
            },
            Visual {
                sprite: launcher.projectile_sprite,
                label: launcher.projectile_label,
            },
        )).id();
        self.ids.insert(projectile_id.clone(), projectile_entity);
        self.known.insert(projectile_id.clone());
        self.projectile_count += 1;
        self.projectile_contacts.insert(projectile_id.clone(), BTreeSet::new());
        self.refresh_state_weight();
        Ok(Some((projectile_id, Vector3 { x: muzzle[0], y: muzzle[1], z: muzzle[2] })))
    }
    fn displace(&mut self, id: &str, delta: Vector3) -> Result<()> {
        if [delta.x, delta.y, delta.z]
            .iter()
            .any(|value| !value.is_finite())
            || (delta.x * delta.x + delta.y * delta.y + delta.z * delta.z).sqrt() > 2.0
        {
            return Err("invalid displacement".into());
        }
        let entity = self.entity(id)?;
        let current = *self.ecs.get::<Position>(entity).ok_or("no position")?;
        if delta.y.abs() > 1e-9 {
            return Err("vertical displacement is unsupported on current surfaces".into());
        }
        let (local_x, local_z) = if let Some(support_id) = self.support_id(entity) {
            let support = self.world_pose(&support_id)?;
            let radians = support.facing * std::f64::consts::FRAC_PI_2;
            let (sin, cos) = radians.sin_cos();
            (cos * delta.x + sin * delta.z, -sin * delta.x + cos * delta.z)
        } else {
            (delta.x, delta.z)
        };
        let target = Point {
            x: current.x + local_x,
            y: current.y,
            z: current.z + local_z,
            frame: self.support_id(entity),
        };
        if let Some(bounds) = self.frame_bounds(target.frame.as_deref())? {
            if target.x < bounds.min_x
                || target.x > bounds.max_x
                || target.z < bounds.min_z
                || target.z > bounds.max_z
            {
                return Err("displacement leaves support surface".into());
            }
        }
        let min_x = current.x.min(target.x).floor() as i32 - 1;
        let max_x = current.x.max(target.x).ceil() as i32 + 1;
        let min_z = current.z.min(target.z).floor() as i32 - 1;
        let max_z = current.z.max(target.z).ceil() as i32 + 1;
        if let Some(blocked) = self.blocked_by_frame.get(&self.support_id(entity)) {
            for x in min_x..=max_x {
                for z in min_z..=max_z {
                    let cell = (x, navigation::cell(navigation::point(current)).1, z);
                    if blocked.contains(&cell) && segment_intersects_cell(&navigation::point(current), &target, cell) {
                        return Err("displacement enters an obstacle".into());
                    }
                }
            }
        }
        if self.ecs.get::<Destination>(entity).is_some() {
            let destination = self.ecs.get::<Destination>(entity).cloned().ok_or("missing destination")?;
            self.state_weight = self.state_weight.saturating_sub(
                self.registry.weight("hive.destination", &record(&destination)),
            );
            self.ecs.entity_mut(entity).remove::<Destination>();
            self.routes.remove(&entity);
        }
        self.ecs.entity_mut(entity).insert(Position {
            x: target.x,
            y: target.y,
            z: target.z,
            facing: current.facing,
        });
        Ok(())
    }
    fn predicted_world_pose(&self, entity: Entity, delta: f64, depth: usize) -> Result<Position> {
        if depth > 16 {
            return Err("support chain exceeds depth 16".into());
        }
        let local = *self.ecs.get::<Position>(entity).ok_or("no position")?;
        let mut predicted = local;
        if let Some(path) = self.routes.get(&entity) {
            let mut remaining = path.clone();
            let speed = self.ecs.get::<Body>(entity).map_or(0.0, |body| body.speed);
            navigation::advance(&mut predicted, &mut remaining, speed * delta);
            if let Some(destination) = self.ecs.get::<Destination>(entity) {
                predicted.facing = destination.facing;
            }
        }
        if let Some(support) = self.ecs.get::<Support>(entity) {
            let parent = self.entity(&support.entity)?;
            let parent_position = self.predicted_world_pose(parent, delta, depth + 1)?;
            let radians = parent_position.facing * std::f64::consts::FRAC_PI_2;
            let (sin, cos) = radians.sin_cos();
            return Ok(Position {
                x: parent_position.x + cos * predicted.x - sin * predicted.z,
                y: parent_position.y + predicted.y,
                z: parent_position.z + sin * predicted.x + cos * predicted.z,
                facing: parent_position.facing + predicted.facing,
            });
        }
        Ok(predicted)
    }
    fn world_linear_velocity(&self, entity: Entity, delta: f64) -> Result<[f64; 3]> {
        if delta <= 0.0 {
            return Ok([0.0; 3]);
        }
        let start = self.world_pose_entity(entity, 0)?;
        let end = self.predicted_world_pose(entity, delta, 0)?;
        Ok([(end.x - start.x) / delta, (end.y - start.y) / delta, (end.z - start.z) / delta])
    }
    fn projectile_colliders(&self, launcher: &str, elapsed: f64, step: f64, origin:[f64;3], velocity:[f64;3], radius:f64, gravity:f64) -> Result<Vec<combat::ContactCollider>> {
        let mut candidates=Vec::new();
        for id in &self.collider_ids {
            if id==launcher { continue; }
            let entity=self.entity(id)?;
            let collider=self.ecs.get::<Collider>(entity).ok_or("stale collider index")?;
            let start=self.predicted_world_pose(entity,elapsed,0)?;
            let end=self.predicted_world_pose(entity,elapsed+step,0)?;
            let initial=self.world_pose_entity(entity,0)?;
            let extent=match collider.shape {ColliderShape::Ball=>collider.radius,ColliderShape::Cuboid=>(collider.half_x.powi(2)+collider.half_y.powi(2)+collider.half_z.powi(2)).sqrt()}+radius+0.01;
            let projectile_end=combat::ballistic_interval(origin,velocity,gravity,step).0;
            let offset_radius=(collider.offset_x.powi(2)+collider.offset_z.powi(2)).sqrt();
            let target_start=[start.x,start.y+collider.offset_y,start.z];
            let target_end=[end.x,end.y+collider.offset_y,end.z];
            if (0..3).any(|axis| origin[axis].min(projectile_end[axis])-extent > target_start[axis].max(target_end[axis])+extent+offset_radius || origin[axis].max(projectile_end[axis])+extent < target_start[axis].min(target_end[axis])-extent-offset_radius) {continue;}
            if matches!(collider.shape,ColliderShape::Cuboid) && (end.facing-initial.facing).abs()>1e-9 { return Err("rotating cuboid collision is unsupported".into()); }
            let angle=start.facing*std::f64::consts::FRAC_PI_2;
            let (sin,cos)=angle.sin_cos();
            let material=self.ecs.get::<ImpactMaterial>(entity);
            candidates.push(combat::ContactCollider {
                geometry:collision::Collider {id:id.clone(),shape:match collider.shape {
                    ColliderShape::Ball=>collision::ColliderShape::Ball{radius:collider.radius},
                    ColliderShape::Cuboid=>collision::ColliderShape::Cuboid{half_extents:[collider.half_x,collider.half_y,collider.half_z]},
                },origin:[start.x+cos*collider.offset_x-sin*collider.offset_z,start.y+collider.offset_y,start.z+sin*collider.offset_x+cos*collider.offset_z],
                linear_velocity:if step>0.0 {[(end.x-start.x)/step,(end.y-start.y)/step,(end.z-start.z)/step]} else {[0.0;3]},yaw:angle+collider.yaw},
                material:combat::ImpactProfile {response:material.map_or("stop",|m|m.response.as_str()).into(),resistance:material.map_or(0.0,|m|m.resistance),restitution:material.map_or(0.0,|m|m.restitution),friction:material.map_or(1.0,|m|m.friction),embed_speed:material.map_or(0.0,|m|m.embed_speed)},
            });
            if candidates.len()>collision::MAX_CANDIDATE_COLLIDERS {return Err("projectile candidate budget exceeded".into());}
        }
        Ok(candidates)
    }
    fn advance_projectiles(&mut self, delta: f64) -> Result<Vec<ImpactEvent>> {
        if self.projectile_count==0 || delta==0.0 {return Ok(Vec::new());}
        let mut impacts=Vec::new();
        for id in self.projectile_ids() {
            let entity=self.entity(&id)?;
            let mut projectile=self.ecs.get::<Projectile>(entity).cloned().ok_or("missing projectile")?;
            if !matches!(projectile.state.as_str(),"flying"|"rolling") {continue;}
            let launcher=projectile.launcher.clone();
            let mut position=*self.ecs.get::<Position>(entity).ok_or("projectile has no position")?;
            let mut victims=self.projectile_contacts.get(&id).cloned().unwrap_or_default();
            let radius=projectile.radius;let gravity=projectile.gravity;
            let result=combat::advance_motion(&id,&mut projectile,&mut position,&mut victims,delta,|elapsed,step,origin,velocity|self.projectile_colliders(&launcher,elapsed,step,origin,velocity,radius,gravity))?;
            for contact in result.contacts {
                if impacts.len()>=combat::MAX_IMPACTS_PER_STEP || self.next_impact>9_007_199_254_740_991 {return Err("impact event budget exceeded".into());}
                let hit=contact.hit;
                impacts.push(ImpactEvent {id:format!("{}/impact.{}",id,self.next_impact),sequence:self.next_impact,projectile_id:id.clone(),source_id:launcher.clone(),target_id:hit.target_id,time:self.time+contact.elapsed,point:Vector3{x:hit.point[0],y:hit.point[1],z:hit.point[2]},normal:Vector3{x:hit.normal[0],y:hit.normal[1],z:hit.normal[2]},velocity:Vector3{x:contact.velocity[0],y:contact.velocity[1],z:contact.velocity[2]}});
                self.next_impact+=1;
            }
            if result.expired {
                self.ecs.despawn(entity);self.ids.remove(&id);self.known.remove(&id);self.projectile_contacts.remove(&id);
                self.projectile_count=self.projectile_count.saturating_sub(1);
            } else {
                if !matches!(projectile.state.as_str(),"flying"|"rolling") {self.projectile_count=self.projectile_count.saturating_sub(1);}
                self.ecs.entity_mut(entity).insert((position,projectile));
                self.projectile_contacts.insert(id,victims);
            }
        }
        self.refresh_state_weight();
        if self.state_weight>STATE_BYTES {return Err("region canonical state capacity".into());}
        Ok(impacts)
    }
    fn transfer(&mut self, lot: &str, from: &str, to: &str, quantity: u32) -> Result<()> {
        if quantity == 0 || from == to {
            return Err("invalid transfer".into());
        }
        let source = self.entity(from)?;
        let dest = self.entity(to)?;
        let e = self.entity(lot)?;
        let mut stock = self
            .ecs
            .get::<Lot>(e)
            .cloned()
            .ok_or("not a material lot")?;
        let capacity = self
            .ecs
            .get::<Container>(dest)
            .ok_or("not a container")?
            .capacity;
        if stock.container != from || stock.quantity < quantity {
            return Err("stock is not available at source".into());
        }
        if self.quantity(to) + u64::from(quantity) > u64::from(capacity) {
            return Err("destination is full".into());
        }
        self.contact(source, dest)?;
        let current_water = self.ecs.get::<LotWater>(e).map(|water| water.water_kg);
        let moved_water = current_water.map(|water| {
            if quantity == stock.quantity { water } else { water * f64::from(quantity) / f64::from(stock.quantity) }
        });
        let remainder_water = if quantity < stock.quantity {
            current_water.map(|water| water - moved_water.expect("split water"))
        } else { None };
        if let Some(water) = current_water {
            let moved = moved_water.unwrap_or(0.0);
            let remainder = remainder_water.unwrap_or(0.0);
            if !water.is_finite() || water < 0.0 || water > MAX_CARRIED_WATER_KG
                || (quantity < stock.quantity && (!moved.is_finite() || !remainder.is_finite()
                    || moved < 0.0 || remainder < 0.0
                    || (water > 0.0 && (moved <= 0.0 || remainder <= 0.0))))
            {
                return Err("carried water split is not representable".into());
            }
        }
        // Split identity is selected before mutation. The moved lot retains its
        // ID so the actor's delivery plan continues to refer to the same object.
        if stock.quantity > quantity {
            if self.ids.len() >= 16384 {
                return Err("region entity capacity".into());
            }
            let (id, next) = material_output::allocate_lot_id(self.next_lot, |candidate| self.known.contains(candidate))?;
            let extra_lot = Lot {
                kind: stock.kind.clone(),
                quantity: stock.quantity - quantity,
                container: from.into(),
            };
            let extra_water = remainder_water.map(|water| LotWater { water_kg: water });
            let extra = id.len() + 128 + self.registry.weight("hive.lot", &record(&extra_lot))
                + extra_water.as_ref().map(|water| self.registry.weight("hive.lot-water", &record(water))).unwrap_or(0);
            if self.state_weight + extra > STATE_BYTES {
                return Err("region canonical state capacity".into());
            }
            let remainder = if let Some(water) = extra_water {
                self.ecs.spawn((ExternalId(id.clone()), extra_lot, water)).id()
            } else {
                self.ecs.spawn((ExternalId(id.clone()), extra_lot)).id()
            };
            self.next_lot = next;
            self.state_weight += extra;
            self.ids.insert(id.clone(), remainder);
            self.known.insert(id);
            self.contents
                .entry(from.into())
                .or_default()
                .insert(remainder);
        }
        stock.quantity = quantity;
        stock.container = to.into();
        self.ecs.entity_mut(e).insert(stock);
        if let Some(moved) = moved_water {
            self.ecs.entity_mut(e).insert(LotWater { water_kg: moved });
        }
        self.contents.entry(from.into()).or_default().remove(&e);
        self.contents.entry(to.into()).or_default().insert(e);
        Ok(())
    }
    fn invalidate_terrain_routes(&mut self) -> Result<()> {
        let candidates: Vec<_> = self.terrain_routes.iter().filter_map(|(entity, state)| (!state.waiting).then_some(*entity)).collect();
        let mut invalid = Vec::new();
        for entity in candidates {
            let Some(capability) = self.ecs.get::<Traversal>(entity).copied() else { invalid.push(entity); continue };
            let blocked = self.blocked_by_frame.get(&None).cloned().ok_or("missing obstacle frame index")?;
            let environment_view = self.environment.as_ref().ok_or("terrain route needs environment")?;
            let spacing = environment_view.world.cell_spacing_m();
            let active_blocked = self.terrain_routes.get(&entity).and_then(|state| state.path.get(0..2)).is_some_and(|edge| edge.iter().any(|cell| {
                i32::try_from(cell.x).ok().zip(i32::try_from(cell.z).ok()).is_some_and(|(x, z)| {
                    blocked.contains(&(x, ((f64::from(cell.y) + 0.5) * spacing[1]).round() as i32, z))
                })
            }));
            if active_blocked { invalid.push(entity); continue; }
            if let Some(state) = self.terrain_routes.get(&entity) {
                if let Some(target) = &state.target {
                    let position = *self.ecs.get::<Position>(entity).ok_or("terrain route actor lost position")?;
                    let current = navigation::point(position);
                    let delta = [target.x - state.origin.x, target.y - state.origin.y, target.z - state.origin.z];
                    let length2 = delta.iter().map(|value| value * value).sum::<f64>();
                    let along = if length2 <= f64::EPSILON { 0.0 } else {
                        ((current.x - state.origin.x) * delta[0] + (current.y - state.origin.y) * delta[1]
                            + (current.z - state.origin.z) * delta[2]) / length2
                    };
                    let along = along.clamp(0.0, 1.0);
                    let expected = [state.origin.x + delta[0] * along, state.origin.y + delta[1] * along, state.origin.z + delta[2] * along];
                    let error = ((current.x - expected[0]).powi(2) + (current.y - expected[1]).powi(2) + (current.z - expected[2]).powi(2)).sqrt();
                    if !error.is_finite() || error > 1e-7 || along < -1e-9 || along > 1.0 + 1e-9 {
                        invalid.push(entity);
                        continue;
                    }
                }
            }
            let current_revision = environment_view.world.terrain_revision();
            if self.terrain_routes.get(&entity).and_then(|state| state.revision) == Some(current_revision) { continue; }
            let path = self.terrain_routes.get(&entity).map(|state| state.path.clone()).ok_or("terrain route witness missing")?;
            let environment = self.environment.as_mut().ok_or("terrain route needs environment")?;
            let config = crate::terrain_traversal::TraversalConfig {
                spacing,
                clearance_cells: capability.clearance_cells,
                max_step_cells: capability.max_step_cells,
            };
            let mut query = |cell| match environment.world.material(cell) {
                Ok(material) => Ok(crate::terrain_traversal::TraversalMaterial { solid: !environment.world.is_open_material(material), outside: false }),
                Err(error) if error == "cell outside world bounds" => Ok(crate::terrain_traversal::TraversalMaterial { solid: false, outside: true }),
                Err(error) => Err(error),
            };
            let mut valid = true;
            for cell in &path {
                if !matches!(crate::terrain_traversal::node(*cell, config, &mut query)?, Some(_)) { valid = false; break; }
            }
            if valid {
                for pair in path.windows(2) {
                    let from = crate::terrain_traversal::node(pair[0], config, &mut query)?;
                    let Some(from) = from else { valid = false; break };
                    let dx = i32::try_from(pair[1].x - pair[0].x).unwrap_or(2);
                    let dz = i32::try_from(pair[1].z - pair[0].z).unwrap_or(2);
                    let dy = pair[1].y - pair[0].y;
                    if !matches!(crate::terrain_traversal::step(from, dx, dy, dz, config, &mut query)?, Some(_)) { valid = false; break; }
                }
            }
            if !valid { invalid.push(entity); }
            else if let Some(state) = self.terrain_routes.get_mut(&entity) { state.revision = Some(current_revision); }
        }
        for entity in invalid {
            if let Some(route) = self.routes.get_mut(&entity) { route.clear(); }
            if let Some(state) = self.terrain_routes.get_mut(&entity) { state.waiting = true; state.revision = None; }
        }
        Ok(())
    }

    fn advance_movement(&mut self, delta: f64) -> Result<()> {
        self.invalidate_terrain_routes()?;
        let prior_targets: BTreeMap<_, _> = self.terrain_routes.iter().filter_map(|(entity, state)| state.target.clone().map(|target| (*entity, target))).collect();
        self.routes.retain(|entity, path| {
            let speed = self.ecs.get::<Body>(*entity).expect("route body").speed;
            let target = self
                .ecs
                .get::<Destination>(*entity)
                .expect("route destination")
                .clone();
            let mut p = *self.ecs.get::<Position>(*entity).expect("route position");
            navigation::advance(&mut p, path, speed * delta);
            p.facing = target.facing;
            self.ecs.entity_mut(*entity).insert(p);
            if path.is_empty() {
                self.state_weight -= self.registry.weight("hive.destination", &record(&target));
                self.ecs.entity_mut(*entity).remove::<Destination>();
                false
            } else {
                true
            }
        });
        let finished: Vec<_> = self.terrain_routes.keys().filter(|entity| !self.routes.contains_key(entity)).copied().collect();
        for entity in finished { self.terrain_routes.remove(&entity); }
        for (entity, prior) in prior_targets {
            if let Some(state) = self.terrain_routes.get_mut(&entity) {
                let next = self.routes.get(&entity).and_then(|path| path.front().cloned());
                if next.as_ref() != state.target.as_ref() {
                    state.origin = prior;
                    state.target = next;
                }
            }
        }
        Ok(())
    }

    fn advance_direct(&mut self, delta: f64) -> Result<()> {
        if delta == 0.0 { return Ok(()); }
        let entities: Vec<Entity> = self.direct.keys().copied().collect();
        for entity in entities {
            let Some(mut state) = self.direct.remove(&entity) else { continue };
            let credit = state.remainder + delta;
            let mut steps = ((credit + 1e-9) / navigation::DIRECT_STEP_SECONDS).floor() as usize;
            steps = steps.min(state.queue.len());
            let remainder = if state.queue.is_empty() || steps == state.queue.len() { 0.0 }
                else { (credit - steps as f64 * navigation::DIRECT_STEP_SECONDS).max(0.0) };
            let position = *self.ecs.get::<Position>(entity).ok_or("direct stream lost position")?;
            let body = *self.ecs.get::<Body>(entity).ok_or("direct stream lost body")?;
            let blocked = self.blocked_by_frame.get(&None).cloned().unwrap_or_default();
            let bounds = self.frame_bounds(None)?;
            let mut next = position;
            for input in state.queue.iter().take(steps) {
                next = navigation::direct_step(next, input.x, input.z, body.speed, &blocked, bounds)?;
                state.last_processed = input.sequence;
            }
            state.queue.drain(..steps);
            state.remainder = remainder;
            self.ecs.entity_mut(entity).insert(next);
            self.direct.insert(entity, state);
        }
        Ok(())
    }
}

#[cfg(test)]
mod entity_membership_tests {
    use super::Kernel;
    use serde_json::json;

    #[test]
    fn membership_is_authoritative_bounded_and_rejects_invalid_batches() {
        let mut kernel = Kernel::new();
        kernel.load(&serde_json::to_string(&json!({
            "format":"hive-game", "version":1, "game":"membership",
            "components":[], "initial":[{"id":"actor","components":{}}]
        })).unwrap()).unwrap();
        assert_eq!(kernel.entity_membership_json(r#"["actor","missing"]"#).unwrap(), "[true,false]");
        assert!(kernel.entity_membership_json(r#"["bad id"]"#).is_err());
        let too_many = serde_json::to_string(&(0..129).map(|i| format!("entity-{i}")).collect::<Vec<_>>()).unwrap();
        assert!(kernel.entity_membership_json(&too_many).is_err());
    }
}

#[cfg(test)]
mod lot_water_tests {
    use super::Kernel;
    use serde_json::{json, Value};

    fn scene(water: Option<Value>, dest_capacity: u32) -> String {
        let mut lot = json!({"hive.lot":{"kind":"water-lot","quantity":4,"container":"source"}});
        if let Some(value) = water { lot["hive.lot-water"] = value; }
        serde_json::to_string(&json!({
            "format":"hive-game", "version":1, "game":"lot-water",
            "components":[], "initial":[
                {"id":"source","components":{"hive.position":{"x":0.0,"y":0.0,"z":0.0,"facing":0.0},"hive.container":{"capacity":10}}},
                {"id":"dest","components":{"hive.position":{"x":1.0,"y":0.0,"z":0.0,"facing":0.0},"hive.container":{"capacity":dest_capacity}}},
                {"id":"lot","components":lot}
            ]
        })).unwrap()
    }
    fn transfer(kernel: &mut Kernel, quantity: u32) -> Value {
        serde_json::from_str(&kernel.advance_json(&json!({
            "delta":0.0,"writes":[],"actions":[{"kind":"transfer","lot":"lot","from":"source","to":"dest","quantity":quantity}]
        }).to_string()).unwrap()).unwrap()
    }
    fn rows(kernel: &mut Kernel, component: &str) -> Value {
        serde_json::from_str(&kernel.query_json(&format!("[\"{component}\"]")).unwrap()).unwrap()
    }

    #[test]
    fn partial_and_whole_transfer_conserve_carried_water() {
        let mut kernel = Kernel::new();
        kernel.load(&scene(Some(json!({"waterKg":8.0})), 10)).unwrap();
        assert_eq!(transfer(&mut kernel, 2)["results"][0]["accepted"], true);
        let water = rows(&mut kernel, "hive.lot-water");
        let mut values: Vec<f64> = water.as_array().unwrap().iter().map(|row| row["components"]["hive.lot-water"]["waterKg"].as_f64().unwrap()).collect();
        values.sort_by(|a, b| a.partial_cmp(b).unwrap());
        assert_eq!(values, vec![4.0, 4.0]);
        let mut whole = Kernel::new();
        whole.load(&scene(Some(json!({"waterKg":10.3})), 10)).unwrap();
        assert_eq!(transfer(&mut whole, 4)["results"][0]["accepted"], true);
        assert_eq!(rows(&mut whole, "hive.lot-water").as_array().unwrap().len(), 1);
        assert_eq!(rows(&mut whole, "hive.lot-water")[0]["components"]["hive.lot-water"]["waterKg"], 10.3);
    }

    #[test]
    fn invalid_water_reference_and_mass_are_rejected_on_load_and_restore() {
        let mut orphan: Value = serde_json::from_str(&scene(None, 10)).unwrap();
        let components = orphan["initial"][2]["components"].as_object_mut().unwrap();
        assert!(components.remove("hive.lot").is_some());
        components.insert("hive.lot-water".into(), json!({"waterKg":1.0}));
        assert!(Kernel::new().load(&orphan.to_string()).is_err());
        assert!(Kernel::new().load(&scene(Some(json!({"waterKg":-1.0})), 10)).is_err());
        assert!(Kernel::new().load(&scene(Some(json!({"waterKg":8.0})), 10).replace("\"quantity\":4", "\"quantity\":0")).is_err());
        let mut kernel = Kernel::new();
        kernel.load(&scene(Some(json!({"waterKg":8.0})), 10)).unwrap();
        let forged = kernel.snapshot_json().unwrap().replace("\"waterKg\":8.0", "\"waterKg\":-1.0");
        assert!(Kernel::new().restore_json(&forged).is_err());
    }

    #[test]
    fn full_destination_and_wet_consume_reject_without_mutation() {
        let mut full = Kernel::new();
        full.load(&scene(Some(json!({"waterKg":8.0})), 1)).unwrap();
        assert!(transfer(&mut full, 1)["results"][0]["accepted"] == true);
        let before_full_lot = rows(&mut full, "hive.lot");
        let before_full_water = rows(&mut full, "hive.lot-water");
        let rejected: Value = serde_json::from_str(&full.advance_json(r#"{"delta":0,"writes":[],"actions":[{"kind":"transfer","lot":"lot.1","from":"source","to":"dest","quantity":1}]}"#).unwrap()).unwrap();
        assert_eq!(rejected["results"][0]["accepted"], false);
        assert_eq!(rows(&mut full, "hive.lot"), before_full_lot);
        assert_eq!(rows(&mut full, "hive.lot-water"), before_full_water);
        let mut wet = Kernel::new(); wet.load(&scene(Some(json!({"waterKg":8.0})), 10)).unwrap();
        let before_wet_lot = rows(&mut wet, "hive.lot");
        let before_wet_water = rows(&mut wet, "hive.lot-water");
        wet.advance_json(r#"{"delta":0,"writes":[],"actions":[{"kind":"consume","entity":"source","lot":"lot","quantity":1}]}"#).unwrap();
        assert_eq!(rows(&mut wet, "hive.lot"), before_wet_lot);
        assert_eq!(rows(&mut wet, "hive.lot-water"), before_wet_water);
        let mut tiny = Kernel::new(); tiny.load(&scene(Some(json!({"waterKg":5e-324})), 10)).unwrap();
        let tiny_before = rows(&mut tiny, "hive.lot-water");
        assert_eq!(transfer(&mut tiny, 1)["results"][0]["accepted"], false);
        assert_eq!(rows(&mut tiny, "hive.lot-water"), tiny_before);
        let mut dry = Kernel::new(); dry.load(&scene(None, 10)).unwrap();
        let dry_result: Value = serde_json::from_str(&dry.advance_json(r#"{"delta":0,"writes":[],"actions":[{"kind":"consume","entity":"source","lot":"lot","quantity":1}]}"#).unwrap()).unwrap();
        assert_eq!(dry_result["results"][0]["accepted"], true);
        assert_eq!(rows(&mut dry, "hive.lot")[0]["components"]["hive.lot"]["quantity"], 3);
    }
}

#[cfg(test)]
mod combat_tests {
    use super::Kernel;
    use serde_json::json;

    fn combat_scene() -> String {
        serde_json::to_string(&json!({
            "format": "hive-game",
            "version": 1,
            "game": "formation-combat",
            "components": [],
            "initial": [
                {"id":"cannon", "components": {
                    "hive.position":{"x":0.0,"y":0.0,"z":0.0,"facing":0.0},
                    "hive.container":{"capacity":4},
                    "hive.launcher":{"ammoKind":"cannonball","muzzleX":0.0,"muzzleY":0.0,"muzzleZ":0.0,"maxSpeed":20.0,"projectileRadius":0.1,"maxRange":20.0,"maxLifetime":5.0,"projectileSprite":"cannonball","projectileLabel":"Cannonball","gravity":0.0,"penetration":0.0}
                }},
                {"id":"ball", "components": {
                    "hive.position":{"x":3.0,"y":0.0,"z":0.0,"facing":0.0},
                    "hive.collider":{"shape":"ball","radius":0.5,"halfX":0.0,"halfY":0.0,"halfZ":0.0,"yaw":0.0,"offsetX":0.0,"offsetY":0.0,"offsetZ":0.0}
                }},
                {"id":"ammo", "components": {
                    "hive.lot":{"kind":"cannonball","quantity":1,"container":"cannon"}
                }}
            ]
        }))
        .expect("combat fixture")
    }

    #[test]
    fn public_advance_returns_one_launch_and_one_new_impact() {
        let mut kernel = Kernel::new();
        kernel.load(&combat_scene()).expect("load combat fixture");
        let response = kernel
            .advance_json(
                r#"{"delta":0.5,"writes":[],"actions":[{"kind":"launch","launcher":"cannon","ammunition":"ammo","velocity":{"x":10.0,"y":0.0,"z":0.0}}]}"#,
            )
            .expect("launch and sweep");
        let value: serde_json::Value = serde_json::from_str(&response).expect("response JSON");
        assert_eq!(value["results"][0]["accepted"], true);
        assert_eq!(value["results"][0]["projectileId"], "shot.1");
        assert_eq!(value["results"][0]["launchPoint"], json!({"x":0.0,"y":0.0,"z":0.0}));
        assert_eq!(value["impacts"][0]["sourceId"], "cannon");
        assert_eq!(value["impacts"][0]["targetId"], "ball");
        assert!(value["impacts"][0]["time"].as_f64().unwrap() > 0.0);
    }

    #[test]
    fn rejected_launch_does_not_spend_ammo_or_allocate_projectile() {
        let mut kernel = Kernel::new();
        kernel.load(&combat_scene()).expect("load combat fixture");
        let response = kernel
            .advance_json(
                r#"{"delta":0.0,"writes":[],"actions":[{"kind":"launch","launcher":"cannon","ammunition":"ammo","velocity":{"x":100.0,"y":0.0,"z":0.0}}]}"#,
            )
            .expect("rejected action remains a valid batch");
        let value: serde_json::Value = serde_json::from_str(&response).expect("response JSON");
        assert_eq!(value["results"][0]["accepted"], false);
        assert_eq!(value["results"][0]["reason"], "launch velocity exceeds launcher limit");
        let rows: serde_json::Value = serde_json::from_str(
            &kernel.query_json(r#"["hive.lot"]"#).expect("lot query"),
        )
        .expect("lot JSON");
        let ammo = rows
            .as_array()
            .unwrap()
            .iter()
            .find(|row| row["id"] == "ammo")
            .expect("ammo lot");
        assert_eq!(ammo["components"]["hive.lot"]["quantity"], 1);
        assert!(!kernel
            .render_json()
            .expect("render")
            .contains("shot.1"));
    }

    #[test]
    fn public_displace_crosses_cells_without_teleporting_through_obstacle() {
        let scene = combat_scene().replace(
            "\"hive.collider\":{\"shape\":\"ball\",\"radius\":0.5,\"halfX\":0.0,\"halfY\":0.0,\"halfZ\":0.0,\"yaw\":0.0,\"offsetX\":0.0,\"offsetY\":0.0,\"offsetZ\":0.0}",
            "\"hive.collider\":{\"shape\":\"ball\",\"radius\":0.5,\"halfX\":0.0,\"halfY\":0.0,\"halfZ\":0.0,\"yaw\":0.0,\"offsetX\":0.0,\"offsetY\":0.0,\"offsetZ\":0.0},\"hive.obstacle\":{\"occupied\":false}",
        );
        let mut kernel = Kernel::new();
        kernel.load(&scene).expect("load combat fixture");
        let response = kernel
            .advance_json(
                r#"{"delta":0.0,"writes":[],"actions":[{"kind":"displace","entity":"cannon","delta":{"x":1.5,"y":0.0,"z":0.0}}]}"#,
            )
            .expect("displace across cells");
        let value: serde_json::Value = serde_json::from_str(&response).expect("response JSON");
        assert_eq!(value["results"][0]["accepted"], true);
        let facts: serde_json::Value = serde_json::from_str(&kernel.render_json().expect("render"))
            .expect("render JSON");
        let cannon = facts
            .as_array()
            .unwrap()
            .iter()
            .find(|fact| fact["id"] == "cannon")
            .expect("cannon fact");
        assert_eq!(cannon["local"]["position"]["x"], 1.5);
    }

    #[test]
    fn public_snapshot_restores_in_flight_projectile_and_counter() {
        let mut kernel = Kernel::new();
        kernel.load(&combat_scene()).expect("load combat fixture");
        kernel
            .advance_json(
                r#"{"delta":0.05,"writes":[],"actions":[{"kind":"launch","launcher":"cannon","ammunition":"ammo","velocity":{"x":10.0,"y":0.0,"z":0.0}}]}"#,
            )
            .expect("launch");
        let snapshot = kernel.snapshot_json().expect("snapshot");
        let mut restored = Kernel::new();
        restored.restore_json(&snapshot).expect("restore");
        assert_eq!(restored.snapshot_json().expect("restored snapshot"), snapshot);
    }

    fn rotating_cuboid_scene(target_x: f64) -> String {
        let mut scene: serde_json::Value = serde_json::from_str(&combat_scene()).expect("fixture JSON");
        let target = scene["initial"]
            .as_array_mut()
            .unwrap()
            .iter_mut()
            .find(|row| row["id"] == "ball")
            .expect("target fixture");
        target["components"]["hive.position"]["x"] = json!(target_x);
        target["components"]["hive.collider"]["shape"] = json!("cuboid");
        target["components"]["hive.collider"]["radius"] = json!(0.0);
        target["components"]["hive.collider"]["halfX"] = json!(0.5);
        target["components"]["hive.collider"]["halfY"] = json!(0.5);
        target["components"]["hive.collider"]["halfZ"] = json!(0.5);
        target["components"]["hive.body"] = json!({"speed":1.0});
        target["components"]["hive.destination"] = json!({
            "x":target_x,"y":0.0,"z":1.0,"facing":1.0,"frame":null
        });
        serde_json::to_string(&scene).expect("fixture serialization")
    }

    #[test]
    fn relevant_rotating_cuboid_rejects_and_restores_whole_step() {
        let mut kernel = Kernel::new();
        kernel.load(&rotating_cuboid_scene(3.0)).expect("load rotating fixture");
        let before = kernel.snapshot_json().expect("before snapshot");
        let result = kernel.advance_json(
            r#"{"delta":0.5,"writes":[],"actions":[{"kind":"launch","launcher":"cannon","ammunition":"ammo","velocity":{"x":10.0,"y":0.0,"z":0.0}}]}"#,
        );
        assert!(result.is_err());
        assert_eq!(kernel.snapshot_json().expect("rollback snapshot"), before);
    }

    #[test]
    fn distant_rotating_cuboid_does_not_block_shot() {
        let mut kernel = Kernel::new();
        kernel.load(&rotating_cuboid_scene(100.0)).expect("load distant fixture");
        let response = kernel
            .advance_json(
                r#"{"delta":0.5,"writes":[],"actions":[{"kind":"launch","launcher":"cannon","ammunition":"ammo","velocity":{"x":10.0,"y":0.0,"z":0.0}}]}"#,
            )
            .expect("distant rotation is irrelevant");
        let value: serde_json::Value = serde_json::from_str(&response).expect("response JSON");
        assert!(value["results"][0]["accepted"].as_bool().unwrap());
        assert_eq!(value["impacts"].as_array().unwrap().len(), 0);
    }

    #[test]
    fn zero_delta_preserves_active_projectile() {
        let mut kernel = Kernel::new();
        kernel.load(&combat_scene()).expect("load combat fixture");
        kernel
            .advance_json(
                r#"{"delta":0.0,"writes":[],"actions":[{"kind":"launch","launcher":"cannon","ammunition":"ammo","velocity":{"x":10.0,"y":0.0,"z":0.0}}]}"#,
            )
            .expect("zero delta launch");
        assert!(kernel.render_json().expect("render").contains("shot.1"));
        kernel
            .advance_json(r#"{"delta":0.0,"writes":[],"actions":[]}"#)
            .expect("zero delta idle");
        assert!(kernel.render_json().expect("render").contains("shot.1"));
    }

    #[test]
    fn forged_snapshot_projectile_launcher_is_rejected() {
        let mut kernel = Kernel::new();
        kernel.load(&combat_scene()).expect("load combat fixture");
        kernel
            .advance_json(
                r#"{"delta":0.05,"writes":[],"actions":[{"kind":"launch","launcher":"cannon","ammunition":"ammo","velocity":{"x":10.0,"y":0.0,"z":0.0}}]}"#,
            )
            .expect("launch");
        let snapshot = kernel
            .snapshot_json()
            .expect("snapshot")
            .replace("\"launcher\":\"cannon\"", "\"launcher\":\"ammo\"");
        let mut restored = Kernel::new();
        assert!(restored.restore_json(&snapshot).is_err());
    }

    #[test]
    fn repeated_same_move_save_restore_reaches_fractional_destination() {
        let scene = serde_json::to_string(&json!({
            "format":"hive-game", "version":1, "game":"route-recovery",
            "components":[], "initial":[{"id":"mover","components":{
                "hive.position":{"x":0.4,"y":0.0,"z":0.4,"facing":0.0},
                "hive.body":{"speed":2.0}
            }}]
        })).expect("route fixture");
        let mut kernel = Kernel::new();
        kernel.load(&scene).expect("load route fixture");
        let move_action = r#"{"delta":0.1,"writes":[],"actions":[{"kind":"move","entity":"mover","destination":{"x":3.2,"y":0.0,"z":0.4,"frame":null}}]}"#;
        for _ in 0..30 {
            kernel.advance_json(move_action).expect("repeated move");
            let saved = kernel.snapshot_json().expect("save route");
            kernel.restore_json(&saved).expect("restore route");
        }
        let facts: serde_json::Value = serde_json::from_str(&kernel.render_json().expect("render route"))
            .expect("route render JSON");
        let mover = facts.as_array().unwrap().iter().find(|fact| fact["id"] == "mover").unwrap();
        assert!((mover["local"]["position"]["x"].as_f64().unwrap() - 3.2).abs() < 1e-9);
    }
}

#[cfg(test)]
mod direct_tests {
    use super::Kernel;
    use serde_json::json;

    fn scene() -> String {
        serde_json::to_string(&json!({
            "format":"hive-game", "version":1, "game":"survival",
            "components":[], "initial":[{"id":"survivor","components":{
                "hive.position":{"x":0.0,"y":0.0,"z":0.0,"facing":0.0},
                "hive.body":{"speed":2.0}
            }}]
        })).unwrap()
    }
    fn batch(delta: f64, actions: serde_json::Value) -> String {
        serde_json::to_string(&json!({"delta":delta,"writes":[],"actions":actions})).unwrap()
    }

    #[test]
    fn direct_stream_uses_fixed_clock_and_survives_restore() {
        let mut kernel = Kernel::new();
        kernel.load(&scene()).unwrap();
        kernel.advance_json(&batch(0.0, json!([{"kind":"begin-direct","entity":"survivor","stream":"keyboard"}]))).unwrap();
        kernel.advance_json(&batch(0.019, json!([{"kind":"direct-input","entity":"survivor","stream":"keyboard","inputs":[{"sequence":1,"x":1.0,"z":0.0}]}]))).unwrap();
        let before = kernel.render_json().unwrap();
        kernel.advance_json(&batch(0.001, json!([]))).unwrap();
        let after = kernel.render_json().unwrap();
        assert_ne!(before, after);
        let snapshot = kernel.snapshot_json().unwrap();
        let mut restored = Kernel::new();
        restored.restore_json(&snapshot).unwrap();
        assert_eq!(restored.snapshot_json().unwrap(), snapshot);
    }

    #[test]
    fn rejected_direct_gap_does_not_mutate_stream() {
        let mut kernel = Kernel::new();
        kernel.load(&scene()).unwrap();
        kernel.advance_json(&batch(0.0, json!([{"kind":"begin-direct","entity":"survivor","stream":"keyboard"}]))).unwrap();
        let before_render = kernel.render_json().unwrap();
        let result: serde_json::Value = serde_json::from_str(&kernel.advance_json(&batch(0.0, json!([{"kind":"direct-input","entity":"survivor","stream":"keyboard","inputs":[{"sequence":2,"x":1.0,"z":0.0}]}]))).unwrap()).unwrap();
        assert_eq!(result["results"][0]["accepted"], false);
        assert_eq!(kernel.render_json().unwrap(), before_render);
    }

    #[test]
    fn direct_flood_is_fixed_clock_and_forged_frontier_is_rejected() {
        let mut kernel = Kernel::new();
        kernel.load(&scene()).unwrap();
        kernel.advance_json(&batch(0.0, json!([{"kind":"begin-direct","entity":"survivor","stream":"keyboard"}]))).unwrap();
        let inputs: Vec<_> = (1..=50).map(|sequence| json!({"sequence":sequence,"x":1.0,"z":0.0})).collect();
        for chunk in inputs.chunks(50) {
            let result: serde_json::Value = serde_json::from_str(&kernel.advance_json(&batch(0.0, json!([{"kind":"direct-input","entity":"survivor","stream":"keyboard","inputs":chunk}]))).unwrap()).unwrap();
            assert_eq!(result["results"][0]["accepted"], true);
        }
        let before = kernel.render_json().unwrap();
        kernel.advance_json(&batch(0.2, json!([]))).unwrap();
        let ten_steps = kernel.render_json().unwrap();
        assert_ne!(before, ten_steps);
        let ten: serde_json::Value = serde_json::from_str(&ten_steps).unwrap();
        assert!((ten[0]["pose"]["position"]["x"].as_f64().unwrap() - 0.4).abs() < 1e-9);
        kernel.advance_json(&batch(0.8, json!([]))).unwrap();
        let finished = kernel.render_json().unwrap();
        kernel.advance_json(&batch(1.0, json!([]))).unwrap();
        assert_eq!(kernel.render_json().unwrap(), finished);
        let snapshot = kernel.snapshot_json().unwrap().replace("\"last_queued\":50", "\"last_queued\":51");
        let mut restored = Kernel::new();
        assert!(restored.restore_json(&snapshot).is_err());
    }
}
