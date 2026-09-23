# Care proof preparation

`create-care-fixture.mjs` is intentionally not executed during preparation.
When the core is frozen, it creates a schema-valid paused snapshot by using the
actual libcolony Wasm and `step`: Rowan chops an oak, repairs the cache, then
the fixture sets Rowan's nourishment and hydration to 30%, and unrecruited
Sedge's hydration to 30%. It does not inject a care job, operation, result,
ration, pail, or water.

The browser proof loads the served origin, replaces its normal IndexedDB record,
then reloads into the snapshot. Care therefore enters only through normal
post-load admission.
