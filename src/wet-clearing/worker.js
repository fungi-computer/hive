import { createWetClearing } from '../world-presets/seepage/wet-clearing.mjs';

// A local interactive consumer. Production durability belongs to Region/DO;
// this worker explicitly reopens exported checkpoints and runs no wall clock.
let recipe = createWetClearing(), state = recipe.input;
const bounds = { min: [-4, 11, 124], max: [5, 18, 133] };
self.onmessage = ({ data }) => {
  try {
    switch (data.action) {
      case 'inspect': break;
      case 'dig':
        state = recipe.adapter.excavate(state, { ...recipe.command, at: data.at }).state;
        break;
      case 'advance': state = recipe.adapter.advance(state, 600).state; break;
      case 'reopen': {
        const checkpoint = recipe.adapter.encode(state);
        const fresh = createWetClearing();
        const restored = fresh.adapter.decode(checkpoint);
        if (fresh.adapter.encode(restored) !== checkpoint) throw new Error('Checkpoint changed on reopen');
        recipe = fresh; state = restored; break;
      }
      case 'reset': recipe = createWetClearing(); state = recipe.input; break;
      default: throw new Error('Unknown wet-clearing action');
    }
    self.postMessage({ id: data.id, action: data.action, ok: true, scene: recipe.adapter.scene(state, bounds),
      target: recipe.target, checkpoint: recipe.adapter.encode(state) });
  } catch (error) {
    self.postMessage({ id: data.id, ok: false, error: error.message });
  }
};
