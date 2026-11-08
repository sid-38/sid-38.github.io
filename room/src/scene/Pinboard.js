import * as THREE from 'three';
import { box, place, toon, gradientMap, C } from '../utils/materials.js';

// The cork pinboard on the back wall, right of the window. Most of what's pinned to it is
// painted onto one small canvas (a Zoe polaroid, the cycle sketch, sticky notes, a ribbon);
// the résumé is its own sheet so the camera can fly to it and lay the real page over it
// (see #resume-ui in index.html). Measurements on the board are in centimetres from its
// top-left corner.
const BOARD = { w: 76, h: 56 }; // cork, cm (the wooden frame adds 2 cm around it)
const PX = 4; // canvas pixels per cm: chunky, like the rest of the room
// The résumé (US letter proportions), on the right half: the window's curtain would get between
// the camera and anything on the left half at the close-up
const SHEET = { x: 50, y: 7, w: 20, h: 26 };

const BASE = import.meta.env.BASE_URL;
const FONT = '"Pixelify Sans", monospace';

/** Board-local position (metres) of a point given in cm on the cork */
const at = (x, y, z = 0) => new THREE.Vector3(-BOARD.w / 200 + x / 100, 0.3 + BOARD.h / 200 - y / 100, z);

function canvasTexture(canvas) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

// ---- What's painted on the cork ----------------------------------------------------------
const NOTES = [
  { x: 34, y: 27, w: 11, h: 11, rot: 0.05, color: '#ffd7a3', lines: ['ship', 'it!'] },
  { x: 6, y: 26, w: 12, h: 13, rot: -0.04, color: '#7d9a6b', lines: ['todo:', '☑ code', '☐ sleep'] },
  { x: 33, y: 42, w: 12, h: 10, rot: -0.07, color: '#d05fd8', lines: ['drink', 'water :)'] },
];

function drawCork(ctx, images) {
  const W = BOARD.w * PX, H = BOARD.h * PX;
  // Cork: warm brown with darker and lighter flecks (seeded, so it's the same every visit)
  ctx.fillStyle = '#93674a';
  ctx.fillRect(0, 0, W, H);
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = rand() < 0.6 ? '#6d4a35' : '#b98c64';
    ctx.fillRect(Math.floor(rand() * W), Math.floor(rand() * H), 1 + Math.floor(rand() * 2), 1);
  }

  const item = (x, y, w, h, rot, draw) => {
    ctx.save();
    ctx.translate((x + w / 2) * PX, (y + h / 2) * PX);
    ctx.rotate(rot);
    ctx.fillStyle = 'rgba(42, 29, 26, 0.45)'; // drop shadow on the cork
    ctx.fillRect((-w / 2 + 0.6) * PX, (-h / 2 + 0.8) * PX, w * PX, h * PX);
    draw((-w / 2) * PX, (-h / 2) * PX, w * PX, h * PX);
    ctx.restore();
  };

  // Shadow under the résumé sheet (the sheet itself is a separate mesh in front)
  ctx.fillStyle = 'rgba(42, 29, 26, 0.45)';
  ctx.fillRect((SHEET.x + 0.6) * PX, (SHEET.y + 0.8) * PX, SHEET.w * PX, SHEET.h * PX);
  // Masking tape under it: "résumé"
  item(SHEET.x + 3, SHEET.y + SHEET.h + 2, 14, 4, -0.03, (x, y, w, h) => {
    ctx.fillStyle = '#ffeccf';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#c8424f';
    ctx.font = `600 ${3 * PX}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('résumé ↑', 0, 1);
  });

  // Zoe, the team mascot, as a polaroid
  item(32, 5, 14, 17, -0.07, (x, y, w, h) => {
    ctx.fillStyle = '#e6ecf5';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#1e2742';
    ctx.fillRect(x + PX, y + PX, w - 2 * PX, w - 2 * PX);
    if (images.zoe) ctx.drawImage(images.zoe, x + PX, y + PX, w - 2 * PX, w - 2 * PX);
    ctx.fillStyle = '#1e2742';
    ctx.font = `${2.6 * PX}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('zoe', 0, h / 2 - 1.6 * PX);
  });

  // The cycle sketch
  item(5, 5, 21, 16, 0.05, (x, y, w, h) => {
    ctx.fillStyle = '#ffeccf';
    ctx.fillRect(x, y, w, h);
    if (images.cycle) {
      ctx.globalAlpha = 0.85;
      ctx.drawImage(images.cycle, x + PX * 0.5, y + PX * 0.5, w - PX, h - PX);
      ctx.globalAlpha = 1;
    }
  });

  // First place ribbon (the malware evasion competition)
  item(22, 25, 8, 15, 0.08, (x, y, w) => {
    const cx = x + w / 2, r = w / 2;
    ctx.fillStyle = '#1e2742';
    ctx.fillRect(cx - r * 0.75, y + r * 1.2, r * 0.6, r * 2.2); // tails
    ctx.fillRect(cx + r * 0.15, y + r * 1.2, r * 0.6, r * 2.2);
    ctx.fillStyle = '#3fb8d8';
    ctx.fillRect(cx - r * 0.65, y + r * 1.2, r * 0.4, r * 2.0);
    ctx.fillRect(cx + r * 0.25, y + r * 1.2, r * 0.4, r * 2.0);
    ctx.beginPath();
    ctx.arc(cx, y + r, r, 0, Math.PI * 2);
    ctx.fillStyle = '#3fb8d8';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, y + r, r * 0.65, 0, Math.PI * 2);
    ctx.fillStyle = '#f7c948';
    ctx.fill();
    ctx.fillStyle = '#1e2742';
    ctx.font = `600 ${2.6 * PX}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('1st', cx, y + r + 1);
  });

  // Sticky notes
  for (const n of NOTES) {
    item(n.x, n.y, n.w, n.h, n.rot, (x, y, w, h) => {
      ctx.fillStyle = n.color;
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = 'rgba(11, 14, 26, 0.12)'; // the sticky strip at the top
      ctx.fillRect(x, y, w, 1.5 * PX);
      ctx.fillStyle = '#1e2742';
      ctx.font = `${2.4 * PX}px ${FONT}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      n.lines.forEach((line, i) => ctx.fillText(line, x + PX, y + 2.4 * PX + i * 2.9 * PX));
    });
  }
}

export function createPinboard() {
  const g = new THREE.Group();
  g.name = 'pinboard';

  // Wooden frame and the cork face
  const frame = box(BOARD.w / 100 + 0.04, BOARD.h / 100 + 0.04, 0.025, toon(C.woodLight), 'pinboard_frame');
  frame.position.set(0, 0.3 - (BOARD.h / 100 + 0.04) / 2, 0.0125);
  g.add(frame);

  const corkCanvas = document.createElement('canvas');
  corkCanvas.width = BOARD.w * PX;
  corkCanvas.height = BOARD.h * PX;
  const corkCtx = corkCanvas.getContext('2d');
  const corkTex = canvasTexture(corkCanvas);
  const cork = new THREE.Mesh(
    new THREE.PlaneGeometry(BOARD.w / 100, BOARD.h / 100),
    new THREE.MeshToonMaterial({ map: corkTex, gradientMap }),
  );
  cork.name = 'pinboard_cork';
  cork.position.set(0, 0.3, 0.0255);
  cork.receiveShadow = true;
  g.add(cork);

  // The résumé: a sheet just in front of the cork, showing the real first page (shrunk)
  const sheetCanvas = document.createElement('canvas');
  sheetCanvas.width = 85;
  sheetCanvas.height = 110;
  const sheetCtx = sheetCanvas.getContext('2d');
  sheetCtx.fillStyle = '#eef1f7';
  sheetCtx.fillRect(0, 0, 85, 110);
  const sheetTex = canvasTexture(sheetCanvas);
  const sheet = new THREE.Mesh(
    new THREE.PlaneGeometry(SHEET.w / 100, SHEET.h / 100),
    new THREE.MeshToonMaterial({ map: sheetTex, gradientMap }),
  );
  sheet.name = 'resume_sheet';
  sheet.position.copy(at(SHEET.x + SHEET.w / 2, SHEET.y + SHEET.h / 2, 0.0275));
  sheet.receiveShadow = true;
  g.add(sheet);

  // Push pins: a round head on a short stem, one per thing pinned
  const pinGeo = new THREE.SphereGeometry(0.007, 8, 6);
  const pins = [
    [SHEET.x + SHEET.w / 2, SHEET.y + 1.2, 0xc8424f],
    [39, 6.2, 0x3fb8d8], [15.5, 6.4, 0xf7c948], [26, 26, 0xe6ecf5],
    [39.5, 28.2, 0xc8424f], [12, 27.2, 0x3fb8d8], [39, 43.2, 0xf7c948],
  ];
  for (const [x, y, color] of pins) {
    const pin = new THREE.Mesh(pinGeo, toon(color));
    pin.position.copy(at(x, y, 0.036));
    pin.castShadow = true;
    g.add(pin);
  }

  // Paint the cork now, and again as the font and photos arrive
  const images = {};
  const paint = () => {
    drawCork(corkCtx, images);
    corkTex.needsUpdate = true;
  };
  paint();
  Promise.all([
    loadImage(`${BASE}images/zoe.png`).then((img) => { images.zoe = img; }),
    loadImage(`${BASE}images/cycle.jpeg`).then((img) => { images.cycle = img; }),
    document.fonts?.load(`16px ${FONT}`).catch(() => {}),
  ]).then(paint);
  loadImage(`${BASE}images/resume-page.png`).then((img) => {
    if (!img) return;
    sheetCtx.imageSmoothingQuality = 'high';
    sheetCtx.drawImage(img, 0, 0, 85, 110);
    sheetTex.needsUpdate = true;
  });

  // On the wall right of the window, under the shelf
  return place(g, 1.56, 1.18, -2);
}

/** Where the résumé sheet's centre is, in the board's own space (for the guide's dot) */
export const SHEET_CENTER = at(SHEET.x + SHEET.w / 2, SHEET.y + SHEET.h / 2, 0.03).toArray();
