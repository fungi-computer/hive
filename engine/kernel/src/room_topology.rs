//! Rebuildable room classification. Only sections and aggregate portals become
//! gas inputs; outdoor cells never become simulated parcels. Physical snapshots
//! are supplied by the terrain owner, not saved as a second geometry authority.
use crate::generation::Cell;
use crate::structure_geometry::FaceAxis;
use crate::terrain_water::{AirGeometrySnapshot, AirGeometryFaceKind, AirWaterCoverage};
use std::collections::{BTreeMap, BTreeSet, VecDeque};

#[derive(Clone, Debug)]
pub(crate) struct RoomSection {
    pub anchor: Cell,
    pub volume_m3: f64,
    pub elevation_m: f64,
}
#[derive(Clone, Debug)]
pub(crate) struct RoomPortal {
    pub from: usize,
    pub to: Option<usize>,
    pub conductance_m: f64,
    pub elevation_m: f64,
}
#[derive(Clone, Debug)]
pub(crate) struct RoomTopology {
    pub sections: Vec<RoomSection>,
    pub portals: Vec<RoomPortal>,
    /// Spatial lookup/rebind aid only. Never encode this as gas stocks/binding.
    pub membership: BTreeMap<Cell, usize>,
    pub outdoors: BTreeSet<Cell>,
}

impl RoomTopology {
    pub fn classify(snapshot: &AirGeometrySnapshot, spacing: [f64; 3], sky_boundary: bool, band_height: i32) -> Result<Self, String> {
        if band_height <= 0 || snapshot.cells.len() > 40_000 || snapshot.faces.len() > 56_000
            || !spacing.iter().all(|v| v.is_finite() && *v > 0.0) {
            return Err("invalid bounded room classification".into());
        }
        let mut free = BTreeMap::new();
        let mut columns: BTreeMap<(i64,i64), Vec<Cell>> = BTreeMap::new();
        for cell in &snapshot.cells {
            let water = match cell.water { AirWaterCoverage::Admitted { liquid_volume_m3 } => liquid_volume_m3, AirWaterCoverage::Unmodeled => 0.0 };
            let volume = cell.voxel_volume_m3 - water;
            if !volume.is_finite() || volume < 0.0 || !water.is_finite() || water < 0.0 {
                return Err("invalid room free volume".into());
            }
            if volume == 0.0 { continue; }
            if free.insert(cell.at, volume).is_some() { return Err("duplicate room cell".into()); }
            columns.entry((cell.at.x,cell.at.z)).or_default().push(cell.at);
        }
        let mut vertical_open = BTreeSet::new();
        for face in &snapshot.faces {
            if matches!(face.face.axis, FaceAxis::Y) && matches!(face.kind, AirGeometryFaceKind::Internal { sealed:false, .. } | AirGeometryFaceKind::Frontier { sealed:false, .. }) {
                vertical_open.insert(face.face.cell);
            }
        }
        // Direct sky, not flood-fill from a doorway: a roofed room remains a
        // room when its door opens, and exchanges through that opening.
        let mut outdoors = BTreeSet::new();
        if sky_boundary {
            for column in columns.values_mut() {
                column.sort_unstable_by_key(|cell| std::cmp::Reverse(cell.y));
                let mut expected = snapshot.bounds.max.y - 1;
                for cell in column {
                    if cell.y != expected || !vertical_open.contains(cell) { break; }
                    outdoors.insert(*cell);
                    expected -= 1;
                }
            }
        }
        let mut adjacency: BTreeMap<Cell, Vec<Cell>> = BTreeMap::new();
        for face in &snapshot.faces {
            let AirGeometryFaceKind::Internal { a,b,sealed:false } = face.kind else { continue; };
            if !free.contains_key(&a) || !free.contains_key(&b) || outdoors.contains(&a) || outdoors.contains(&b)
                || a.y.div_euclid(band_height) != b.y.div_euclid(band_height) { continue; }
            adjacency.entry(a).or_default().push(b);
            adjacency.entry(b).or_default().push(a);
        }
        let mut sections = Vec::new();
        let mut membership = BTreeMap::new();
        for (&anchor, _) in &free {
            if outdoors.contains(&anchor) || membership.contains_key(&anchor) { continue; }
            let index = sections.len();
            membership.insert(anchor,index);
            let mut queue = VecDeque::from([anchor]);
            let (mut volume,mut weighted_height) = (0.0,0.0);
            while let Some(cell) = queue.pop_front() {
                let amount = free[&cell];
                volume += amount;
                weighted_height += amount * f64::from(cell.y) * spacing[1];
                if let Some(neighbors) = adjacency.get(&cell) {
                    for neighbor in neighbors {
                        if membership.contains_key(neighbor) { continue; }
                        membership.insert(*neighbor,index);
                        queue.push_back(*neighbor);
                    }
                }
            }
            if !volume.is_finite() || !weighted_height.is_finite() { return Err("room metric overflow".into()); }
            sections.push(RoomSection { anchor, volume_m3:volume, elevation_m:weighted_height/volume });
        }
        let mut edges: BTreeMap<(usize,Option<usize>),(f64,f64)> = BTreeMap::new();
        for face in &snapshot.faces {
            let AirGeometryFaceKind::Internal { a,b,sealed:false } = face.kind else { continue; };
            let (from,to) = match (membership.get(&a),membership.get(&b)) {
                (Some(&a),Some(&b)) if a != b => (a.min(b),Some(a.max(b))),
                (Some(&room),None) if outdoors.contains(&b) => (room,None),
                (None,Some(&room)) if outdoors.contains(&a) => (room,None),
                _ => continue,
            };
            let axis = match face.face.axis { FaceAxis::X=>0,FaceAxis::Y=>1,FaceAxis::Z=>2 };
            let area = spacing[(axis+1)%3] * spacing[(axis+2)%3];
            let conductance = area / spacing[axis];
            let height = (f64::from(a.y) + f64::from(b.y)) * 0.5 * spacing[1];
            let edge = edges.entry((from,to)).or_default();
            edge.0 += conductance;
            edge.1 += conductance * height;
        }
        let portals = edges.into_iter().map(|((from,to),(conductance,height))| RoomPortal {
            from,to,conductance_m:conductance,elevation_m:height/conductance,
        }).collect();
        Ok(Self { sections, portals, membership, outdoors })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::structure_geometry::Face;
    use crate::terrain_water::{AirGeometryBounds, AirGeometryCell, AirGeometryFace, AirGeometryFrontier};
    fn room(roof:bool, door:bool) -> AirGeometrySnapshot {
        let mut cells = Vec::new();
        for x in 0..2 { for y in 0..4 {
            if roof && x==1 && y==3 { continue; }
            cells.push(AirGeometryCell { at:Cell{x,y,z:0}, voxel_volume_m3:1.0, water:AirWaterCoverage::Unmodeled });
        }}
        let present:BTreeSet<_> = cells.iter().map(|c|c.at).collect();
        let mut faces=Vec::new();
        for a in &present {
            for axis in [FaceAxis::X,FaceAxis::Y,FaceAxis::Z] {
                let face=Face{cell:*a,axis};
                let b=face.neighbor().unwrap();
                if present.contains(&b) {
                    faces.push(AirGeometryFace{face,kind:AirGeometryFaceKind::Internal{a:*a,b,sealed:matches!(axis,FaceAxis::X)&&!door}});
                } else if matches!(axis,FaceAxis::Y)&&a.y==3 {
                    faces.push(AirGeometryFace{face,kind:AirGeometryFaceKind::Frontier{neighbor:AirGeometryFrontier::OutsideQuery,sealed:false}});
                }
            }
        }
        AirGeometrySnapshot{physical_revision:0,epoch:0,bounds:AirGeometryBounds{min:Cell{x:0,y:0,z:0},max:Cell{x:2,y:4,z:1}},cells,faces}
    }
    #[test]
    fn open_door_retains_roofed_room_with_one_ambient_portal() {
        let topology=RoomTopology::classify(&room(true,true),[1.0;3],true,4).unwrap();
        assert_eq!(topology.outdoors.len(),4);
        assert_eq!(topology.sections.len(),1);
        assert_eq!(topology.sections[0].volume_m3,3.0);
        assert_eq!(topology.membership.len(),3);
        assert_eq!(topology.portals.len(),1);
        assert_eq!(topology.portals[0].to,None);
        assert_eq!(topology.portals[0].conductance_m,3.0);
    }
    #[test]
    fn outdoor_only_allocates_no_gas_sections_and_closed_door_has_no_portal() {
        let outside=RoomTopology::classify(&room(false,true),[1.0;3],true,4).unwrap();
        assert!(outside.sections.is_empty());
        assert!(outside.portals.is_empty());
        let closed=RoomTopology::classify(&room(true,false),[1.0;3],true,4).unwrap();
        assert_eq!(closed.sections.len(),1);
        assert!(closed.portals.is_empty());
    }
}
