use super::*;

impl CompiledAtmosphere {
    pub fn compile(definition: AtmosphereDefinition) -> Result<Self, String> {
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
        let mut member_ids = BTreeSet::new();
        let mut members = 0usize;
        for (index, volume) in definition.volumes.iter().enumerate() {
            if volume.id.is_empty()
                || volume.id.len() > MAX_ID_BYTES
                || volume.members.is_empty()
                || volume_index.insert(volume.id.clone(), index).is_some()
            {
                return Err("invalid atmosphere volume identity".into());
            }
            for member in &volume.members {
                if member.cell_id.is_empty()
                    || member.cell_id.len() > MAX_ID_BYTES
                    || !member_ids.insert(member.cell_id.clone())
                    || !member.volume_m3.is_finite()
                    || member.volume_m3 <= 0.0
                    || !member.elevation_m.is_finite()
                {
                    return Err("invalid atmosphere member".into());
                }
                members = members
                    .checked_add(1)
                    .ok_or("atmosphere member budget overflow")?;
                if members > MAX_MEMBERS {
                    return Err("atmosphere member budget exceeded".into());
                }
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
        let mut openings = Vec::with_capacity(definition.openings.len());
        let mut ids = BTreeSet::new();
        for opening in &definition.openings {
            if opening.id.is_empty()
                || opening.id.len() > MAX_ID_BYTES
                || !ids.insert(opening.id.clone())
                || opening.from_cell_id.is_empty()
                || opening.from_cell_id.len() > MAX_ID_BYTES
                || opening
                    .to_cell_id
                    .as_ref()
                    .is_some_and(|id| id.is_empty() || id.len() > MAX_ID_BYTES)
            {
                return Err("invalid atmosphere opening identity".into());
            }
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
                || !definition.volumes[from]
                    .members
                    .iter()
                    .any(|member| member.cell_id == opening.from_cell_id)
                || (to.is_some() != opening.to_cell_id.is_some())
                || to
                    .zip(opening.to_cell_id.as_ref())
                    .is_some_and(|(index, cell)| {
                        !definition.volumes[index]
                            .members
                            .iter()
                            .any(|member| member.cell_id == *cell)
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
            openings.push(OpeningIndex {
                from,
                to,
                area_m2: opening.area_m2,
                distance_m: opening.distance_m,
                permeability: opening.permeability,
                elevation_m: opening.elevation_m,
            });
        }
        let ambient_carrier_density = definition.ambient.pressure_pa
            / (model.specific_gas_constant_jkg_k * definition.ambient.temperature_k);
        if !ambient_carrier_density.is_finite() || ambient_carrier_density <= 0.0 {
            return Err("invalid atmosphere ambient density".into());
        }
        let identity = identity(&definition)?;
        Ok(Self {
            definition,
            openings,
            volume_index,
            volume_m3,
            elevation_m,
            ambient_carrier_density,
            identity,
            owner: Arc::new(()),
        })
    }

    pub fn definition(&self) -> &AtmosphereDefinition {
        &self.definition
    }
    pub fn identity(&self) -> &str {
        &self.identity
    }
}
