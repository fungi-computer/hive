use crate::{collision, combat, components::*, navigation, registry::Registry};
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
    projectile_id: String,
    source_id: String,
    target_id: String,
    time: f64,
    point: Vector3,
    normal: Vector3,
    velocity: Vector3,
}

pub struct Kernel {
    ecs: World,
    registry: Registry,
    ids: BTreeMap<String, Entity>,
    known: BTreeSet<String>,
    queries: BTreeMap<Vec<String>, QueryState<Entity>>,
    contents: BTreeMap<String, BTreeSet<Entity>>,
    blocked_by_frame: BTreeMap<Option<String>, BTreeSet<navigation::Cell>>,
    routes: BTreeMap<Entity, VecDeque<Point>>,
    game: String,
    revision: u64,
    time: f64,
    next_lot: u64,
    next_projectile: u64,
    next_impact: u64,
    state_weight: usize,
}
const STATE_BYTES: usize = 8 * 1024 * 1024;

impl Kernel {
    pub fn new() -> Self {
        let mut ecs = World::new();
        let registry = Registry::new(&mut ecs, vec![]).expect("builtin schemas");
        Self {
            ecs,
            registry,
            ids: BTreeMap::new(),
            known: BTreeSet::new(),
            queries: BTreeMap::new(),
            contents: BTreeMap::new(),
            blocked_by_frame: BTreeMap::new(),
            routes: BTreeMap::new(),
            game: String::new(),
            revision: 0,
            time: 0.0,
            next_lot: 1,
            next_projectile: 1,
            next_impact: 1,
            state_weight: 0,
        }
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
        self.state_weight = weight;
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
        &self,
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
            .expect("rebuilt obstacle frame index");
        navigation::route(
            navigation::point(start),
            destination.clone(),
            &blocked,
            self.frame_bounds(frame.as_deref())?,
        )
    }
    fn restore_routes(&mut self, saved: Vec<RouteSnapshot>) -> Result<()> {
        if saved.len() > self.ids.len() {
            return Err("too many saved routes".into());
        }
        let mut restored = BTreeMap::new();
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
        let expected = self
            .ids
            .values()
            .filter(|entity| self.ecs.get::<Destination>(**entity).is_some())
            .count();
        if expected != restored.len() {
            return Err("saved route set does not match destinations".into());
        }
        self.routes = restored;
        Ok(())
    }
    fn rebuild_physical_indexes(&mut self, build_routes: bool) -> Result<()> {
        self.blocked_by_frame.clear();
        self.routes.clear();
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
    pub fn snapshot_json(&self) -> Result<String> {
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
            })
            .collect();
        routes.sort_by(|a: &RouteSnapshot, b: &RouteSnapshot| a.entity.cmp(&b.entity));
        let route_bytes = serde_json::to_vec(&routes).map_err(|e| e.to_string())?.len();
        if self.state_weight.saturating_add(route_bytes) > STATE_BYTES {
            return Err("route state exceeds canonical capacity".into());
        }
        let state = Snapshot {
            format: "hive-kernel".into(),
            version: 3,
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
        };
        serde_json::to_string(&state).map_err(|e| e.to_string())
    }
    pub fn restore_json(&mut self, input: &str) -> Result<()> {
        if input.len() > 8 * 1024 * 1024 {
            return Err("snapshot too large".into());
        }
        let state: Snapshot = serde_json::from_str(input).map_err(|e| e.to_string())?;
        if state.format != "hive-kernel"
            || state.version != 3
            || !state.time.is_finite()
            || state.time < 0.0
            || state.next_lot == 0
            || state.next_projectile == 0
            || state.next_impact == 0
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
        candidate.revision = state.revision;
        candidate.time = state.time;
        candidate.next_lot = state.next_lot;
        candidate.next_projectile = state.next_projectile;
        candidate.next_impact = state.next_impact;
        *self = candidate;
        Ok(())
    }
    pub fn render_json(&self) -> Result<String> {
        let mut facts = Vec::new();
        for (id, e) in &self.ids {
            let Some(local) = self.ecs.get::<Position>(*e) else {
                continue;
            };
            let p = self.world_pose_entity(*e, 0)?;
            let visual=self.ecs.get::<Visual>(*e);
            facts.push(json!({
                "id":id,
                "pose":{"position":{"x":p.x,"y":p.y,"z":p.z},"facing":p.facing},
                "local":{"position":{"x":local.x,"y":local.y,"z":local.z},"facing":local.facing},
                "support":self.support_id(*e),
                "surface":self.ecs.get::<Surface>(*e),
                "visual":visual.map(|v|&v.sprite),
                "label":visual.map(|v|&v.label)
            }));
        }
        serde_json::to_string(&facts).map_err(|e| e.to_string())
    }
    pub fn world_pose_json(&self, input: &str) -> Result<String> {
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
        let needs_staging = serde_json::from_str::<Batch>(input)
            .map(|batch| {
                !self.projectile_ids().is_empty()
                    || batch.actions.iter().any(|action| {
                        matches!(action, Action::Launch { .. } | Action::Displace { .. })
                    })
            })
            .unwrap_or(false);
        if needs_staging {
            let before = self.snapshot_json()?;
            let result = self.advance_json_inner(input);
            if result.is_err() {
                self.restore_json(&before)?;
            }
            return result;
        }
        self.advance_json_inner(input)
    }

    fn advance_json_inner(&mut self, input: &str) -> Result<String> {
        if input.len() > 1024 * 1024 {
            return Err("batch too large".into());
        }
        let batch: Batch = serde_json::from_str(input).map_err(|e| e.to_string())?;
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
                let result = self.apply_action(action);
                ActionResult {
                    accepted: result.is_ok(),
                    projectile_id: result.as_ref().ok().and_then(|id| id.clone()),
                    reason: result.err(),
                    revision: self.revision,
                }
            })
            .collect::<Vec<_>>();
        self.advance_movement(batch.delta);
        let impacts = self.advance_projectiles(batch.delta)?;
        self.time += batch.delta;
        serde_json::to_string(&json!({"revision":self.revision,"results":results,"impacts":impacts}))
            .map_err(|e| e.to_string())
    }
    fn entity(&self, id: &str) -> Result<Entity> {
        self.ids
            .get(id)
            .copied()
            .ok_or_else(|| format!("unknown entity {id}"))
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
    fn apply_action(&mut self, action: Action) -> Result<Option<String>> {
        match action {
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
                let path = self.route_for(e, p, &destination)?;
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
                self.ecs.entity_mut(e).insert(target);
                self.state_weight += extra;
                self.routes.insert(e, path);
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
                stock.quantity -= quantity;
                self.ecs.entity_mut(e).insert(stock);
                Ok(None)
            }
            Action::Launch {
                launcher,
                ammunition,
                velocity,
            } => self.launch(&launcher, &ammunition, velocity),
            Action::Displace { entity, delta } => {
                self.displace(&entity, delta)?;
                Ok(None)
            }
        }
    }
    fn projectile_ids(&self) -> Vec<String> {
        self.ids
            .iter()
            .filter(|(_, entity)| self.ecs.get::<Projectile>(**entity).is_some())
            .map(|(id, _)| id.clone())
            .collect()
    }
    fn launch(&mut self, launcher_id: &str, ammunition: &str, velocity: Vector3) -> Result<Option<String>> {
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
        if self.projectile_ids().len() >= combat::MAX_ACTIVE_PROJECTILES || self.ids.len() >= 16384 {
            return Err("projectile capacity exhausted".into());
        }
        let radians = launcher_position.facing * std::f64::consts::FRAC_PI_2;
        let (sin, cos) = radians.sin_cos();
        let muzzle_x = cos * launcher.muzzle_x - sin * launcher.muzzle_z;
        let muzzle_z = sin * launcher.muzzle_x + cos * launcher.muzzle_z;
        let support_velocity = self.world_linear_velocity(launcher_entity, 0)?;
        let projectile_id = format!("shot.{}", self.next_projectile);
        self.next_projectile = self.next_projectile.checked_add(1).ok_or("projectile ID exhausted")?;
        lot.quantity -= 1;
        self.ecs.entity_mut(lot_entity).insert(lot);
        let projectile_entity = self.ecs.spawn((
            ExternalId(projectile_id.clone()),
            Position {
                x: launcher_position.x + muzzle_x,
                y: launcher_position.y + launcher.muzzle_y,
                z: launcher_position.z + muzzle_z,
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
            },
        )).id();
        self.ids.insert(projectile_id.clone(), projectile_entity);
        self.known.insert(projectile_id.clone());
        self.refresh_state_weight();
        if self.state_weight > STATE_BYTES {
            return Err("region canonical state capacity".into());
        }
        Ok(Some(projectile_id))
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
        let target = Point {
            x: current.x + delta.x,
            y: current.y + delta.y,
            z: current.z + delta.z,
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
        if navigation::cell(target.clone()) != navigation::cell(navigation::point(current)) {
            return Err("displacement crosses a navigation cell".into());
        }
        if self.blocked_by_frame
            .get(&self.support_id(entity))
            .is_some_and(|blocked| blocked.contains(&navigation::cell(target.clone())))
        {
            return Err("displacement enters an obstacle".into());
        }
        self.ecs.entity_mut(entity).insert(Position {
            x: target.x,
            y: target.y,
            z: target.z,
            facing: current.facing,
        });
        Ok(())
    }
    fn world_linear_velocity(&self, entity: Entity, depth: usize) -> Result<[f64; 3]> {
        if depth > 16 {
            return Err("support chain exceeds depth 16".into());
        }
        let local = *self.ecs.get::<Position>(entity).ok_or("no position")?;
        let mut velocity = [0.0; 3];
        if let Some(path) = self.routes.get(&entity) {
            if let Some(next) = path.front() {
                let speed = self.ecs.get::<Body>(entity).map_or(0.0, |body| body.speed);
                let dx = next.x - local.x;
                let dz = next.z - local.z;
                let length = (dx * dx + dz * dz).sqrt();
                if length > 1e-9 {
                    velocity[0] = dx / length * speed;
                    velocity[2] = dz / length * speed;
                }
            }
        }
        if let Some(support) = self.ecs.get::<Support>(entity) {
            let parent = self.entity(&support.entity)?;
            let parent_position = *self.ecs.get::<Position>(parent).ok_or("no support position")?;
            let parent_velocity = self.world_linear_velocity(parent, depth + 1)?;
            let radians = parent_position.facing * std::f64::consts::FRAC_PI_2;
            let (sin, cos) = radians.sin_cos();
            let rotated = [cos * velocity[0] - sin * velocity[2], velocity[1], sin * velocity[0] + cos * velocity[2]];
            velocity = [rotated[0] + parent_velocity[0], rotated[1] + parent_velocity[1], rotated[2] + parent_velocity[2]];
        }
        Ok(velocity)
    }
    fn advance_projectiles(&mut self, delta: f64) -> Result<Vec<ImpactEvent>> {
        let mut impacts = Vec::new();
        for projectile_id in self.projectile_ids() {
            let entity = self.entity(&projectile_id)?;
            let projectile = self.ecs.get::<Projectile>(entity).cloned().ok_or("missing projectile")?;
            let position = *self.ecs.get::<Position>(entity).ok_or("projectile has no position")?;
            let speed = (projectile.velocity_x * projectile.velocity_x
                + projectile.velocity_y * projectile.velocity_y
                + projectile.velocity_z * projectile.velocity_z)
                .sqrt();
            let sweep_delta = combat::sweep_interval(
                delta,
                projectile.age,
                projectile.distance,
                speed,
                projectile.max_lifetime,
                projectile.max_range,
            )
            .map_err(|error| error.to_string())?;
            if sweep_delta <= 0.0 {
                self.ecs.despawn(entity);
                self.ids.remove(&projectile_id);
                self.known.remove(&projectile_id);
                continue;
            }
            let mut candidates = Vec::new();
            for (target_id, target_entity) in &self.ids {
                if target_id == &projectile_id || target_id == &projectile.launcher {
                    continue;
                }
                let Some(collider) = self.ecs.get::<Collider>(*target_entity) else { continue };
                let target_position = self.world_pose_entity(*target_entity, 0)?;
                let target_velocity = self.world_linear_velocity(*target_entity, 0)?;
                candidates.push(collision::Collider {
                    id: target_id.clone(),
                    shape: match collider.shape {
                        ColliderShape::Ball => collision::ColliderShape::Ball { radius: collider.radius },
                        ColliderShape::Cuboid => collision::ColliderShape::Cuboid { half_extents: [collider.half_x, collider.half_y, collider.half_z] },
                    },
                    origin: [target_position.x, target_position.y, target_position.z],
                    linear_velocity: target_velocity,
                    yaw: target_position.facing * std::f64::consts::FRAC_PI_2 + collider.yaw,
                });
            }
            candidates.sort_by(|a, b| a.id.cmp(&b.id));
            let hit = collision::sweep_projectile(
                &collision::Projectile {
                    id: projectile_id.clone(),
                    radius: projectile.radius,
                    origin: [position.x, position.y, position.z],
                    linear_velocity: [projectile.velocity_x, projectile.velocity_y, projectile.velocity_z],
                },
                &candidates,
                sweep_delta,
            )
            .map_err(|error| error.to_string())?;
            if let Some(hit) = hit {
                if impacts.len() >= combat::MAX_IMPACTS_PER_STEP {
                    return Err("impact event budget exceeded".into());
                }
                let impact_id = format!("{}/impact.{}", projectile_id, self.next_impact);
                self.next_impact = self.next_impact.checked_add(1).ok_or("impact ID exhausted")?;
                impacts.push(ImpactEvent {
                    id: impact_id,
                    projectile_id: projectile_id.clone(),
                    source_id: projectile.launcher.clone(),
                    target_id: hit.target_id,
                    time: self.time + hit.time,
                    point: Vector3 { x: hit.point[0], y: hit.point[1], z: hit.point[2] },
                    normal: Vector3 { x: hit.normal[0], y: hit.normal[1], z: hit.normal[2] },
                    velocity: Vector3 { x: projectile.velocity_x, y: projectile.velocity_y, z: projectile.velocity_z },
                });
                self.ecs.despawn(entity);
                self.ids.remove(&projectile_id);
                self.known.remove(&projectile_id);
            } else if sweep_delta < delta || sweep_delta <= 0.0 {
                self.ecs.despawn(entity);
                self.ids.remove(&projectile_id);
                self.known.remove(&projectile_id);
            } else {
                let distance = projectile.distance + speed * delta;
                self.ecs.entity_mut(entity).insert((
                    Position {
                        x: position.x + projectile.velocity_x * delta,
                        y: position.y + projectile.velocity_y * delta,
                        z: position.z + projectile.velocity_z * delta,
                        facing: position.facing,
                    },
                    Projectile { age: projectile.age + delta, distance, ..projectile },
                ));
            }
        }
        self.refresh_state_weight();
        if self.state_weight > STATE_BYTES {
            return Err("region canonical state capacity".into());
        }
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
        // Split identity is selected before mutation. The moved lot retains its
        // ID so the actor's delivery plan continues to refer to the same object.
        if stock.quantity > quantity {
            if self.ids.len() >= 16384 {
                return Err("region entity capacity".into());
            }
            let mut next = self.next_lot;
            let id = loop {
                let id = format!("lot.{next}");
                next = next.checked_add(1).ok_or("lot ID exhausted")?;
                if !self.known.contains(&id) {
                    break id;
                }
            };
            let extra_lot = Lot {
                kind: stock.kind.clone(),
                quantity: stock.quantity - quantity,
                container: from.into(),
            };
            let extra = id.len() + 128 + self.registry.weight("hive.lot", &record(&extra_lot));
            if self.state_weight + extra > STATE_BYTES {
                return Err("region canonical state capacity".into());
            }
            let remainder = self.ecs.spawn((ExternalId(id.clone()), extra_lot)).id();
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
        self.contents.entry(from.into()).or_default().remove(&e);
        self.contents.entry(to.into()).or_default().insert(e);
        Ok(())
    }
    fn advance_movement(&mut self, delta: f64) {
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
    }
}
