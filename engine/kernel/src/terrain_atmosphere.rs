//! Canonical terrain/water to connected-volume atmosphere composition.
use crate::atmosphere::{
    project_geometry, rebind_geometry, AirAtmosphereGeometry, AtmosphereAmbient,
    AtmosphereDefinition, AtmosphereModel, AtmosphereRebindReceipt, AtmosphereRebindResult,
    AtmosphereSource, AtmosphereState, CompiledAtmosphere, UnmodeledWaterPolicy,
};
use crate::generation::Cell;
use crate::terrain_water::{
    AirGeometryBounds, AirGeometryFaceKind, AirGeometryFrontier, AirGeometrySnapshot, TerrainWater,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
const RECORD_VERSION: u16 = 1;
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
    state: Vec<u8>,
}
pub struct TerrainAtmosphere {
    config: TerrainAtmosphereConfig,
    compiled: CompiledAtmosphere,
    state: AtmosphereState,
    geometry_revision: u64,
    source_physical_revision: u64,
    source_epoch: u64,
    spacing: [f64; 3],
    owner: Arc<()>,
    epoch: u64,
}
pub(crate) enum PreparedAtmosphereRebind {
    Unchanged {
        source_physical_revision: u64,
        source_epoch: u64,
        owner: Arc<()>,
        epoch: u64,
        receipt: AtmosphereRebindReceipt,
    },
    Changed {
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
        let (compiled, state) = compile_snapshot(world, &config, &snapshot)?;
        Ok(Self {
            config,
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
        let saved_definition = CompiledAtmosphere::saved_definition(&records.state)?;
        let (mut current_definition, _) =
            definition_from_snapshot(&records.config, &snapshot, world.cell_spacing_m())?;
        if !same_physical_definition(&current_definition, &saved_definition) {
            return Err("terrain atmosphere geometry binding mismatch".into());
        }
        let compiled = CompiledAtmosphere::compile(saved_definition)?;
        let state = compiled.decode_state(&records.state)?;
        let geometry_revision = compiled.definition().revision;
        Ok(Self {
            config: records.config.clone(),
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
    pub(crate) fn prepare_rebind(
        &self,
        snapshot: &AirGeometrySnapshot,
    ) -> Result<Result<PreparedAtmosphereRebind, AtmosphereRebindResult>, String> {
        if snapshot.physical_revision < self.source_physical_revision
            || snapshot.epoch <= self.source_epoch
            || snapshot.bounds.min != self.config.min
            || snapshot.bounds.max != self.config.max
        {
            return Err("atmosphere rebind candidate is stale or mismatched".into());
        }
        if !snapshot_has_free_air(snapshot) {
            return Ok(Err(AtmosphereRebindResult::Blocked(
                crate::atmosphere::RebindBlockReason::TrappedVolumeRemoved,
            )));
        }
        let (candidate_definition, _) =
            definition_from_snapshot(&self.config, snapshot, self.spacing)?;
        if same_physical_definition(&candidate_definition, self.compiled.definition()) {
            return Ok(Ok(PreparedAtmosphereRebind::Unchanged {
                source_physical_revision: snapshot.physical_revision,
                source_epoch: snapshot.epoch,
                owner: self.owner.clone(),
                epoch: self.epoch,
                receipt: unchanged_receipt(&self.compiled),
            }));
        }
        let next_revision = self
            .geometry_revision
            .checked_add(1)
            .ok_or("atmosphere geometry revision exhausted")?;
        let (compiled, _) = compile_snapshot_from_snapshot(
            &self.config,
            snapshot,
            self.spacing,
            next_revision,
            self.compiled.definition().model.clone(),
            self.compiled.definition().ambient.clone(),
        )?;
        match rebind_geometry(&self.compiled, &self.state, &compiled)? {
            AtmosphereRebindResult::Blocked(reason) => {
                Ok(Err(AtmosphereRebindResult::Blocked(reason)))
            }
            AtmosphereRebindResult::Applied { state, receipt } => {
                Ok(Ok(PreparedAtmosphereRebind::Changed {
                    compiled,
                    state,
                    geometry_revision: next_revision,
                    source_physical_revision: snapshot.physical_revision,
                    source_epoch: snapshot.epoch,
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
                source_physical_revision,
                source_epoch,
                receipt,
                ..
            } => {
                self.source_physical_revision = source_physical_revision;
                self.source_epoch = source_epoch;
                self.epoch = epoch;
                Ok(receipt)
            }
            PreparedAtmosphereRebind::Changed {
                compiled,
                state,
                geometry_revision,
                source_physical_revision,
                source_epoch,
                receipt,
                ..
            } => {
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

fn snapshot_has_free_air(snapshot: &AirGeometrySnapshot) -> bool {
    snapshot.cells.iter().any(|cell| match &cell.water {
        crate::terrain_water::AirWaterCoverage::Unmodeled => true,
        crate::terrain_water::AirWaterCoverage::Admitted { liquid_volume_m3 } => {
            liquid_volume_m3.is_finite()
                && cell.voxel_volume_m3.is_finite()
                && *liquid_volume_m3 < cell.voxel_volume_m3
        }
    })
}

fn compile_snapshot(
    world: &mut TerrainWater,
    config: &TerrainAtmosphereConfig,
    snapshot: &AirGeometrySnapshot,
) -> Result<(CompiledAtmosphere, AtmosphereState), String> {
    validate_config(world, config)?;
    let (definition, _) = definition_from_snapshot(config, snapshot, world.cell_spacing_m())?;
    let compiled = CompiledAtmosphere::compile(definition)?;
    let state = compiled.initial();
    Ok((compiled, state))
}
fn compile_snapshot_from_snapshot(
    config: &TerrainAtmosphereConfig,
    snapshot: &AirGeometrySnapshot,
    spacing: [f64; 3],
    revision: u64,
    model: AtmosphereModel,
    ambient: AtmosphereAmbient,
) -> Result<(CompiledAtmosphere, AtmosphereState), String> {
    let (mut definition, _) = definition_from_snapshot(config, snapshot, spacing)?;
    definition.revision = revision;
    definition.model = model;
    definition.ambient = ambient;
    let compiled = CompiledAtmosphere::compile(definition)?;
    let state = compiled.initial();
    Ok((compiled, state))
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
fn same_physical_definition(left: &AtmosphereDefinition, right: &AtmosphereDefinition) -> bool {
    left.region_id == right.region_id
        && left.ambient == right.ambient
        && left.model == right.model
        && left.volumes == right.volumes
        && left.openings == right.openings
}
fn unchanged_receipt(compiled: &CompiledAtmosphere) -> AtmosphereRebindReceipt {
    let volume_m3 = compiled
        .definition()
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
fn definition_from_snapshot(
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
        let mut next_id = 0usize;
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
                id: format!("sky:{next_id}"),
                from: (*volume_id).to_owned(),
                from_cell_id: cell_id,
                to: None,
                to_cell_id: None,
                area_m2: spacing[0] * spacing[2],
                distance_m: spacing[1],
                elevation_m: (f64::from(face.face.cell.y) + 1.0) * spacing[1],
                permeability: 1.0,
            });
            next_id += 1;
        }
    }
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
