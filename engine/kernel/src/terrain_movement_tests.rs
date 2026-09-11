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
        if end.y != start.y + 1 { continue; }
        let pose = Position{x:x as f64,y:(f64::from(start.y)+0.5)*0.54,z:z as f64,facing:0.0};
        let target = Point{x:end.x as f64,y:(f64::from(end.y)+0.5)*0.54,z:end.z as f64,frame:None};
        kernel.ecs.entity_mut(actor).insert(pose);
        if kernel.route_for(actor,pose,&target).is_ok() { return (kernel,target); }
    }
    panic!("fixture must contain an admitted one-voxel climb");
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
