import * as THREE from 'three';

// 3-band toon ramp. NearestFilter keeps the bands hard, which reads as "pixel art lighting".
export const gradientMap = (() => {
  const data = new Uint8Array([60, 150, 255]);
  const tex = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
})();

const cache = new Map();

/** Shared toon material per color, so blockout objects batch nicely. */
export function toon(color) {
  const key = `toon-${color}`;
  if (!cache.has(key)) {
    cache.set(key, new THREE.MeshToonMaterial({ color, gradientMap }));
  }
  return cache.get(key);
}

/** Unlit material for light sources (screens, lit windows, RGB strips). */
export function glow(color) {
  const key = `glow-${color}`;
  if (!cache.has(key)) {
    cache.set(key, new THREE.MeshBasicMaterial({ color, toneMapped: false }));
  }
  return cache.get(key);
}

/** Blockout helper: a box sitting on y=0 of its parent (pivot at bottom centre). */
export function box(w, h, d, material, name) {
  const geo = new THREE.BoxGeometry(w, h, d);
  geo.translate(0, h / 2, 0);
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  if (name) mesh.name = name;
  return mesh;
}

export function place(obj, x, y, z, ry = 0) {
  obj.position.set(x, y, z);
  obj.rotation.y = ry;
  return obj;
}

// Named colors used by the blockout. Real assets will replace these.
export const C = {
  wall: 0x3c4a6e,
  wallDark: 0x2b3757,
  floor: 0x4a3128,
  wood: 0x6d4a35,
  woodLight: 0x93674a,
  metal: 0x1e2742,
  plastic: 0x141a2e,
  sheet: 0xbcc8e0,
  paper: 0xe6ecf5,
  cover: 0x8a2b3a,
  chair: 0xc8424f,
  hoodie: 0x93a3c6,
  skin: 0xf2b880,
  hair: 0x141a2e,
};
