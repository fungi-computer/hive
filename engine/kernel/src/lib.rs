//! One headless world owner for browser Workers and Durable Objects.
pub mod assign;
mod components;
mod navigation;
mod registry;
mod world;
use wasm_bindgen::prelude::*;
pub use world::Kernel;

#[wasm_bindgen]
pub struct WasmKernel(Kernel);
fn js_error(error: String) -> JsValue {
    JsValue::from_str(&error)
}
#[wasm_bindgen]
impl WasmKernel {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self(Kernel::new())
    }
    pub fn load(&mut self, json: &str) -> Result<(), JsValue> {
        self.0.load(json).map_err(js_error)
    }
    pub fn query(&mut self, json: &str) -> Result<String, JsValue> {
        self.0.query_json(json).map_err(js_error)
    }
    pub fn advance(&mut self, json: &str) -> Result<String, JsValue> {
        self.0.advance_json(json).map_err(js_error)
    }
    pub fn snapshot(&self) -> Result<String, JsValue> {
        self.0.snapshot_json().map_err(js_error)
    }
    pub fn restore(&mut self, json: &str) -> Result<(), JsValue> {
        self.0.restore_json(json).map_err(js_error)
    }
    pub fn render_facts(&self) -> Result<String, JsValue> {
        self.0.render_json().map_err(js_error)
    }
}
impl Default for WasmKernel {
    fn default() -> Self {
        Self::new()
    }
}
