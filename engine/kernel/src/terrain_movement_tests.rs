use super::*;

fn climbing_world() -> (Kernel, Point) {
    let mut kernel = Kernel::new();
    kernel.load(&json!({"format":"hive-game","version":3,"game":"climbing","components":[],"materialCatalog":[],"initial":[{"id":"walker","components":{
        "hive.position":{"x":0,"y":0,"z":0,"facing":0},
        "hive.body":{"speed":1},"hive.traversal":{"clearanceCells":1,"maxStepCells":1}
    }}]}).to_string()).unwrap();
    kernel.load_environment(&crate::environment_definition::tests::fixture("climb-recovery")).unwrap();
    let columns: Vec<_> = (-7..7).flat_map(|x| (-7..7).map(move |z| (x,z))).collect();
    let mut surfaces = Vec::new();
    for batch in columns.chunks(64) {
        surfaces.extend(kernel.environment.as_mut().unwrap().world.surface_cells(batch).unwrap());
    }
    let cells: BTreeMap<_,_> = surfaces.into_iter().flatten().map(|s| ((s.cell.x,s.cell.z),s.cell)).collect();
    let actor = kernel.entity("walker").unwrap();
    for (&(x,z), start) in &cells {
        let Some(end) = cells.get(&(x+1,z)) else { continue };
        if end.y != start.y { continue; }
        let world = &mut kernel.environment.as_mut().unwrap().world;
        let expected = world.material(*start).unwrap();
        let crate::terrain_water::ExcavationResult::Prepared(change) = world.prepare_excavation(*start,expected,0).unwrap() else { continue };
        world.apply_excavation(change).unwrap();
        let start = crate::generation::Cell { y:start.y-1, ..*start };
        let pose = Position{x:x as f64,y:(f64::from(start.y)+0.5)*0.54,z:z as f64,facing:0.0};
        let target = Point{x:end.x as f64,y:(f64::from(end.y)+0.5)*0.54,z:end.z as f64,frame:None};
        kernel.ecs.entity_mut(actor).insert(pose);
        if kernel.route_for(actor,pose,&target).is_ok() { return (kernel,target); }
    }
    panic!("excavated generated fixture must admit a one-voxel climb");
}

#[test]
fn terrain_kernel_climb_recovers_after_every_partial_segment() {
    let (mut kernel,target) = climbing_world();
    kernel.advance_json(&json!({"delta":0.0,"writes":[],"actions":[{"scope":{"kind":"host"},"request":{"kind":"move","entity":"walker","destination":target}}]}).to_string()).unwrap();
    for _ in 0..20 {
        kernel.advance_json(r#"{"delta":0.1,"writes":[],"actions":[]}"#).unwrap();
        let saved = kernel.save_records().unwrap();
        let mut recovered = Kernel::new();
        recovered.restore_records(&saved).expect("valid in-flight climb must restore");
        kernel = recovered;
    }
    let position = kernel.ecs.get::<Position>(kernel.entity("walker").unwrap()).unwrap();
    assert!((position.x-target.x).abs()<1e-9 && (position.y-target.y).abs()<1e-9);
}

#[test]
fn terrain_kernel_rejects_forged_waiting_waypoints() {
    let (mut kernel,target) = climbing_world();
    kernel.advance_json(&json!({"delta":0.1,"writes":[],"actions":[{"scope":{"kind":"host"},"request":{"kind":"move","entity":"walker","destination":target}}]}).to_string()).unwrap();
    let mut saved = kernel.save_records().unwrap();
    let mut data: serde_json::Value = serde_json::from_str(&saved.entities).unwrap();
    data["routes"][0]["terrain_waiting"] = json!(true);
    data["routes"][0]["path"][0]["x"] = json!(1000);
    saved.entities = data.to_string();
    assert!(Kernel::new().restore_records(&saved).is_err(), "waiting cannot bypass physical route validation");
}

#[test]
fn terrain_kernel_waiting_replans_and_resumes_after_recovery() {
    let (mut kernel,target) = climbing_world();
    kernel.advance_json(&json!({"delta":0.1,"writes":[],"actions":[{"scope":{"kind":"host"},"request":{"kind":"move","entity":"walker","destination":target}}]}).to_string()).unwrap();
    let actor = kernel.entity("walker").unwrap();
    kernel.terrain_routes.get_mut(&actor).unwrap().waiting = true;
    let pose = *kernel.ecs.get::<Position>(actor).unwrap();
    let saved = kernel.save_records().unwrap();
    let mut recovered = Kernel::new();
    recovered.restore_records(&saved).unwrap();
    recovered.advance_json(r#"{"delta":0.0,"writes":[],"actions":[]}"#).unwrap();
    let actor = recovered.entity("walker").unwrap();
    assert!(!recovered.terrain_routes[&actor].waiting, "reopened waiting route must replan");
    assert!(recovered.ecs.get::<Destination>(actor).is_some());
    let after = recovered.ecs.get::<Position>(actor).unwrap();
    assert_eq!((after.x,after.y,after.z),(pose.x,pose.y,pose.z));
    for _ in 0..20 { recovered.advance_json(r#"{"delta":0.1,"writes":[],"actions":[]}"#).unwrap(); }
    let reached = recovered.ecs.get::<Position>(actor).unwrap();
    assert!((reached.x-target.x).abs()<1e-9 && (reached.y-target.y).abs()<1e-9 && (reached.z-target.z).abs()<1e-9);
}

#[test]
fn terrain_route_invalidated_by_revision_replans_through_native_owner() {
    let (mut kernel, target) = climbing_world();
    let actor = kernel.entity("walker").unwrap();
    kernel.advance_json(&json!({"delta":0.1,"writes":[],"actions":[{"scope":{"kind":"host"},"request":{"kind":"move","entity":"walker","destination":target}}]}).to_string()).unwrap();
    let before = *kernel.ecs.get::<Position>(actor).unwrap();
    kernel.terrain_routes.get_mut(&actor).unwrap().waiting = true;
    kernel.terrain_routes.get_mut(&actor).unwrap().revision = None;

    kernel.advance_movement(0.0).unwrap();

    let state = kernel.terrain_routes.get(&actor).unwrap();
    assert!(!state.waiting, "a changed terrain route must get one native replan");
    assert!(kernel.ecs.get::<Destination>(actor).is_some());
    assert_eq!(*kernel.ecs.get::<Position>(actor).unwrap(), before, "replanning cannot teleport the actor");
    for _ in 0..20 { kernel.advance_movement(0.1).unwrap(); }
    let reached = kernel.ecs.get::<Position>(actor).unwrap();
    assert!((reached.x-target.x).abs()<1e-9 && (reached.y-target.y).abs()<1e-9 && (reached.z-target.z).abs()<1e-9);
}

#[test]
fn unreachable_invalidated_terrain_route_releases_destination() {
    let (mut kernel, target) = climbing_world();
    let actor = kernel.entity("walker").unwrap();
    kernel.advance_json(&json!({"delta":0.0,"writes":[],"actions":[{"scope":{"kind":"host"},"request":{"kind":"move","entity":"walker","destination":target}}]}).to_string()).unwrap();
    let spacing = kernel.environment.as_ref().unwrap().world.cell_spacing_m();
    kernel.blocked_by_frame.get_mut(&None).unwrap().insert((
        (target.x / spacing[0]).round() as i32,
        target.y.round() as i32,
        (target.z / spacing[2]).round() as i32,
    ));
    kernel.terrain_routes.get_mut(&actor).unwrap().waiting = true;
    kernel.terrain_routes.get_mut(&actor).unwrap().revision = None;

    kernel.advance_movement(0.0).unwrap();

    assert!(kernel.ecs.get::<Destination>(actor).is_none(), "unreachable movement must release its caller lock");
    assert!(!kernel.routes.contains_key(&actor));
    assert!(!kernel.terrain_routes.contains_key(&actor));
}

#[test]
fn terrain_kernel_same_position_move_has_no_pending_route() {
    let (mut kernel,_) = climbing_world();
    let actor = kernel.entity("walker").unwrap();
    let pose = *kernel.ecs.get::<Position>(actor).unwrap();
    kernel.advance_json(&json!({"delta":0.0,"writes":[],"actions":[{"scope":{"kind":"host"},"request":{"kind":"move","entity":"walker","destination":{"x":pose.x,"y":pose.y,"z":pose.z,"frame":null}}}]}).to_string()).unwrap();
    assert!(!kernel.routes.contains_key(&actor));
    assert!(!kernel.terrain_routes.contains_key(&actor));
    assert!(kernel.ecs.get::<Destination>(actor).is_none());
    Kernel::new().restore_records(&kernel.save_records().unwrap()).unwrap();
}

#[test]
fn terrain_kernel_long_tick_cannot_cross_blocked_second_segment() {
    let (mut kernel,target) = climbing_world();
    kernel.advance_json(&json!({"delta":0.0,"writes":[],"actions":[{"scope":{"kind":"host"},"request":{"kind":"move","entity":"walker","destination":target}}]}).to_string()).unwrap();
    let actor = kernel.entity("walker").unwrap();
    let before = *kernel.ecs.get::<Position>(actor).unwrap();
    kernel.blocked_by_frame.get_mut(&None).unwrap().insert((target.x.round() as i32,target.y.round() as i32,target.z.round() as i32));
    kernel.advance_movement(2.0).unwrap();
    let after = kernel.ecs.get::<Position>(actor).unwrap();
    assert_eq!((after.x,after.y,after.z),(before.x,before.y,before.z));
    assert!(kernel.terrain_routes[&actor].waiting);
    assert!(kernel.ecs.get::<Destination>(actor).is_some());
}

#[test]
fn terrain_kernel_route_preparation_does_not_install_work() {
    let (mut kernel,target) = climbing_world();
    let actor = kernel.entity("walker").unwrap();
    let pose = *kernel.ecs.get::<Position>(actor).unwrap();
    let before = kernel.snapshot_entities_json().unwrap();
    let prepared = kernel.route_for(actor,pose,&target).unwrap();
    assert!(!prepared.points.is_empty());
    assert!(prepared.terrain.is_some());
    let mut before: serde_json::Value = serde_json::from_str(&before).unwrap();
    let mut after: serde_json::Value = serde_json::from_str(&kernel.snapshot_entities_json().unwrap()).unwrap();
    // Preparation may advance durable computation, but cannot install physical
    // work, claims, movement or intent before its caller accepts the witness.
    before["planner"].as_object_mut().unwrap().remove("routeSearches");
    after["planner"].as_object_mut().unwrap().remove("routeSearches");
    assert_eq!(after, before);
    assert!(!kernel.terrain_routes.contains_key(&actor));
}

#[test]
fn terrain_kernel_failed_replacement_preserves_existing_route() {
    let (mut kernel,target) = climbing_world();
    kernel.advance_json(&json!({"delta":0.1,"writes":[],"actions":[{"scope":{"kind":"host"},"request":{"kind":"move","entity":"walker","destination":target}}]}).to_string()).unwrap();
    let before = kernel.snapshot_entities_json().unwrap();
    let actor = kernel.entity("walker").unwrap();
    let pose = *kernel.ecs.get::<Position>(actor).unwrap();
    let impossible = Point{x:1000.0,y:target.y,z:target.z,frame:None};
    assert!(kernel.route_for(actor,pose,&impossible).is_err());
    assert_eq!(kernel.snapshot_entities_json().unwrap(),before);
    Kernel::new().restore_records(&kernel.save_records().unwrap()).unwrap();
}

#[test]
fn terrain_kernel_direct_control_cannot_bypass_walking_geometry() {
    let (mut kernel,_) = climbing_world();
    let before = kernel.snapshot_entities_json().unwrap();
    assert!(kernel.apply_action(Action::BeginDirect{entity:"walker".into(),stream:"test".into()},0.0, &ActionScope::Host).is_err());
    assert_eq!(kernel.snapshot_entities_json().unwrap(),before);
}

#[test]
fn terrain_kernel_mid_climb_redirect_preserves_pose_and_recovers() {
    let (mut kernel,target) = climbing_world();
    let actor = kernel.entity("walker").unwrap();
    let original = navigation::point(*kernel.ecs.get::<Position>(actor).unwrap());
    kernel.advance_json(&json!({"delta":0.1,"writes":[],"actions":[{"scope":{"kind":"host"},"request":{"kind":"move","entity":"walker","destination":target}}]}).to_string()).unwrap();
    let before = *kernel.ecs.get::<Position>(actor).unwrap();
    kernel.apply_action(Action::Move{entity:"walker".into(),destination:original.clone(),facing:None},0.0, &ActionScope::Host).unwrap();
    let after = kernel.ecs.get::<Position>(actor).unwrap();
    assert_eq!((before.x,before.y,before.z),(after.x,after.y,after.z));
    for _ in 0..35 {
        let mut recovered = Kernel::new();
        recovered.restore_records(&kernel.save_records().unwrap()).unwrap();
        recovered.advance_json(r#"{"delta":0.1,"writes":[],"actions":[]}"#).unwrap();
        kernel = recovered;
    }
    let pose = kernel.ecs.get::<Position>(kernel.entity("walker").unwrap()).unwrap();
    assert_eq!((pose.x,pose.y,pose.z),(original.x,original.y,original.z));
}

#[test]
fn terrain_stop_retains_contact_and_resumes_after_restore() {
    for elapsed in [0.1, 0.8] {
        let (mut kernel, target) = climbing_world();
        kernel.advance_json(&json!({"delta":elapsed,"writes":[],"actions":[{"scope":{"kind":"host"},"request":{"kind":"move","entity":"walker","destination":target}}]}).to_string()).unwrap();
        let actor = kernel.entity("walker").unwrap();
        let stopped = *kernel.ecs.get::<Position>(actor).unwrap();
        let stop = json!({"kind":"move","entity":"walker","destination":navigation::point(stopped)});
        let response: serde_json::Value = serde_json::from_str(&kernel.advance_json(&json!({"delta":0,"writes":[],"actions":[{"scope":{"kind":"host"},"request":stop}]}).to_string()).unwrap()).unwrap();
        assert_eq!(response["results"][0]["accepted"], true);
        assert!(kernel.ecs.get::<Destination>(actor).is_none());
        assert!(kernel.terrain_routes.get(&actor).unwrap().suspended);
        assert_eq!(navigation::point(kernel.predicted_world_pose(actor, 1.0, 0).unwrap()), navigation::point(stopped));
        let saved = kernel.save_records().unwrap();
        let mut forged = kernel.save_records().unwrap();
        let mut data: serde_json::Value = serde_json::from_str(&forged.entities).unwrap();
        data["routes"][0]["terrain_suspended"] = json!(false);
        forged.entities = data.to_string();
        assert!(Kernel::new().restore_records(&forged).is_err(), "missing destination cannot masquerade as active motion");
        let mut recovered = Kernel::new();
        recovered.restore_records(&saved).unwrap();
        recovered.advance_json(r#"{"delta":1,"writes":[],"actions":[]}"#).unwrap();
        let actor = recovered.entity("walker").unwrap();
        assert_eq!(navigation::point(*recovered.ecs.get::<Position>(actor).unwrap()), navigation::point(stopped));
        let response: serde_json::Value = serde_json::from_str(&recovered.advance_json(&json!({"delta":0,"writes":[],"actions":[{"scope":{"kind":"host"},"request":{"kind":"move","entity":"walker","destination":target}}]}).to_string()).unwrap()).unwrap();
        assert_eq!(response["results"][0]["accepted"], true);
        for _ in 0..20 { recovered.advance_json(r#"{"delta":0.1,"writes":[],"actions":[]}"#).unwrap(); }
        let reached = recovered.ecs.get::<Position>(actor).unwrap();
        assert!((reached.x-target.x).abs()<1e-9 && (reached.y-target.y).abs()<1e-9);
    }
}

#[test]
fn terrain_kernel_mid_segment_return_join_uses_waypoint_cursor() {
    let (mut kernel, target) = climbing_world();
    let actor = kernel.entity("walker").unwrap();
    let origin = navigation::point(*kernel.ecs.get::<Position>(actor).unwrap());

    // The return route deliberately revisits its origin. Its vertical rise
    // and cross waypoints have different lengths, so find the exact retained
    // cursor state instead of assuming a fixed travel time.
    kernel.advance_json(&json!({"delta":0.1,"writes":[],"actions":[{"scope":{"kind":"host"},"request":{
        "kind":"move","entity":"walker","destination":target
    }}]}).to_string()).expect("initial segment must advance");
    kernel.advance_json(&json!({"delta":0.0,"writes":[],"actions":[{"scope":{"kind":"host"},"request":{
        "kind":"move","entity":"walker","destination":origin
    }}]}).to_string()).expect("return route must be admitted");

    let capability = *kernel.ecs.get::<Traversal>(actor).unwrap();
    let spacing = kernel.environment.as_ref().unwrap().world.cell_spacing_m();
    let config = crate::terrain_traversal::TraversalConfig {
        spacing,
        clearance_cells: capability.clearance_cells,
        max_step_cells: capability.max_step_cells,
    };
    let mut joined = false;
    for _ in 0..400 {
        let actor = kernel.entity("walker").unwrap();
        let Some(state) = kernel.terrain_routes.get(&actor) else { break };
        let Some(route) = kernel.routes.get(&actor) else { break };
        let points = crate::terrain_route::waypoints(&state.path, config).unwrap();
        let Some(next) = points.len().checked_sub(route.len()) else { break };
        let active = kernel.ecs.get::<Position>(actor).copied().unwrap();
        let mid_segment = state.target.as_ref().is_some_and(|target| {
            navigation::distance(navigation::point(active), state.origin.clone()) > 1e-9
                && navigation::distance(navigation::point(active), target.clone()) > 1e-9
        });
        let revisited_next = next > 0 && next < points.len()
            && route.front().is_some_and(|front| points[..next].iter().any(|point| point == front));
        if mid_segment && revisited_next {
            kernel.advance_json(&json!({"delta":0.0,"writes":[],"actions":[{"scope":{"kind":"host"},"request":{
                "kind":"move","entity":"walker","destination":target
            }}]}).to_string()).expect("revisited mid-segment join must not panic");
            joined = true;
            break;
        }
        kernel.advance_json(r#"{"delta":0.033,"writes":[],"actions":[]}"#).expect("return route must remain valid");
    }

    assert!(joined, "test must reach a revisited waypoint while the route is in flight");
    let actor = kernel.entity("walker").unwrap();
    let path = &kernel.terrain_routes[&actor].path;
    assert!(path.len() >= 4, "return retarget must retain the revisited support history");
    assert!(path.iter().enumerate().any(|(index, cell)| path[..index].contains(cell)),
        "the joined route should retain its revisited support history");
}

#[test]
fn exhausted_move_is_accepted_and_resumes_after_recovery_without_resending() {
    let (mut kernel, target) = climbing_world();
    kernel.planner.route_searches.occurrence = Some(kernel.revision + 1);
    kernel.planner.route_searches.spent = crate::terrain_route::SEARCH_EXPANSIONS;
    let response: serde_json::Value = serde_json::from_str(&kernel.advance_json(&json!({
        "delta": 0.0, "writes": [], "actions": [{"scope":{"kind":"host"},"request":{
            "kind":"move","entity":"walker","destination":target
        }}]
    }).to_string()).unwrap()).unwrap();
    assert_eq!(response["results"][0]["accepted"], true);
    let actor = kernel.entity("walker").unwrap();
    assert!(kernel.terrain_routes[&actor].pending);
    assert!(kernel.ecs.get::<Destination>(actor).is_some());
    let position = *kernel.ecs.get::<Position>(actor).unwrap();
    let mut recovered = Kernel::new();
    recovered.restore_records(&kernel.save_records().unwrap()).unwrap();
    recovered.advance_json(r#"{"delta":0.0,"writes":[],"actions":[]}"#).unwrap();
    let actor = recovered.entity("walker").unwrap();
    assert!(!recovered.terrain_routes[&actor].pending);
    assert_eq!(*recovered.ecs.get::<Position>(actor).unwrap(), position);
    for _ in 0..20 { recovered.advance_json(r#"{"delta":0.1,"writes":[],"actions":[]}"#).unwrap(); }
    let reached = recovered.ecs.get::<Position>(actor).unwrap();
    assert_eq!((reached.x, reached.y, reached.z), (target.x, target.y, target.z));
    assert!(recovered.ecs.get::<Destination>(actor).is_none());
}

#[test]
fn topology_intersection_is_charged_before_geometry_validation() {
    let (mut kernel, target) = climbing_world();
    kernel.advance_json(&json!({"delta":0.0,"writes":[],"actions":[{"scope":{"kind":"host"},"request":{
        "kind":"move","entity":"walker","destination":target
    }}]}).to_string()).unwrap();
    let actor = kernel.entity("walker").unwrap();
    let world = &mut kernel.environment.as_mut().unwrap().world;
    let distant = world.surface_cells(&[(7, 7)]).unwrap()[0].as_ref().unwrap().cell;
    let material = world.material(distant).unwrap();
    let crate::terrain_water::ExcavationResult::Prepared(change) = world.prepare_excavation(distant, material, 0).unwrap() else { panic!("distant excavation must prepare") };
    world.apply_excavation(change).unwrap();
    let revision = world.terrain_revision();
    let prior = kernel.terrain_routes[&actor].revision;
    kernel.invalidate_terrain_routes_bounded(0).unwrap();
    assert_eq!(kernel.terrain_routes[&actor].revision, prior, "even a disjoint intersection scan needs allowance");
    kernel.invalidate_terrain_routes_bounded(1).unwrap();
    assert_eq!(kernel.terrain_routes[&actor].revision, Some(revision));
    assert!(!kernel.terrain_routes[&actor].waiting);

    let endpoint = *kernel.terrain_routes[&actor].path.last().unwrap();
    let world = &mut kernel.environment.as_mut().unwrap().world;
    let material = world.material(endpoint).unwrap();
    let crate::terrain_water::ExcavationResult::Prepared(change) = world.prepare_excavation(endpoint, material, 0).unwrap() else { panic!("route endpoint excavation must prepare") };
    world.apply_excavation(change).unwrap();
    kernel.invalidate_terrain_routes_bounded(0).unwrap();
    assert_eq!(kernel.terrain_routes[&actor].revision, Some(revision), "intersecting route must await an actual validation slice");
}

#[test]
fn topology_revalidation_checks_only_the_admitted_number_of_routes() {
    let (mut kernel, target) = climbing_world();
    let walker = kernel.entity("walker").unwrap();
    let position = *kernel.ecs.get::<Position>(walker).unwrap();
    for n in 0..11 {
        let id = format!("bounded-{n:02}");
        let entity = kernel.ecs.spawn((ExternalId(id.clone()), position, Body { speed: 1.0 }, Traversal { clearance_cells: 1, max_step_cells: 1 })).id();
        kernel.ids.insert(id, entity);
        let route = kernel.route_for(entity, position, &target).unwrap();
        kernel.ecs.entity_mut(entity).insert(Destination { x: target.x, y: target.y, z: target.z, facing: 0.0, frame: None });
        kernel.install_route(entity, route);
        kernel.terrain_routes.get_mut(&entity).unwrap().revision = None;
    }
    kernel.invalidate_terrain_routes_bounded(3).unwrap();
    assert_eq!(kernel.terrain_routes.values().filter(|state| state.revision.is_some()).count(), 3);
    kernel.refresh_state_weight();
    let mut recovered = Kernel::new();
    recovered.restore_records(&kernel.save_records().unwrap()).unwrap();
    assert_eq!(recovered.terrain_routes.values().filter(|state| state.revision.is_some()).count(), 3,
        "restoring witnesses must not advance the route-review sweep");
    recovered.invalidate_terrain_routes_bounded(3).unwrap();
    kernel.invalidate_terrain_routes_bounded(3).unwrap();
    assert_eq!(recovered.snapshot_entities_json().unwrap(), kernel.snapshot_entities_json().unwrap());
    assert_eq!(kernel.terrain_routes.values().filter(|state| state.revision.is_some()).count(), 6);
    for n in 0..6 {
        let entity = kernel.entity(&format!("bounded-{n:02}")).unwrap();
        assert!(kernel.terrain_routes[&entity].revision.is_some(), "stable external IDs own validation order");
    }
}

#[test]
fn retained_search_restore_rejects_noncanonical_record_identity() {
    let (mut kernel, target) = climbing_world();
    let actor = kernel.entity("walker").unwrap();
    let pose = *kernel.ecs.get::<Position>(actor).unwrap();
    let world = &mut kernel.environment.as_mut().unwrap().world;
    let spacing = world.cell_spacing_m();
    let to_cell = |x: f64, y: f64, z: f64| crate::generation::Cell {
        x: (x / spacing[0]).round() as i64,
        y: (y / spacing[1] - 0.5).round() as i32,
        z: (z / spacing[2]).round() as i64,
    };
    let revision = world.terrain_revision();
    let search = crate::terrain_route::RouteSearch::new(
        to_cell(pose.x, pose.y, pose.z), &[to_cell(target.x, target.y, target.z)],
        crate::terrain_traversal::TraversalConfig { spacing, clearance_cells: 1, max_step_cells: 1 },
        &mut |cell| world.traversal_material(cell), &|_| false,
    ).unwrap();
    let canonical = "a".repeat(64);
    kernel.planner.route_searches.entries.insert(canonical.clone(), crate::terrain_route::SearchRequest {
        actor: "walker".into(), revision, last_used: kernel.revision, spacing, search,
    });
    kernel.planner.route_searches.occurrence = Some(kernel.revision);
    let mut saved = kernel.save_records().unwrap();
    let mut restored = Kernel::new();
    restored.restore_records(&saved).unwrap();
    assert_eq!(restored.save_records().unwrap().entities, saved.entities,
        "canonical search identity must survive capture and restore");

    let mut data: serde_json::Value = serde_json::from_str(&saved.entities).unwrap();
    let entries = data["planner"]["routeSearches"]["entries"].as_object_mut().unwrap();
    let search = entries.remove(&canonical).unwrap();
    entries.insert(canonical.to_ascii_uppercase(), search);
    saved.entities = data.to_string();
    assert_eq!(Kernel::new().restore_records(&saved).unwrap_err(), "invalid retained route search request",
        "restore must reject identities the next durable capture cannot encode");
}
