use super::*;
use crate::generation::Cell;
use crate::structure_geometry::StaticInstance;
use serde_json::json;

fn kernel() -> Kernel {
    let mut kernel = Kernel::new();
    kernel.load(&json!({"format":"hive-game","version":1,"game":"structure-observation","components":[],"initial":[]}).to_string()).unwrap();
    kernel.load_environment(&crate::environment_definition::tests::fixture("structure-observation")).unwrap();
    kernel
}

#[test]
fn structure_state_query_preserves_order_and_missing_is_null() {
    let mut kernel = kernel();
    let first = kernel.environment.as_mut().unwrap().world.surface_cells(&[(0, 0)]).unwrap().into_iter().next().flatten().unwrap().cell;
    let second = kernel.environment.as_mut().unwrap().world.surface_cells(&[(1, 0)]).unwrap().into_iter().next().flatten().unwrap().cell;
    let instances = vec![
        StaticInstance::Wall { id: "wall".into(), base: Cell { x: first.x, y: first.y + 1, z: first.z }, height: 2 },
        StaticInstance::ApertureWall { id: "door".into(), base: Cell { x: second.x, y: second.y + 1, z: second.z }, height: 4, opening_bottom: 0, opening_height: 2, open: true },
    ];
    let environment = kernel.environment.as_mut().unwrap();
    let prepared = environment.world.prepare_structures(instances).unwrap().unwrap();
    environment.world.apply_structures(prepared).unwrap();
    let value: serde_json::Value = serde_json::from_str(&kernel.structure_states_json(r#"["door","missing","wall"]"#).unwrap()).unwrap();
    assert_eq!(value.as_array().unwrap().len(), 3);
    assert_eq!(value[0]["kind"], "aperture-wall");
    assert!(value[1].is_null());
    assert_eq!(value[2]["kind"], "wall");
    assert!(kernel.structure_states_json(r#"["door","door"]"#).is_err());
    assert!(kernel.structure_states_json(&serde_json::to_string(&vec!["wall"; 65]).unwrap()).is_err());
}

#[test]
fn structure_state_query_reports_open_then_closed_canonical_state() {
    let mut kernel = kernel();
    let surface = kernel.environment.as_mut().unwrap().world.surface_cells(&[(0, 0)]).unwrap().into_iter().next().flatten().unwrap().cell;
    let make = |open| StaticInstance::ApertureWall { id: "door".into(), base: Cell { x: surface.x, y: surface.y + 1, z: surface.z }, height: 4, opening_bottom: 0, opening_height: 2, open };
    for open in [true, false] {
        let environment = kernel.environment.as_mut().unwrap();
        let prepared = environment.world.prepare_structures(vec![make(open)]).unwrap().unwrap();
        environment.world.apply_structures(prepared).unwrap();
        let value: serde_json::Value = serde_json::from_str(&kernel.structure_states_json(r#"["door"]"#).unwrap()).unwrap();
        assert_eq!(value[0]["open"], open);
    }
}
