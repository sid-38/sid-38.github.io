import * as THREE from 'three';
import { SECTIONS, VISIBLE_SECTIONS } from '../sections.js';

/**
 * Clickable objects in the room.
 * Each section gets an invisible "hotspot" box around its object, used for hover/click (a little
 * bigger than the object, so small things like the phone are easy to hit). Its centre is where
 * the guide's glowing dot sits.
 */
export class Hotspots {
  constructor() {
    this.scene = new THREE.Scene();
    this.spots = new Map(); // id -> { meshes, material, strength }
    this.raycaster = new THREE.Raycaster();
    this._ndc = new THREE.Vector2();
  }

  /**
   * @param id section id
   * @param anchor object whose world transform the box follows (read once: the room is static)
   * @param size [w, h, d] box size in the anchor's local space
   * @param offset [x, y, z] box centre in the anchor's local space
   * @param markerAt [x, y, z] where the guide's dot sits (anchor space), if not the box centre
   */
  add(id, anchor, size, offset = [0, 0, 0], markerAt = offset) {
    const section = SECTIONS.find((s) => s.id === id);
    let spot = this.spots.get(id);
    if (!spot) {
      const material = new THREE.MeshBasicMaterial({
        color: new THREE.Color(section.color),
        blending: THREE.NoBlending,
        transparent: false,
        fog: false,
      });
      spot = { id, meshes: [], material, strength: 0, center: null };
      this.spots.set(id, spot);
    }
    anchor.updateWorldMatrix(true, false);
    const geo = new THREE.BoxGeometry(...size);
    geo.translate(...offset);
    const mesh = new THREE.Mesh(geo, spot.material);
    mesh.matrixAutoUpdate = false;
    mesh.matrix.copy(anchor.matrixWorld);
    mesh.matrixWorld.copy(anchor.matrixWorld);
    mesh.userData.section = id;
    spot.meshes.push(mesh);
    spot.center ??= new THREE.Vector3(...markerAt).applyMatrix4(anchor.matrixWorld);
    this.scene.add(mesh);
  }

  /** Strength per section: 0 = no glow, ~0.6 = gentle pulse, 1 = bright (hovered) */
  setStrength(id, s) {
    const spot = this.spots.get(id);
    if (!spot) return;
    spot.strength = s;
    spot.material.opacity = s;
    spot.material.visible = s > 0.01;
  }

  center(id) { return this.spots.get(id)?.center; }

  /** Section under a screen point (client px), or null */
  pick(x, y, camera, viewport) {
    this._ndc.set((x / viewport.width) * 2 - 1, -(y / viewport.height) * 2 + 1);
    this.raycaster.setFromCamera(this._ndc, camera);
    const hits = this.raycaster.intersectObjects(this.scene.children, false);
    return hits.length ? hits[0].object.userData.section : null;
  }
}

/**
 * The Guide button (top left) and its list of sections with coloured pills,
 * plus the little label that follows the cursor over a glowing object.
 */
export class Guide {
  constructor({ button, panel, tooltip, onPick, onHover }) {
    this.button = button;
    this.panel = panel;
    this.tooltip = tooltip;
    this.onHover = onHover;
    panel.innerHTML = VISIBLE_SECTIONS.map((s) => `
      <li><button type="button" class="guide__item" data-section="${s.id}" style="--pill:${s.color}">
        <span class="guide__pill" aria-hidden="true"></span>
        <span class="guide__label">${s.label}</span>
        <span class="guide__where">${s.where}</span>
      </button></li>`).join('');
    button.addEventListener('click', () => this.toggle());
    panel.addEventListener('click', (e) => {
      const item = e.target.closest('[data-section]');
      if (!item) return;
      this.toggle(false);
      onPick(item.dataset.section);
    });
    panel.addEventListener('pointerover', (e) => {
      const item = e.target.closest('[data-section]');
      onHover(item ? item.dataset.section : null);
    });
    panel.addEventListener('pointerleave', () => onHover(null));
    panel.addEventListener('focusin', (e) => {
      const item = e.target.closest('[data-section]');
      if (item) onHover(item.dataset.section);
    });
    this.toggle(false);
  }

  get isOpen() { return this.button.getAttribute('aria-expanded') === 'true'; }

  toggle(open = !this.isOpen) {
    this.button.setAttribute('aria-expanded', String(open));
    this.panel.hidden = !open;
    if (!open) this.onHover(null);
  }

  setCurrent(id) {
    for (const item of this.panel.querySelectorAll('[data-section]')) {
      item.toggleAttribute('aria-current', item.dataset.section === id);
    }
  }

  showTooltip(section, x, y) {
    const t = this.tooltip;
    if (!section) {
      t.hidden = true;
      return;
    }
    t.hidden = false;
    t.style.setProperty('--pill', section.color);
    t.querySelector('.hover-label__text').textContent = section.label;
    t.style.transform = `translate(${Math.round(x + 16)}px, ${Math.round(y + 14)}px)`;
  }
}

/**
 * Pixel-art sprites for a guide marker, as data URLs:
 *   glow   16×16: a soft dot in hard alpha steps, brighter in the middle
 *   ripple RIPPLE_FRAMES frames of 24×24 side by side: a ring growing and fading out
 * They're drawn tiny and scaled up with nearest-neighbour sampling, so the pixels match the room.
 */
export const RIPPLE_FRAMES = 8;
export function markerSprites(hex) {
  const c = new THREE.Color(hex);
  const rgb = (k) => `${Math.round(c.r * 255 + (255 - c.r * 255) * k)},${Math.round(c.g * 255 + (255 - c.g * 255) * k)},${Math.round(c.b * 255 + (255 - c.b * 255) * k)}`;
  const step = (a, n) => Math.round(a * n) / n; // quantise: hard bands instead of a smooth blur

  const g = document.createElement('canvas');
  g.width = g.height = 16;
  const gx = g.getContext('2d');
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const d = Math.hypot(x + 0.5 - 8, y + 0.5 - 8);
      const a = step(Math.min(1, Math.max(0, 1 - d / 8) * 1.7) ** 1.3, 4);
      if (a <= 0) continue;
      gx.fillStyle = `rgba(${rgb(d < 1.6 ? 0.85 : d < 3 ? 0.45 : d < 4.4 ? 0.1 : 0)},${a})`;
      gx.fillRect(x, y, 1, 1);
    }
  }

  const S = 24;
  const r = document.createElement('canvas');
  r.width = S * RIPPLE_FRAMES;
  r.height = S;
  const rx = r.getContext('2d');
  for (let f = 0; f < RIPPLE_FRAMES; f++) {
    const t = f / (RIPPLE_FRAMES - 1);
    const radius = 3 + t * 8.5;
    const alpha = step(0.9 * (1 - t), 3);
    if (alpha <= 0) continue;
    rx.fillStyle = `rgba(${rgb(0.15)},${alpha})`;
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const d = Math.hypot(x + 0.5 - S / 2, y + 0.5 - S / 2);
        if (Math.abs(d - radius) < 0.6) rx.fillRect(f * S + x, y, 1, 1);
      }
    }
  }
  return { glow: g.toDataURL(), ripple: r.toDataURL() };
}
