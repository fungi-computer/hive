//! Deterministic atmosphere geometry projection over the canonical air query.
//!
//! This module has no ambient policy, solver, clock, or stock remap authority.
//! Query frontiers are intentionally closed until a caller supplies an explicit
//! exterior policy.

use super::{AtmosphereMember, AtmosphereOpeningDefinition, AtmosphereVolumeDefinition};
use crate::generation::Cell;
use crate::structure_geometry::{Face, FaceAxis};
use crate::terrain_water::{AirGeometryFaceKind, AirGeometrySnapshot, AirWaterCoverage};
use std::collections::{BTreeMap, BTreeSet};

const MIXING_BIN_CELLS: i64 = 8;

/// A bounded simulation partition, independent of the rendering metric.
/// A component never joins across one of these boundaries; exchange does.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub(crate) struct MixingTile(pub i64, pub i32, pub i64);
impl MixingTile {
    pub(crate) fn at(cell: Cell) -> Self {
        Self(cell.x.div_euclid(MIXING_BIN_CELLS), cell.y, cell.z.div_euclid(MIXING_BIN_CELLS))
    }
    pub(crate) fn bounds(self, region: crate::terrain_water::AirGeometryBounds) -> crate::terrain_water::AirGeometryBounds {
        let x = self.0 * MIXING_BIN_CELLS;
        let z = self.2 * MIXING_BIN_CELLS;
        crate::terrain_water::AirGeometryBounds {
            min: Cell { x: x.max(region.min.x), y: self.1, z: z.max(region.min.z) },
            max: Cell { x: x.saturating_add(MIXING_BIN_CELLS).min(region.max.x),
                y: self.1.saturating_add(1).min(region.max.y), z: z.saturating_add(MIXING_BIN_CELLS).min(region.max.z) },
        }
    }
}

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

#[derive(Clone, Copy, Debug)]
struct AirMetric {
    index: usize,
    free: f64,
    liquid: f64,
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

    if snapshot.cells.len() > super::MAX_MEMBERS {
        return Err("atmosphere geometry exceeds cell bound".into());
    }
    if snapshot.faces.len() > super::MAX_OPENINGS {
        return Err("atmosphere geometry exceeds face bound".into());
    }
    let mut seen_cells = BTreeSet::new();
    for cell in &snapshot.cells {
        if !seen_cells.insert(cell.at) {
            return Err("duplicate atmosphere geometry cell".into());
        }
        if !cell.voxel_volume_m3.is_finite()
            || cell.voxel_volume_m3 <= 0.0
            || cell.voxel_volume_m3 != voxel_volume
        {
            return Err("atmosphere geometry cell metric mismatch".into());
        }
        match &cell.water {
            AirWaterCoverage::Admitted { liquid_volume_m3 }
                if !liquid_volume_m3.is_finite()
                    || *liquid_volume_m3 < 0.0
                    || *liquid_volume_m3 > cell.voxel_volume_m3 =>
            {
                return Err("atmosphere geometry water volume is invalid".into())
            }
            AirWaterCoverage::Unmodeled if water_policy == UnmodeledWaterPolicy::Reject => {
                return Err("atmosphere geometry has unmodeled water coverage".into())
            }
            _ => {}
        }
    }
    let mut seen_faces = BTreeSet::new();
    for face in &snapshot.faces {
        if !seen_faces.insert(face.face) {
            return Err("duplicate atmosphere geometry face".into());
        }
        if let AirGeometryFaceKind::Internal { a, b, .. } = &face.kind {
            if face.face.cell != *a
                || !canonical_neighbor(*a, *b, face.face.axis)
                || !seen_cells.contains(a)
                || !seen_cells.contains(b)
            {
                return Err("non-canonical atmosphere internal face".into());
            }
        }
    }
    let mut cells = snapshot.cells.clone();
    cells.sort_by_key(|cell| cell.at);
    let mut air = BTreeMap::<Cell, AirMetric>::new();
    for cell in &cells {
        let liquid = match &cell.water {
            AirWaterCoverage::Admitted { liquid_volume_m3 } => *liquid_volume_m3,
            AirWaterCoverage::Unmodeled => 0.0,
        };
        let free = cell.voxel_volume_m3 - liquid;
        if free > 0.0 {
            let index = air.len();
            air.insert(
                cell.at,
                AirMetric {
                    index,
                    free,
                    liquid,
                },
            );
        }
    }
    if air.is_empty() {
        return Err("atmosphere geometry has no free air cells".into());
    }

    let mut parent: Vec<usize> = (0..air.len()).collect();
    let mut positions = BTreeMap::new();
    for (at, metric) in &air {
        positions.insert(*at, metric.index);
    }
    for face in &snapshot.faces {
        let AirGeometryFaceKind::Internal { a, b, sealed } = &face.kind else {
            continue;
        };
        if *sealed || !matches!(face.face.axis, FaceAxis::X | FaceAxis::Z) {
            continue;
        }
        let (Some(left), Some(right)) = (positions.get(a), positions.get(b)) else {
            continue;
        };
        if MixingTile::at(*a) == MixingTile::at(*b) {
            union(&mut parent, *left, *right);
        }
    }

    let mut members: BTreeMap<usize, Vec<(Cell, f64)>> = BTreeMap::new();
    for (at, metric) in &air {
        let root = find(&mut parent, metric.index);
        members.entry(root).or_default().push((*at, metric.free));
    }
    let mut groups: Vec<Vec<(Cell, f64)>> = members.into_values().collect();
    for group in &mut groups {
        group.sort_by_key(|(at, _)| *at);
    }
    groups.sort_by_key(|group| group[0].0);

    let mut volume_by_cell = BTreeMap::new();
    let mut volumes = Vec::with_capacity(groups.len());
    for group in groups {
        let first = group[0].0;
        let volume_id = cell_id(first);
        let mut member_defs = Vec::with_capacity(group.len());
        for (at, free) in &group {
            let id = cell_id(*at);
            volume_by_cell.insert(*at, volume_id.clone());
            let elevation_m = (f64::from(at.y) + 0.5) * spacing_m[1];
            if !elevation_m.is_finite() || !free.is_finite() || *free <= 0.0 {
                return Err("atmosphere geometry member metric is invalid".into());
            }
            member_defs.push(AtmosphereMember {
                cell_id: id,
                volume_m3: *free,
                elevation_m,
            });
        }
        volumes.push(AtmosphereVolumeDefinition {
            id: volume_id,
            members: member_defs,
        });
    }

    let mut openings = Vec::new();
    let mut opening_ids = BTreeSet::new();
    for face in &snapshot.faces {
        let AirGeometryFaceKind::Internal { a, b, sealed } = &face.kind else {
            continue;
        };
        if *sealed || !air.contains_key(a) || !air.contains_key(b) {
            continue;
        }
        let from = volume_by_cell
            .get(a)
            .ok_or("air volume missing face endpoint")?;
        let to = volume_by_cell
            .get(b)
            .ok_or("air volume missing face endpoint")?;
        let left = &air[a];
        let right = &air[b];
        let Some(opening) = connect_face(face.face,
            FaceEndpoint { volume: from, free: left.free, liquid: left.liquid },
            FaceEndpoint { volume: to, free: right.free, liquid: right.liquid }, spacing_m)? else { continue; };
        if !opening_ids.insert(opening.id.clone()) {
            return Err("duplicate atmosphere opening".into());
        }
        openings.push(opening);
    }
    openings.sort_by(|left, right| left.id.cmp(&right.id));
    if volumes.len() > super::MAX_VOLUMES || openings.len() > super::MAX_OPENINGS {
        return Err("atmosphere geometry graph exceeds admission bounds".into());
    }

    Ok(AirAtmosphereGeometry {
        identity: geometry_identity(
            snapshot.physical_revision,
            spacing_m,
            water_policy,
            cells.len(),
            openings.len(),
        ),
        physical_revision: snapshot.physical_revision,
        epoch: snapshot.epoch,
        volumes,
        openings,
    })
}

fn validate_spacing(spacing: [f64; 3]) -> Result<(), String> {
    if spacing
        .iter()
        .any(|value| !value.is_finite() || *value <= 0.0)
    {
        return Err("atmosphere geometry spacing is invalid".into());
    }
    Ok(())
}

fn cell_id(at: Cell) -> String {
    format!("cell:{},{},{}", at.x, at.y, at.z)
}

fn canonical_neighbor(a: Cell, b: Cell, axis: FaceAxis) -> bool {
    match axis {
        FaceAxis::X => a.y == b.y && a.z == b.z && a.x.checked_add(1) == Some(b.x),
        FaceAxis::Y => a.x == b.x && a.z == b.z && a.y.checked_add(1) == Some(b.y),
        FaceAxis::Z => a.x == b.x && a.y == b.y && a.z.checked_add(1) == Some(b.z),
    }
}

fn face_id(axis: FaceAxis, at: Cell) -> String {
    let axis = match axis {
        FaceAxis::X => 'x',
        FaceAxis::Y => 'y',
        FaceAxis::Z => 'z',
    };
    format!("{axis}:{},{},{}", at.x, at.y, at.z)
}

fn axis_index(axis: FaceAxis) -> usize {
    match axis {
        FaceAxis::X => 0,
        FaceAxis::Y => 1,
        FaceAxis::Z => 2,
    }
}

pub(crate) struct FaceEndpoint<'a> {
    pub(crate) volume: &'a str,
    pub(crate) free: f64,
    pub(crate) liquid: f64,
}

/// Shared metric law for the full reference and incremental projection.
pub(crate) fn connect_face(face: Face, left: FaceEndpoint<'_>, right: FaceEndpoint<'_>, spacing: [f64; 3])
    -> Result<Option<AtmosphereOpeningDefinition>, String> {
    if left.volume == right.volume { return Ok(None); }
    let area = match face.axis {
        FaceAxis::Y => {
            if right.liquid > 0.0 {
                0.0
            } else {
                spacing[0] * spacing[2]
            }
        }
        FaceAxis::X | FaceAxis::Z => {
            let dry_left = left.free / (spacing[0] * spacing[2]);
            let dry_right = right.free / (spacing[0] * spacing[2]);
            dry_left.min(dry_right)
                * if face.axis == FaceAxis::X {
                    spacing[2]
                } else {
                    spacing[0]
                }
        }
    };
    let b = face.neighbor()?;
    let elevation_m = (f64::from(face.cell.y) + f64::from(b.y) + 1.0) * spacing[1] * 0.5;
    let distance_m = spacing[axis_index(face.axis)];
    if !area.is_finite() || !elevation_m.is_finite() || !distance_m.is_finite() {
        return Err("atmosphere geometry opening metric is invalid".into());
    }
    if area <= 0.0 { return Ok(None); }
    Ok(Some(AtmosphereOpeningDefinition {
        id: face_id(face.axis, face.cell), from: left.volume.to_owned(), from_cell_id: cell_id(face.cell),
        to: Some(right.volume.to_owned()), to_cell_id: Some(cell_id(b)), area_m2: area,
        distance_m, elevation_m, permeability: 1.0,
    }))
}

fn find(parent: &mut [usize], value: usize) -> usize {
    let mut root = value;
    while parent[root] != root {
        root = parent[root];
    }
    let mut current = value;
    while parent[current] != current {
        let next = parent[current];
        parent[current] = root;
        current = next;
    }
    root
}

fn union(parent: &mut [usize], left: usize, right: usize) {
    let left = find(parent, left);
    let right = find(parent, right);
    if left == right {
        return;
    }
    if left < right {
        parent[right] = left;
    } else {
        parent[left] = right;
    }
}

pub(crate) fn geometry_identity(
    physical_revision: u64,
    spacing: [f64; 3],
    policy: UnmodeledWaterPolicy,
    cells: usize,
    openings: usize,
) -> String {
    // This bounded revision tag is not topology authority. The atmosphere
    // owner retains canonical definition equality when accepting a definition.
    // A process-local epoch resets after restore and cannot identify saved geometry.
    format!(
        "air-geometry:v2:{}:{:?}:{:?}:{cells}:{openings}",
        physical_revision, spacing, policy
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::structure_geometry::{Face, FaceAxis};
    use crate::terrain_water::{
        AirGeometryBounds, AirGeometryCell, AirGeometryFace, AirGeometryFaceKind, AirWaterCoverage,
    };

    fn snapshot(cells: &[(Cell, AirWaterCoverage)], faces: &[(Face, bool)]) -> AirGeometrySnapshot {
        AirGeometrySnapshot {
            physical_revision: 7,
            epoch: 9,
            bounds: AirGeometryBounds {
                min: Cell {
                    x: -32,
                    y: -2,
                    z: -32,
                },
                max: Cell { x: 32, y: 4, z: 32 },
            },
            cells: cells
                .iter()
                .map(|(at, water)| AirGeometryCell {
                    at: *at,
                    voxel_volume_m3: 1.0,
                    water: water.clone(),
                })
                .collect(),
            faces: faces
                .iter()
                .map(|(face, sealed)| AirGeometryFace {
                    face: *face,
                    kind: AirGeometryFaceKind::Internal {
                        a: face.cell,
                        b: match face.axis {
                            FaceAxis::X => Cell {
                                x: face.cell.x + 1,
                                ..face.cell
                            },
                            FaceAxis::Y => Cell {
                                y: face.cell.y + 1,
                                ..face.cell
                            },
                            FaceAxis::Z => Cell {
                                z: face.cell.z + 1,
                                ..face.cell
                            },
                        },
                        sealed: *sealed,
                    },
                })
                .collect(),
        }
    }
    fn project(snapshot: &AirGeometrySnapshot) -> Result<AirAtmosphereGeometry, String> {
        super::project(
            snapshot,
            [1.0, 1.0, 1.0],
            UnmodeledWaterPolicy::AssumeNoAdmittedWater,
        )
    }

    #[test]
    fn same_y_eight_m_bins_split_dry_cells() {
        let input = snapshot(
            &[
                (Cell { x: 7, y: 0, z: 0 }, AirWaterCoverage::Unmodeled),
                (Cell { x: 8, y: 0, z: 0 }, AirWaterCoverage::Unmodeled),
            ],
            &[(
                Face {
                    cell: Cell { x: 7, y: 0, z: 0 },
                    axis: FaceAxis::X,
                },
                false,
            )],
        );
        assert_eq!(project(&input).unwrap().volumes.len(), 2);
    }

    #[test]
    fn negative_coordinate_floor_bins_are_deterministic() {
        let input = snapshot(
            &[
                (Cell { x: -9, y: 0, z: 0 }, AirWaterCoverage::Unmodeled),
                (Cell { x: -8, y: 0, z: 0 }, AirWaterCoverage::Unmodeled),
            ],
            &[(
                Face {
                    cell: Cell { x: -9, y: 0, z: 0 },
                    axis: FaceAxis::X,
                },
                false,
            )],
        );
        assert_eq!(project(&input).unwrap().volumes.len(), 2);
    }

    #[test]
    fn vertical_faces_open_between_parcels_and_sealed_faces_do_not() {
        let lower = Cell { x: 0, y: 0, z: 0 };
        let upper = Cell { y: 1, ..lower };
        let open = snapshot(
            &[
                (lower, AirWaterCoverage::Unmodeled),
                (upper, AirWaterCoverage::Unmodeled),
            ],
            &[(
                Face {
                    cell: lower,
                    axis: FaceAxis::Y,
                },
                false,
            )],
        );
        assert_eq!(project(&open).unwrap().openings.len(), 1);
        let sealed = snapshot(
            &[
                (lower, AirWaterCoverage::Unmodeled),
                (upper, AirWaterCoverage::Unmodeled),
            ],
            &[(
                Face {
                    cell: lower,
                    axis: FaceAxis::Y,
                },
                true,
            )],
        );
        assert_eq!(project(&sealed).unwrap().openings.len(), 0);
    }

    #[test]
    fn full_admitted_water_is_excluded_and_unmodeled_policy_is_explicit() {
        let input = snapshot(
            &[
                (
                    Cell { x: 0, y: 0, z: 0 },
                    AirWaterCoverage::Admitted {
                        liquid_volume_m3: 1.0,
                    },
                ),
                (Cell { x: 1, y: 0, z: 0 }, AirWaterCoverage::Unmodeled),
            ],
            &[],
        );
        assert_eq!(project(&input).unwrap().volumes.len(), 1);
        assert!(super::project(&input, [1.0, 1.0, 1.0], UnmodeledWaterPolicy::Reject).is_err());
    }

    #[test]
    fn duplicate_cells_are_rejected_before_projection() {
        let mut input = snapshot(
            &[(Cell { x: 0, y: 0, z: 0 }, AirWaterCoverage::Unmodeled)],
            &[],
        );
        input.cells.push(input.cells[0].clone());
        assert!(project(&input).is_err());
    }

    #[test]
    fn restored_process_epoch_does_not_change_canonical_geometry_identity() {
        let mut input = snapshot(
            &[(Cell { x: 0, y: 0, z: 0 }, AirWaterCoverage::Unmodeled)], &[]);
        let before = project(&input).unwrap();
        input.epoch = 0;
        let restored = project(&input).unwrap();
        assert_eq!(before.identity, restored.identity);
        assert_eq!(before.volumes, restored.volumes);
        assert_eq!(before.openings, restored.openings);
        assert_ne!(before.epoch, restored.epoch);
    }

    #[test]
    fn face_order_does_not_change_projection() {
        let a = Cell { x: 0, y: 0, z: 0 };
        let b = Cell { x: 1, y: 0, z: 0 };
        let c = Cell { x: 0, y: 0, z: 1 };
        let first = snapshot(
            &[
                (a, AirWaterCoverage::Unmodeled),
                (b, AirWaterCoverage::Unmodeled),
                (c, AirWaterCoverage::Unmodeled),
            ],
            &[
                (
                    Face {
                        cell: a,
                        axis: FaceAxis::X,
                    },
                    false,
                ),
                (
                    Face {
                        cell: a,
                        axis: FaceAxis::Z,
                    },
                    false,
                ),
            ],
        );
        let mut second = first.clone();
        second.faces.reverse();
        assert_eq!(project(&first).unwrap(), project(&second).unwrap());
    }
}
