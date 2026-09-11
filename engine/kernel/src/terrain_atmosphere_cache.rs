//! Rebuildable bounded gas partitions. Physical terrain remains authoritative.
//! Preparation shares untouched tiles; publication replaces the detached cache.
use super::{ExteriorPolicy, TerrainAtmosphereConfig};
use crate::atmosphere::{
    self, SharedAtmosphereDefinition, AtmosphereOpeningDefinition, AtmosphereVolumeDefinition,
    FaceEndpoint, MixingTile, UnmodeledWaterPolicy,
};
use crate::generation::Cell;
use crate::structure_geometry::{Face, FaceAxis};
use crate::terrain_water::{
    AirGeometryBounds, AirGeometryCell, AirGeometryFace, AirGeometryFaceKind, AirGeometryFrontier,
    AirGeometrySnapshot, AirWaterCoverage,
};
use std::collections::{BTreeMap, BTreeSet};
use std::sync::Arc;

#[derive(Clone, Debug)]
struct Tile {
    cells: BTreeMap<Cell, AirGeometryCell>,
    faces: BTreeMap<Face, bool>,
    volumes: Vec<(Cell, Arc<AtmosphereVolumeDefinition>)>,
    membership: BTreeMap<Cell, (String, f64, f64)>,
}

impl Tile {
    fn compile(snapshot: &AirGeometrySnapshot, spacing: [f64; 3]) -> Result<Self, String> {
        let cells: BTreeMap<_, _> = snapshot
            .cells
            .iter()
            .map(|cell| (cell.at, cell.clone()))
            .collect();
        let faces = snapshot
            .faces
            .iter()
            .map(|face| {
                (
                    face.face,
                    match face.kind {
                        AirGeometryFaceKind::Internal { sealed, .. }
                        | AirGeometryFaceKind::Frontier { sealed, .. } => sealed,
                    },
                )
            })
            .collect();
        if cells.len() != snapshot.cells.len() {
            return Err("duplicate atmosphere geometry cell".into());
        }
        for cell in cells.values() {
            let water = liquid(cell);
            if !cell.voxel_volume_m3.is_finite()
                || cell.voxel_volume_m3 <= 0.0
                || cell.voxel_volume_m3 != spacing.iter().product::<f64>()
            {
                return Err("atmosphere geometry cell metric mismatch".into());
            }
            if !water.is_finite() || water < 0.0 || water > cell.voxel_volume_m3 {
                return Err("atmosphere geometry water volume is invalid".into());
            }
        }
        let has_air = cells
            .values()
            .any(|cell| liquid(cell) < cell.voxel_volume_m3);
        let projected = if has_air {
            atmosphere::project_geometry(
                snapshot,
                spacing,
                UnmodeledWaterPolicy::AssumeNoAdmittedWater,
            )?
            .volumes
        } else {
            Vec::new()
        };
        let mut membership = BTreeMap::new();
        let mut volumes = Vec::new();
        let names: BTreeMap<_, _> = cells
            .keys()
            .map(|at| (format!("cell:{},{},{}", at.x, at.y, at.z), *at))
            .collect();
        for volume in projected {
            let first = *names
                .get(&volume.members[0].cell_id)
                .ok_or("gas tile anchor is missing")?;
            for member in &volume.members {
                let at = *names
                    .get(&member.cell_id)
                    .ok_or("gas tile member is missing")?;
                membership.insert(
                    at,
                    (volume.id.clone(), member.volume_m3, liquid(&cells[&at])),
                );
            }
            volumes.push((first, Arc::new(volume)));
        }
        Ok(Self {
            cells,
            faces,
            volumes,
            membership,
        })
    }
}

fn liquid(cell: &AirGeometryCell) -> f64 {
    match cell.water {
        AirWaterCoverage::Admitted { liquid_volume_m3 } => liquid_volume_m3,
        AirWaterCoverage::Unmodeled => 0.0,
    }
}

pub(super) fn contains(bounds: AirGeometryBounds, cell: Cell) -> bool {
    cell.x >= bounds.min.x
        && cell.x < bounds.max.x
        && cell.y >= bounds.min.y
        && cell.y < bounds.max.y
        && cell.z >= bounds.min.z
        && cell.z < bounds.max.z
}

#[derive(Clone, Debug)]
pub(crate) struct AirGeometryCache {
    tiles: BTreeMap<MixingTile, Arc<Tile>>,
    openings: BTreeMap<Face, Arc<AtmosphereOpeningDefinition>>,
}

impl AirGeometryCache {
    pub(super) fn from_snapshot(
        snapshot: &AirGeometrySnapshot,
        config: &TerrainAtmosphereConfig,
        spacing: [f64; 3],
    ) -> Result<Self, String> {
        let mut pieces = BTreeMap::new();
        for cell in &snapshot.cells {
            let key = MixingTile::at(cell.at);
            piece(&mut pieces, key, snapshot).cells.push(cell.clone());
        }
        for face in &snapshot.faces {
            let b = face.face.neighbor()?;
            let keys: BTreeSet<_> = [face.face.cell, b]
                .into_iter()
                .filter(|cell| contains(snapshot.bounds, *cell))
                .map(MixingTile::at)
                .collect();
            for key in keys {
                let local = piece(&mut pieces, key, snapshot);
                let kind = match face.kind {
                    AirGeometryFaceKind::Internal { a, b, sealed }
                        if contains(local.bounds, a) && contains(local.bounds, b) =>
                    {
                        AirGeometryFaceKind::Internal { a, b, sealed }
                    }
                    AirGeometryFaceKind::Internal { sealed, .. }
                    | AirGeometryFaceKind::Frontier { sealed, .. } => {
                        AirGeometryFaceKind::Frontier {
                            neighbor: AirGeometryFrontier::OutsideQuery,
                            sealed,
                        }
                    }
                };
                local.faces.push(AirGeometryFace {
                    face: face.face,
                    kind,
                });
            }
        }
        let tiles = pieces
            .into_iter()
            .map(|(key, piece)| Ok((key, Arc::new(Tile::compile(&piece, spacing)?))))
            .collect::<Result<_, String>>()?;
        let mut cache = Self {
            tiles,
            openings: BTreeMap::new(),
        };
        for face in &snapshot.faces {
            let sealed = match face.kind {
                AirGeometryFaceKind::Internal { sealed, .. }
                | AirGeometryFaceKind::Frontier { sealed, .. } => sealed,
            };
            if let Some(opening) = cache.opening(face.face, sealed, config, spacing)? {
                cache.openings.insert(face.face, Arc::new(opening));
            }
        }
        Ok(cache)
    }

    /// Only supplied tile snapshots are repartitioned. Incident openings also
    /// see the updated memberships at both endpoints before they are replaced.
    pub(super) fn with_patches(
        &self,
        patches: &[AirGeometrySnapshot],
        config: &TerrainAtmosphereConfig,
        spacing: [f64; 3],
    ) -> Result<Self, String> {
        let mut next = self.clone();
        let mut changed = BTreeSet::new();
        let mut faces = BTreeSet::new();
        for patch in patches {
            let key = MixingTile::at(patch.bounds.min);
            if key.bounds(config.bounds()) != patch.bounds || !changed.insert(key) {
                return Err("gas geometry patch is not a unique complete tile".into());
            }
            if let Some(old) = self.tiles.get(&key) {
                faces.extend(old.faces.keys().copied());
            }
            let tile = Tile::compile(patch, spacing)?;
            faces.extend(tile.faces.keys().copied());
            next.tiles.insert(key, Arc::new(tile));
        }
        for face in faces {
            let b = face.neighbor()?;
            // An unchanged neighbor can still retain an old boundary-face flag.
            // Prefer the freshly queried physical endpoint, never that stale flag.
            let keys = [MixingTile::at(face.cell), MixingTile::at(b)];
            let sealed = keys
                .iter()
                .filter(|key| changed.contains(key))
                .filter_map(|key| next.tiles.get(key))
                .find_map(|tile| tile.faces.get(&face))
                .copied();
            next.openings.remove(&face);
            if let Some(sealed) = sealed {
                if let Some(opening) = next.opening(face, sealed, config, spacing)? {
                    next.openings.insert(face, Arc::new(opening));
                }
            }
        }
        Ok(next)
    }

    fn endpoint(&self, at: Cell) -> Option<FaceEndpoint<'_>> {
        let (volume, free, liquid) = self.tiles.get(&MixingTile::at(at))?.membership.get(&at)?;
        Some(FaceEndpoint {
            volume,
            free: *free,
            liquid: *liquid,
        })
    }

    fn opening(
        &self,
        face: Face,
        sealed: bool,
        config: &TerrainAtmosphereConfig,
        spacing: [f64; 3],
    ) -> Result<Option<AtmosphereOpeningDefinition>, String> {
        if sealed {
            return Ok(None);
        }
        let Some(left) = self.endpoint(face.cell) else {
            return Ok(None);
        };
        if let Some(right) = self.endpoint(face.neighbor()?) {
            return atmosphere::connect_face(face, left, right, spacing);
        }
        if config.exterior != ExteriorPolicy::WorldTop
            || face.axis != FaceAxis::Y
            || face.cell.y != config.max.y - 1
        {
            return Ok(None);
        }
        Ok(Some(AtmosphereOpeningDefinition {
            id: format!("sky:{},{},{}", face.cell.x, face.cell.y, face.cell.z),
            from: left.volume.to_owned(),
            from_cell_id: format!("cell:{},{},{}", face.cell.x, face.cell.y, face.cell.z),
            to: None,
            to_cell_id: None,
            area_m2: spacing[0] * spacing[2],
            distance_m: spacing[1],
            elevation_m: (f64::from(face.cell.y) + 1.0) * spacing[1],
            permeability: 1.0,
        }))
    }

    pub(super) fn definition(
        &self,
        config: &TerrainAtmosphereConfig,
        spacing: [f64; 3],
        physical_revision: u64,
    ) -> SharedAtmosphereDefinition {
        let mut volumes: Vec<_> = self
            .tiles
            .values()
            .flat_map(|tile| tile.volumes.iter())
            .collect();
        // The full projector orders volume IDs by numeric first-cell coordinate.
        volumes.sort_by_key(|(cell, _)| *cell);
        let volumes = volumes
            .into_iter()
            .map(|(_, volume)| volume.clone())
            .collect();
        let mut openings: Vec<_> = self
            .openings
            .values()
            .cloned()
            .collect();
        openings.sort_by(|a, b| {
            a.to.is_none()
                .cmp(&b.to.is_none())
                .then_with(|| a.id.cmp(&b.id))
        });
        let internal = openings
            .iter()
            .filter(|opening| opening.to.is_some())
            .count();
        let cells = self.tiles.values().map(|tile| tile.cells.len()).sum();
        let identity = atmosphere::geometry_identity(
            physical_revision,
            spacing,
            UnmodeledWaterPolicy::AssumeNoAdmittedWater,
            cells,
            internal,
        );
        SharedAtmosphereDefinition {
            version: "connected-atmosphere-definition-v1".into(),
            region_id: config.region_id.clone(),
            geometry_identity: format!("{identity}:exterior:{:?}", config.exterior),
            revision: physical_revision,
            ambient: config.ambient.clone(),
            model: config.model.clone(),
            volumes,
            openings,
        }
    }
}

fn piece<'a>(
    pieces: &'a mut BTreeMap<MixingTile, AirGeometrySnapshot>,
    key: MixingTile,
    full: &AirGeometrySnapshot,
) -> &'a mut AirGeometrySnapshot {
    pieces.entry(key).or_insert_with(|| AirGeometrySnapshot {
        bounds: key.bounds(full.bounds),
        physical_revision: full.physical_revision,
        epoch: full.epoch,
        cells: Vec::new(),
        faces: Vec::new(),
    })
}
