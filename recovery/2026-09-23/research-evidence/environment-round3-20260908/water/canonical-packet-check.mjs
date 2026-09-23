// One bounded serial proof for the discovered cold-encoding correction and its
// affected radial/rest caller. Earlier failed source/results remain untouched.
await import('./boundary-proof.mjs');
if (process.exitCode) process.exit(process.exitCode);
await import('./radial-rest.mjs');
