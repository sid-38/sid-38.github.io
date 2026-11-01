import * as THREE from 'three';
import gsap from 'gsap';
import { CONFIG } from '../config.js';
import { ROOM } from '../scene/Room.js';

/**
 * Camera director: holds the landing shot of the room and flies to close-ups of the clickable
 * objects (monitor, phone, ID card, journal) and back.
 *
 * Each close-up is a "surface shot": the camera looks straight at a flat surface (a screen,
 * a page, a card) from far enough away that it fills `fill` of the viewport. Shots are
 * recomputed every frame, so resizing the window never breaks the framing.
 */
const UP = new THREE.Vector3(0, 1, 0);

// Free look in the room: orbit around the desk, kept inside the room
const ORBIT = {
  yaw: [-1.1, 0.6], // radians from straight down the room (+Z): far toward the bed, a little toward the desk wall
  pitch: [0.08, 1.0], // just above the horizon … looking well down onto the desk
  radius: [1.1, 3.2], // zoom range (metres)
  margin: 0.18, // closest the camera gets to a wall, the floor or the ceiling
};
const BOX = {
  min: new THREE.Vector3(ROOM.minX + ORBIT.margin, 0.25, ROOM.backZ + ORBIT.margin),
  max: new THREE.Vector3(ROOM.maxX - ORBIT.margin, ROOM.height - ORBIT.margin, ROOM.frontZ - ORBIT.margin),
};

/** How far from `origin` along `dir` before leaving the room box */
function distanceInsideRoom(origin, dir) {
  let t = Infinity;
  for (const k of ['x', 'y', 'z']) {
    if (dir[k] > 1e-6) t = Math.min(t, (BOX.max[k] - origin[k]) / dir[k]);
    else if (dir[k] < -1e-6) t = Math.min(t, (BOX.min[k] - origin[k]) / dir[k]);
  }
  return Math.max(0, t);
}

export function surfaceShot(camera, { center, normal, up, width, height, fill = 0.9, tilt = 0 }) {
  const halfTan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const distH = height / (fill * 2 * halfTan);
  const distW = width / (fill * 2 * halfTan * camera.aspect);
  const dist = Math.max(distH, distW);
  // Lean back a touch toward the reader's side (away from the surface's "up") if tilted
  const dir = normal.clone().multiplyScalar(Math.cos(tilt)).addScaledVector(up, -Math.sin(tilt)).normalize();
  const pos = center.clone().addScaledVector(dir, dist);
  const quat = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(pos, center, up));
  return { pos, quat };
}

/** Surface description of a flat mesh with a PlaneGeometry (its +Z face, geometry +Y = up) */
export function planeSurface(mesh, extra = {}) {
  mesh.updateWorldMatrix(true, false);
  const { width, height } = mesh.geometry.parameters;
  const e = mesh.matrixWorld.elements;
  const sx = Math.hypot(e[0], e[1], e[2]);
  const sy = Math.hypot(e[4], e[5], e[6]);
  return {
    center: new THREE.Vector3().setFromMatrixPosition(mesh.matrixWorld),
    normal: new THREE.Vector3(0, 0, 1).transformDirection(mesh.matrixWorld),
    up: new THREE.Vector3(0, 1, 0).transformDirection(mesh.matrixWorld),
    width: width * sx,
    height: height * sy,
    ...extra,
  };
}

/** The four world-space corners of a plane mesh: TL, TR, BR, BL (for laying HTML over it) */
export function planeCorners(mesh, target = []) {
  mesh.updateWorldMatrix(true, false);
  const { width: w, height: h } = mesh.geometry.parameters;
  [[-w / 2, h / 2], [w / 2, h / 2], [w / 2, -h / 2], [-w / 2, -h / 2]].forEach(([x, y], i) => {
    target[i] = (target[i] || new THREE.Vector3()).set(x, y, 0).applyMatrix4(mesh.matrixWorld);
  });
  return target;
}

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.shots = new Map(); // id -> (camera) => { pos, quat }
    this.focus = null; // null = the room
    this.arrived = true;
    this.closeness = 0; // 0 in the room … 1 at a close-up (drives the pixel size)
    this.parallax = new THREE.Vector2();
    this.parallaxTarget = new THREE.Vector2();
    this.flight = null;
    this.listeners = new Set();
    this._v = new THREE.Vector3();
    // Orbit starts at the landing shot; `goal` is where drags send it, `orbit` eases toward it
    const { pos, target } = CONFIG.camera.establishing;
    this.orbitTarget = new THREE.Vector3(...target);
    const off = new THREE.Vector3(...pos).sub(this.orbitTarget);
    const r = off.length();
    this.orbit = { yaw: Math.atan2(off.x, off.z), pitch: Math.asin(off.y / r), radius: r };
    this.goal = { ...this.orbit };
    this.rebuild();
  }

  addShot(id, fn) { this.shots.set(id, fn); }
  onChange(fn) { this.listeners.add(fn); }

  /** Call on resize */
  rebuild() {
    const cam = this.camera;
    cam.fov = cam.aspect < 1 ? CONFIG.camera.fovPortrait : CONFIG.camera.fov;
    cam.updateProjectionMatrix();
  }

  /** Drag to look around (radians); only does anything in the room */
  orbitBy(dYaw, dPitch) {
    const g = this.goal;
    g.yaw = THREE.MathUtils.clamp(g.yaw + dYaw, ...ORBIT.yaw);
    g.pitch = THREE.MathUtils.clamp(g.pitch + dPitch, ...ORBIT.pitch);
  }

  /** Wheel zoom: factor > 1 moves away */
  zoomBy(factor) {
    this.goal.radius = THREE.MathUtils.clamp(this.goal.radius * factor, ...ORBIT.radius);
  }

  /** The room shot: wherever the visitor has orbited to, pulled in so it never leaves the room */
  roomShot() {
    const { yaw, pitch, radius } = this.orbit;
    const t = this.orbitTarget.clone();
    const dir = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    const p = t.clone().addScaledVector(dir, Math.min(radius, distanceInsideRoom(t, dir)));
    const quat = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(p, t, UP));
    return { pos: p, quat, target: t };
  }

  shotFor(id) {
    return id && this.shots.has(id) ? this.shots.get(id)(this.camera) : this.roomShot();
  }

  /** Fly to a close-up (id) or back to the room (null) */
  go(id, { duration } = {}) {
    if (id === this.focus && !this.flight) return;
    const from = { pos: this.camera.position.clone(), quat: this.camera.quaternion.clone(), close: this.closeness };
    const prev = this.focus;
    this.focus = id;
    this.arrived = false;
    this.flight?.tween.kill();
    const f = { t: 0 };
    const dist = from.pos.distanceTo(this.shotFor(id).pos);
    const dur = duration ?? THREE.MathUtils.clamp(0.9 + dist * 0.5, 1.1, 2.0);
    this.flight = {
      from, f,
      tween: gsap.to(f, {
        t: 1, duration: dur, ease: 'power2.inOut',
        onComplete: () => {
          this.flight = null;
          this.arrived = true;
          this.listeners.forEach((fn) => fn({ focus: this.focus, arrived: true }));
        },
      }),
    };
    this.listeners.forEach((fn) => fn({ focus: id, from: prev, arrived: false, duration: dur }));
  }

  setPointer(nx, ny) { this.parallaxTarget.set(nx, ny); }

  update(dt) {
    const cam = this.camera;
    // Ease the orbit toward where it's been dragged
    const k = 1 - Math.exp(-dt * 10);
    for (const key of ['yaw', 'pitch', 'radius']) this.orbit[key] += (this.goal[key] - this.orbit[key]) * k;
    const to = this.shotFor(this.focus);
    this.parallax.lerp(this.parallaxTarget, 1 - Math.exp(-dt * 4));

    if (this.flight) {
      const { from, f } = this.flight;
      const e = f.t;
      // Arc: rise a little above the straight line so the move swoops instead of sliding
      const ctrl = this._v.copy(from.pos).lerp(to.pos, 0.5);
      ctrl.y += 0.12 * from.pos.distanceTo(to.pos);
      const a = (1 - e) * (1 - e), b = 2 * (1 - e) * e, c = e * e;
      cam.position.set(
        a * from.pos.x + b * ctrl.x + c * to.pos.x,
        a * from.pos.y + b * ctrl.y + c * to.pos.y,
        a * from.pos.z + b * ctrl.z + c * to.pos.z,
      );
      cam.quaternion.slerpQuaternions(from.quat, to.quat, e);
      this.closeness = THREE.MathUtils.lerp(from.close, this.focus ? 1 : 0, e);
    } else if (!this.focus) {
      // Room: subtle mouse parallax around the landing shot
      const amount = CONFIG.camera.parallax;
      cam.position.copy(to.pos);
      cam.position.x += this.parallax.x * amount;
      cam.position.y += this.parallax.y * amount * 0.5;
      cam.position.clamp(BOX.min, BOX.max);
      cam.lookAt(to.target);
      this.closeness = 0;
    } else {
      cam.position.copy(to.pos);
      cam.quaternion.copy(to.quat);
      this.closeness = 1;
    }
  }
}
