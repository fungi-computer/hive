//! Canonical terrain/water to connected-volume atmosphere composition.
use crate::atmosphere::{
    rebind_geometry, AtmosphereAmbient,
    AtmosphereModel, AtmosphereRebindReceipt, AtmosphereRebindResult,
    AtmosphereSource, AtmosphereState, CompiledAtmosphere,
};
#[cfg(test)]
use crate::atmosphere::{project_geometry, AirAtmosphereGeometry, AtmosphereDefinition, UnmodeledWaterPolicy};
#[cfg(test)]
use crate::terrain_water::{AirGeometryFaceKind, AirGeometryFrontier, AirGeometrySnapshot};
use crate::generation::Cell;
use crate::terrain_water::{
    AirGeometryBounds, TerrainWater,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
#[path = "terrain_atmosphere_cache.rs"]
mod cache;
use cache::AirGeometryCache;
const RECORD_VERSION: u16 = 3;
const MAX_CONFIG_BYTES: usize = 64 * 1024;

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub enum ExteriorPolicy {
    Closed,
    WorldTop,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct TerrainAtmosphereConfig {
    pub region_id: String,
    pub min: Cell,
    pub max: Cell,
    pub ambient: AtmosphereAmbient,
    pub model: AtmosphereModel,
    pub exterior: ExteriorPolicy,
}
impl TerrainAtmosphereConfig {
    pub(crate) fn bounds(&self) -> AirGeometryBounds {
        AirGeometryBounds {
            min: self.min,
            max: self.max,
        }
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct TerrainAtmosphereRecords {
    version: u16,
    config: TerrainAtmosphereConfig,
    geometry_revision: u64,
    geometry_identity: String,
    state: Vec<u8>,
}
pub struct TerrainAtmosphere {
    config: TerrainAtmosphereConfig,
    compiled: CompiledAtmosphere,
    state: AtmosphereState,
    geometry: AirGeometryCache,
    geometry_revision: u64,
    source_physical_revision: u64,
    source_epoch: u64,
    spacing: [f64; 3],
    owner: Arc<()>,
    epoch: u64,
}
pub(crate) enum PreparedAtmosphereRebind {
    Unchanged {
        geometry: Option<AirGeometryCache>,
        source_physical_revision: u64,
        source_epoch: u64,
        owner: Arc<()>,
        epoch: u64,
        receipt: AtmosphereRebindReceipt,
    },
    Changed {
        geometry: AirGeometryCache,
        compiled: CompiledAtmosphere,
        state: AtmosphereState,
        geometry_revision: u64,
        source_physical_revision: u64,
        source_epoch: u64,
        owner: Arc<()>,
        epoch: u64,
        receipt: AtmosphereRebindReceipt,
    },
}

impl TerrainAtmosphere {
    pub fn fresh(
        world: &mut TerrainWater,
        config: TerrainAtmosphereConfig,
    ) -> Result<Self, String> {
        validate_config(world, &config)?;
        let snapshot = world.air_geometry(config.bounds())?;
        let geometry = AirGeometryCache::from_snapshot(&snapshot, &config, world.cell_spacing_m())?;
        let compiled = CompiledAtmosphere::compile_shared(geometry.definition(&config, world.cell_spacing_m(), snapshot.physical_revision))?;
        let state = compiled.initial();
        Ok(Self {
            config,
            geometry,
            compiled,
            state,
            geometry_revision: snapshot.physical_revision,
            source_physical_revision: snapshot.physical_revision,
            source_epoch: snapshot.epoch,
            spacing: world.cell_spacing_m(),
            owner: Arc::new(()),
            epoch: 0,
        })
    }
    pub fn config(&self) -> &TerrainAtmosphereConfig {
        &self.config
    }
    pub fn compiled(&self) -> &CompiledAtmosphere {
        &self.compiled
    }
    pub fn state(&self) -> &AtmosphereState {
        &self.state
    }
    pub fn geometry_revision(&self) -> u64 {
        self.geometry_revision
    }
    pub fn source_epoch(&self) -> u64 {
        self.source_epoch
    }
    pub fn advance(
        &mut self,
        seconds: f64,
        sources: &[AtmosphereSource],
    ) -> Result<crate::atmosphere::AtmosphereReceipt, String> {
        let epoch = self
            .epoch
            .checked_add(1)
            .ok_or("atmosphere owner epoch exhausted")?;
        let (state, receipt) = self.compiled.advance(&self.state, seconds, sources)?;
        self.state = state;
        self.epoch = epoch;
        Ok(receipt)
    }
    pub fn save(&self) -> Result<TerrainAtmosphereRecords, String> {
        let state = self.compiled.encode_state(&self.state)?;
        let config_bytes =
            postcard::to_allocvec(&self.config).map_err(|_| "atmosphere config encoding failed")?;
        if config_bytes.len() > MAX_CONFIG_BYTES {
            return Err("atmosphere config exceeds record budget".into());
        }
        Ok(TerrainAtmosphereRecords {
            version: RECORD_VERSION,
            config: self.config.clone(),
            geometry_revision: self.compiled.shared_definition().revision,
            geometry_identity: self.compiled.shared_definition().geometry_identity.clone(),
            state,
        })
    }
    pub fn restore(
        world: &mut TerrainWater,
        records: &TerrainAtmosphereRecords,
    ) -> Result<Self, String> {
        if records.version != RECORD_VERSION {
            return Err("unsupported terrain atmosphere record version".into());
        }
        validate_config(world, &records.config)?;
        if records.state.len() > 2 * 1024 * 1024 {
            return Err("atmosphere state exceeds record budget".into());
        }
        let config_bytes = postcard::to_allocvec(&records.config)
            .map_err(|_| "atmosphere config encoding failed")?;
        if config_bytes.len() > MAX_CONFIG_BYTES {
            return Err("atmosphere config exceeds record budget".into());
        }
        let snapshot = world.air_geometry(records.config.bounds())?;
        let geometry = AirGeometryCache::from_snapshot(&snapshot, &records.config, world.cell_spacing_m())?;
        let mut current_definition = geometry.definition(&records.config, world.cell_spacing_m(), snapshot.physical_revision);
        // Physical content is rebuilt, not trusted from a second saved geometry.
        // Keep the gas owner's original labels through unrelated world edits;
        // decode_state verifies a SHA-256 binding of the full physical content.
        current_definition.revision = records.geometry_revision;
        current_definition.geometry_identity = records.geometry_identity.clone();
        let compiled = CompiledAtmosphere::compile_shared(current_definition)?;
        let state = compiled.decode_state(&records.state)?;
        let geometry_revision = compiled.shared_definition().revision;
        Ok(Self {
            config: records.config.clone(),
            geometry,
            compiled,
            state,
            geometry_revision,
            source_physical_revision: snapshot.physical_revision,
            source_epoch: snapshot.epoch,
            spacing: world.cell_spacing_m(),
            owner: Arc::new(()),
            epoch: 0,
        })
    }
    pub(crate) fn prepare_world_change(
        &self,
        world: &mut TerrainWater,
        edit: crate::terrain_water::AirGeometryEdit<'_>,
    ) -> Result<Result<PreparedAtmosphereRebind, AtmosphereRebindResult>, String> {
        let changes = world.air_geometry_changes(edit)?;
        self.validate_frontier(changes.physical_revision, changes.epoch)?;
        let tiles: std::collections::BTreeSet<_> = changes.cells.into_iter()
            .filter(|cell| cache::contains(self.config.bounds(), *cell))
            .map(crate::atmosphere::MixingTile::at).collect();
        if tiles.is_empty() {
            return Ok(Ok(self.unchanged(None, changes.physical_revision, changes.epoch)));
        }
        let patches = tiles.into_iter().map(|tile| world.changed_air_geometry(edit, tile.bounds(self.config.bounds())))
            .collect::<Result<Vec<_>, _>>()?;
        let geometry = self.geometry.with_patches(&patches, &self.config, self.spacing)?;
        self.prepare_geometry(geometry, changes.physical_revision, changes.epoch)
    }
    fn validate_frontier(&self, physical_revision: u64, epoch: u64) -> Result<(), String> {
        if physical_revision < self.source_physical_revision || epoch <= self.source_epoch {
            return Err("atmosphere rebind candidate is stale or mismatched".into());
        }
        Ok(())
    }
    fn unchanged(&self, geometry: Option<AirGeometryCache>, physical_revision: u64, epoch: u64) -> PreparedAtmosphereRebind {
        PreparedAtmosphereRebind::Unchanged {
            geometry, source_physical_revision: physical_revision, source_epoch: epoch,
            owner: self.owner.clone(), epoch: self.epoch, receipt: unchanged_receipt(&self.compiled),
        }
    }
    #[cfg(test)]
    pub(crate) fn prepare_rebind(
        &self, snapshot: &AirGeometrySnapshot,
    ) -> Result<Result<PreparedAtmosphereRebind, AtmosphereRebindResult>, String> {
        self.validate_frontier(snapshot.physical_revision, snapshot.epoch)?;
        if snapshot.bounds != self.config.bounds() {
            return Err("atmosphere rebind candidate is stale or mismatched".into());
        }
        let geometry = AirGeometryCache::from_snapshot(snapshot, &self.config, self.spacing)?;
        self.prepare_geometry(geometry, snapshot.physical_revision, snapshot.epoch)
    }
    fn prepare_geometry(&self, geometry: AirGeometryCache, physical_revision: u64, epoch: u64)
        -> Result<Result<PreparedAtmosphereRebind, AtmosphereRebindResult>, String> {
        let mut candidate_definition = geometry.definition(&self.config, self.spacing, physical_revision);
        if candidate_definition.volumes.is_empty() {
            return Ok(Err(AtmosphereRebindResult::Blocked(crate::atmosphere::RebindBlockReason::TrappedVolumeRemoved)));
        }
        if candidate_definition.same_physical(self.compiled.shared_definition()) {
            return Ok(Ok(self.unchanged(Some(geometry), physical_revision, epoch)));
        }
        let next_revision = self
            .geometry_revision
            .checked_add(1)
            .ok_or("atmosphere geometry revision exhausted")?;
        // The exact candidate was already projected above. Do not scan and
        // partition the entire air domain a second time for the same edit.
        candidate_definition.revision = next_revision;
        let compiled = self.compiled.recompile_shared(candidate_definition)?;
        match rebind_geometry(&self.compiled, &self.state, &compiled)? {
            AtmosphereRebindResult::Blocked(reason) => {
                Ok(Err(AtmosphereRebindResult::Blocked(reason)))
            }
            AtmosphereRebindResult::Applied { state, receipt } => {
                Ok(Ok(PreparedAtmosphereRebind::Changed {
                    compiled,
                    state,
                    geometry,
                    geometry_revision: next_revision,
                    source_physical_revision: physical_revision,
                    source_epoch: epoch,
                    owner: self.owner.clone(),
                    epoch: self.epoch,
                    receipt,
                }))
            }
        }
    }
    pub(crate) fn apply_rebind(
        &mut self,
        prepared: PreparedAtmosphereRebind,
    ) -> Result<AtmosphereRebindReceipt, String> {
        let (owner, prepared_epoch) = match &prepared {
            PreparedAtmosphereRebind::Unchanged { owner, epoch, .. }
            | PreparedAtmosphereRebind::Changed { owner, epoch, .. } => (owner, *epoch),
        };
        if !Arc::ptr_eq(&self.owner, owner) || self.epoch != prepared_epoch {
            return Err("prepared atmosphere rebind is stale or foreign".into());
        }
        let epoch = self
            .epoch
            .checked_add(1)
            .ok_or("atmosphere owner epoch exhausted")?;
        match prepared {
            PreparedAtmosphereRebind::Unchanged {
                geometry,
                source_physical_revision,
                source_epoch,
                receipt,
                ..
            } => {
                if let Some(geometry) = geometry { self.geometry = geometry; }
                self.source_physical_revision = source_physical_revision;
                self.source_epoch = source_epoch;
                self.epoch = epoch;
                Ok(receipt)
            }
            PreparedAtmosphereRebind::Changed {
                geometry,
                compiled,
                state,
                geometry_revision,
                source_physical_revision,
                source_epoch,
                receipt,
                ..
            } => {
                self.geometry = geometry;
                self.compiled = compiled;
                self.state = state;
                self.geometry_revision = geometry_revision;
                self.source_physical_revision = source_physical_revision;
                self.source_epoch = source_epoch;
                self.epoch = epoch;
                Ok(receipt)
            }
        }
    }
}

fn validate_config(world: &TerrainWater, config: &TerrainAtmosphereConfig) -> Result<(), String> {
    if config.region_id.is_empty() {
        return Err("atmosphere region id is empty".into());
    }
    let b = world.bounds();
    if config.min.x >= config.max.x
        || config.min.y >= config.max.y
        || config.min.z >= config.max.z
        || config.min.x < b.min_x
        || config.max.x > b.max_x
        || config.min.y < b.min_y
        || config.max.y > b.max_y
        || config.min.z < b.min_z
        || config.max.z > b.max_z
    {
        return Err("atmosphere bounds outside generated world".into());
    }
    if config.exterior == ExteriorPolicy::WorldTop && config.max.y != b.max_y {
        return Err("world-top atmosphere requires the world upper bound".into());
    }
    Ok(())
}
fn unchanged_receipt(compiled: &CompiledAtmosphere) -> AtmosphereRebindReceipt {
    let volume_m3 = compiled
        .shared_definition()
        .volumes
        .iter()
        .flat_map(|volume| volume.members.iter())
        .map(|member| member.volume_m3)
        .sum();
    AtmosphereRebindReceipt {
        old_identity: compiled.identity().to_owned(),
        new_identity: compiled.identity().to_owned(),
        old_volume_m3: volume_m3,
        new_volume_m3: volume_m3,
        carrier_boundary_kg: 0.0,
        smoke_boundary_kg: 0.0,
        heat_boundary_j: 0.0,
        routed_parcels: Vec::new(),
    }
}
#[cfg(test)]
pub(crate) fn definition_from_snapshot(
    config: &TerrainAtmosphereConfig,
    snapshot: &AirGeometrySnapshot,
    spacing: [f64; 3],
) -> Result<(AtmosphereDefinition, AirAtmosphereGeometry), String> {
    let mut projected = project_geometry(
        snapshot,
        spacing,
        UnmodeledWaterPolicy::AssumeNoAdmittedWater,
    )?;
    let mut openings = projected.openings.clone();
    if config.exterior == ExteriorPolicy::WorldTop {
        let mut volume_by_cell = std::collections::BTreeMap::new();
        for volume in &projected.volumes {
            for member in &volume.members {
                volume_by_cell.insert(member.cell_id.as_str(), volume.id.as_str());
            }
        }
        for face in &snapshot.faces {
            let AirGeometryFaceKind::Frontier {
                neighbor: AirGeometryFrontier::OutsideQuery,
                sealed: false,
            } = &face.kind
            else {
                continue;
            };
            if !matches!(face.face.axis, crate::structure_geometry::FaceAxis::Y)
                || face.face.cell.y != config.max.y.saturating_sub(1)
            {
                continue;
            }
            let cell_id = format!(
                "cell:{},{},{}",
                face.face.cell.x, face.face.cell.y, face.face.cell.z
            );
            let Some(volume_id) = volume_by_cell.get(cell_id.as_str()) else {
                continue;
            };
            openings.push(crate::atmosphere::AtmosphereOpeningDefinition {
                id: format!("sky:{},{},{}", face.face.cell.x, face.face.cell.y, face.face.cell.z),
                from: (*volume_id).to_owned(),
                from_cell_id: cell_id,
                to: None,
                to_cell_id: None,
                area_m2: spacing[0] * spacing[2],
                distance_m: spacing[1],
                elevation_m: (f64::from(face.face.cell.y) + 1.0) * spacing[1],
                permeability: 1.0,
            });
        }
    }
    openings.sort_by(|a, b| a.to.is_none().cmp(&b.to.is_none()).then_with(|| a.id.cmp(&b.id)));
    let identity = format!("{}:exterior:{:?}", projected.identity, config.exterior);
    let definition = AtmosphereDefinition {
        version: "connected-atmosphere-definition-v1".into(),
        region_id: config.region_id.clone(),
        geometry_identity: identity,
        revision: snapshot.physical_revision,
        ambient: config.ambient.clone(),
        model: config.model.clone(),
        volumes: projected.volumes.clone(),
        openings,
    };
    projected.openings = definition.openings.clone();
    Ok((definition, projected))
}
