import * as THREE from 'three';

/**
 * Lays an HTML element over a flat surface in the 3D scene (a screen, a card...).
 * The element is designed at a fixed size (designW × designH px) and scaled onto the
 * surface's on-screen rectangle, so its layout is identical at any window size.
 */
export class SurfaceUI {
  /**
   * @param compact optional { w, h }: on narrow portrait screens the element isn't pinned to
   *   the 3D surface (it would be too small to read); it's shown centred at this design size
   *   with an `is-compact` class instead.
   */
  constructor(el, getCorners, designW, designH, compact = null) {
    this.compact = compact;
    this.isCompact = false;
    this.el = el;
    this.getCorners = getCorners; // (target[]) => world corners TL, TR, BR, BL
    this.designW = designW;
    this.designH = designH;
    this.corners = [];
    this._v = new THREE.Vector3();
    this.scale = 1;
    this.interactive = false;
    el.style.width = `${designW}px`;
    el.style.height = `${designH}px`;
  }

  update(amount, viewport, camera) {
    const { el } = this;
    el.style.opacity = amount.toFixed(3);
    el.style.visibility = amount > 0.001 ? 'visible' : 'hidden';
    const interactive = amount > 0.95;
    if (interactive !== this.interactive) {
      this.interactive = interactive;
      el.style.pointerEvents = interactive ? 'auto' : 'none';
      el.toggleAttribute('inert', !interactive);
    }
    if (amount <= 0.001) return;
    const compact = !!this.compact && viewport.width < 700 && viewport.width < viewport.height;
    if (compact !== this.isCompact) {
      this.isCompact = compact;
      el.classList.toggle('is-compact', compact);
      const { w, h } = compact ? this.compact : { w: this.designW, h: this.designH };
      el.style.width = `${w}px`;
      el.style.height = `${h}px`;
    }
    if (compact) {
      const { w, h } = this.compact;
      const top = 76; // below the guide / back buttons
      const s = Math.min((viewport.width * 0.96) / w, (viewport.height - top - 12) / h);
      this.scale = s;
      const x = (viewport.width - w * s) / 2;
      el.style.transform = `translate(${x.toFixed(2)}px, ${top}px) scale(${s.toFixed(5)})`;
      return;
    }
    this.getCorners(this.corners);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const c of this.corners) {
      this._v.copy(c).project(camera);
      const x = (this._v.x * 0.5 + 0.5) * viewport.width;
      const y = (-this._v.y * 0.5 + 0.5) * viewport.height;
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
    const sx = (maxX - minX) / this.designW;
    const sy = (maxY - minY) / this.designH;
    this.scale = sx;
    el.style.transform = `translate(${minX.toFixed(2)}px, ${minY.toFixed(2)}px) scale(${sx.toFixed(5)}, ${sy.toFixed(5)})`;
  }
}
