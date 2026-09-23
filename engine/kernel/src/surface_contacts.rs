//! Transfer contact discovery on the existing rigid support-frame geometry.
//! Terrain spacing and generated columns have no authority over a ship/deck.
use super::{Kernel, TransferContactError, interaction_contact};
use crate::components::Point;
use bevy_ecs::prelude::Entity;

impl Kernel {
    pub(super) fn supported_transfer_contacts(&self, container: Entity, frame: &str) -> Result<Vec<Point>, TransferContactError> {
        let surface = self.surface(frame)?;
        let parent = self.world_pose(frame)?;
        let world = self.contact_pose(container)?;
        // Invert the same rigid transform used by world_pose_entity, including
        // nested support frames and portable containers held on that frame.
        let (sin, cos) = (parent.facing * std::f64::consts::FRAC_PI_2).sin_cos();
        let dx = world.x - parent.x;
        let dz = world.z - parent.z;
        let local = [cos * dx + sin * dz, world.y - parent.y, -sin * dx + cos * dz];
        let blocked = self.blocked_by_frame.get(&Some(frame.to_owned())).ok_or("missing obstacle frame index")?;
        let reach = interaction_contact::TRANSFER_REACH_METRES;
        // At most 5 by 5 candidates, regardless of surface or world size.
        // Surface navigation uses integer metre x/z cells at one saved height.
        let mut targets = Vec::new();
        for x in (local[0] - reach).ceil() as i32..=(local[0] + reach).floor() as i32 {
            for z in (local[2] - reach).ceil() as i32..=(local[2] + reach).floor() as i32 {
                let point = [f64::from(x), surface.height, f64::from(z)];
                if point[0] < surface.min_x || point[0] > surface.max_x
                    || point[2] < surface.min_z || point[2] > surface.max_z
                    || blocked.contains(&(x, surface.height.round() as i32, z))
                    || !interaction_contact::within_transfer_reach(local, point) { continue; }
                targets.push(Point { x: point[0], y: point[1], z: point[2], frame: Some(frame.to_owned()) });
            }
        }
        if targets.is_empty() { return Err(TransferContactError::NoContact); }
        Ok(targets)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn fixture(facing: u32) -> Kernel {
        let mut kernel = Kernel::new();
        kernel.load(&json!({ "format":"hive-game", "version":3, "game":"surface-cargo", "components":[], "materialCatalog":[], "initial":[
            {"id":"deck","components":{
                "hive.position":{"x":27.0,"y":4.0,"z":-13.0,"facing":facing},
                "hive.surface":{"minX":-3.0,"maxX":3.0,"minZ":-2.0,"maxZ":2.0,"height":1.0}
            }},
            {"id":"chest","components":{
                "hive.position":{"x":2.0,"y":1.0,"z":0.0,"facing":0.0},
                "hive.container":{"capacity":4}, "hive.support":{"entity":"deck"}
            }},
            {"id":"obstacle","components":{
                "hive.position":{"x":1.0,"y":1.0,"z":0.0,"facing":0.0},
                "hive.obstacle":{"occupied":true}, "hive.support":{"entity":"deck"}
            }}
        ] }).to_string()).unwrap();
        kernel
    }
    #[test]
    fn contacts_use_local_surface_bounds_obstacles_and_reach_at_every_heading() {
        let mut expected = None;
        for facing in 0..4 {
            let kernel = fixture(facing);
            let contacts = kernel.supported_transfer_contacts(kernel.entity("chest").unwrap(), "deck").unwrap();
            assert!(contacts.len() <= 25);
            assert!(!contacts.iter().any(|point| point.x == 1.0 && point.z == 0.0));
            assert!(contacts.iter().all(|point| point.frame.as_deref() == Some("deck") && point.y == 1.0
                && point.x >= -3.0 && point.x <= 3.0 && point.z >= -2.0 && point.z <= 2.0
                && interaction_contact::within_transfer_reach([2.0,1.0,0.0],[point.x,point.y,point.z])));
            if let Some(expected) = &expected { assert_eq!(&contacts, expected); } else { expected = Some(contacts); }
        }
    }
}
