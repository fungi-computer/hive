use super::*;

fn climbing_world() -> (Kernel, Point) {
    let mut kernel = Kernel::new();
    kernel.load(&json!({"format":"hive-game","version":1,"game":"climbing","components":[],"initial":[{"id":"walker","components":{
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
    kernel.advance_json(&json!({"delta":0.0,"writes":[],"actions":[{"kind":"move","entity":"walker","destination":target}]}).to_string()).unwrap();
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
    kernel.advance_json(&json!({"delta":0.1,"writes":[],"actions":[{"kind":"move","entity":"walker","destination":target}]}).to_string()).unwrap();
    let mut saved = kernel.save_records().unwrap();
    let mut data: serde_json::Value = serde_json::from_str(&saved.entities).unwrap();
    data["routes"][0]["terrain_waiting"] = json!(true);
    data["routes"][0]["path"][0]["x"] = json!(1000);
    saved.entities = data.to_string();
    assert!(Kernel::new().restore_records(&saved).is_err(), "waiting cannot bypass physical route validation");
}

#[test]
fn terrain_kernel_waiting_retains_route_and_pose_after_recovery() {
    let (mut kernel,target) = climbing_world();
    kernel.advance_json(&json!({"delta":0.1,"writes":[],"actions":[{"kind":"move","entity":"walker","destination":target}]}).to_string()).unwrap();
    let actor = kernel.entity("walker").unwrap();
    kernel.terrain_routes.get_mut(&actor).unwrap().waiting = true;
    let before = kernel.routes[&actor].clone();
    let pose = *kernel.ecs.get::<Position>(actor).unwrap();
    let saved = kernel.save_records().unwrap();
    let mut recovered = Kernel::new();
    recovered.restore_records(&saved).unwrap();
    recovered.advance_json(r#"{"delta":0.5,"writes":[],"actions":[]}"#).unwrap();
    let actor = recovered.entity("walker").unwrap();
    assert_eq!(recovered.routes[&actor],before);
    assert!(recovered.ecs.get::<Destination>(actor).is_some());
    let after = recovered.ecs.get::<Position>(actor).unwrap();
    assert_eq!((after.x,after.y,after.z),(pose.x,pose.y,pose.z));
}

#[test]
fn terrain_kernel_same_position_move_has_no_pending_route() {
    let (mut kernel,_) = climbing_world();
    let actor = kernel.entity("walker").unwrap();
    let pose = *kernel.ecs.get::<Position>(actor).unwrap();
    kernel.advance_json(&json!({"delta":0.0,"writes":[],"actions":[{"kind":"move","entity":"walker","destination":{"x":pose.x,"y":pose.y,"z":pose.z,"frame":null}}]}).to_string()).unwrap();
    assert!(!kernel.routes.contains_key(&actor));
    assert!(!kernel.terrain_routes.contains_key(&actor));
    assert!(kernel.ecs.get::<Destination>(actor).is_none());
    Kernel::new().restore_records(&kernel.save_records().unwrap()).unwrap();
}

#[test]
fn terrain_kernel_long_tick_cannot_cross_blocked_second_segment() {
    let (mut kernel,target) = climbing_world();
    kernel.advance_json(&json!({"delta":0.0,"writes":[],"actions":[{"kind":"move","entity":"walker","destination":target}]}).to_string()).unwrap();
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
    assert_eq!(kernel.snapshot_entities_json().unwrap(),before);
    assert!(!kernel.terrain_routes.contains_key(&actor));
}

#[test]
fn terrain_kernel_failed_replacement_preserves_existing_route() {
    let (mut kernel,target) = climbing_world();
    kernel.advance_json(&json!({"delta":0.1,"writes":[],"actions":[{"kind":"move","entity":"walker","destination":target}]}).to_string()).unwrap();
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
    assert!(kernel.apply_action(Action::BeginDirect{entity:"walker".into(),stream:"test".into()},0.0).is_err());
    assert_eq!(kernel.snapshot_entities_json().unwrap(),before);
}

#[test]
fn terrain_kernel_mid_climb_redirect_preserves_pose_and_recovers() {
    let (mut kernel,target) = climbing_world();
    let actor = kernel.entity("walker").unwrap();
    let original = navigation::point(*kernel.ecs.get::<Position>(actor).unwrap());
    kernel.advance_json(&json!({"delta":0.1,"writes":[],"actions":[{"kind":"move","entity":"walker","destination":target}]}).to_string()).unwrap();
    let before = *kernel.ecs.get::<Position>(actor).unwrap();
    kernel.apply_action(Action::Move{entity:"walker".into(),destination:original.clone(),facing:None},0.0).unwrap();
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
        kernel.advance_json(&json!({"delta":elapsed,"writes":[],"actions":[{"kind":"move","entity":"walker","destination":target}]}).to_string()).unwrap();
        let actor = kernel.entity("walker").unwrap();
        let stopped = *kernel.ecs.get::<Position>(actor).unwrap();
        let stop = json!({"kind":"move","entity":"walker","destination":navigation::point(stopped)});
        let response: serde_json::Value = serde_json::from_str(&kernel.advance_json(&json!({"delta":0,"writes":[],"actions":[stop]}).to_string()).unwrap()).unwrap();
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
        let response: serde_json::Value = serde_json::from_str(&recovered.advance_json(&json!({"delta":0,"writes":[],"actions":[{"kind":"move","entity":"walker","destination":target}]}).to_string()).unwrap()).unwrap();
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

    // The return route deliberately revisits its origin. It first reaches the
    // far support cell, then retargets while partway back, so a historical
    // coordinate lookup would join the wrong path occurrence.
    kernel.advance_json(&json!({"delta":0.25,"writes":[],"actions":[{
        "kind":"move","entity":"walker","destination":target
    }]}).to_string()).expect("initial segment must advance");
    kernel.advance_json(&json!({"delta":0.85,"writes":[],"actions":[{
        "kind":"move","entity":"walker","destination":origin
    }]}).to_string()).expect("return segment must advance");
    kernel.advance_json(&json!({"delta":0.0,"writes":[],"actions":[{
        "kind":"move","entity":"walker","destination":target
    }]}).to_string()).expect("mid-segment return join must not panic");

    let actor = kernel.entity("walker").unwrap();
    let path = &kernel.terrain_routes[&actor].path;
    assert!(path.len() >= 4, "return retarget must retain the revisited support history");
    assert_eq!(path[0], path[2], "the route should contain the original support revisit");
}
