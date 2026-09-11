use super::*;
use sha2::{Digest, Sha256};

impl CompiledAtmosphere {
    pub fn compile(definition: AtmosphereDefinition) -> Result<Self, String> {
        Self::compile_shared(definition.into())
    }
    pub(crate) fn compile_shared(definition: SharedAtmosphereDefinition) -> Result<Self, String> {
        Self::compile_geometry(definition, None)
    }
    pub(crate) fn recompile_shared(
        &self,
        definition: SharedAtmosphereDefinition,
    ) -> Result<Self, String> {
        Self::compile_geometry(definition, Some(self))
    }
    fn compile_geometry(
        definition: SharedAtmosphereDefinition,
        previous: Option<&Self>,
    ) -> Result<Self, String> {
        if definition.version != "connected-atmosphere-definition-v1"
            || definition.region_id.is_empty()
            || definition.geometry_identity.is_empty()
            || definition.region_id.len() > MAX_ID_BYTES
            || definition.geometry_identity.len() > MAX_ID_BYTES
        {
            return Err("invalid atmosphere definition identity".into());
        }
        if definition.volumes.is_empty()
            || definition.volumes.len() > MAX_VOLUMES
            || definition.openings.len() > MAX_OPENINGS
        {
            return Err("atmosphere definition exceeds bounds".into());
        }
        if !definition.ambient.pressure_pa.is_finite()
            || definition.ambient.pressure_pa <= 0.0
            || !definition.ambient.temperature_k.is_finite()
            || definition.ambient.temperature_k <= 0.0
        {
            return Err("invalid atmosphere ambient".into());
        }
        let model = &definition.model;
        for (value, name) in [
            (model.specific_gas_constant_jkg_k, "gas constant"),
            (model.heat_capacity_jkg_k, "heat capacity"),
            (model.mixing_velocity_mps, "mixing velocity"),
            (model.buoyancy_velocity_mps_k, "buoyancy velocity"),
            (model.pressure_velocity_mps_pa, "pressure velocity"),
            (model.max_step_s, "maximum step"),
            (model.max_exchange_fraction, "exchange fraction"),
            (model.max_pressure_ratio, "pressure ratio"),
            (model.max_temperature_delta_k, "temperature envelope"),
            (model.max_smoke_mass_fraction, "smoke envelope"),
        ] {
            finite_nonnegative(value, name)?;
        }
        if model.specific_gas_constant_jkg_k == 0.0
            || model.heat_capacity_jkg_k == 0.0
            || model.max_step_s == 0.0
            || model.max_exchange_fraction > 1.0
            || model.max_pressure_ratio < 1.0
            || model.max_temperature_delta_k == 0.0
            || model.max_smoke_mass_fraction > 1.0
            || model.max_smoke_mass_fraction == 0.0
        {
            return Err("invalid atmosphere model bounds".into());
        }
        let mut volume_index = BTreeMap::new();
        let mut volume_m3 = Vec::with_capacity(definition.volumes.len());
        let mut elevation_m = Vec::with_capacity(definition.volumes.len());
        let mut member_index = Vec::new();
        let mut members = 0usize;
        let mut reused = vec![None; previous.map_or(0, |old| old.definition.volumes.len())];
        for (index, volume) in definition.volumes.iter().enumerate() {
            if volume.id.is_empty()
                || volume.id.len() > MAX_ID_BYTES
                || volume.members.is_empty()
                || volume_index.insert(volume.id.clone(), index).is_some()
            {
                return Err("invalid atmosphere volume identity".into());
            }
            members = members
                .checked_add(volume.members.len())
                .ok_or("atmosphere member budget overflow")?;
            if members > MAX_MEMBERS {
                return Err("atmosphere member budget exceeded".into());
            }
            if let Some((old, old_index)) =
                previous.and_then(|old| old.volume_index.get(&volume.id).map(|&i| (old, i)))
            {
                if Arc::ptr_eq(volume, &old.definition.volumes[old_index]) {
                    reused[old_index] = Some(index);
                    volume_m3.push(old.volume_m3[old_index]);
                    elevation_m.push(old.elevation_m[old_index]);
                    continue;
                }
            }
            for (member_number, member) in volume.members.iter().enumerate() {
                if member.cell_id.is_empty()
                    || member.cell_id.len() > MAX_ID_BYTES
                    || !member.volume_m3.is_finite()
                    || member.volume_m3 <= 0.0
                    || !member.elevation_m.is_finite()
                {
                    return Err("invalid atmosphere member".into());
                }
                member_index.push(MemberLocation {
                    volume: index,
                    member: member_number,
                    volume_m3: member.volume_m3,
                });
            }
            let total: f64 = volume.members.iter().map(|member| member.volume_m3).sum();
            let elevation = volume
                .members
                .iter()
                .map(|member| member.elevation_m * member.volume_m3)
                .sum::<f64>()
                / total;
            if !total.is_finite() || total <= 0.0 || !elevation.is_finite() {
                return Err("invalid atmosphere volume aggregate".into());
            }
            volume_m3.push(total);
            elevation_m.push(elevation);
        }
        let member_index =
            shared_definition::compile_members(&definition, member_index, previous, &reused)?;
        let mut openings = Vec::with_capacity(definition.openings.len());
        let mut shared_opening_index =
            std::collections::HashMap::with_capacity(definition.openings.len());
        let mut ids = std::collections::HashSet::with_capacity(definition.openings.len());
        let mut incident_openings = vec![Vec::new(); definition.volumes.len()];
        for opening in &definition.openings {
            if opening.id.is_empty()
                || opening.id.len() > MAX_ID_BYTES
                || !ids.insert(opening.id.as_str())
                || opening.from_cell_id.is_empty()
                || opening.from_cell_id.len() > MAX_ID_BYTES
                || opening
                    .to_cell_id
                    .as_ref()
                    .is_some_and(|id| id.is_empty() || id.len() > MAX_ID_BYTES)
            {
                return Err("invalid atmosphere opening identity".into());
            }
            let indexed = if let Some(indexed) =
                shared_definition::reused_opening(previous, opening, &reused)
            {
                indexed
            } else {
                let from = *volume_index
                    .get(&opening.from)
                    .ok_or("atmosphere opening source volume missing")?;
                let to = match opening.to.as_ref() {
                    Some(id) => Some(
                        *volume_index
                            .get(id)
                            .ok_or("atmosphere opening destination volume missing")?,
                    ),
                    None => None,
                };
                if to == Some(from)
                    || shared_definition::find_member(
                        &definition,
                        &member_index,
                        &opening.from_cell_id,
                    )
                    .map(|member| member.volume)
                        != Some(from)
                    || (to.is_some() != opening.to_cell_id.is_some())
                    || to
                        .zip(opening.to_cell_id.as_ref())
                        .is_some_and(|(index, cell)| {
                            shared_definition::find_member(&definition, &member_index, cell)
                                .map(|member| member.volume)
                                != Some(index)
                        })
                {
                    return Err("atmosphere opening endpoint membership mismatch".into());
                }
                if !opening.area_m2.is_finite()
                    || opening.area_m2 <= 0.0
                    || !opening.distance_m.is_finite()
                    || opening.distance_m <= 0.0
                    || !opening.elevation_m.is_finite()
                    || !opening.permeability.is_finite()
                    || opening.permeability < 0.0
                    || opening.permeability > 1.0
                {
                    return Err("invalid atmosphere opening metric".into());
                }
                OpeningIndex {
                    from,
                    to,
                    area_m2: opening.area_m2,
                    distance_m: opening.distance_m,
                    permeability: opening.permeability,
                    elevation_m: opening.elevation_m,
                }
            };
            let opening_index = openings.len();
            incident_openings[indexed.from].push(opening_index);
            if let Some(to) = indexed.to {
                incident_openings[to].push(opening_index);
            }
            shared_opening_index.insert(Arc::as_ptr(opening) as usize, opening_index);
            openings.push(indexed);
        }
        let ambient_carrier_density = definition.ambient.pressure_pa
            / (model.specific_gas_constant_jkg_k * definition.ambient.temperature_k);
        if !ambient_carrier_density.is_finite() || ambient_carrier_density <= 0.0 {
            return Err("invalid atmosphere ambient density".into());
        }
        let mut initial_carrier_kg = 0.0;
        for volume_m3 in &volume_m3 {
            let carrier_kg = ambient_carrier_density * *volume_m3;
            if !carrier_kg.is_finite() || carrier_kg < 0.0 {
                return Err("atmosphere initial carrier exceeds finite range".into());
            }
            initial_carrier_kg += carrier_kg;
            if !initial_carrier_kg.is_finite() {
                return Err("atmosphere initial carrier ledger exceeds finite range".into());
            }
        }
        let exchange_openings = aggregate_exchange_openings(&openings)?;
        let identity = identity(&definition)?;
        // Revision labels are not topology authority. Bind all physical content,
        // including same-count opening changes, model and ambient. A no-op world
        // edit can advance the terrain revision without changing this content.
        let volumes: Vec<_> = definition.volumes.iter().map(Arc::as_ref).collect();
        let physical_openings: Vec<_> = definition.openings.iter().map(Arc::as_ref).collect();
        let binding = postcard::to_allocvec(&(
            &definition.version,
            &definition.region_id,
            &definition.ambient,
            &definition.model,
            &volumes,
            &physical_openings,
        ))
        .map_err(|_| "atmosphere definition binding failed")?;
        let content_digest = Sha256::digest(&binding).into();
        Ok(Self {
            definition,
            exported_definition: std::sync::OnceLock::new(),
            content_digest,
            openings,
            shared_opening_index,
            exchange_openings,
            volume_index,
            member_index,
            incident_openings,
            volume_m3,
            elevation_m,
            ambient_carrier_density,
            identity,
            owner: Arc::new(()),
        })
    }

    pub fn definition(&self) -> &AtmosphereDefinition {
        self.exported_definition
            .get_or_init(|| self.definition.owned())
    }
    /// Derived lookup rebuilt with geometry, never a persisted second location.
    pub fn volume_for_cell(&self, cell_id: &str) -> Option<&str> {
        self.member_location(cell_id)
            .map(|member| self.definition.volumes[member.volume].id.as_str())
    }
    pub fn identity(&self) -> &str {
        &self.identity
    }
}

/// Only area is additive: direction, endpoints, distance, elevation and
/// permeability remain identical within a group. These are the exact inputs
/// used by the exchange law. Physical face identities are retained separately.
fn aggregate_exchange_openings(openings: &[OpeningIndex]) -> Result<Vec<OpeningIndex>, String> {
    let mut groups = BTreeMap::new();
    let mut result: Vec<OpeningIndex> = Vec::new();
    for opening in openings {
        let key = (
            opening.from,
            opening.to,
            opening.distance_m.to_bits(),
            opening.elevation_m.to_bits(),
            opening.permeability.to_bits(),
        );
        if let Some(&index) = groups.get(&key) {
            let combined: &mut OpeningIndex = &mut result[index];
            combined.area_m2 += opening.area_m2;
            if !combined.area_m2.is_finite() {
                return Err("atmosphere aggregate opening exceeds finite range".into());
            }
        } else {
            groups.insert(key, result.len());
            result.push(opening.clone());
        }
    }
    Ok(result)
}
