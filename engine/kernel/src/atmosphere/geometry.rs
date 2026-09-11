//! Deterministic atmosphere geometry projection over the canonical air query.
//!
//! This module has no ambient policy, solver, clock, or stock remap authority.
//! Query frontiers are intentionally closed until a caller supplies an explicit
//! exterior policy.

use super::{AtmosphereMember, AtmosphereOpeningDefinition, AtmosphereVolumeDefinition};
use crate::generation::Cell;
use crate::structure_geometry::FaceAxis;
use crate::terrain_water::{AirGeometryFaceKind, AirGeometrySnapshot, AirWaterCoverage};
use std::collections::{BTreeMap, BTreeSet};

const MIXING_BIN_METRES: f64 = 8.0;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum UnmodeledWaterPolicy {
    Reject,
    AssumeNoAdmittedWater,
}

#[derive(Clone, Debug, PartialEq)]
pub struct AirAtmosphereGeometry {
    pub identity: String,
    pub physical_revision: u64,
    pub epoch: u64,
    pub volumes: Vec<AtmosphereVolumeDefinition>,
    pub openings: Vec<AtmosphereOpeningDefinition>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct Bin {
    x: i64,
    y: i32,
    z: i64,
}

pub fn project(
    snapshot: &AirGeometrySnapshot,
    spacing_m: [f64; 3],
    water_policy: UnmodeledWaterPolicy,
) -> Result<AirAtmosphereGeometry, String> {
    validate_spacing(spacing_m)?;
    let voxel_volume = spacing_m.iter().product::<f64>();
    if !voxel_volume.is_finite() || voxel_volume <= 0.0 {
        return Err("atmosphere geometry voxel volume is invalid".into());
    }

    let mut cells = snapshot.cells.clone();
    cells.sort_by_key(|cell| cell.at);
    let mut air = BTreeMap::<Cell, (usize, f64)>::new();
    for cell in &cells {
        if !cell.voxel_volume_m3.is_finite() || cell.voxel_volume_m3 <= 0.0
            || (cell.voxel_volume_m3 - voxel_volume).abs() > 1e-9 * voxel_volume.max(1.0)
        {
            return Err("atmosphere geometry cell metric mismatch".into());
        }
        let liquid = match &cell.water {
            AirWaterCoverage::Admitted { liquid_volume_m3 } => {
                if !liquid_volume_m3.is_finite() || *liquid_volume_m3 < 0.0 || *liquid_volume_m3 > cell.voxel_volume_m3 {
                    return Err("atmosphere geometry water volume is invalid".into());
                }
                *liquid_volume_m3
            }
            AirWaterCoverage::Unmodeled => match water_policy {
                UnmodeledWaterPolicy::Reject => return Err("atmosphere geometry has unmodeled water coverage".into()),
                UnmodeledWaterPolicy::AssumeNoAdmittedWater => 0.0,
            },
        };
        let free = cell.voxel_volume_m3 - liquid;
        if free > 0.0 {
            let index = air.len();
            air.insert(cell.at, (index, free));
        }
    }
    if air.is_empty() {
        return Err("atmosphere geometry has no free air cells".into());
    }

    let mut parent: Vec<usize> = (0..air.len()).collect();
    let mut positions = BTreeMap::new();
    for (at, (index, _)) in &air { positions.insert(*at, *index); }
    for face in &snapshot.faces {
        let AirGeometryFaceKind::Internal { a, b, sealed } = &face.kind else { continue };
        if *sealed || !matches!(face.face.axis, FaceAxis::X | FaceAxis::Z) { continue; }
        let (Some(left), Some(right)) = (positions.get(a), positions.get(b)) else { continue };
        if same_bin(*a, *b, spacing_m)? { union(&mut parent, *left, *right); }
    }

    let mut members: BTreeMap<usize, Vec<(Cell, f64)>> = BTreeMap::new();
    for (at, (index, free)) in &air {
        let root = find(&mut parent, *index);
        members.entry(root).or_default().push((*at, *free));
    }
    let mut groups: Vec<Vec<(Cell, f64)>> = members.into_values().collect();
    for group in &mut groups { group.sort_by_key(|(at, _)| *at); }
    groups.sort_by_key(|group| group[0].0);

    let mut volume_by_cell = BTreeMap::new();
    let mut volumes = Vec::with_capacity(groups.len());
    for group in groups {
        let first = group[0].0;
        let volume_id = cell_id(first);
        let members = group.iter().map(|(at, free)| {
            let id = cell_id(*at);
            volume_by_cell.insert(*at, volume_id.clone());
            AtmosphereMember { cell_id: id, volume_m3: *free, elevation_m: (f64::from(at.y) + 0.5) * spacing_m[1] }
        }).collect();
        volumes.push(AtmosphereVolumeDefinition { id: volume_id, members });
    }

    let mut openings = Vec::new();
    let mut opening_ids = BTreeSet::new();
    for face in &snapshot.faces {
        let AirGeometryFaceKind::Internal { a, b, sealed } = &face.kind else { continue };
        if *sealed || !air.contains_key(a) || !air.contains_key(b) { continue; }
        let from = volume_by_cell.get(a).ok_or("air volume missing face endpoint")?;
        let to = volume_by_cell.get(b).ok_or("air volume missing face endpoint")?;
        if from == to { continue; }
        let axis = axis_index(face.face.axis);
        let area = face_area(face.face.axis, *a, *b, &air, spacing_m)?;
        if area <= 0.0 { continue; }
        let id = face_id(face.face.axis, face.face.cell);
        if !opening_ids.insert(id.clone()) { return Err("duplicate atmosphere opening".into()); }
        openings.push(AtmosphereOpeningDefinition {
            id,
            from: from.clone(),
            from_cell_id: cell_id(*a),
            to: Some(to.clone()),
            to_cell_id: Some(cell_id(*b)),
            area_m2: area,
            distance_m: spacing_m[axis],
            elevation_m: (f64::from(a.y) + f64::from(b.y) + 1.0) * spacing_m[1] * 0.5,
            permeability: 1.0,
        });
    }
    openings.sort_by(|left, right| left.id.cmp(&right.id));
    if volumes.len() > MAX_VOLUMES || openings.len() > MAX_OPENINGS {
        return Err("atmosphere geometry graph exceeds admission bounds".into());
    }

    Ok(AirAtmosphereGeometry {
        identity: identity(snapshot, &cells, spacing_m, water_policy),
        physical_revision: snapshot.physical_revision,
        epoch: snapshot.epoch,
        volumes,
        openings,
    })
}

fn validate_spacing(spacing: [f64; 3]) -> Result<(), String> {
    if spacing.iter().any(|value| !value.is_finite() || *value <= 0.0) {
        return Err("atmosphere geometry spacing is invalid".into());
    }
    Ok(())
}

fn cell_id(at: Cell) -> String { format!("cell:{},{},{}", at.x, at.y, at.z) }

fn face_id(axis: FaceAxis, at: Cell) -> String {
    let axis = match axis { FaceAxis::X => 'x', FaceAxis::Y => 'y', FaceAxis::Z => 'z' };
    format!("{axis}:{},{},{}", at.x, at.y, at.z)
}

fn axis_index(axis: FaceAxis) -> usize {
    match axis { FaceAxis::X => 0, FaceAxis::Y => 1, FaceAxis::Z => 2 }
}

fn floor_bin(value: f64) -> Result<i64, String> {
    let value = (value / MIXING_BIN_METRES).floor();
    if !value.is_finite() || value < i64::MIN as f64 || value > i64::MAX as f64 { return Err("atmosphere mixing bin overflow".into()); }
    Ok(value as i64)
}

fn same_bin(a: Cell, b: Cell, spacing: [f64; 3]) -> Result<bool, String> {
    if a.y != b.y { return Ok(false); }
    Ok(floor_bin((a.x as f64 + 0.5) * spacing[0])? == floor_bin((b.x as f64 + 0.5) * spacing[0])?
        && floor_bin((a.z as f64 + 0.5) * spacing[2])? == floor_bin((b.z as f64 + 0.5) * spacing[2])?)
}

fn face_area(axis: FaceAxis, a: Cell, b: Cell, air: &BTreeMap<Cell, (usize, f64)>, spacing: [f64; 3]) -> Result<f64, String> {
    let left = air.get(&a).ok_or("missing air face endpoint")?.1;
    let right = air.get(&b).ok_or("missing air face endpoint")?.1;
    let area = match axis {
        FaceAxis::Y => if spacing[0] * spacing[2] * spacing[1] - right > 0.0 { 0.0 } else { spacing[0] * spacing[2] },
        FaceAxis::X | FaceAxis::Z => {
            let dry_left = (spacing[1] - (spacing[0] * spacing[2] * spacing[1] - left) / (spacing[0] * spacing[2])).max(0.0);
            let dry_right = (spacing[1] - (spacing[0] * spacing[2] * spacing[1] - right) / (spacing[0] * spacing[2])).max(0.0);
            dry_left.min(dry_right) * if axis == FaceAxis::X { spacing[2] } else { spacing[0] }
        }
    };
    area.is_finite().then_some(area).ok_or("atmosphere face area is invalid")
}

fn find(parent: &mut [usize], value: usize) -> usize {
    if parent[value] == value { return value; }
    let root = find(parent, parent[value]);
    parent[value] = root;
    root
}

fn union(parent: &mut [usize], left: usize, right: usize) {
    let left = find(parent, left);
    let right = find(parent, right);
    if left == right { return; }
    if left < right { parent[right] = left; } else { parent[left] = right; }
}

fn identity(snapshot: &AirGeometrySnapshot, cells: &[crate::terrain_water::AirGeometryCell], spacing: [f64; 3], policy: UnmodeledWaterPolicy) -> String {
    let mut hash = 2_166_136_261u32;
    let feed = |hash: &mut u32, text: &str| { for byte in text.as_bytes() { *hash = (*hash ^ u32::from(*byte)).wrapping_mul(16_777_619); } };
    feed(&mut hash, &format!("{}:{}:{:?}:{:?}:", snapshot.physical_revision, snapshot.epoch, spacing, policy));
    let mut sorted = cells.iter().map(|cell| cell_id(cell.at)).collect::<Vec<_>>();
    sorted.sort();
    for id in sorted { feed(&mut hash, &id); }
    let mut faces = snapshot.faces.clone();
    faces.sort_by_key(|face| face.face);
    for face in faces {
        feed(&mut hash, &face_id(face.face.axis, face.face.cell));
        match face.kind {
            AirGeometryFaceKind::Internal { a, b, sealed } => {
                feed(&mut hash, &format!("i:{}:{}:{}", cell_id(a), cell_id(b), sealed));
            }
            AirGeometryFaceKind::Frontier { neighbor, sealed } => {
                feed(&mut hash, &format!("f:{:?}:{}", neighbor, sealed));
            }
        }
    }
    format!("air-geometry:{:08x}", hash)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::structure_geometry::{Face, FaceAxis};
    use crate::terrain_water::{AirGeometryBounds, AirGeometryCell, AirGeometryFace, AirGeometryFaceKind, AirWaterCoverage};

    fn snapshot(cells: &[(Cell, AirWaterCoverage)], faces: &[(Face, bool)]) -> AirGeometrySnapshot {
        AirGeometrySnapshot {
            physical_revision: 7,
            epoch: 9,
            bounds: AirGeometryBounds { min: Cell { x: -32, y: -2, z: -32 }, max: Cell { x: 32, y: 4, z: 32 } },
            cells: cells.iter().map(|(at, water)| AirGeometryCell { at: *at, voxel_volume_m3: 1.0, water: water.clone() }).collect(),
            faces: faces.iter().map(|(face, sealed)| AirGeometryFace { face: *face, kind: AirGeometryFaceKind::Internal { a: face.cell, b: match face.axis { FaceAxis::X => Cell { x: face.cell.x + 1, ..face.cell }, FaceAxis::Y => Cell { y: face.cell.y + 1, ..face.cell }, FaceAxis::Z => Cell { z: face.cell.z + 1, ..face.cell } }, sealed: *sealed } }).collect(),
        }
    }
    fn project(snapshot: &AirGeometrySnapshot) -> Result<AirAtmosphereGeometry, String> { project(snapshot, [1.0, 1.0, 1.0], UnmodeledWaterPolicy::AssumeNoAdmittedWater) }

    #[test]
    fn same_y_eight_m_bins_split_dry_cells() {
        let input = snapshot(&[(Cell { x: 7, y: 0, z: 0 }, AirWaterCoverage::Unmodeled), (Cell { x: 8, y: 0, z: 0 }, AirWaterCoverage::Unmodeled)], &[(Face { cell: Cell { x: 7, y: 0, z: 0 }, axis: FaceAxis::X }, false)]);
        assert_eq!(project(&input).unwrap().volumes.len(), 2);
    }

    #[test]
    fn negative_coordinate_floor_bins_are_deterministic() {
        let input = snapshot(&[(Cell { x: -9, y: 0, z: 0 }, AirWaterCoverage::Unmodeled), (Cell { x: -8, y: 0, z: 0 }, AirWaterCoverage::Unmodeled)], &[(Face { cell: Cell { x: -9, y: 0, z: 0 }, axis: FaceAxis::X }, false)]);
        assert_eq!(project(&input).unwrap().volumes.len(), 2);
    }

    #[test]
    fn vertical_faces_open_between_parcels_and_sealed_faces_do_not() {
        let lower = Cell { x: 0, y: 0, z: 0 };
        let upper = Cell { y: 1, ..lower };
        let open = snapshot(&[(lower, AirWaterCoverage::Unmodeled), (upper, AirWaterCoverage::Unmodeled)], &[(Face { cell: lower, axis: FaceAxis::Y }, false)]);
        assert_eq!(project(&open).unwrap().openings.len(), 1);
        let sealed = snapshot(&[(lower, AirWaterCoverage::Unmodeled), (upper, AirWaterCoverage::Unmodeled)], &[(Face { cell: lower, axis: FaceAxis::Y }, true)]);
        assert_eq!(project(&sealed).unwrap().openings.len(), 0);
    }

    #[test]
    fn full_admitted_water_is_excluded_and_unmodeled_policy_is_explicit() {
        let input = snapshot(&[(Cell { x: 0, y: 0, z: 0 }, AirWaterCoverage::Admitted { liquid_volume_m3: 1.0 }), (Cell { x: 1, y: 0, z: 0 }, AirWaterCoverage::Unmodeled)], &[]);
        assert_eq!(project(&input).unwrap().volumes.len(), 1);
        assert!(project(&input, [1.0, 1.0, 1.0], UnmodeledWaterPolicy::Reject).is_err());
    }
}
