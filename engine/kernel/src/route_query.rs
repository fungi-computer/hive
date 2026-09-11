//! Bounded read-only route-cost requests over the canonical movement owner.
//!
//! This module deliberately calls `Kernel::route_for`; it does not maintain a
//! second pathfinder or install a destination. Terrain page caches are the
//! only rebuildable state route preparation may touch.

use crate::components::{valid_id, Point, Position};
use serde::{Deserialize, Serialize};

const MAX_BYTES: usize = 16 * 1024;
const MAX_REQUESTS: usize = 32;
const MAX_COORDINATE: f64 = 1_000_000.0;
const MAX_COST_METRES: f64 = 1.0e9;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Request {
    actor: String,
    target: Point,
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
        prepared.push(Prepared::Search { actor: request.actor, entity, start, target: request.target });
    }

    let mut results = Vec::with_capacity(prepared.len());
    for item in prepared {
        match item {
            Prepared::Immediate(result) => results.push(result),
            Prepared::Search { actor, entity, start, target } => match kernel.route_for(entity, start, &target) {
            Ok(prepared) => {
                let cost = route_cost(start, prepared.points)?;
                results.push(Result::Reachable { actor, cost });
            }
            Err(error) if unavailable_error(&error) => {
                results.push(Result::Unavailable { actor, reason: error });
            }
            Err(error) => return Err(error),
            },
        }
    }
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
