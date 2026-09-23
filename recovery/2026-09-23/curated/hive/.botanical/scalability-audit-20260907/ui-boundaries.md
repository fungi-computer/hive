# UI and command boundary audit — 2026-09-07

Read-only review of the dirty two-person-home candidate over `016b1a02b009e798165bd4ba11653093cf4ee1c6`. The 35-file source capture and full hashes are in `source-inventory.json` and `source-at-review/`. No files changed during that capture; later active UI changes are not covered by these findings. These findings describe the captured caller, not the final Jotai/XState replacement now being authored by home-ui under game-delivery. No tracked source, Git, dependencies or preview were changed by this audit.

## 1. Current correction: one subscribed UI owner and immutable published facts

`main.js:14-29,51-58,70-101,236-327,509-530` own overlapping mutable selection/tool/pointer flags, a HUD dirty flag and repeated top-level renders. `hud.jsx:104-196` claims a read-only snapshot, but its roster, visitor and focused fields expose the authoritative mutable actor objects directly. React can observe later mutations through those references even though its model was derived earlier. Repeated property clearing is evidence of ambiguous interaction phases; simply moving the object into one atom does not remove it.

The current Jotai/XState correction has the right ownership split: Jotai owns UI selection/inspector/preferences and subscriptions to immutable displayed facts; one XState tool/pointer owner defines gesture phases; the fixed-step simulation owns world state. Publish coherent, small value projections, retain identity for unchanged facts, and let actual panel subscriptions consume relevant changes. Keep Pixi position/animation updates outside React and do not atomize the whole terrain. One shared rectangle/eligible-target projection must feed highlights, count and command generation; `construction-view.js:10-21` remains a wall-row primitive rather than an area brush.

Proof required in the current joined correction: an old display snapshot remains unchanged after the next simulation step; a focused order button survives an actual status change; canceled/finished gestures cannot leave endpoints behind; frozen preview is stable while moving onto Commit; off-axis eligible trees are included and the shown count matches the resolved targets. Quiet paused/no-op UI must mean both stable DOM and no repeated expensive snapshot/room derivation.

This is not a newly discovered requirement: the earlier foundation review explicitly requested immutable cached UI facts. That requirement was incompletely realized, and the new gesture/selection surface exposed the ownership gap. Current work must be accepted against deleted ownership and the real caller, not just installed dependencies.

## 2. Current correction: typed producer-to-dispatcher actions

`keys.js:18-22` and `hud.jsx:390-395` emit `rotate`, while the captured `main.js:236-327` switch has no rotate handler. `tsconfig.json` checks included TS files but sets `checkJs:false`; the action producers and router are unchecked JS/JSX. The simulation becoming TypeScript does not prove that its UI consumers are checked.

Use one closed typed UI action vocabulary at the actual key/DOM/tool producers and dispatcher, with exhaustive handling. Keep world Command separate from local pan/selection actions. This is a type seam, not a new runtime validator, generic action bus or translation framework. Runtime parsing belongs at actual future save/network boundaries. The current R key/button must rotate the same actual bed ghost and submitted footprint, and adding a new valid action must require its dispatcher behavior to be addressed.

## 3. Current correction: submitted requests are not applied outcomes

`main.js:123-178` validates against current state, appends to `pending`, and returns true. `commitChop` counts that result as accepted. `clearing.ts:89-93` applies the batch on the next fixed tick; `orders.ts:147-185` revalidates sequentially and can reject a previously plausible request, returning no structured result. The simulation correctly protects state, but a preliminary check cannot establish the eventual applied count.

The bounded actual-WASM probe `command-probe.mjs` uses the frozen reviewed source and the actual shipped 16 MiB libcolony. Two same-cell wall requests both pass the preliminary check; the next tick creates exactly one site/job, records two inputs, and puts the rejection in one global notice. The step returns no per-request settlement. `command-result.json` is the observed result; `command-run.json` records `run-u390.scope`, invocation `8a355eb595414ed1b2bd2156a47dbd1e`, normal exit 0. This is an API/caller probe, not a hosted/browser acceptance or a resource duplication defect.

Return small typed applied/rejected outcomes from the existing command-application owner, and let the UI display that truth after the tick. The command queue still preserves ordering and supports replay. A local batch result does not require a new network protocol, a forever-growing receipt store, or duplicate simulation state. Reconnect deduplication and persisted command identity remain requirements for the future real multiplayer boundary.

## 4. Before persistent worlds: bounded recording and a real lifetime boundary

`Clearing.commands` and `clearing.ts:90-92` retain every input, including rejected commands. `main.js:532-550` copies the entire state for proof access. Recording is useful, but no gameplay read requires retaining every past request in a live world. The earlier foundation review already identified this open issue. Keep proof/session recording separate or use a coherent saved checkpoint plus bounded retained tail when persistence is introduced. Reaching diagnostic retention limits must never prevent new valid player commands. Future transport must validate stored/wire data once with a maintained decoder; do not add a decoder to every trusted in-process object.

`startGame` has one page-lifetime app, event listeners, ticker, keymap and resize observer; ordinary Reset reuses that session. This is not a demonstrated current reset leak. Before replacing a world without page reload, establish one explicit session teardown/cancellation owner, using native disposal/unsubscription and the actual maintained async owner selected at that boundary. Effect may earn ownership for save/load/network/cancellation lifecycles; it is not needed to turn walking or work into wall-clock fibers. The present browser visibility auto-pause/frame clamp is local-demo behavior and must not become the eventual always-running multiplayer clock.

## Disposition and retained strengths

Game-delivery has received findings 1–3 for its existing UI correction; it owns routine integration, proof and release. The render audit separately identifies the current Rowan-only cutaway assumption. Later world/session/retention requirements belong in the existing persistence/chunk issues and must not expand the current home into a backend project.

Keep the fixed-step state owner, typed actor/party scope, real optimizer and material claims, shared original sprite textures, Caps, OpenTUI keymap and declarative React components. Imperative mutation inside the simulation owner and retained Pixi updates are intentional. The missing primitive is generally an explicit owner/query/result/lifecycle, not an obligation to install a library for each noun.
