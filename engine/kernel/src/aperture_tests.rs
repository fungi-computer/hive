//! Focused native aperture laws. Geometry, rooted support, and action admission
//! all remain owned by the existing structure/environment owners.
use super::*;
use crate::generation::{Bounds, Cell};
use crate::structure_geometry::{StaticGeometry, StaticInstance};

fn bounds() -> Bounds { Bounds { min_x: -4, max_x: 4, min_y: -8, max_y: 16, min_z: -4, max_z: 4 } }

#[test]
fn door_and_upper_vent_keep_frame_support_while_opening_only_the_interval() {
    for (bottom, height) in [(0u8, 2u8), (2u8, 1u8)] {
        let base = Cell { x: 0, y: 0, z: 0 };
        let closed = StaticGeometry::new(bounds(), vec![StaticInstance::ApertureWall {
            id: "aperture".into(), base, height: 5, opening_bottom: bottom, opening_height: height, open: false,
        }]).unwrap();
        let open = StaticGeometry::new(bounds(), vec![StaticInstance::ApertureWall {
            id: "aperture".into(), base, height: 5, opening_bottom: bottom, opening_height: height, open: true,
        }]).unwrap();
        let closed_projection = closed.projection().unwrap();
        let open_projection = open.projection().unwrap();
        assert!(closed_projection.is_bulk_solid(Cell { y: bottom, ..base }));
        assert!(!open_projection.is_bulk_solid(Cell { y: bottom, ..base }));
        assert!(open_projection.is_bulk_solid(Cell { y: 4, ..base }));
        assert!(open_projection.supports(base));
    }
}

#[test]
fn rooted_aperture_wall_is_supported_by_terrain_anchor() {
    let base = Cell { x: 0, y: 1, z: 0 };
    let geometry = StaticGeometry::new(bounds(), vec![StaticInstance::ApertureWall {
        id: "door".into(), base, height: 4, opening_bottom: 0, opening_height: 2, open: true,
    }]).unwrap();
    let mut query = |cell: Cell| Ok(cell == Cell { x: 0, y: 0, z: 0 });
    let result = crate::structure_support::resolve(&geometry, crate::structure_support::SupportPolicy {
        max_span_steps: 6, max_instances: 16, max_work: 4096,
    }, &mut query).unwrap();
    assert!(result.supported.contains("door"));
}
