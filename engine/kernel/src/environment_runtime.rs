//! Coupled physical publication inside the existing Kernel environment owner.
use super::KernelEnvironment;
use crate::atmosphere::{AtmosphereReceipt, AtmosphereRebindResult};
use crate::terrain_water::{PreparedExcavation, PreparedStructureChange};
use crate::water::WaterWork;

impl KernelEnvironment {
    pub(super) fn apply_excavation(&mut self, prepared: PreparedExcavation) -> Result<bool, String> {
        let air = if let Some(air) = &self.atmosphere {
            let snapshot = self.world.prepared_excavation_air_geometry(&prepared, air.config().bounds())?;
            match air.prepare_rebind(&snapshot)? {
                Ok(candidate) => Some(candidate),
                Err(AtmosphereRebindResult::Blocked(_)) => return Ok(false),
                Err(AtmosphereRebindResult::Applied { .. }) => return Err("invalid air admission result".into()),
            }
        } else { None };
        self.world.apply_excavation(prepared)?;
        if let Some(candidate) = air { self.atmosphere.as_mut().unwrap().apply_rebind(candidate)?; }
        Ok(true)
    }
    pub(super) fn apply_structures(&mut self, prepared: PreparedStructureChange) -> Result<bool, String> {
        let air = if let Some(air) = &self.atmosphere {
            let snapshot = self.world.prepared_structure_air_geometry(&prepared, air.config().bounds())?;
            match air.prepare_rebind(&snapshot)? {
                Ok(candidate) => Some(candidate),
                Err(AtmosphereRebindResult::Blocked(_)) => return Ok(false),
                Err(AtmosphereRebindResult::Applied { .. }) => return Err("invalid air admission result".into()),
            }
        } else { None };
        self.world.apply_structures(prepared)?;
        if let Some(candidate) = air { self.atmosphere.as_mut().unwrap().apply_rebind(candidate)?; }
        Ok(true)
    }
    pub(super) fn advance(&mut self, seconds: f64) -> Result<(Option<WaterWork>, Option<AtmosphereReceipt>), String> {
        if seconds == 0.0 { return Ok((None, None)); }
        let prepared = self.world.prepare_water_advance(seconds)?;
        let air = if let Some(air) = &self.atmosphere {
            let snapshot = self.world.prepared_water_air_geometry(&prepared, air.config().bounds())?;
            match air.prepare_rebind(&snapshot)? {
                Ok(candidate) => Some(candidate),
                Err(AtmosphereRebindResult::Blocked(_)) => {
                    let receipt = self.atmosphere.as_mut().unwrap().advance(seconds, &[])?;
                    return Ok((None, Some(receipt)));
                }
                Err(AtmosphereRebindResult::Applied { .. }) => return Err("invalid air admission result".into()),
            }
        } else { None };
        let water = self.world.apply_water_advance(prepared)?;
        if let Some(candidate) = air { self.atmosphere.as_mut().unwrap().apply_rebind(candidate)?; }
        let receipt = self.atmosphere.as_mut().map(|air| air.advance(seconds, &[])).transpose()?;
        Ok((Some(water), receipt))
    }
}
