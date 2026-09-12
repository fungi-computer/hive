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
    pub free: BTreeMap<Cell, f64>,
}

impl RoomTopology {
    pub fn definition(&self, config: &crate::terrain_atmosphere::TerrainAtmosphereConfig, revision: u64) -> crate::atmosphere::SharedAtmosphereDefinition {
        use crate::atmosphere::{AtmosphereDefinition,AtmosphereVolumeDefinition,AtmosphereMember,AtmosphereOpeningDefinition};
        let ids:Vec<_> = self.sections.iter().map(|s|format!("room:{},{},{}",s.anchor.x,s.anchor.y,s.anchor.z)).collect();
        AtmosphereDefinition {
            version:"connected-atmosphere-definition-v1".into(),region_id:config.region_id.clone(),
            geometry_identity:"coarse-rooms-v1".into(),revision,ambient:config.ambient.clone(),model:config.model.clone(),
            volumes:self.sections.iter().enumerate().map(|(i,s)|AtmosphereVolumeDefinition{id:ids[i].clone(),members:vec![AtmosphereMember{cell_id:ids[i].clone(),volume_m3:s.volume_m3,elevation_m:s.elevation_m}]}).collect(),
            openings:self.portals.iter().enumerate().map(|(i,p)|AtmosphereOpeningDefinition{id:format!("portal:{i}"),from:ids[p.from].clone(),from_cell_id:ids[p.from].clone(),to:p.to.map(|j|ids[j].clone()),to_cell_id:p.to.map(|j|ids[j].clone()),area_m2:p.conductance_m,distance_m:1.0,elevation_m:p.elevation_m,permeability:1.0}).collect(),
        }.into()
    }
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
        Ok(Self { sections, portals, membership, outdoors, free })
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
    fn config() -> crate::terrain_atmosphere::TerrainAtmosphereConfig {
        serde_json::from_value(serde_json::json!({
            "regionId":"room-test","min":{"x":0,"y":0,"z":0},"max":{"x":2,"y":4,"z":1},"exterior":"WorldTop",
            "ambient":{"pressurePa":101325.0,"temperatureK":293.15},
            "model":{"specificGasConstantJkgK":287.05,"heatCapacityJkgK":1005.0,"mixingVelocityMps":1.0,"buoyancyVelocityMpsK":0.1,"pressureVelocityMpsPa":0.001,"maxStepS":0.2,"maxExchangeFraction":0.5,"maxPressureRatio":4.0,"maxTemperatureDeltaK":100.0,"maxSmokeMassFraction":0.01}
        })).unwrap()
    }
    #[test]
    fn outdoor_fire_has_no_parcel_and_records_finite_source_and_exit() {
        use crate::atmosphere::CompiledAtmosphere;
        let outside = RoomTopology::classify(&room(false,true), [1.0;3], true, 4).unwrap();
        let air = CompiledAtmosphere::compile_shared(outside.definition(&config(),0)).unwrap();
        let original = air.initial();
        let (state, receipt) = air.advance_with_boundary(&original, 0.5, &[], (0.02, 100.0)).unwrap();
        assert!(state.parcels().is_empty());
        assert_eq!(receipt.source_smoke_kg, 0.01);
        assert_eq!(receipt.smoke_boundary_kg, 0.01);
        assert_eq!(receipt.source_heat_j, 50.0);
        assert_eq!(receipt.heat_boundary_j, 50.0);
        let bytes = air.encode_state(&state).unwrap();
        air.decode_state(&bytes).unwrap();
        assert!(air.advance_with_boundary(&state, 0.5, &[], (f64::INFINITY, 0.0)).is_err());
        assert_eq!(air.encode_state(&state).unwrap(), bytes);
        let (_, paused) = air.advance_with_boundary(&state, 0.0, &[], (0.02, 100.0)).unwrap();
        assert_eq!(paused.source_smoke_kg, 0.0);
    }
    #[test]
    fn roof_creation_and_removal_conserve_room_stock_through_ambient() {
        use crate::atmosphere::{CompiledAtmosphere,AtmosphereRebindResult,AtmosphereSource,rebind_rooms};
        let outside=RoomTopology::classify(&room(false,true),[1.0;3],true,4).unwrap();
        let roofed=RoomTopology::classify(&room(true,false),[1.0;3],true,4).unwrap();
        let a=CompiledAtmosphere::compile_shared(outside.definition(&config(),0)).unwrap();
        let b=CompiledAtmosphere::compile_shared(roofed.definition(&config(),1)).unwrap();
        let AtmosphereRebindResult::Applied{state,receipt}=rebind_rooms(&a,&a.initial(),&b,&outside,&roofed).unwrap() else {panic!("new room");};
        assert!(receipt.carrier_boundary_kg<0.0);
        let (state,_)=b.advance(&state,0.1,&[AtmosphereSource{volume_id:b.definition().volumes[0].id.clone(),smoke_kg_s:0.001,heat_j_s:1.0}]).unwrap();
        let c=CompiledAtmosphere::compile_shared(outside.definition(&config(),2)).unwrap();
        let AtmosphereRebindResult::Applied{state:empty,receipt}=rebind_rooms(&b,&state,&c,&roofed,&outside).unwrap() else {panic!("roof breach");};
        assert!(receipt.smoke_boundary_kg>0.0);
        c.decode_state(&c.encode_state(&empty).unwrap()).unwrap();
    }
    #[test]
    fn coarse_band_split_preserves_stock_and_solid_removal_cannot_erase_it() {
        use crate::atmosphere::{CompiledAtmosphere,AtmosphereRebindResult,rebind_rooms};
        let snapshot=room(true,false);
        let room=RoomTopology::classify(&snapshot,[1.0;3],true,4).unwrap();
        let split=RoomTopology::classify(&snapshot,[1.0;3],true,2).unwrap();
        let a=CompiledAtmosphere::compile_shared(room.definition(&config(),0)).unwrap();
        let b=CompiledAtmosphere::compile_shared(split.definition(&config(),1)).unwrap();
        let state=a.initial();
        let AtmosphereRebindResult::Applied{state:split_state,receipt}=rebind_rooms(&a,&state,&b,&room,&split).unwrap() else {panic!("split");};
        assert_eq!(receipt.carrier_boundary_kg,0.0);
        b.decode_state(&b.encode_state(&split_state).unwrap()).unwrap();
        let mut flooded=snapshot;
        for c in &mut flooded.cells { if c.at.x==1 {c.water=AirWaterCoverage::Admitted{liquid_volume_m3:1.0};} }
        let gone=RoomTopology::classify(&flooded,[1.0;3],true,4).unwrap();
        let c=CompiledAtmosphere::compile_shared(gone.definition(&config(),2)).unwrap();
        assert!(matches!(rebind_rooms(&a,&state,&c,&room,&gone).unwrap(),AtmosphereRebindResult::Blocked(_)));
        a.decode_state(&a.encode_state(&state).unwrap()).unwrap();
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
