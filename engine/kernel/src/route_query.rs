//! Bounded read-only route-cost requests over the canonical movement owner.
//!
//! This module deliberately calls `Kernel::route_for`; it does not maintain a
//! second pathfinder or install a destination. Failed terrain cost queries are
//! remembered only under identical physical geometry, blockers and endpoints.

use crate::components::{valid_id, Point, Position};
use serde::{Deserialize, Serialize};

const MAX_BYTES: usize = 16 * 1024;
const MAX_REQUESTS: usize = 32;
const MAX_COORDINATE: f64 = 1_000_000.0;
const MAX_COST_METRES: f64 = 1.0e9;

#[derive(Clone, PartialEq, Eq, PartialOrd, Ord)]
struct FailureKey {
    coordinates: [u64; 6],
    clearance: u8,
    step: u8,
}

#[derive(Default)]
pub(super) struct FailureCache {
    revision: Option<u64>,
    blocked: std::collections::BTreeSet<crate::navigation::Cell>,
    entries: std::collections::BTreeMap<Vec<(String, FailureKey)>, String>,
}

impl FailureCache {
    fn synchronize(&mut self, revision: u64, blocked: &std::collections::BTreeSet<crate::navigation::Cell>) {
        if self.revision != Some(revision) || self.blocked != *blocked {
            self.entries.clear();
            self.revision = Some(revision);
            self.blocked.clone_from(blocked);
        }
    }
    fn remember(&mut self, key: Vec<(String, FailureKey)>, reason: String) {
        if self.entries.len() >= 64 { self.entries.clear(); }
        self.entries.insert(key, reason);
    }
}

fn failure_key(kernel: &super::Kernel, entity: bevy_ecs::prelude::Entity, start: Position, target: &Point) -> Option<FailureKey> {
    // In-flight terrain prefixes and moving support frames have additional
    // dependencies. Keep those on the existing uncached route path.
    if target.frame.is_some() || kernel.support_id(entity).is_some() || kernel.terrain_routes.contains_key(&entity) {
        return None;
    }
    kernel.environment.as_ref()?;
    let traversal = kernel.ecs.get::<crate::components::Traversal>(entity)?;
    Some(FailureKey {
        coordinates: [start.x, start.y, start.z, target.x, target.y, target.z].map(f64::to_bits),
        clearance: traversal.clearance_cells,
        step: traversal.max_step_cells,
    })
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Request {
    actor: String,
    target: Point,
    #[serde(default, rename = "excavationTarget")]
    excavation_target: Option<[i32; 3]>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct AnyRequest {
    actor: String,
    targets: Vec<Point>,
    #[serde(default)]
    excavation_target: Option<[i32; 3]>,
}

#[derive(Serialize)]
#[serde(tag = "status", rename_all = "camelCase")]
enum Result {
    Reachable { actor: String, cost: f64 },
    Unavailable { actor: String, reason: String },
}

#[derive(Serialize)]
#[serde(tag = "status", rename_all = "camelCase")]
enum AnyResult {
    Reachable { actor: String, #[serde(rename = "targetIndex")] target_index: usize, cost: f64 },
    Unavailable { actor: String, reason: String },
}

fn finite_point(point: &Point) -> bool {
    [point.x, point.y, point.z]
        .iter()
        .all(|value| value.is_finite() && value.abs() <= MAX_COORDINATE)
}

fn unavailable_error(error: &str) -> bool {
    matches!(
        error,
        "destination frame does not match actor support"
            | "destination is occupied"
            | "no vertical transition configured in this scene"
            | "no route within local search budget"
            | "no supported terrain route"
            | "route endpoint lacks support or clearance"
            | "retained terrain contact is no longer traversable"
            | "terrain route exceeds local search budget"
            | "terrain route waypoint budget exceeded"
            | "point is outside support surface"
    )
}

fn route_cost(start: Position, points: impl IntoIterator<Item = Point>) -> crate::components::Result<f64> {
    let mut route = vec![crate::navigation::point(start)];
    route.extend(points);
    let cost = crate::terrain_route::waypoint_cost_micrometres(route)? as f64 / 1_000_000.0;
    (cost <= MAX_COST_METRES).then_some(cost).ok_or("route metric cost exceeds bound".into())
}

pub(super) fn execute(kernel: &mut super::Kernel, input: &str) -> crate::components::Result<String> {
    if input.len() > MAX_BYTES {
        return Err("route-cost request exceeds input budget".into());
    }
    let requests: Vec<Request> = serde_json::from_str(input).map_err(|error| error.to_string())?;
    if requests.is_empty() || requests.len() > MAX_REQUESTS {
        return Err("route-cost request must contain 1..32 entries".into());
    }

    // Complete request validation happens before the first route search or
    // page-cache touch, so malformed batches cannot produce partial results.
    for request in &requests {
        if !valid_id(&request.actor) {
            return Err("route-cost actor ID is invalid".into());
        }
        if !finite_point(&request.target) {
            return Err("route-cost target must be finite and bounded".into());
        }
        if request.target.frame.as_deref().is_some_and(|frame| !valid_id(frame)) {
            return Err("route-cost target frame is invalid".into());
        }
    }

    enum Prepared {
        Immediate(Result),
        Search { actor: String, entity: bevy_ecs::prelude::Entity, start: Position, target: Point },
    }
    let mut prepared = Vec::with_capacity(requests.len());
    for request in requests {
        let entity = match kernel.entity(&request.actor) {
            Ok(entity) => entity,
            Err(_) => {
                prepared.push(Prepared::Immediate(Result::Unavailable { actor: request.actor, reason: "unknown actor".into() }));
                continue;
            }
        };
        let Some(start) = kernel.ecs.get::<Position>(entity).copied() else {
            prepared.push(Prepared::Immediate(Result::Unavailable { actor: request.actor, reason: "actor has no position".into() }));
            continue;
        };
        if kernel.ecs.get::<crate::components::Body>(entity).is_none() {
            prepared.push(Prepared::Immediate(Result::Unavailable { actor: request.actor, reason: "actor has no movement capability".into() }));
            continue;
        }
        let support = kernel.support_id(entity);
        if request.target.frame.as_ref() != support.as_ref() {
            prepared.push(Prepared::Immediate(Result::Unavailable { actor: request.actor, reason: "destination frame does not match actor support".into() }));
            continue;
        }
        if let Some([x, y, z]) = request.excavation_target {
            let reachable_work = request.target.frame.is_none() && kernel.environment.as_ref().is_some_and(|environment| {
                super::excavation_work::within_reach([request.target.x, request.target.y, request.target.z],
                    crate::generation::Cell { x: i64::from(x), y, z: i64::from(z) }, environment.world.cell_spacing_m())
            });
            if !reachable_work {
                prepared.push(Prepared::Immediate(Result::Unavailable { actor: request.actor,
                    reason: "approach is outside excavation reach".into() }));
                continue;
            }
        }
        prepared.push(Prepared::Search { actor: request.actor, entity, start, target: request.target });
    }

    let result_count = prepared.len();
    let mut results: Vec<Option<Result>> = (0..result_count).map(|_| None).collect();
    if let Some(environment) = &kernel.environment {
        if let Some(blocked) = kernel.blocked_by_frame.get(&None) {
            kernel.route_cost_failures.synchronize(environment.world.terrain_revision(), blocked);
        }
    }
    // Memoize the exact ordered batch, not individual failed targets: a
    // shared search budget can fail a batch that succeeds as separate queries.
    let batch_key: Option<Vec<_>> = prepared.iter().map(|item| match item {
        Prepared::Search { actor, entity, start, target } => failure_key(kernel, *entity, *start, target).map(|key| (actor.clone(), key)),
        Prepared::Immediate(_) => None,
    }).collect();
    if let Some(key) = &batch_key {
        if let Some(response) = kernel.route_cost_failures.entries.get(key) { return Ok(response.clone()); }
    }
    let mut groups: std::collections::BTreeMap<bevy_ecs::prelude::Entity, Vec<(usize, String, Position, Point)>> = std::collections::BTreeMap::new();
    for (index, item) in prepared.into_iter().enumerate() {
        match item {
            Prepared::Immediate(result) => results[index] = Some(result),
            Prepared::Search { actor, entity, start, target } => groups.entry(entity).or_default().push((index, actor, start, target)),
        }
    }
    for (entity, entries) in groups {
        let start = entries[0].2;
        let targets: Vec<_> = entries.iter().map(|entry| entry.3.clone()).collect();
        let routes = match kernel.route_for_many(entity, start, &targets) {
            Ok(routes) => routes,
            Err(error) if unavailable_error(&error) => {
                for (index, actor, _, _) in entries {
                    results[index] = Some(Result::Unavailable { actor, reason: error.clone() });
                }
                continue;
            }
            Err(error) => return Err(error),
        };
        for ((index, actor, _, _), route) in entries.into_iter().zip(routes) {
            match route {
                Ok(prepared) => {
                    let cost = route_cost(start, prepared.points)?;
                    results[index] = Some(Result::Reachable { actor, cost });
                }
                Err(error) if unavailable_error(&error) => results[index] = Some(Result::Unavailable { actor, reason: error }),
                Err(error) => return Err(error),
            }
        }
    }
    let results: Vec<_> = results.into_iter().map(|result| result.ok_or("route-cost result missing".into())).collect::<crate::components::Result<_>>()?;
    let response = serde_json::to_string(&results).map_err(|error| error.to_string())?;
    if results.iter().any(|result| matches!(result, Result::Unavailable { .. })) {
        if let Some(key) = batch_key { kernel.route_cost_failures.remember(key, response.clone()); }
    }
    Ok(response)
}

pub(super) fn execute_any(kernel: &mut super::Kernel, input: &str) -> crate::components::Result<String> {
    if input.len() > MAX_BYTES { return Err("route-to-any request exceeds input budget".into()); }
    let request: AnyRequest = serde_json::from_str(input).map_err(|error| error.to_string())?;
    if !valid_id(&request.actor) { return Err("route-to-any actor ID is invalid".into()); }
    if request.targets.is_empty() || request.targets.len() > MAX_REQUESTS {
        return Err("route-to-any request must contain 1..32 targets".into());
    }
    for target in &request.targets {
        if !finite_point(target) { return Err("route-to-any target must be finite and bounded".into()); }
        if target.frame.as_deref().is_some_and(|frame| !valid_id(frame)) {
            return Err("route-to-any target frame is invalid".into());
        }
    }
    let entity = match kernel.entity(&request.actor) {
        Ok(entity) => entity,
        Err(_) => return serde_json::to_string(&AnyResult::Unavailable { actor:request.actor, reason:"unknown actor".into() }).map_err(|error| error.to_string()),
    };
    let Some(start) = kernel.ecs.get::<Position>(entity).copied() else {
        return serde_json::to_string(&AnyResult::Unavailable { actor:request.actor, reason:"actor has no position".into() }).map_err(|error| error.to_string());
    };
    if kernel.ecs.get::<crate::components::Body>(entity).is_none() {
        return serde_json::to_string(&AnyResult::Unavailable { actor:request.actor, reason:"actor has no movement capability".into() }).map_err(|error| error.to_string());
    }
    let support = kernel.support_id(entity);
    let has_matching_frame = request.targets.iter().any(|target| target.frame.as_ref() == support.as_ref());
    let indexed: Vec<_> = request.targets.into_iter().enumerate().filter(|(_,target)| {
        if target.frame.as_ref() != support.as_ref() { return false; }
        let Some([x,y,z]) = request.excavation_target else { return true };
        target.frame.is_none() && kernel.environment.as_ref().is_some_and(|environment| {
            super::excavation_work::within_reach(
                [target.x,target.y,target.z], crate::generation::Cell { x:i64::from(x),y,z:i64::from(z) },
                environment.world.cell_spacing_m(),
            )
        })
    }).collect();
    if indexed.is_empty() {
        let reason = if has_matching_frame { "approach is outside excavation reach" } else { "destination frame does not match actor support" };
        return serde_json::to_string(&AnyResult::Unavailable { actor:request.actor, reason:reason.into() }).map_err(|error| error.to_string());
    }
    let targets: Vec<_> = indexed.iter().map(|(_,target)| target.clone()).collect();
    let result = match kernel.route_for_any(entity,start,&targets) {
        Ok((local_index,prepared)) => AnyResult::Reachable {
            actor:request.actor,
            target_index:indexed.get(local_index).ok_or("route-to-any selected an unknown target")?.0,
            cost:route_cost(start,prepared.points)?,
        },
        Err(error) if unavailable_error(&error) => AnyResult::Unavailable { actor:request.actor, reason:error },
        Err(error) => return Err(error),
    };
    serde_json::to_string(&result).map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::world::Kernel;
    use serde_json::{json, Value};
    use std::collections::BTreeMap;

    fn scene(with_obstacle: bool) -> String {
        let mut initial = vec![json!({
            "id": "mover",
            "components": {
                "hive.position": { "x": 0.0, "y": 0.0, "z": 0.0, "facing": 0.0 },
                "hive.body": { "speed": 1.0 }
            }
        })];
        if with_obstacle {
            initial.push(json!({
                "id": "rock",
                "components": {
                    "hive.position": { "x": 1.0, "y": 0.0, "z": 0.0, "facing": 0.0 },
                    "hive.obstacle": { "occupied": true }
                }
            }));
        }
        serde_json::to_string(&json!({
            "format": "hive-game", "version": 1, "game": "route-cost",
            "components": [], "initial": initial
        })).unwrap()
    }

    fn query(kernel: &mut Kernel, requests: Value) -> Value {
        serde_json::from_str(&kernel.route_costs_json(&requests.to_string()).unwrap()).unwrap()
    }

    fn query_any(kernel: &mut Kernel, request: Value) -> Value {
        serde_json::from_str(&kernel.route_to_any_json(&request.to_string()).unwrap()).unwrap()
    }

    fn climbing_world() -> (Kernel, Point) {
        let mut kernel = Kernel::new();
        kernel.load(&json!({
            "format": "hive-game", "version": 1, "game": "climbing-cost",
            "components": [], "initial": [{ "id": "walker", "components": {
                "hive.position": { "x": 0, "y": 0, "z": 0, "facing": 0 },
                "hive.body": { "speed": 1 },
                "hive.traversal": { "clearanceCells": 1, "maxStepCells": 1 }
            }}]
        }).to_string()).unwrap();
        kernel.load_environment(&crate::environment_definition::tests::fixture("climb-recovery")).unwrap();
        let columns: Vec<_> = (-7..7).flat_map(|x| (-7..7).map(move |z| (x, z))).collect();
        let mut surfaces = Vec::new();
        for batch in columns.chunks(64) {
            surfaces.extend(kernel.environment.as_mut().unwrap().world.surface_cells(batch).unwrap());
        }
        let cells: BTreeMap<_, _> = surfaces.into_iter().flatten()
            .map(|surface| ((surface.cell.x, surface.cell.z), surface.cell)).collect();
        let actor = kernel.entity("walker").unwrap();
        for (&(x, z), start) in &cells {
            let Some(end) = cells.get(&(x + 1, z)) else { continue };
            if end.y != start.y { continue; }
            let world = &mut kernel.environment.as_mut().unwrap().world;
            let expected = world.material(*start).unwrap();
            let crate::terrain_water::ExcavationResult::Prepared(change) = world.prepare_excavation(*start, expected, 0).unwrap() else { continue };
            world.apply_excavation(change).unwrap();
            let start = crate::generation::Cell { y: start.y - 1, ..*start };
            let pose = Position { x: x as f64, y: (f64::from(start.y) + 0.5) * 0.54, z: z as f64, facing: 0.0 };
            let target = Point { x: end.x as f64, y: (f64::from(end.y) + 0.5) * 0.54, z: end.z as f64, frame: None };
            kernel.ecs.entity_mut(actor).insert(pose);
            if kernel.route_for(actor, pose, &target).is_ok() { return (kernel, target); }
        }
        panic!("climbing fixture did not admit a terrain route");
    }

    #[test]
    fn failed_terrain_cost_is_reused_until_blockers_change_without_changing_saved_state() {
        let (mut kernel, target) = climbing_world();
        let obstacle = (target.x.round() as i32, target.y.round() as i32, target.z.round() as i32);
        kernel.blocked_by_frame.entry(None).or_default().insert(obstacle);
        let request = json!([{ "actor": "walker", "target": target }]);
        let before = kernel.snapshot_entities_json().unwrap();
        let first = query(&mut kernel, request.clone());
        assert_eq!(first[0]["status"], "unavailable");
        assert_eq!(kernel.route_cost_failures.entries.len(), 1);
        assert_eq!(query(&mut kernel, request.clone()), first);
        assert_eq!(kernel.snapshot_entities_json().unwrap(), before);
        kernel.blocked_by_frame.get_mut(&None).unwrap().remove(&obstacle);
        assert_eq!(query(&mut kernel, request)[0]["status"], "reachable");
        assert!(kernel.route_cost_failures.entries.is_empty());
    }

    #[test]
    fn failed_batch_does_not_answer_a_different_batch_and_discard_blocks_queries() {
        let (mut kernel, target) = climbing_world();
        let actor = kernel.entity("walker").unwrap();
        let start = *kernel.ecs.get::<Position>(actor).unwrap();
        let blocked = (target.x.round() as i32, target.y.round() as i32, target.z.round() as i32);
        kernel.blocked_by_frame.entry(None).or_default().insert(blocked);
        let singleton = json!([{ "actor": "walker", "target": target }]);
        assert_eq!(query(&mut kernel, singleton)[0]["status"], "unavailable");
        let batch = query(&mut kernel, json!([
            { "actor": "walker", "target": target },
            { "actor": "walker", "target": {"x":start.x,"y":start.y,"z":start.z,"frame":null} }
        ]));
        assert_eq!(batch.as_array().unwrap().len(), 2);
        assert_eq!(batch[1]["status"], "reachable");
        assert_eq!(kernel.route_cost_failures.entries.len(), 2);
        kernel.discard_required = true;
        assert_eq!(kernel.route_costs_json("[]").unwrap_err(), "kernel attempt requires durable restore");
        assert_eq!(kernel.route_cost_failures.entries.len(), 2);
    }

    #[test]
    fn failure_cache_drops_geometry_results_and_is_bounded() {
        let mut cache = super::FailureCache::default();
        let blocked = Default::default();
        cache.synchronize(1, &blocked);
        for i in 0..300 {
            cache.remember(vec![("actor".into(), super::FailureKey { coordinates: [i; 6], clearance: 2, step: 1 })], "no supported terrain route".into());
            assert!(cache.entries.len() <= 64);
        }
        cache.synchronize(2, &blocked);
        assert!(cache.entries.is_empty());
    }

    #[test]
    fn route_cost_uses_authoritative_detour_and_is_read_only() {
        let mut kernel = Kernel::new();
        kernel.load(&scene(true)).unwrap();
        let before = kernel.snapshot_json().unwrap();
        let response = query(&mut kernel, json!([{
            "actor": "mover",
            "target": { "x": 2.0, "y": 0.0, "z": 0.0, "frame": null }
        }]));
        assert_eq!(response[0]["status"], "reachable");
        assert!(response[0]["cost"].as_f64().unwrap() > 2.0);
        assert_eq!(kernel.snapshot_json().unwrap(), before);
    }

    #[test]
    fn route_cost_reports_unavailable_without_swallowing_malformed_requests() {
        let mut kernel = Kernel::new();
        kernel.load(&scene(true)).unwrap();
        let response = query(&mut kernel, json!([{
            "actor": "mover",
            "target": { "x": 1.0, "y": 0.0, "z": 0.0, "frame": null }
        }]));
        assert_eq!(response[0]["status"], "unavailable");
        assert_eq!(response[0]["reason"], "destination is occupied");
        assert!(kernel.route_costs_json(r#"[{"actor":"mover","target":{"x":0,"y":0,"z":0,"frame":null,"extra":true}}]"#).is_err());
    }

    #[test]
    fn route_to_any_selects_the_cheapest_reachable_input_and_is_read_only() {
        let mut kernel = Kernel::new();
        kernel.load(&scene(true)).unwrap();
        let before = kernel.snapshot_json().unwrap();
        let response = query_any(&mut kernel,json!({
            "actor":"mover",
            "targets":[
                { "x":4.0,"y":0.0,"z":0.0,"frame":null },
                { "x":0.0,"y":0.0,"z":1.0,"frame":null }
            ]
        }));
        assert_eq!(response["status"],"reachable");
        assert_eq!(response["targetIndex"],1);
        assert_eq!(response["cost"],1.0);
        assert_eq!(kernel.snapshot_json().unwrap(),before);
    }

    #[test]
    fn route_to_any_validates_the_whole_request_before_search() {
        let mut kernel = Kernel::new();
        kernel.load(&scene(false)).unwrap();
        assert!(kernel.route_to_any_json(r#"{"actor":"mover","targets":[{"x":0,"y":0,"z":0,"frame":null},{"x":1,"y":0,"z":0,"frame":null,"extra":true}]}"#).is_err());
    }

    #[test]
    fn route_to_any_preserves_input_index_when_another_frame_is_filtered() {
        let mut kernel = Kernel::new();
        kernel.load(&scene(true)).unwrap();
        let response = query_any(&mut kernel,json!({
            "actor":"mover",
            "targets":[
                { "x":0.0,"y":0.0,"z":0.0,"frame":"another-frame" },
                { "x":0.0,"y":0.0,"z":1.0,"frame":null }
            ]
        }));
        assert_eq!(response["status"],"reachable");
        assert_eq!(response["targetIndex"],1);
    }

    #[test]
    fn route_cost_uses_saved_terrain_prefix_without_mutating_midroute_or_suspended_state() {
        let (mut kernel, target) = climbing_world();
        kernel.advance_json(&json!({
            "delta": 0.1, "writes": [], "actions": [{"scope":{"kind":"host"},"request":{
                "kind": "move", "entity": "walker", "destination": target
            }}]
        }).to_string()).unwrap();
        let actor = kernel.entity("walker").unwrap();
        let midroute = kernel.snapshot_entities_json().unwrap();
        let response = query(&mut kernel, json!([{
            "actor": "walker", "target": target
        }]));
        assert_eq!(response[0]["status"], "reachable");
        assert!(response[0]["cost"].as_f64().unwrap() > 0.0);
        assert_eq!(kernel.snapshot_entities_json().unwrap(), midroute);

        let stopped = *kernel.ecs.get::<Position>(actor).unwrap();
        kernel.advance_json(&json!({
            "delta": 0.0, "writes": [], "actions": [{"scope":{"kind":"host"},"request":{
                "kind": "move", "entity": "walker",
                "destination": { "x": stopped.x, "y": stopped.y, "z": stopped.z, "frame": null }
            }}]
        }).to_string()).unwrap();
        assert!(kernel.terrain_routes.get(&actor).is_some_and(|state| state.suspended));
        let suspended = kernel.snapshot_entities_json().unwrap();
        let response = query(&mut kernel, json!([{
            "actor": "walker", "target": target
        }]));
        assert_eq!(response[0]["status"], "reachable");
        assert!(response[0]["cost"].as_f64().unwrap() > 0.0);
        assert_eq!(kernel.snapshot_entities_json().unwrap(), suspended);
    }
}
