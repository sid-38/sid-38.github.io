import * as THREE from 'three';
import { box, place, toon, glow, C } from '../utils/materials.js';
import { loadModel } from '../utils/models.js';

// Desk runs along Z on the right side of the room. The avatar sits on the -X side facing +X,
// the monitor faces back toward them. The near (+Z) end is where the notebook lives.
export const DESK = { x: 1.0, z: -0.475, width: 0.8, length: 1.75, height: 0.75 };

export function createDesk() {
  const g = new THREE.Group();
  g.name = 'desk';
  const top = DESK.height;

  // Table
  g.add(place(box(DESK.width, 0.04, DESK.length, toon(C.woodLight), 'desk_top'), DESK.x, top - 0.04, DESK.z));
  const legMat = toon(C.metal);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const leg = box(0.05, top - 0.04, 0.05, legMat, 'desk_leg');
      g.add(place(leg, DESK.x + sx * (DESK.width / 2 - 0.05), 0, DESK.z + sz * (DESK.length / 2 - 0.05)));
    }
  }
  // Drawer unit under the back half
  g.add(place(box(0.6, 0.55, 0.45, toon(C.wood), 'desk_drawers'), DESK.x + 0.05, 0.05, DESK.z - 0.65));

  // Monitor (faces -X)
  const monitor = new THREE.Group();
  monitor.name = 'monitor';
  monitor.add(place(box(0.18, 0.015, 0.22, toon(C.plastic), 'monitor_base'), 0, 0, 0));
  monitor.add(place(box(0.04, 0.2, 0.05, toon(C.plastic), 'monitor_neck'), 0.03, 0.015, 0));
  const bezel = box(0.04, 0.38, 0.64, toon(C.plastic), 'monitor_bezel');
  monitor.add(place(bezel, 0, 0.14, 0));
  const screenTex = createScreenTexture();
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.6, 0.34),
    new THREE.MeshBasicMaterial({ map: screenTex.texture, toneMapped: false }),
  );
  screen.name = 'monitor_screen';
  screen.position.set(-0.021, 0.14 + 0.19, 0);
  screen.rotation.y = -Math.PI / 2;
  screen.userData.update = screenTex.update;
  monitor.add(screen);
  g.add(place(monitor, DESK.x + 0.22, top, -0.45));

  // Speakers either side of the monitor, on little stands, facing the avatar
  for (const z of [-0.9, 0.0]) g.add(place(createSpeaker(), DESK.x + 0.2, top, z));

  // Keyboard + mouse: cream keys with sage-green modifiers, white mouse (see reference)
  g.add(place(box(0.42, 0.004, 0.75, toon(C.plastic), 'mousepad'), DESK.x - 0.18, top, -0.35));
  g.add(place(createKeyboard(), DESK.x - 0.25, top + 0.004, -0.45)); // within the avatar's reach
  const mouse = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), toon(C.paper));
  mouse.scale.set(0.065, 0.035, 0.04);
  mouse.castShadow = true;
  mouse.name = 'mouse';
  g.add(place(mouse, DESK.x - 0.22, top + 0.004, -0.2));

  // PC tower on the back of the desk, glass side + RGB facing the room
  const pc = new THREE.Group();
  pc.name = 'pc_tower';
  pc.add(box(0.42, 0.46, 0.22, toon(C.plastic), 'pc_case_blockout'));
  const rgb = box(0.005, 0.38, 0.012, glow(0xd05fd8), 'pc_rgb');
  pc.add(place(rgb, -0.212, 0.04, 0.08));
  pc.add(place(new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.008, 6, 16), glow(0x7af0ff)), -0.212, 0.3, -0.03, Math.PI / 2));
  pc.userData.update = (dt, t) => {
    rgb.material.color.setHSL((t * 0.05) % 1, 0.7, 0.6);
  };
  g.add(place(pc, DESK.x + 0.12, top, -1.1));

  // Near-end props (the cosy clutter from the reference)
  g.add(place(createPhone(), DESK.x - 0.28, top, 0.28, 0.3));
  const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.035, 0.09, 10), toon(C.sheet));
  mug.castShadow = true;
  g.add(place(mug, DESK.x + 0.33, top + 0.045, 0.12));
  g.add(createLamp());

  // Far end: water bottle in front of the PC tower, on the avatar's left
  g.add(place(createWaterBottle(), DESK.x - 0.28, top, -1.2));
  // ID badge (About) beside the bottle, lanyard curling toward the back of the desk
  g.add(place(createIdCard(), DESK.x - 0.19, top, -1.245, -0.1));

  return g;
}

/**
 * Phone lying face up. Its screen (`phone_screen`, top of the screen = local -Z) is where the
 * Contact app appears when you zoom in.
 */
export const PHONE_SCREEN = { w: 0.062, h: 0.128 };
function createPhone() {
  const g = new THREE.Group();
  g.name = 'phone';
  g.add(box(0.07, 0.008, 0.14, toon(C.plastic), 'phone_body'));
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(PHONE_SCREEN.w, PHONE_SCREEN.h), glow(0x2b3757));
  screen.name = 'phone_screen';
  screen.rotation.x = -Math.PI / 2;
  screen.position.y = 0.0085;
  g.add(screen);
  return g;
}

/**
 * ID badge lying on the desk with its lanyard (the About section). The face is a small canvas
 * texture; drawIdCardFace() repaints it once the avatar's portrait has been rendered.
 * Top of the card = local -Z.
 */
export const ID_CARD = { w: 0.1, h: 0.064 };
const idCanvas = document.createElement('canvas');
idCanvas.width = 160;
idCanvas.height = 102;
const idTexture = new THREE.CanvasTexture(idCanvas);
idTexture.colorSpace = THREE.SRGBColorSpace;
idTexture.magFilter = THREE.NearestFilter;
idTexture.minFilter = THREE.LinearMipmapLinearFilter;

export function drawIdCardFace(portrait) {
  const ctx = idCanvas.getContext('2d');
  const { width: W, height: H } = idCanvas;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#eef1f7';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#c8424f'; // header band
  ctx.fillRect(0, 0, W, 18);
  ctx.fillStyle = '#eef1f7';
  ctx.fillRect(8, 7, 30, 4);
  ctx.fillStyle = '#1e2742';
  ctx.fillRect(66, 8, 22, 4); // lanyard slot
  // Portrait
  ctx.fillStyle = '#93a3c6';
  ctx.fillRect(8, 26, 46, 56);
  if (portrait) ctx.drawImage(portrait, 8, 26, 46, 56);
  // "Text" lines
  ctx.fillStyle = '#1e2742';
  ctx.fillRect(62, 28, 70, 7);
  ctx.fillStyle = '#52618a';
  for (const [y, w] of [[42, 84], [50, 60], [58, 76], [66, 52]]) ctx.fillRect(62, y, w, 4);
  // Barcode
  ctx.fillStyle = '#1e2742';
  for (let x = 62, i = 0; x < 150; x += 2 + (i++ % 3)) ctx.fillRect(x, 80, 1 + (i % 2), 14);
  idTexture.needsUpdate = true;
}

function createIdCard() {
  const g = new THREE.Group();
  g.name = 'id_card';
  const card = box(ID_CARD.w + 0.004, 0.0015, ID_CARD.h + 0.004, toon(C.paper), 'id_card_body');
  g.add(card);
  drawIdCardFace(null);
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(ID_CARD.w, ID_CARD.h),
    new THREE.MeshToonMaterial({ map: idTexture, gradientMap: toon(C.paper).gradientMap }),
  );
  face.name = 'id_card_face';
  face.rotation.x = -Math.PI / 2;
  face.position.y = 0.0016;
  face.receiveShadow = true;
  g.add(face);
  // Lanyard: a red strap loop running off the top edge of the card
  const pts = [
    [0, 0.002, -0.034], [0.012, 0.0025, -0.07], [0.05, 0.0025, -0.11], [0.11, 0.0025, -0.12],
    [0.15, 0.0025, -0.08], [0.13, 0.0025, -0.03], [0.07, 0.0025, -0.02], [0.01, 0.002, -0.034],
  ].map(([x, y, z]) => new THREE.Vector3(x, y, z));
  const strap = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 48, 0.0035, 4, true),
    toon(0xc8424f),
  );
  strap.scale.set(0.75, 0.4, 0.75); // flat ribbon, small enough to stay on the desk
  strap.name = 'id_card_lanyard';
  g.add(strap);
  return g;
}

/**
 * Matte navy insulated bottle with a light steel band and a black loop cap.
 * Kept dark on purpose: it sits right next to the PC's RGB light, which turns light colours magenta.
 */
function createWaterBottle() {
  const g = new THREE.Group();
  g.name = 'water_bottle';
  const R = 0.036, H = 0.2;
  // Lathe profile (radius, height): flat base, straight body, rounded shoulder, neck
  const pts = [
    [0, 0], [R - 0.004, 0], [R, 0.004], [R, H * 0.78],
    [R * 0.92, H * 0.86], [R * 0.72, H * 0.93], [R * 0.6, H * 0.96], [R * 0.6, H], [0, H],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const body = new THREE.Mesh(new THREE.LatheGeometry(pts, 16), toon(0x2b3757));
  body.name = 'water_bottle_body';
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);
  // Light steel band just under the shoulder, so it reads as a metal bottle
  const band = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.0008, R + 0.0008, 0.01, 16, 1, true), toon(0xbcc8e0));
  band.position.y = H * 0.72;
  g.add(band);
  const black = toon(C.plastic);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.62, R * 0.62, 0.028, 14), black);
  cap.position.y = H + 0.014;
  cap.castShadow = true;
  g.add(cap);
  const loop = new THREE.Mesh(new THREE.TorusGeometry(0.014, 0.004, 6, 12, Math.PI), black);
  loop.position.y = H + 0.028;
  g.add(loop);
  return g;
}

/**
 * Swap the gray-box table for the Blender standing desk (public/models/desk.glb).
 * The model is exported at its room position, so it's added without any offset.
 * Everything else on the desk (monitor, keyboard, lamp…) is still built in code.
 */
export async function loadDeskModel(deskGroup, url) {
  const { scene: model } = await loadModel(url);
  for (const name of ['desk_top', 'desk_leg', 'desk_drawers']) {
    deskGroup.children.filter((o) => o.name === name).forEach((o) => deskGroup.remove(o));
  }
  deskGroup.add(...model.children);
}

/** Bookshelf speaker (faces -X). Pivot at the bottom of its stand. */
function createSpeaker() {
  const g = new THREE.Group();
  g.name = 'speaker';
  const black = toon(C.plastic);
  // Stand: two thin rails and a top plate, like the reference
  for (const z of [-0.045, 0.045]) g.add(place(box(0.12, 0.05, 0.012, black), 0, 0, z));
  g.add(place(box(0.14, 0.008, 0.12, black), 0, 0.05, 0));
  const body = box(0.15, 0.21, 0.13, black, 'speaker_body');
  g.add(place(body, 0, 0.058, 0));
  // Woofer + tweeter on the front face
  const cone = (r, y, colour) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.006, 16), toon(colour));
    m.rotation.z = Math.PI / 2;
    m.position.set(-0.076, y, 0);
    return m;
  };
  g.add(cone(0.042, 0.058 + 0.075, C.metal));
  g.add(cone(0.03, 0.058 + 0.075, 0x2b3757));
  g.add(cone(0.014, 0.058 + 0.17, C.metal));
  return g;
}

/** Keyboard: cream case + key texture drawn on a canvas (cream alphas, sage modifiers). */
function createKeyboard() {
  const W = 0.42, D = 0.14, H = 0.022;
  const g = new THREE.Group();
  g.name = 'keyboard';
  g.add(box(D, H, W, toon(C.paper), 'keyboard_case'));

  // 16 x 5 key units, 4 px per unit. Each row: [width in units, 'c'ream | 'g'reen]
  const rows = [
    [[1, 'g'], ...Array(13).fill([1, 'c']), [2, 'g']],
    [[1.5, 'g'], ...Array(13).fill([1, 'c']), [1.5, 'g']],
    [[1.75, 'g'], ...Array(12).fill([1, 'c']), [2.25, 'g']],
    [[2.25, 'g'], ...Array(11).fill([1, 'c']), [2.75, 'g']],
    [[1.25, 'g'], [1.25, 'g'], [1.25, 'g'], [6.25, 'c'], [1.25, 'g'], [1.25, 'g'], [1.25, 'g'], [1.25, 'g'], [1, 'g']],
  ];
  const U = 4;
  const canvas = document.createElement('canvas');
  canvas.width = 16 * U;
  canvas.height = 5 * U;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#bcc8e0'; // gaps between keys
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const colours = { c: '#ffeccf', g: '#6aa35a' }; // green is a touch stronger than the reference so it survives the blue night light
  rows.forEach((row, r) => {
    let x = 0;
    for (const [w, c] of row) {
      ctx.fillStyle = colours[c];
      ctx.fillRect(x, r * U, w * U - 1, U - 1);
      x += w * U;
    }
  });
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter; // fades to an average colour far away, crisp up close

  // Plane on top of the case. Texture right = keyboard's right (+Z, the avatar faces +X),
  // texture up = the far row (+X, toward the monitor).
  const geo = new THREE.PlaneGeometry(W - 0.01, D - 0.01);
  geo.rotateX(-Math.PI / 2);
  const keys = new THREE.Mesh(geo, new THREE.MeshToonMaterial({ map: tex, gradientMap: toon(C.paper).gradientMap }));
  keys.name = 'keyboard_keys';
  keys.rotation.y = -Math.PI / 2;
  keys.position.y = H + 0.0005;
  keys.receiveShadow = true;
  g.add(keys);
  return g;
}

/** Desk lamp near the notebook: its warm pool of light leads the eye there on landing. */
function createLamp() {
  const g = new THREE.Group();
  g.name = 'lamp';
  const mat = toon(C.metal);
  g.add(box(0.12, 0.02, 0.12, mat, 'lamp_base'));
  const arm1 = box(0.02, 0.38, 0.02, mat, 'lamp_arm');
  arm1.rotation.z = 0.35;
  g.add(place(arm1, 0, 0.02, 0));
  const headMat = mat.clone();
  headMat.side = THREE.DoubleSide;
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.11, 10, 1, true), headMat);
  head.name = 'lamp_head';
  head.position.set(-0.17, 0.4, 0);
  head.rotation.z = -0.9;
  g.add(head);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), glow(0xffeccf).clone()); // own copy: it changes colour
  bulb.name = 'lamp_bulb'; // Lighting.js dims it when the lamp is off
  bulb.position.set(-0.163, 0.369, 0); // inside the Blender shade, just below its narrow end
  g.add(bulb);
  // Light is created in Lighting.js and attached to this anchor
  const anchor = new THREE.Object3D();
  anchor.name = 'anchor_lamp_light';
  anchor.position.set(-0.163, 0.369, 0);
  g.add(anchor);
  return place(g, DESK.x + 0.3, DESK.height, 0.3, -0.5);
}

/** Tiny fake code editor drawn on a canvas. Updated at a low rate. */
function createScreenTexture() {
  const W = 160, H = 90;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;

  const colors = ['#7af0ff', '#d05fd8', '#ffd7a3', '#93a3c6', '#6f9b6c'];
  const lines = Array.from({ length: 40 }, () => ({
    indent: Math.floor(Math.random() * 4) * 8,
    segs: Array.from({ length: 1 + Math.floor(Math.random() * 4) }, () => ({
      w: 6 + Math.random() * 30,
      c: colors[Math.floor(Math.random() * colors.length)],
    })),
  }));
  let offset = 0;
  let acc = 0;

  const draw = () => {
    ctx.fillStyle = '#141a2e';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#1e2742';
    ctx.fillRect(0, 0, 22, H);
    for (let i = 0; i < 14; i++) {
      const line = lines[(i + offset) % lines.length];
      let x = 28 + line.indent;
      for (const s of line.segs) {
        ctx.fillStyle = s.c;
        ctx.fillRect(x, 4 + i * 6, s.w, 3);
        x += s.w + 4;
      }
    }
    // cursor
    ctx.fillStyle = '#e6ecf5';
    ctx.fillRect(30 + (offset % 7) * 6, 4 + 13 * 6, 3, 4);
    texture.needsUpdate = true;
  };
  draw();

  return {
    texture,
    update: (dt) => {
      acc += dt;
      if (acc > 0.6) {
        acc = 0;
        offset++;
        draw();
      }
    },
  };
}
