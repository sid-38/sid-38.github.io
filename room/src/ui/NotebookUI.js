import * as THREE from 'three';
import { Book, PAGE_W, PAGE_H } from './Book.js';

/**
 * The notebook's content is real HTML (crisp, selectable, accessible, indexable).
 * The book is laid out at a fixed design size (one page = 500 × 669 design px) and scaled
 * onto the 3D pages by projecting the open spread's corners to the screen.
 */
export class NotebookUI {
  constructor(el, source, notebook, camera, { reducedMotion = false } = {}) {
    this.el = el;
    this.notebook = notebook;
    this.camera = camera;
    this.corners = [];
    this._v = new THREE.Vector3();
    this.visible = 0;
    this.book = new Book(el, source, { reducedMotion });
  }

  /** @param amount 0..1 from the scroll timeline */
  update(amount, viewport) {
    this.visible = amount;
    const { el } = this;
    el.style.opacity = amount.toFixed(3);
    el.style.visibility = amount > 0.001 ? 'visible' : 'hidden';
    const interactive = amount > 0.95;
    el.style.pointerEvents = interactive ? 'auto' : 'none';
    el.toggleAttribute('inert', !interactive);
    this.book.setInteractive(interactive);
    if (amount <= 0.001) return;

    // Tall screens: the camera frames the right page only, one page at a time
    const portrait = viewport.width < viewport.height;
    this.book.setPortrait(portrait);

    // Screen-space bounding box of the page area
    this.notebook.getSpreadCorners(this.corners, portrait ? 'right' : 'spread');
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const c of this.corners) {
      this._v.copy(c).project(this.camera);
      const x = (this._v.x * 0.5 + 0.5) * viewport.width;
      const y = (-this._v.y * 0.5 + 0.5) * viewport.height;
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
    const w = portrait ? PAGE_W : PAGE_W * 2;
    const sx = (maxX - minX) / w;
    const sy = (maxY - minY) / PAGE_H;
    el.style.width = `${w}px`;
    el.style.transform = `translate(${minX.toFixed(2)}px, ${minY.toFixed(2)}px) scale(${sx.toFixed(5)}, ${sy.toFixed(5)})`;

    // Page-turn perspective matches the real camera
    const focal = viewport.height / 2 / Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    // (1.6× the real camera distance: a calmer lift that stays on screen)
    el.style.setProperty('--perspective', `${((1.6 * focal) / sy).toFixed(1)}px`);
    el.style.setProperty('--persp-x', `${((viewport.width / 2 - minX) / sx).toFixed(1)}px`);
    el.style.setProperty('--persp-y', `${((viewport.height / 2 - minY) / sy).toFixed(1)}px`);
  }
}
