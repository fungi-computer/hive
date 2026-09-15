//! Bounded read-only route-cost requests over the canonical movement owner.
//!
//! This module deliberately calls `Kernel::route_for`; it does not maintain a
//! second pathfinder or install a destination. Terrain page caches are the
//! only rebuildable state route preparation may touch.

use crate::components::{valid_id, Point, Position, Traversal};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

const MAX_BYTES: usize = 16 * 1024;
const MAX_REQUESTS: usize = 32;
const MAX_COORDINATE: f64 = 1_000_000.0;
const MAX_COST_METRES: f64 = 1.0e9;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Request {
    actor: String,
    target: Point,
    #[serde(default, rename = "excavationTarget")]
    excavation_target: Option<[i32; 3]>,
}

#[derive(Serialize)]
#[serde(tag = "status", rename_all = "camelCase")]
enum Result {
    Reachable { actor: String, cost: f64 },
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
    let mut previous = crate::navigation::point(start);
    let mut cost = 0.0;
    for point in points {
        let segment = crate::navigation::distance(previous.clone(), point.clone());
        if !segment.is_finite() {
            return Err("route metric cost is not finite".into());
        }
        let next = cost + segment;
        if !next.is_finite() || next > MAX_COST_METRES {
            return Err("route metric cost exceeds bound".into());
        }
        cost = next;
        previous = point;
    }
    Ok(cost)
}

/// Terrain actors can price many possible jobs from one disposable search
/// frontier. Unsupported movement states fall back to the ordinary route owner
/// so in-flight prefixes and non-terrain frames keep their exact semantics.
fn shared_terrain_costs(
    kernel: &mut super::Kernel,
    entity: bevy_ecs::prelude::Entity,
    start: Position,
    targets: &[Point],
) -> crate::components::Result<Option<Vec<crate::components::Result<f64>>>> {
    if kernel.support_id(entity).is_some() || kernel.ecs.get::<Traversal>(entity).is_none() {
        return Ok(None);
    }
    let blocked = kernel.blocked_by_frame.get(&None).cloned().ok_or("missing obstacle frame index")?;
    let environment = kernel.environment.as_mut().ok_or("terrain traversal needs environment")?;
    let spacing = environment.world.cell_spacing_m();
    let to_cell = |point: &Point| -> crate::components::Result<crate::generation::Cell> {
        let values = [point.x / spacing[0], point.y / spacing[1] - 0.5, point.z / spacing[2]];
        if !values.iter().all(|value| value.is_finite() && *value >= f64::from(i32::MIN) && *value <= f64::from(i32::MAX)) {
            return Err("terrain route metric position is not finite".into());
        }
        Ok(crate::generation::Cell { x: values[0].round() as i64, y: values[1].round() as i32, z: values[2].round() as i64 })
    };
    let start_point = crate::navigation::point(start);
    let start_cell = to_cell(&start_point)?;
    let centered = Point {
        x: start_cell.x as f64 * spacing[0],
        y: (f64::from(start_cell.y) + 0.5) * spacing[1],
        z: start_cell.z as f64 * spacing[2],
        frame: None,
    };
    if start_point != centered {
        return Ok(None);
    }
    let destinations = targets.iter().map(to_cell).collect::<crate::components::Result<Vec<_>>>()?;
    let capability = *kernel.ecs.get::<Traversal>(entity).expect("checked traversal capability");
    let config = crate::terrain_traversal::TraversalConfig {
        spacing,
        clearance_cells: capability.clearance_cells,
        max_step_cells: capability.max_step_cells,
    };
    let stairs = environment.world.stair_edges().to_vec();
    let obstacle = |cell: crate::generation::Cell| {
        i32::try_from(cell.x).ok().zip(i32::try_from(cell.z).ok()).is_some_and(|(x, z)| {
            let y = ((f64::from(cell.y) + 0.5) * spacing[1]).round() as i32;
            blocked.contains(&(x, y, z))
        })
    };
    let mut query = |cell| environment.world.traversal_material(cell);
    let paths = crate::terrain_route::search_many_with_blocked_and_stairs(
        start_cell, &destinations, config, &mut query, &obstacle, &stairs,
    )?;
    let costs = paths.into_iter().map(|path| {
        let points = crate::terrain_route::waypoints_with_stairs(&path?, config, &stairs)?;
        route_cost(start, points)
    }).collect();
    Ok(Some(costs))
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

    let mut results: Vec<Option<Result>> = (0..prepared.len()).map(|_| None).collect();
    let mut groups = BTreeMap::<String, Vec<(usize, bevy_ecs::prelude::Entity, Position, Point)>>::new();
    for (index, item) in prepared.into_iter().enumerate() {
        match item {
            Prepared::Immediate(result) => results[index] = Some(result),
            Prepared::Search { actor, entity, start, target } => {
                groups.entry(actor).or_default().push((index, entity, start, target));
            }
        }
    }
    for (actor, group) in groups {
        let (_, entity, start, _) = group[0];
        let targets = group.iter().map(|(_, _, _, target)| target.clone()).collect::<Vec<_>>();
        if let Some(costs) = shared_terrain_costs(kernel, entity, start, &targets)? {
            for ((index, _, _, _), cost) in group.into_iter().zip(costs) {
                results[index] = Some(match cost {
                    Ok(cost) => Result::Reachable { actor: actor.clone(), cost },
                    Err(reason) if unavailable_error(&reason) => Result::Unavailable { actor: actor.clone(), reason },
                    Err(error) => return Err(error),
                });
            }
            continue;
        }
        for (index, entity, start, target) in group {
            results[index] = Some(match kernel.route_for(entity, start, &target) {
                Ok(prepared) => Result::Reachable { actor: actor.clone(), cost: route_cost(start, prepared.points)? },
                Err(reason) if unavailable_error(&reason) => Result::Unavailable { actor: actor.clone(), reason },
                Err(error) => return Err(error),
            });
        }
    }
    let results = results.into_iter().map(|result| result.expect("every prepared route has a result")).collect::<Vec<_>>();
    serde_json::to_string(&results).map_err(|error| error.to_string())
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
    fn route_cost_uses_saved_terrain_prefix_without_mutating_midroute_or_suspended_state() {
        let (mut kernel, target) = climbing_world();
        kernel.advance_json(&json!({
            "delta": 0.1, "writes": [], "actions": [{
                "kind": "move", "entity": "walker", "destination": target
            }]
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
            "delta": 0.0, "writes": [], "actions": [{
                "kind": "move", "entity": "walker",
                "destination": { "x": stopped.x, "y": stopped.y, "z": stopped.z, "frame": null }
            }]
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
