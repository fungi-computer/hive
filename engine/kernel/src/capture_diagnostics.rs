//! Temporary noncanonical timing probes for the residual capture profile.
//! Remove after the owner cut is selected.
use std::cell::RefCell;
use std::collections::BTreeMap;

#[cfg(target_arch = "wasm32")]
#[wasm_bindgen::prelude::wasm_bindgen]
extern "C" {
    #[wasm_bindgen::prelude::wasm_bindgen(js_namespace = performance, js_name = now)]
    fn performance_now() -> f64;
}

pub(crate) fn now_ms() -> f64 {
    #[cfg(target_arch = "wasm32")]
    { performance_now() }
    #[cfg(not(target_arch = "wasm32"))]
    {
        use std::sync::OnceLock;
        static START: OnceLock<std::time::Instant> = OnceLock::new();
        START.get_or_init(std::time::Instant::now).elapsed().as_secs_f64() * 1000.0
    }
}

thread_local! {
    static TOTALS: RefCell<BTreeMap<String, (u64, f64)>> = RefCell::new(BTreeMap::new());
}

pub(crate) fn record(name: &str, start_ms: f64) {
    let elapsed = (now_ms() - start_ms).max(0.0);
    TOTALS.with(|totals| {
        let mut totals = totals.borrow_mut();
        let value = totals.entry(name.to_owned()).or_default();
        value.0 += 1;
        value.1 += elapsed;
    });
}

pub(crate) fn take_json() -> String {
    TOTALS.with(|totals| serde_json::to_string(&std::mem::take(&mut *totals.borrow_mut())).unwrap_or_else(|_| "{}".into()))
}
