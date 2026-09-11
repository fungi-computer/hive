//! Deterministic finite release schedules.
//!
//! This module owns only pure schedule arithmetic. A caller binds `start_s` to
//! a committed material receipt and owns the receiver, cursor, payment, and
//! publication transaction.

use std::collections::BTreeMap;

use crate::quantity::resolve_quantity_change;

const MAX_CHANNELS: usize = 16;
const MAX_CHANNEL_ID_BYTES: usize = 160;

#[derive(Clone, Debug, PartialEq)]
pub struct FiniteReleaseDefinition {
    pub duration_s: f64,
    pub totals: BTreeMap<String, f64>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct ReleaseFacts {
    pub fraction: f64,
    pub remaining_s: f64,
    pub ends_at_s: Option<f64>,
    pub released: BTreeMap<String, f64>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct ReleaseSegment {
    pub seconds: f64,
    /// `None` means the source is inactive during this segment.
    pub rates: Option<BTreeMap<String, f64>>,
}

#[derive(Clone, Debug, PartialEq)]
pub enum ReleasePlan {
    Ready { segments: Vec<ReleaseSegment> },
    Blocked { reason: ReleaseBlockReason },
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ReleaseBlockReason {
    SubminimumInterval,
}

#[derive(Clone, Debug, PartialEq)]
pub struct FiniteRelease {
    definition: FiniteReleaseDefinition,
}

fn finite_time(value: f64, name: &str) -> Result<(), String> {
    if value.is_finite() && value >= 0.0 {
        Ok(())
    } else {
        Err(format!("{name} must be finite and nonnegative"))
    }
}

fn checked_change(before: f64, delta: f64, name: &str) -> Result<f64, String> {
    resolve_quantity_change(before, delta)?
        .ok_or_else(|| format!("{name} is below representable quantity"))
}

impl FiniteRelease {
    pub fn new(definition: FiniteReleaseDefinition) -> Result<Self, String> {
        if !definition.duration_s.is_finite() || definition.duration_s <= 0.0 {
            return Err("finite release duration must be positive".into());
        }
        if definition.totals.is_empty() || definition.totals.len() > MAX_CHANNELS {
            return Err("finite release requires 1..16 channels".into());
        }
        for (channel, total) in &definition.totals {
            // Native IDs are bounded by UTF-8 bytes; callers own any text
            // encoding policy at the content boundary.
            if channel.is_empty() || channel.len() > MAX_CHANNEL_ID_BYTES {
                return Err("finite release channel id is invalid".into());
            }
            if !total.is_finite() {
                return Err("finite release total must be finite".into());
            }
            let rate = total / definition.duration_s;
            if !rate.is_finite() || (total != 0.0 && rate == 0.0) {
                return Err("finite release rate is not representable".into());
            }
        }
        Ok(Self { definition })
    }

    pub fn definition(&self) -> &FiniteReleaseDefinition {
        &self.definition
    }

    pub fn read(&self, start_s: Option<f64>, at_s: f64) -> Result<ReleaseFacts, String> {
        finite_time(at_s, "release time")?;
        let Some(start_s) = start_s else {
            return Ok(ReleaseFacts {
                fraction: 0.0,
                remaining_s: 0.0,
                ends_at_s: None,
                released: self.zero_channels(),
            });
        };
        finite_time(start_s, "release start")?;
        if start_s > at_s {
            return Err("release starts after the host clock".into());
        }
        let end_s = checked_change(start_s, self.definition.duration_s, "release end")?;
        let fraction = if at_s >= end_s {
            1.0
        } else {
            (at_s - start_s) / (end_s - start_s)
        };
        if !fraction.is_finite() || !(0.0..=1.0).contains(&fraction) {
            return Err("finite release fraction is invalid".into());
        }
        let released = self.map_channels(|total, _| {
            let value = total * fraction;
            if total != 0.0 && fraction != 0.0 && value == 0.0 {
                return Err("finite released quantity is not representable".into());
            }
            if !value.is_finite() {
                return Err("finite released quantity is not finite".into());
            }
            Ok(value)
        })?;
        Ok(ReleaseFacts {
            fraction,
            remaining_s: (end_s - at_s).max(0.0),
            ends_at_s: Some(end_s),
            released,
        })
    }

    pub fn released_between(
        &self,
        start_s: Option<f64>,
        from_s: f64,
        to_s: f64,
    ) -> Result<BTreeMap<String, f64>, String> {
        finite_time(from_s, "release interval start")?;
        finite_time(to_s, "release interval end")?;
        if to_s < from_s {
            return Err("finite release endpoints are out of order".into());
        }
        let before = self.read(start_s, from_s)?;
        let after = self.read(start_s, to_s)?;
        self.released_delta(&before, &after)
    }

    pub fn plan(
        &self,
        start_s: Option<f64>,
        at_s: f64,
        seconds: f64,
        minimum_interval_s: f64,
    ) -> Result<ReleasePlan, String> {
        finite_time(at_s, "release time")?;
        finite_time(seconds, "release interval")?;
        if !minimum_interval_s.is_finite() || minimum_interval_s <= 0.0 {
            return Err("release minimum interval must be positive".into());
        }
        let before = self.read(start_s, at_s)?;
        let interval_end_s = checked_change(at_s, seconds, "release interval end")?;
        let active_s = if before.remaining_s == 0.0 {
            0.0
        } else if interval_end_s <= before.ends_at_s.expect("active release has an end") {
            seconds
        } else {
            before.remaining_s
        };
        let coast_s = seconds - active_s;
        let owed_s = before
            .ends_at_s
            .map(|end| (end - interval_end_s).max(0.0))
            .unwrap_or(0.0);
        if [active_s, coast_s, owed_s]
            .into_iter()
            .any(|part| part > 0.0 && part < minimum_interval_s)
        {
            return Ok(ReleasePlan::Blocked {
                reason: ReleaseBlockReason::SubminimumInterval,
            });
        }
        let mut segments = Vec::with_capacity(2);
        if active_s > 0.0 {
            let after = self.read(
                start_s,
                interval_end_s.min(before.ends_at_s.expect("active release has an end")),
            )?;
            segments.push(ReleaseSegment {
                seconds: active_s,
                rates: Some(self.interval_rates(&before, &after, active_s)?),
            });
        }
        if coast_s > 0.0 {
            segments.push(ReleaseSegment {
                seconds: coast_s,
                rates: None,
            });
        }
        Ok(ReleasePlan::Ready { segments })
    }

    fn zero_channels(&self) -> BTreeMap<String, f64> {
        self.definition
            .totals
            .keys()
            .map(|channel| (channel.clone(), 0.0))
            .collect()
    }

    fn map_channels<F>(&self, mut f: F) -> Result<BTreeMap<String, f64>, String>
    where
        F: FnMut(f64, &str) -> Result<f64, String>,
    {
        self.definition
            .totals
            .iter()
            .map(|(channel, total)| Ok((channel.clone(), f(*total, channel)?)))
            .collect()
    }

    fn released_delta(
        &self,
        before: &ReleaseFacts,
        after: &ReleaseFacts,
    ) -> Result<BTreeMap<String, f64>, String> {
        self.map_channels(|total, channel| {
            let delta = after.released[channel] - before.released[channel];
            if !delta.is_finite()
                || (total != 0.0 && after.fraction > before.fraction && delta == 0.0)
            {
                return Err("finite release interval quantity is not representable".into());
            }
            Ok(delta)
        })
    }

    fn interval_rates(
        &self,
        before: &ReleaseFacts,
        after: &ReleaseFacts,
        seconds: f64,
    ) -> Result<BTreeMap<String, f64>, String> {
        let released = self.released_delta(before, after)?;
        self.map_channels(|_total, channel| {
            let delta = released[channel];
            let rate = delta / seconds;
            if !rate.is_finite() || (delta != 0.0 && rate == 0.0) {
                return Err("finite release interval quantity is not representable".into());
            }
            Ok(rate)
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn release(duration_s: f64, totals: &[(&str, f64)]) -> FiniteRelease {
        FiniteRelease::new(FiniteReleaseDefinition {
            duration_s,
            totals: totals
                .iter()
                .map(|(key, value)| ((*key).into(), *value))
                .collect(),
        })
        .unwrap()
    }

    #[test]
    fn endpoint_and_split_preserve_finite_totals() {
        let source = release(1.0, &[("smoke", 0.3), ("heat", 0.6)]);
        let end = source.read(Some(0.0), 1.0).unwrap();
        assert_eq!(end.fraction, 1.0);
        assert_eq!(end.released["smoke"], 0.3);
        assert_eq!(end.released["heat"], 0.6);
        let split = source.released_between(Some(0.0), 0.3, 0.9).unwrap();
        assert!((split["smoke"] - 0.18).abs() < 1e-14);
        assert!((split["heat"] - 0.36).abs() < 1e-14);
    }

    #[test]
    fn represented_decimal_boundary_has_no_owed_coast_piece() {
        let source = release(0.6, &[("smoke", 0.6)]);
        let plan = source.plan(Some(0.3), 0.3, 0.6, 0.1).unwrap();
        let ReleasePlan::Ready { segments } = plan else {
            panic!("boundary should be ready");
        };
        assert_eq!(segments.len(), 1);
        assert_eq!(segments[0].seconds, 0.6);
        assert!(segments[0].rates.is_some());
    }

    #[test]
    fn zero_channel_is_retained_and_inactive_source_has_zero_rates() {
        let source = release(2.0, &[("smoke", 0.0), ("heat", 4.0)]);
        let facts = source.read(Some(1.0), 1.5).unwrap();
        assert_eq!(facts.released["smoke"], 0.0);
        assert_eq!(facts.released["heat"], 1.0);
        assert!(
            matches!(source.plan(None, 0.0, 1.0, 0.25).unwrap(), ReleasePlan::Ready { segments } if segments[0].rates.is_none())
        );
    }

    #[test]
    fn signed_channel_partitions_conserve_the_declared_total() {
        let source = release(2.0, &[("smoke", -4.0)]);
        let first = source.released_between(Some(0.0), 0.0, 1.0).unwrap();
        let second = source.released_between(Some(0.0), 1.0, 2.0).unwrap();
        assert_eq!(first["smoke"], -2.0);
        assert_eq!(second["smoke"], -2.0);
        assert_eq!(first["smoke"] + second["smoke"], -4.0);
    }

    #[test]
    fn minimum_interval_blocks_only_unrepresentable_piece() {
        let source = release(0.9, &[("smoke", 0.9)]);
        assert!(matches!(
            source.plan(Some(0.0), 0.0, 1.0, 0.2).unwrap(),
            ReleasePlan::Blocked {
                reason: ReleaseBlockReason::SubminimumInterval
            }
        ));
        let source = release(0.9, &[("smoke", 0.9)]);
        let plan = source.plan(Some(0.0), 0.0, 1.8, 0.2).unwrap();
        assert!(matches!(plan, ReleasePlan::Ready { .. }));
    }

    #[test]
    fn large_clock_keeps_endpoint_and_rejects_lost_duration() {
        let source = release(10.0, &[("smoke", 1.0)]);
        let facts = source.read(Some(1.0e12), 1.0e12 + 10.0).unwrap();
        assert_eq!(facts.fraction, 1.0);
        assert_eq!(facts.released["smoke"], 1.0);
        let tiny = FiniteRelease::new(FiniteReleaseDefinition {
            duration_s: f64::EPSILON,
            totals: BTreeMap::from([(String::from("smoke"), 1.0)]),
        })
        .unwrap();
        assert!(tiny.read(Some(1.0e12), 1.0e12).is_err());
    }

    #[test]
    fn bounds_and_order_are_checked() {
        assert!(FiniteRelease::new(FiniteReleaseDefinition {
            duration_s: 1.0,
            totals: BTreeMap::new(),
        })
        .is_err());
        let source = release(1.0, &[("smoke", 1.0)]);
        assert!(source.released_between(Some(0.0), 1.0, 0.0).is_err());
        assert!(source.read(Some(2.0), 1.0).is_err());
    }
}
