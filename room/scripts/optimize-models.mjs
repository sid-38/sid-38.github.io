// Shrinks the Blender exports in models-src/ into public/models/ (what the site loads).
//
//   npm run models
//
// Export from Blender into models-src/, then run this. Every model gets meshopt geometry
// compression (decoded in the browser by three's MeshoptDecoder). Models listed in WEBP also
// get their textures re-encoded as WebP; that only pays off for big painted textures (the
// avatar), not for the tiny palette swatches the room props use, so those keep their PNGs.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, statSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SRC = 'models-src';
const OUT = 'public/models';
const WEBP = new Set(['avatar.glb']);

const cli = (...args) => execFileSync('npx', ['gltf-transform', ...args], { stdio: 'pipe' });
const kb = (f) => `${(statSync(f).size / 1024).toFixed(0)} KB`;
const tmp = mkdtempSync(join(tmpdir(), 'models-'));

for (const name of readdirSync(SRC).filter((f) => f.endsWith('.glb'))) {
  const src = join(SRC, name);
  const out = join(OUT, name);
  let input = src;
  if (WEBP.has(name)) {
    input = join(tmp, name);
    cli('webp', src, input, '--quality', '92');
  }
  // Textures first, then geometry: re-encoding textures would undo the meshopt step.
  cli('meshopt', input, out, '--level', 'medium');
  console.log(`${name}: ${kb(src)} → ${kb(out)}`);
}
rmSync(tmp, { recursive: true, force: true });
