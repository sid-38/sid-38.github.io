import * as THREE from 'three';
import { box, place, toon, glow, C } from '../utils/materials.js';
import { createPinboard } from './Pinboard.js';

// Room layout (metres, Y-up). Back wall at z=-2 with the window, bed on the left,
// desk along the right. There is no front wall (the camera lives there), but there is a ceiling
// so looking up never shows the sky over the walls.
export const ROOM = { minX: -2, maxX: 2, backZ: -2, frontZ: 2.6, height: 2.7 };
const WINDOW = { x0: -0.9, x1: 0.9, y0: 1.0, y1: 2.2 };

export function createRoom() {
  const room = new THREE.Group();
  room.name = 'room';

  // Floor
  const floor = box(ROOM.maxX - ROOM.minX, 0.05, ROOM.frontZ - ROOM.backZ, toon(C.floor), 'floor');
  place(floor, 0, -0.05, (ROOM.frontZ + ROOM.backZ) / 2);
  room.add(floor);

  // Back wall, built around the window opening
  const wallMat = toon(C.wall);
  const t = 0.1;
  const bz = ROOM.backZ - t / 2;
  const W = ROOM.maxX - ROOM.minX;
  room.add(place(box(W, WINDOW.y0, t, wallMat, 'wall_back_bottom'), 0, 0, bz));
  room.add(place(box(W, ROOM.height - WINDOW.y1, t, wallMat, 'wall_back_top'), 0, WINDOW.y1, bz));
  const sideW = WINDOW.x0 - ROOM.minX;
  room.add(place(box(sideW, WINDOW.y1 - WINDOW.y0, t, wallMat, 'wall_back_left'), ROOM.minX + sideW / 2, WINDOW.y0, bz));
  const sideW2 = ROOM.maxX - WINDOW.x1;
  room.add(place(box(sideW2, WINDOW.y1 - WINDOW.y0, t, wallMat, 'wall_back_right'), WINDOW.x1 + sideW2 / 2, WINDOW.y0, bz));

  // Window frame + mullion
  const frameMat = toon(C.sheet);
  const wx = (WINDOW.x0 + WINDOW.x1) / 2;
  const ww = WINDOW.x1 - WINDOW.x0;
  room.add(place(box(ww + 0.08, 0.06, 0.16, frameMat, 'window_sill'), wx, WINDOW.y0 - 0.03, ROOM.backZ));
  room.add(place(box(ww + 0.08, 0.04, 0.12, frameMat, 'window_head'), wx, WINDOW.y1, ROOM.backZ));
  room.add(place(box(0.04, WINDOW.y1 - WINDOW.y0, 0.1, frameMat, 'window_mullion'), wx, WINDOW.y0, ROOM.backZ));

  // Side walls
  const D = ROOM.frontZ - ROOM.backZ;
  room.add(place(box(t, ROOM.height, D, toon(C.wallDark), 'wall_left'), ROOM.minX - t / 2, 0, ROOM.backZ + D / 2));
  room.add(place(box(t, ROOM.height, D, toon(C.wallDark), 'wall_right'), ROOM.maxX + t / 2, 0, ROOM.backZ + D / 2));

  // Ceiling: a little wider and deeper than the walls so no gap shows at the edges
  const ceiling = box(W + 0.3, 0.08, D + 0.8, toon(C.wallDark), 'ceiling');
  ceiling.castShadow = false;
  room.add(place(ceiling, 0, ROOM.height, ROOM.backZ - 0.15 + (D + 0.8) / 2));

  room.add(createOutside());
  room.add(createBed());
  room.add(createCabinet());
  room.add(createWallShelf());

  // Pinboard right of the window (the résumé is on it), and a poster on the left wall
  room.add(createPinboard());
  const posterL = box(0.02, 0.5, 0.4, toon(0x3fb8d8), 'poster_left');
  room.add(place(posterL, ROOM.minX + 0.015, 1.55, -0.2));

  return room;
}

// What you see through the window. `userData.setMode('day' | 'night')` switches it:
// night is a dark, rainy city with lit windows; day is a bright, dry sky with unlit buildings.
const OUTSIDE = {
  night: { sky: 0x141a2e, buildings: [0x0b0e1a, 0x0b0e1a], windows: 0xffd7a3, rain: true },
  day: { sky: 0x9cd2f2, buildings: [0x6e7fa8, 0x93a3c6], windows: 0x3c4a6e, rain: false },
};

function createOutside() {
  const g = new THREE.Group();
  g.name = 'outside';

  // Sky (unfogged so its colour is exactly what's set here)
  const skyMat = new THREE.MeshBasicMaterial({ color: OUTSIDE.night.sky, fog: false, toneMapped: false });
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(40, 20), skyMat);
  sky.position.set(0, 4, -22);
  g.add(sky);

  // Buildings (unlit, so they read as flat silhouettes / hazy blocks) with windows
  // instanced so hundreds of windows are 1 draw call
  const bMats = [0, 1].map(() => new THREE.MeshBasicMaterial({ toneMapped: false }));
  const buildings = [
    [-3.2, 7, -8, 2.2], [-0.6, 9, -10, 2.6], [1.9, 6, -7.5, 1.8], [4.2, 10, -11, 2.4], [-5.5, 8, -12, 3],
  ];
  const winPositions = [];
  buildings.forEach(([x, h, z, w], i) => {
    g.add(place(box(w, h, 2, bMats[i % 2]), x, -2, z));
    for (let fy = 0; fy < h - 1; fy += 0.7) {
      for (let fx = -w / 2 + 0.3; fx < w / 2 - 0.2; fx += 0.45) {
        if (Math.random() < 0.35) winPositions.push([x + fx, -2 + fy + 0.5, z + 1.01]);
      }
    }
  });
  const winGeo = new THREE.PlaneGeometry(0.22, 0.3);
  const winMat = new THREE.MeshBasicMaterial({ toneMapped: false });
  const lit = new THREE.InstancedMesh(winGeo, winMat, winPositions.length);
  const m = new THREE.Matrix4();
  winPositions.forEach((p, i) => lit.setMatrixAt(i, m.makeTranslation(p[0], p[1], p[2])));
  lit.name = 'city_windows';
  g.add(lit);

  // Rain: cheap falling line segments just outside the window (night only)
  const N = 260;
  const pos = new Float32Array(N * 6);
  const area = { x: [-2, 2], y: [-1, 4], z: [-2.4, -4.5] };
  for (let i = 0; i < N; i++) {
    const x = THREE.MathUtils.randFloat(...area.x);
    const y = THREE.MathUtils.randFloat(...area.y);
    const z = THREE.MathUtils.randFloat(area.z[1], area.z[0]);
    pos.set([x, y, z, x - 0.02, y - 0.18, z], i * 6);
  }
  const rainGeo = new THREE.BufferGeometry();
  rainGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const rain = new THREE.LineSegments(
    rainGeo,
    new THREE.LineBasicMaterial({ color: 0x6e7fa8, transparent: true, opacity: 0.7 }),
  );
  rain.name = 'rain';
  rain.userData.update = (dt) => {
    if (!rain.visible) return;
    const a = rainGeo.attributes.position.array;
    for (let i = 0; i < N; i++) {
      const o = i * 6;
      let dy = -dt * 6;
      if (a[o + 1] + dy < area.y[0]) dy += area.y[1] - area.y[0];
      a[o + 1] += dy;
      a[o + 4] += dy;
      a[o] += dy * 0.1;
      a[o + 3] += dy * 0.1;
      if (a[o] < area.x[0]) { a[o] += 4; a[o + 3] += 4; }
    }
    rainGeo.attributes.position.needsUpdate = true;
  };
  g.add(rain);

  g.userData.setMode = (mode) => {
    const o = OUTSIDE[mode] ?? OUTSIDE.night;
    skyMat.color.set(o.sky);
    bMats.forEach((mat, i) => mat.color.set(o.buildings[i]));
    winMat.color.set(o.windows);
    rain.visible = o.rain;
  };
  g.userData.setMode('night');
  return g;
}

function createBed() {
  const g = new THREE.Group();
  g.name = 'bed';
  const L = 2.0, Wd = 1.0;
  g.add(box(Wd, 0.3, L, toon(C.wood), 'bed_frame'));
  g.add(place(box(Wd - 0.06, 0.18, L - 0.06, toon(C.sheet), 'bed_mattress'), 0, 0.3, 0));
  g.add(place(box(Wd - 0.04, 0.06, L * 0.6, toon(0x52618a), 'bed_blanket'), 0, 0.48, L * 0.18));
  g.add(place(box(0.55, 0.1, 0.32, toon(C.paper), 'bed_pillow'), 0, 0.48, -L / 2 + 0.25));
  g.add(place(box(Wd, 0.75, 0.06, toon(C.wood), 'bed_headboard'), 0, 0, -L / 2 + 0.03));
  // Anchor used later for the "sleeping" avatar state
  const sleepAnchor = new THREE.Object3D();
  sleepAnchor.name = 'anchor_sleep';
  place(sleepAnchor, 0, 0.5, -0.2);
  g.add(sleepAnchor);
  return place(g, ROOM.minX + Wd / 2 + 0.03, 0, ROOM.backZ + L / 2 + 0.05);
}

function createCabinet() {
  const g = new THREE.Group();
  g.name = 'cabinet';
  g.add(box(1.5, 0.6, 0.42, toon(C.metal), 'cabinet_body'));
  g.add(place(box(0.22, 0.32, 0.22, toon(C.plastic), 'speaker'), -0.55, 0.6, 0));
  // The speaker's glowing ring (its own material: it pulses to the music, see main.js)
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.012, 6, 16), glow(0x7a3fa8).clone());
  ring.name = 'speaker_ring';
  g.add(place(ring, -0.55, 0.78, 0.115));
  g.add(place(box(0.34, 0.08, 0.22, toon(C.plastic), 'console'), -0.1, 0.6, 0));
  g.add(place(box(0.2, 0.012, 0.01, glow(0xc8424f), 'console_led'), -0.1, 0.63, 0.11));
  g.add(place(box(0.16, 0.04, 0.1, toon(0x52618a), 'controller'), 0.35, 0.6, 0.02, 0.4));
  return place(g, -0.05, 0, ROOM.backZ + 0.24);
}

function createWallShelf() {
  const g = new THREE.Group();
  g.name = 'wall_shelf';
  g.add(box(0.8, 0.03, 0.2, toon(C.woodLight), 'shelf_board'));
  const colors = [0x3fb8d8, 0xc8424f, 0xf2b880];
  colors.forEach((c, i) => {
    const fig = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 0.06, 2, 6), toon(c));
    fig.castShadow = true;
    g.add(place(fig, -0.25 + i * 0.22, 0.09, 0));
  });
  return place(g, 1.5, 2.0, ROOM.backZ + 0.11); // clear of the right curtain
}
