import * as THREE from 'three';
import gsap from 'gsap';
import { CONFIG } from './config.js';
import { createRoom, ROOM } from './scene/Room.js';
import { createDesk, loadDeskModel, drawIdCardFace } from './scene/Desk.js';
import { Notebook, PAGE } from './scene/Notebook.js';
import { createChair, Avatar } from './scene/Avatar.js';
import { createLighting } from './scene/Lighting.js';
import { PixelPipeline } from './render/PixelPipeline.js';
import { CameraRig, surfaceShot, planeSurface, planeCorners } from './camera/CameraRig.js';
import { NotebookUI } from './ui/NotebookUI.js';
import { SurfaceUI } from './ui/SurfaceUI.js';
import { Desktop, DESKTOP_SIZE } from './ui/Desktop.js';
import { Hotspots, Guide, markerSprites } from './ui/Guide.js';
import { SECTIONS, VISIBLE_SECTIONS, sectionById } from './sections.js';
import { swapWithModel, swapParts, onModelProgress } from './utils/models.js';

const params = new URLSearchParams(location.search);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---- Renderer ---------------------------------------------------------------
const canvas = document.getElementById('webgl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

// ---- Scene ------------------------------------------------------------------
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(CONFIG.camera.fov, innerWidth / innerHeight, 0.05, 40);

const room = createRoom();
scene.add(room);
// Blender models replace the code-built placeholders. The loading screen stays up until all of
// them are in (or failed, in which case that placeholder simply stays), so nothing pops in.
const BASE = `${import.meta.env.BASE_URL}models/`;
const keep = (what) => (err) => console.warn(`${what} not loaded, keeping the blockout:`, err);
// Room: floor, walls, window + curtains, bed. Rain, city, cabinet, shelf and posters stay in code.
const roomReady = swapParts(room, [
  'floor', 'wall_back_bottom', 'wall_back_top', 'wall_back_left', 'wall_back_right',
  'window_sill', 'window_head', 'window_mullion', 'wall_left', 'wall_right', 'bed',
], `${BASE}room.glb`).catch(keep('Room model'));
const desk = createDesk();
scene.add(desk);
const deskReady = loadDeskModel(desk, `${BASE}desk.glb`).catch(keep('Desk model'));
// Monitor body, PC case and lamp from Blender; the animated screen, RGB lights and bulb stay in code.
const propsReady = swapParts(desk, [
  'monitor_base', 'monitor_neck', 'monitor_bezel', 'pc_case_blockout', 'lamp_base', 'lamp_arm', 'lamp_head',
], `${BASE}desk_props.glb`).catch(keep('Desk props'));
const notebook = new Notebook();
scene.add(notebook.group);
const notebookReady = notebook.loadModel(`${BASE}notebook.glb`).catch(keep('Notebook model'));
const chair = createChair();
scene.add(chair);
const chairReady = swapWithModel(chair, `${BASE}chair.glb`).catch(keep('Chair model'));
const avatar = new Avatar();
scene.add(avatar.group);
const avatarReady = avatar.loadModel(`${BASE}avatar.glb`)
  .then(() => renderPortrait())
  .catch(keep('Avatar model'));
const assetsReady = [roomReady, deskReady, propsReady, notebookReady, chairReady, avatarReady];
const lighting = createLighting(scene);

// ---- Day / night ----------------------------------------------------------------
// Starts from ?time=day|night, else the visitor's last choice, else their local clock.
// The window is the switch (see `activate` below).
const outside = room.getObjectByName('outside');
function setMode(mode, { save = false } = {}) {
  lighting.apply(mode);
  outside.userData.setMode(mode);
  document.body.dataset.time = mode;
  if (save) {
    try { localStorage.setItem('portfolio-mode', mode); } catch { /* storage blocked: fine */ }
  }
}
function initialMode() {
  const fromUrl = params.get('time');
  if (fromUrl === 'day' || fromUrl === 'night') return fromUrl;
  try {
    const saved = localStorage.getItem('portfolio-mode');
    if (saved === 'day' || saved === 'night') return saved;
  } catch { /* storage blocked */ }
  const hour = new Date().getHours();
  return hour >= 7 && hour < 19 ? 'day' : 'night';
}
const toggleMode = () => setMode(lighting.mode === 'night' ? 'day' : 'night', { save: true });
setMode(initialMode());

// Objects that animate on their own (rain, monitor, RGB)
const updatables = [];
scene.traverse((o) => { if (o.userData.update) updatables.push(o.userData.update); });

const pipeline = new PixelPipeline(renderer);
const rig = new CameraRig(camera);

// ---- The four sections: where each lives, how the camera frames it, and its HTML -------------
const monitorScreen = desk.getObjectByName('monitor_screen');
const phoneScreen = desk.getObjectByName('phone_screen');
const idCardFace = desk.getObjectByName('id_card_face');

rig.addShot('projects', (cam) => surfaceShot(cam, planeSurface(monitorScreen, { fill: 0.94 })));
rig.addShot('contact', (cam) => surfaceShot(cam, planeSurface(phoneScreen, { fill: 0.86, tilt: 0.05 })));
rig.addShot('about', (cam) => surfaceShot(cam, planeSurface(idCardFace, { fill: 0.8, tilt: 0.05 })));
rig.addShot('misc', (cam) => {
  // Open journal: both pages (or just the right one on tall screens), seen from slightly toward the reader
  const which = cam.aspect < 1 ? 'right' : 'spread';
  const q = notebook.group.getWorldQuaternion(new THREE.Quaternion());
  return surfaceShot(cam, {
    center: notebook.getSpreadCenter(undefined, which),
    normal: new THREE.Vector3(0, 1, 0).applyQuaternion(q),
    up: new THREE.Vector3(0, 0, -1).applyQuaternion(q),
    width: which === 'right' ? PAGE.x1 : PAGE.x1 * 2,
    height: PAGE.halfD * 2,
    fill: CONFIG.camera.notebookFill,
    tilt: CONFIG.camera.notebookTilt,
  });
});

const journal = new NotebookUI(
  document.getElementById('notebook-ui'), document.getElementById('book-source'), notebook, camera, { reducedMotion },
);
const desktop = new Desktop(document.getElementById('desktop'));
const surfaces = {
  projects: new SurfaceUI(document.getElementById('desktop'), (t) => planeCorners(monitorScreen, t), DESKTOP_SIZE.W, DESKTOP_SIZE.H, { w: 420, h: 720 }),
  contact: new SurfaceUI(document.getElementById('phone-ui'), (t) => planeCorners(phoneScreen, t), 300, 620),
  about: new SurfaceUI(document.getElementById('idcard-ui'), (t) => planeCorners(idCardFace, t), 640, 410, { w: 400, h: 660 }),
};
const uiAmount = Object.fromEntries(SECTIONS.map((s) => [s.id, { v: 0 }]));

// Glowing hotspots (box sizes are in each object's own space)
const hotspots = new Hotspots();
hotspots.add('projects', desk.getObjectByName('monitor'), [0.07, 0.41, 0.67], [0, 0.33, 0]);
hotspots.add('contact', desk.getObjectByName('phone'), [0.085, 0.02, 0.155], [0, 0.006, 0]);
hotspots.add('about', desk.getObjectByName('id_card'), [0.115, 0.012, 0.08], [0, 0.003, 0]);
// The journal (misc) is hidden for now: no hotspot, so it isn't clickable.
// hotspots.add('misc', notebook.group, [0.19, 0.03, 0.25], [0.085, 0.01, 0]);
// The whole window opening, deep enough to include the frame and curtains.
// Its dot sits in the upper-left pane, where the avatar's head never covers it.
hotspots.add('window', room, [1.8, 1.2, 0.4], [0, 1.6, ROOM.backZ], [-0.42, 1.88, ROOM.backZ]);

// Clicking a section: fly to its close-up, or for the window, flip day/night
function activate(id) {
  guide.toggle(false);
  if (sectionById[id]?.toggle) {
    if (id === 'window') toggleMode();
    return;
  }
  rig.go(id);
}

// Only the window can be hidden behind other things (the avatar, the cabinet…), so for it,
// check nothing in the room is in front of it before counting it as under the cursor.
const roomRay = new THREE.Raycaster();
const _ndc = new THREE.Vector2();
const _wc = new THREE.Vector3();
function pickAt(x, y) {
  const id = hotspots.pick(x, y, camera, viewport);
  if (id !== 'window') return id;
  _ndc.set((x / viewport.width) * 2 - 1, -(y / viewport.height) * 2 + 1);
  roomRay.setFromCamera(_ndc, camera);
  const blockers = [desk, chair, notebook.group, avatar.group, room.getObjectByName('cabinet'), room.getObjectByName('bed')]
    .filter(Boolean);
  const hit = roomRay.intersectObjects(blockers, true).find((h) => h.object.visible);
  const windowDist = camera.position.distanceTo(_wc.set(0, 1.6, ROOM.backZ));
  return hit && hit.distance < windowDist - 0.3 ? null : id;
}

// ---- Guide + picking ----------------------------------------------------------------------
const viewport = { width: innerWidth, height: innerHeight };
let hovered = null; // under the cursor
let guideHover = null; // highlighted from the guide list
// Pulsing dots at the centre of each clickable object: only while the guide is open
const markerLayer = document.getElementById('markers');
const markers = VISIBLE_SECTIONS.map((s) => {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'marker';
  el.dataset.section = s.id;
  const sprites = markerSprites(s.color);
  el.style.setProperty('--glow', `url(${sprites.glow})`);
  el.style.setProperty('--ripple', `url(${sprites.ripple})`);
  el.setAttribute('aria-label', `${s.label} (${s.where})`);
  el.innerHTML = '<span class="marker__ripple"></span><span class="marker__ripple marker__ripple--late"></span><span class="marker__glow"></span>';
  el.addEventListener('click', () => activate(s.id));
  el.addEventListener('pointerenter', () => { guideHover = s.id; });
  el.addEventListener('pointerleave', () => { guideHover = null; });
  markerLayer.append(el);
  return { el, id: s.id };
});
const _p = new THREE.Vector3();
function updateMarkers() {
  const show = guide.isOpen && canPick();
  markerLayer.classList.toggle('is-visible', show);
  if (!show) return;
  for (const m of markers) {
    _p.copy(hotspots.center(m.id)).project(camera);
    const x = (_p.x * 0.5 + 0.5) * viewport.width;
    const y = (-_p.y * 0.5 + 0.5) * viewport.height;
    m.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    m.el.classList.toggle('is-hot', guideHover === m.id || hovered === m.id);
  }
}

const guide = new Guide({
  button: document.getElementById('guide-button'),
  panel: document.getElementById('guide-panel'),
  tooltip: document.getElementById('hover-label'),
  onPick: (id) => activate(id),
  onHover: (id) => { guideHover = id; },
});
const canPick = () => !rig.focus && !rig.flight;

// Click and drag (or swipe) on the room to look around. A drag never counts as a click.
let drag = null;
let dragged = false;
canvas.addEventListener('pointerdown', (e) => {
  if (!canPick() || e.button > 0) return;
  drag = { x: e.clientX, y: e.clientY, id: e.pointerId, moved: 0 };
  dragged = false;
});
addEventListener('pointerup', () => {
  canvas.classList.remove('is-dragging');
  drag = null;
});
addEventListener('pointercancel', () => { drag = null; canvas.classList.remove('is-dragging'); });
canvas.addEventListener('wheel', (e) => {
  if (!canPick()) return;
  e.preventDefault();
  const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
  rig.zoomBy(Math.exp(THREE.MathUtils.clamp(dy, -100, 100) * 0.0015));
}, { passive: false });

addEventListener('pointermove', (e) => {
  if (drag && e.pointerId === drag.id) {
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    drag.x = e.clientX;
    drag.y = e.clientY;
    drag.moved += Math.abs(dx) + Math.abs(dy);
    if (drag.moved > 5) {
      dragged = true;
      canvas.classList.add('is-dragging');
      // Drag the room around: moving right swings the view right, up tilts down onto the desk
      rig.orbitBy(-dx * 0.005, dy * 0.004);
    }
  }
  if (!reducedMotion && e.pointerType === 'mouse') {
    rig.setPointer((e.clientX / innerWidth) * 2 - 1, -((e.clientY / innerHeight) * 2 - 1));
  }
  hovered = e.target === canvas && canPick() && e.pointerType === 'mouse' && !dragged
    ? pickAt(e.clientX, e.clientY) : null;
  canvas.style.cursor = hovered ? 'pointer' : '';
  guide.showTooltip(hovered && sectionById[hovered], e.clientX, e.clientY);
});
canvas.addEventListener('click', (e) => {
  if (!canPick() || dragged) return;
  const id = pickAt(e.clientX, e.clientY);
  if (id) activate(id);
});

document.getElementById('back-button').addEventListener('click', () => rig.go(null));
addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (guide.isOpen) guide.toggle(false);
  else if (rig.focus) rig.go(null);
});

// Arriving / leaving a close-up: fade its HTML in or out, open or close the journal
const state = { open: 0 };
rig.onChange(({ focus, from, arrived, duration }) => {
  document.body.classList.toggle('is-focused', !!focus);
  guide.setCurrent(focus);
  hovered = null;
  guide.showTooltip(null);
  canvas.style.cursor = '';
  if (!arrived) {
    for (const id of Object.keys(uiAmount)) gsap.to(uiAmount[id], { v: 0, duration: 0.15, overwrite: true });
    if (focus === 'misc') gsap.to(state, { open: 1, duration: 0.9, delay: duration * 0.45, ease: 'power2.inOut', overwrite: true });
    else if (from === 'misc' || state.open > 0) gsap.to(state, { open: 0, duration: 0.6, ease: 'power2.inOut', overwrite: true });
    return;
  }
  if (focus) {
    gsap.to(uiAmount[focus], { v: 1, duration: 0.3, overwrite: true });
    if (focus === 'projects') desktop.onShow();
  }
});

// ---- Phone details --------------------------------------------------------------------
const phoneTime = document.querySelector('.phone__time');
const tickPhone = () => { phoneTime.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); };
tickPhone();
setInterval(tickPhone, 20000);
document.querySelector('.phone__copy').addEventListener('click', async (e) => {
  const b = e.currentTarget;
  try {
    await navigator.clipboard.writeText(b.dataset.copy);
    b.textContent = 'copied!';
  } catch {
    b.textContent = b.dataset.copy;
  }
  setTimeout(() => { b.textContent = 'copy email'; }, 2000);
});

/**
 * A little portrait of the avatar for the ID card and the phone: rendered once from a camera
 * in front of his face, at ID-photo resolution (so it's naturally pixelated).
 */
function renderPortrait() {
  let head = null;
  avatar.group.traverse((o) => {
    if (!head && o.isBone && /head/i.test(o.name) && !/top|end|tip/i.test(o.name)) head = o;
  });
  if (!head) return;
  avatar.update(0.4);
  scene.updateMatrixWorld(true);
  const hp = head.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.035, 0));
  const W = 46, H = 56;
  const cam = new THREE.PerspectiveCamera(22, W / H, 0.05, 5);
  cam.position.copy(hp).add(new THREE.Vector3(0.72, 0.03, 0.14)); // he faces +X (the monitor)
  cam.lookAt(hp);
  const rt = new THREE.WebGLRenderTarget(W, H, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
  rt.texture.colorSpace = THREE.SRGBColorSpace;
  const lamp = new THREE.PointLight(0xffeccf, 1.2, 1.5, 1); // a little key light, like a photo booth
  lamp.position.copy(cam.position).add(new THREE.Vector3(0, 0.15, 0));
  scene.add(lamp);
  renderer.setRenderTarget(rt);
  renderer.render(scene, cam);
  const px = new Uint8Array(W * H * 4);
  renderer.readRenderTargetPixels(rt, 0, 0, W, H, px);
  renderer.setRenderTarget(null);
  scene.remove(lamp);
  rt.dispose();
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const img = c.getContext('2d').createImageData(W, H);
  for (let y = 0; y < H; y++) img.data.set(px.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4); // flip
  c.getContext('2d').putImageData(img, 0, 0);
  drawIdCardFace(c);
  const url = c.toDataURL();
  document.querySelectorAll('img.portrait').forEach((el) => { el.src = url; });
}

// ---- Resize -------------------------------------------------------------------
function resize() {
  viewport.width = innerWidth;
  viewport.height = innerHeight;
  renderer.setSize(viewport.width, viewport.height, false);
  camera.aspect = viewport.width / viewport.height;
  rig.rebuild();
  pipeline.setSize(viewport.width, viewport.height);
}
addEventListener('resize', resize);
resize();

// ---- Loop -------------------------------------------------------------------------
let last = performance.now();
let debug = null;
const { startSize, endSize } = CONFIG.pixel;

function tick(now) {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  const t = now / 1000;
  // Characters animate on a fixed step (12 fps) for a hand-animated, pixel-art feel
  const fps = CONFIG.animationFps;
  const tStep = fps > 0 ? Math.floor(t * fps) / fps : t;

  for (const update of updatables) update(dt, t);
  avatar.update(tStep);
  notebook.setOpen(state.open);

  if (debug?.orbit) debug.orbit.update();
  else rig.update(dt);

  // Chunky pixels in the room, crisp at a close-up
  const k = THREE.MathUtils.smoothstep(rig.closeness, 0.15, 0.9);
  pipeline.setPixelSize(debug?.pixelSize ?? Math.round(THREE.MathUtils.lerp(startSize, endSize, k)));

  updateMarkers();

  journal.update(uiAmount.misc.v, viewport);
  for (const [id, surface] of Object.entries(surfaces)) surface.update(uiAmount[id].v, viewport, camera);
  desktop.scale = surfaces.projects.scale;

  pipeline.render(scene, camera);
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

// ---- Loading screen ------------------------------------------------------------------
// The bar follows the model downloads; the screen lifts once every model (and the fonts) are in,
// the shaders are compiled and one full frame has been drawn behind it.
{
  const loaderEl = document.getElementById('loader');
  const bar = loaderEl.querySelector('.loader__bar');
  const pct = loaderEl.querySelector('.loader__pct');
  const BLOCKS = 20;
  const blocks = Array.from({ length: BLOCKS }, () => bar.appendChild(document.createElement('span')));
  let shown = 0;
  const show = (f) => {
    shown = Math.max(shown, f); // never go backwards when a new file's size becomes known
    const n = Math.floor(shown * BLOCKS);
    blocks.forEach((b, i) => b.classList.toggle('is-on', i < n));
    pct.textContent = `${Math.floor(shown * 100)}%`;
  };
  const stop = onModelProgress((f) => show(f * 0.95)); // the last 5% is compiling + first frame
  let lifted = false;
  const lift = () => {
    if (lifted) return;
    lifted = true;
    stop();
    show(1);
    document.body.classList.remove('is-loading');
    loaderEl.classList.add('is-done');
    loaderEl.setAttribute('aria-busy', 'false');
  };
  Promise.allSettled([...assetsReady, document.fonts?.ready])
    .then(() => renderer.compileAsync?.(scene, camera))
    .catch(() => {})
    .then(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
    .then(lift);
  setTimeout(lift, 30000); // a stuck download never keeps the room hidden forever
}

// ---- Debug panel: add ?debug to the URL ---------------------------------------------
if (params.has('debug')) {
  import('./utils/debug.js').then(({ createDebug }) => {
    debug = createDebug({ scene, camera, renderer, pipeline, lighting, setMode, canvas });
    window.__portfolio = { scene, camera, debug, lighting, rig, book: journal.book }; // handy in the browser console
  });
}
