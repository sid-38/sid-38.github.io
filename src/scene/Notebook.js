import * as THREE from 'three';
import { box, toon, C } from '../utils/materials.js';
import { DESK } from './Desk.js';
import { loadModel } from '../utils/models.js';

// Notebook dimensions (metres). Local space: spine runs along Z at x=0,
// the closed book covers x ∈ [0, W]; open, the spread covers x ∈ [-W, W].
// Local -Z is the top of the page, so the camera reads it from the +Z side.
const W = 0.17;
const D = 0.23;
const BACK = 0.003; // back cover
const STACK = 0.006; // half the pages
const COVER = 0.003;

// The writable page area of the Blender model (inside the covers), in notebook space.
// The ruled lines on the 3D pages and the HTML pages both use exactly this rectangle,
// so the HTML fades in on top of lines that are already there.
export const PAGE = { x0: 0.002, x1: 0.166, halfD: 0.111 };
// Page design units: the open spread is 1000 units wide (the CSS uses the same units via --page-scale)
export const SPREAD_UNITS = 1000;
export const LINE_UNITS = 36; // ruled line spacing
export const MARGIN_UNITS = 36; // red margin line, from each page's left edge

export class Notebook {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'notebook';
    this.width = W;
    this.depth = D;
    this.pageTop = BACK + STACK; // height of the page surfaces when open

    const paper = new THREE.MeshToonMaterial({
      color: C.paper,
      map: ruledPaperTexture(),
      gradientMap: toon(C.paper).gradientMap,
    });
    const coverMat = toon(C.cover);

    // Back cover + right half of the pages (static)
    const back = box(W, BACK, D, coverMat, 'notebook_back');
    back.position.x = W / 2;
    this.group.add(back);
    const right = box(W - 0.006, STACK, D - 0.008, [toon(C.sheet), toon(C.sheet), paper, toon(C.sheet), toon(C.sheet), toon(C.sheet)], 'notebook_pages_right');
    right.position.set(W / 2 - 0.003, BACK, 0);
    this.group.add(right);

    // Front cover + left half of the pages: rotates around the spine (Z axis)
    this.hinge = new THREE.Group();
    this.hinge.name = 'notebook_hinge';
    this.hinge.position.y = this.pageTop;
    // BoxGeometry face order: +x, -x, +y, -y, +z, -z. Paper on -y (it faces up once flipped).
    const left = box(W - 0.006, STACK, D - 0.008, [toon(C.sheet), toon(C.sheet), toon(C.sheet), paper, toon(C.sheet), toon(C.sheet)], 'notebook_pages_left');
    left.position.set(W / 2 - 0.003, 0, 0);
    this.hinge.add(left);
    const cover = box(W, COVER, D, coverMat, 'notebook_cover');
    cover.position.set(W / 2, STACK, 0);
    this.hinge.add(cover);
    // Label + elastic band so it reads as a notebook from far away
    const label = box(0.08, 0.001, 0.04, toon(C.paper), 'notebook_label');
    label.position.set(W / 2, STACK + COVER, -0.05);
    this.hinge.add(label);
    const band = box(0.008, 0.001, D + 0.002, toon(0x141a2e), 'notebook_band');
    band.position.set(W - 0.02, STACK + COVER, 0);
    this.hinge.add(band);
    this.group.add(this.hinge);

    // Spine
    const spine = box(0.006, BACK + STACK * 2 + COVER, D, coverMat, 'notebook_spine');
    spine.position.x = -0.002;
    this.spine = spine;
    this.group.add(spine);

    // Resting spot on the near end of the desk, angled slightly toward the camera
    this.group.position.set(DESK.x - 0.06, DESK.height, 0.18); // clear of the right speaker
    this.group.rotation.y = -0.18;

    this.openAmount = 0;
  }

  /**
   * Swap the gray box for the Blender model (public/models/notebook.glb).
   * The model must contain `notebook_flap`, with its origin on the spine hinge.
   * If loading fails, the blockout simply stays.
   */
  async loadModel(url) {
    const { scene: model } = await loadModel(url);
    const flap = model.getObjectByName('notebook_flap');
    if (!flap) throw new Error('notebook.glb has no "notebook_flap" object');
    this.group.clear();
    this.group.add(...model.children);
    this.hinge = flap;
    this.pageTop = flap.position.y; // the hinge sits at page height
    this.spine = null; // the model's spine is part of the covers
    this.addRuling(flap);
    this.setOpen(this.openAmount);
  }

  /**
   * Ruled lines + margin on both pages, drawn from one canvas covering the whole spread.
   * Right page: a plane just above the right stack. Left page: a plane on the underside
   * of the flap, which faces up once the cover has flipped open.
   */
  addRuling(flap) {
    const tex = ruledSpreadTexture();
    const mat = new THREE.MeshToonMaterial({ map: tex, gradientMap: toon(C.paper).gradientMap, alphaTest: 0.5 });
    const { x0, x1, halfD } = PAGE;
    // Spread coordinates (sx, sz) → texture: u across the whole spread, v = 1 at the top (-Z) edge
    const makePlane = (normalUp, toSpread) => {
      const geo = new THREE.PlaneGeometry(x1 - x0, halfD * 2);
      geo.rotateX(normalUp ? -Math.PI / 2 : Math.PI / 2);
      geo.translate((x0 + x1) / 2, 0, 0);
      const pos = geo.attributes.position;
      const uv = geo.attributes.uv;
      for (let i = 0; i < pos.count; i++) {
        const [sx, sz] = toSpread(pos.getX(i), pos.getZ(i));
        uv.setXY(i, (sx + x1) / (2 * x1), 1 - (sz + halfD) / (2 * halfD));
      }
      const m = new THREE.Mesh(geo, mat);
      m.receiveShadow = true;
      return m;
    };
    const right = makePlane(true, (x, z) => [x, z]);
    right.name = 'notebook_ruling_right';
    right.position.y = this.pageTop + 0.0004;
    this.group.add(right);
    // The flap rotates π about Z to open, so its local x maps to -x in the spread
    const left = makePlane(false, (x, z) => [-x, z]);
    left.name = 'notebook_ruling_left';
    left.position.y = -0.0004;
    flap.add(left);
  }

  /** 0 = closed, 1 = flat open. */
  setOpen(t) {
    this.openAmount = t;
    // Slight lift mid-flip so the cover doesn't scrape the spine
    this.hinge.rotation.z = Math.PI * t;
    this.hinge.position.y = this.pageTop + Math.sin(Math.PI * t) * 0.004;
    // Blockout only: the spine flattens as the book opens so it doesn't ridge up between the pages
    if (this.spine) this.spine.scale.y = THREE.MathUtils.lerp(1, 0.6, t);
  }

  /**
   * World-space corners of the open spread's page area (for aligning the HTML pages).
   * @param which 'spread' (both pages) or 'right' (right page only, used on tall screens)
   */
  getSpreadCorners(target = [], which = 'spread') {
    const y = this.pageTop + 0.0005;
    const { x1, halfD } = PAGE;
    const xa = which === 'right' ? 0 : -x1;
    const local = [
      [xa, y, -halfD], [x1, y, -halfD], [x1, y, halfD], [xa, y, halfD],
    ];
    this.group.updateWorldMatrix(true, false);
    local.forEach((p, i) => {
      target[i] = (target[i] || new THREE.Vector3()).set(...p).applyMatrix4(this.group.matrixWorld);
    });
    return target;
  }

  getSpreadCenter(target = new THREE.Vector3(), which = 'spread') {
    this.group.updateWorldMatrix(true, false);
    const x = which === 'right' ? PAGE.x1 / 2 : 0;
    return target.set(x, this.pageTop, 0).applyMatrix4(this.group.matrixWorld);
  }
}

/**
 * Transparent canvas with the ruled lines and red margins for the whole open spread,
 * in the same units as the HTML pages (see styles.css: --line, --margin-x).
 */
function ruledSpreadTexture() {
  const pxPerUnit = 0.512; // 512 px across the spread: one texel ≈ 2 design units
  const unitsH = (SPREAD_UNITS * PAGE.halfD) / PAGE.x1;
  const c = document.createElement('canvas');
  c.width = Math.round(SPREAD_UNITS * pxPerUnit);
  c.height = Math.round(unitsH * pxPerUnit);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#a3b1d0'; // a touch darker than --rule so the colour snap keeps it (lands on #bcc8e0)
  for (let u = LINE_UNITS; u < unitsH; u += LINE_UNITS) {
    ctx.fillRect(0, Math.round(u * pxPerUnit) - 1, c.width, 1);
  }
  ctx.fillStyle = '#c8424f'; // --margin
  for (const pageLeft of [0, SPREAD_UNITS / 2]) {
    ctx.fillRect(Math.round((pageLeft + MARGIN_UNITS) * pxPerUnit), 0, 1, c.height);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter; // fades out cleanly from far away
  tex.anisotropy = 4;
  return tex;
}

function ruledPaperTexture() {
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 48;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#e6ecf5';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = '#93a3c6';
  for (let y = 6; y < c.height; y += 4) ctx.fillRect(2, y, c.width - 4, 1);
  ctx.fillStyle = '#c8424f';
  ctx.fillRect(5, 0, 1, c.height);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  return tex;
}
