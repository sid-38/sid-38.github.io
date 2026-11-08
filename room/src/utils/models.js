import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { gradientMap } from './materials.js';

// public/models is compressed by `npm run models` (meshopt geometry, WebP avatar textures)
const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);

// Download progress of every model, for the loading screen: url -> { loaded, total }
const downloads = new Map();
const GUESS_BYTES = 300 * 1024;
const listeners = new Set();
/** Call `cb(fraction 0..1)` whenever a model download advances. Returns an unsubscribe. */
export function onModelProgress(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
function report(url, loaded, total) {
  const d = downloads.get(url) ?? { loaded: 0, total: 0 };
  d.loaded = loaded;
  if (total) d.total = total;
  downloads.set(url, d);
  let l = 0;
  let t = 0;
  for (const v of downloads.values()) {
    // Size not known yet (no response headers, or no Content-Length): guess, so a big file
    // that hasn't started doesn't look like a finished small one
    const vt = v.total || GUESS_BYTES;
    l += v.done ? vt : Math.min(v.loaded, vt);
    t += vt;
  }
  for (const cb of listeners) cb(t ? l / t : 0);
}

/** Load a .glb exported from Blender and convert it to the scene's toon look. */
export async function loadModel(url) {
  report(url, 0, 0);
  try {
    const gltf = await loader.loadAsync(url, (e) => report(url, e.loaded, e.lengthComputable ? e.total : 0));
    toonify(gltf.scene);
    return gltf;
  } finally {
    const d = downloads.get(url);
    d.done = true;
    report(url, d.total || 1, d.total || 1);
  }
}

/**
 * Blender materials → the same banded toon material the rest of the scene uses.
 *
 * Texture filtering matters for pixel art:
 *  - Palette atlases (material names starting with "M_palette") stay fully unfiltered:
 *    mipmaps would blend neighbouring colour swatches together.
 *  - Detail textures (cover art, the ribbed band) get mipmaps for distance only, so fine
 *    patterns fade to their average colour far away instead of flickering, and stay crisp
 *    (nearest-neighbour) up close.
 */
export function toonify(root) {
  const converted = new Map();
  const convert = (m) => {
    if (converted.has(m)) return converted.get(m);
    const map = m.map ?? null;
    if (map) {
      map.magFilter = THREE.NearestFilter;
      const isAtlas = m.name?.startsWith('M_palette');
      map.minFilter = isAtlas ? THREE.NearestFilter : THREE.LinearMipmapLinearFilter;
      map.generateMipmaps = !isAtlas;
      map.anisotropy = 1;
      map.needsUpdate = true;
    }
    // Materials named M_glow* are light sources (LEDs, rings): unlit so they always glow.
    const toon = m.name?.startsWith('M_glow')
      ? new THREE.MeshBasicMaterial({ name: m.name, color: m.color, map, toneMapped: false })
      : new THREE.MeshToonMaterial({ name: m.name, color: m.color, map, gradientMap });
    // Keep cut-outs and see-through parts (VRoid eyes, lashes, hair tips, glasses lens)
    Object.assign(toon, {
      transparent: m.transparent,
      opacity: m.opacity,
      alphaTest: m.alphaTest,
      depthWrite: m.depthWrite,
      side: m.side,
    });
    converted.set(m, toon);
    return toon;
  };
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    o.material = Array.isArray(o.material) ? o.material.map(convert) : convert(o.material);
  });
}

/**
 * Replace a code-built placeholder with a Blender model that was exported at its room position
 * (the convention for room assets: model in place in blender/room.blend, export, done).
 * If loading fails, the placeholder simply stays.
 */
export async function swapWithModel(placeholder, url) {
  const { scene: model } = await loadModel(url);
  const parent = placeholder.parent;
  parent.remove(placeholder);
  parent.add(...model.children);
}

/**
 * Replace some named parts (searched at any depth) of a code-built group with a Blender model
 * exported in place. The group itself must sit at the room origin.
 * Use this when the group also holds things that stay in code (lights, animated screens, rain…).
 */
export async function swapParts(group, partNames, url) {
  const { scene: model } = await loadModel(url);
  const names = new Set(partNames);
  const doomed = [];
  group.traverse((o) => { if (o !== group && names.has(o.name)) doomed.push(o); });
  doomed.forEach((o) => o.parent?.remove(o));
  group.add(...model.children);
}
