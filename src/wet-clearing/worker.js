import { createWetClearing } from '../world-presets/seepage/wet-clearing.mjs';

// A local interactive consumer. Production durability belongs to Region/DO;
// this worker explicitly reopens exported checkpoints and runs no wall clock.
const newClearing = () => createWetClearing({ connected: true });
let recipe = newClearing(), state = recipe.input;
const bounds = { min: [-4, 11, 124], max: [5, 18, 133] };
self.onmessage = ({ data }) => {
  try {
    let candidateRecipe = recipe, candidateState = state;
    switch (data.action) {
      case 'inspect': break;
      case 'dig':
        candidateState = recipe.adapter.excavate(state, { at: data.at }).state;
        break;
      case 'advance': candidateState = recipe.adapter.advance(state, data.seconds).state; break;
      case 'reopen': {
        const checkpoint = recipe.adapter.encode(state);
        const fresh = newClearing();
        const restored = fresh.parseClosedState(fresh.adapter.decode(checkpoint));
        if (fresh.adapter.encode(restored) !== checkpoint) throw new Error('Checkpoint changed on reopen');
        candidateRecipe = fresh; candidateState = restored; break;
      }
      case 'reset': candidateRecipe = newClearing(); candidateState = candidateRecipe.input; break;
      default: throw new Error('Unknown wet-clearing action');
    }
    candidateState = candidateRecipe.parseClosedState(candidateState);
    const response = { id: data.id, action: data.action, seconds: data.seconds ?? null, ok: true,
      scene: candidateRecipe.adapter.scene(candidateState, bounds), target: candidateRecipe.target,
      checkpoint: candidateRecipe.adapter.encode(candidateState) };
    // Only a complete serializable projection is acknowledged and installed.
    self.postMessage(response);
    recipe = candidateRecipe; state = candidateState;
  } catch (error) {
    self.postMessage({ id: data.id, ok: false, error: error.message });
  }
};
