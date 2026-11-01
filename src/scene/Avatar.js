import * as THREE from 'three';
import { box, place, toon, glow, C } from '../utils/materials.js';
import { loadModel } from '../utils/models.js';

// Gray-box stand-ins for the chair and the avatar.
// Each exposes update(time) so it can later be replaced by a GLB + AnimationMixer
// without touching main.js.

const SEAT = { x: 0.3, z: -0.45, height: 0.48 };

export function createChair() {
  // Racing-style gaming chair (see reference): tall winged backrest with a headrest slot,
  // stitched horizontal panels, bolstered seat, armrests and a 5-star base on casters.
  const g = new THREE.Group();
  g.name = 'chair';
  const shell = toon(0x3c4a6e);
  const accent = toon(0x5c4a6e);
  const dark = toon(C.plastic);

  // Base: 5 legs with casters, gas lift
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const leg = box(0.3, 0.03, 0.045, dark);
    leg.geometry.translate(0.15, 0, 0);
    leg.rotation.y = a;
    leg.position.y = 0.05;
    g.add(leg);
    const caster = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), dark);
    caster.position.set(Math.cos(a) * 0.29, 0.025, -Math.sin(a) * 0.29);
    g.add(caster);
  }
  g.add(place(new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.32, 10), dark), 0, 0.22, 0));

  // Seat with raised side bolsters
  const seatY = SEAT.height - 0.09;
  g.add(place(box(0.5, 0.09, 0.52, shell, 'chair_seat'), 0, seatY, 0));
  for (const z of [-0.23, 0.23]) g.add(place(box(0.46, 0.04, 0.07, accent, 'chair_seat_bolster'), 0, SEAT.height, z));

  // Armrests
  for (const z of [-0.3, 0.3]) {
    g.add(place(box(0.04, 0.2, 0.04, dark), -0.02, seatY + 0.02, z));
    g.add(place(box(0.26, 0.035, 0.08, dark, 'chair_armrest'), 0.0, seatY + 0.22, z));
  }

  // Backrest pivots at the back of the seat and leans back slightly
  const back = new THREE.Group();
  back.name = 'chair_back';
  back.position.set(-0.24, SEAT.height - 0.04, 0);
  back.rotation.z = 0.12;
  g.add(back);
  back.add(place(box(0.09, 0.82, 0.44, shell, 'chair_back_panel'), 0, 0, 0));
  // Side wings that wrap the shoulders
  for (const z of [-0.235, 0.235]) back.add(place(box(0.13, 0.5, 0.07, accent, 'chair_back_wing'), 0.03, 0.08, z));
  // Narrower top with the headrest slot
  back.add(place(box(0.09, 0.22, 0.34, shell, 'chair_headrest'), 0, 0.82, 0));
  back.add(place(box(0.02, 0.05, 0.12, dark, 'chair_headrest_slot'), 0.04, 0.9, 0));
  // Stitched horizontal panels
  for (const y of [0.22, 0.38, 0.54]) back.add(place(box(0.01, 0.012, 0.36, accent), 0.046, y, 0));

  return place(g, SEAT.x, 0, SEAT.z);
}

export class Avatar {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'avatar';
    const hoodie = toon(C.hoodie);
    const skin = toon(C.skin);
    const pants = toon(0x2b3757);

    // Hips sit on the seat, character faces +X (toward the monitor)
    const hips = place(new THREE.Group(), 0, SEAT.height, 0);
    this.group.add(hips);

    // Legs
    for (const side of [-1, 1]) {
      const thigh = box(0.42, 0.13, 0.13, pants);
      thigh.position.set(0.02, 0, side * 0.1);
      hips.add(thigh);
      const shin = box(0.12, 0.46, 0.12, pants);
      shin.position.set(0.38, -0.46, side * 0.1);
      hips.add(shin);
      hips.add(place(box(0.2, 0.06, 0.1, toon(C.sheet)), 0.44, -0.48, side * 0.1));
    }

    // Torso pivots at the hips so it can lean
    this.torso = place(new THREE.Group(), 0, 0.08, 0);
    hips.add(this.torso);
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.28, 4, 10), hoodie);
    body.scale.set(0.8, 1, 1.1);
    body.position.y = 0.3;
    body.castShadow = true;
    this.torso.add(body);

    // Head
    this.head = place(new THREE.Group(), 0.02, 0.62, 0);
    this.torso.add(this.head);
    const face = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 10), skin);
    face.position.y = 0.11;
    face.castShadow = true;
    this.head.add(face);
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.42), toon(C.hair));
    hair.position.set(-0.01, 0.12, 0);
    hair.rotation.z = 0.55;
    this.head.add(hair);
    // Eyes (so you can tell which way the blockout is looking)
    for (const side of [-1, 1]) {
      this.head.add(place(box(0.012, 0.03, 0.02, toon(C.hair)), 0.115, 0.1, side * 0.045));
    }
    // Headphones
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.135, 0.015, 6, 16, Math.PI), toon(C.plastic));
    band.position.y = 0.12;
    band.rotation.y = Math.PI / 2;
    this.head.add(band);
    for (const side of [-1, 1]) {
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.04, 10), toon(C.plastic));
      cup.rotation.x = Math.PI / 2;
      cup.position.set(0, 0.11, side * 0.13);
      this.head.add(cup);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.008, 4, 12), glow(0xc8424f));
      ring.position.set(0, 0.11, side * 0.152);
      this.head.add(ring);
    }

    // Arms: shoulder pivot → upper arm → elbow pivot → forearm reaching to the keyboard
    this.arms = [];
    for (const side of [-1, 1]) {
      const shoulder = place(new THREE.Group(), 0.0, 0.5, side * 0.2);
      this.torso.add(shoulder);
      const upper = box(0.09, 0.28, 0.09, hoodie);
      upper.geometry.translate(0, -0.28, 0);
      shoulder.add(upper);
      shoulder.rotation.z = 0.35;
      const elbow = place(new THREE.Group(), 0, -0.27, 0);
      shoulder.add(elbow);
      const fore = box(0.3, 0.08, 0.08, hoodie);
      fore.geometry.translate(0.15, -0.04, 0);
      elbow.add(fore);
      const hand = box(0.08, 0.04, 0.07, skin);
      hand.position.set(0.32, -0.06, 0);
      elbow.add(hand);
      elbow.rotation.z = -0.2;
      this.arms.push({ shoulder, elbow, side });
    }

    this.group.position.set(SEAT.x, 0, SEAT.z);
    this.state = 'working'; // later: 'stretching' | 'walking' | 'sleeping'
  }

  /**
   * Swap the gray-box figure for the rigged Blender avatar (public/models/avatar.glb),
   * which is exported sitting in the chair and carries a looping "sit_typing" clip.
   */
  async loadModel(url) {
    const gltf = await loadModel(url);
    this.group.clear();
    this.group.position.set(0, 0, 0); // the model is exported at its room position
    this.group.add(...gltf.scene.children);
    this.mixer = new THREE.AnimationMixer(this.group);
    this.clips = Object.fromEntries(gltf.animations.map((c) => [c.name, c]));
    const typing = this.clips.sit_typing ?? gltf.animations[0];
    if (typing) this.mixer.clipAction(typing).play();
    this.clip = typing;
  }

  /** @param t stepped time in seconds */
  update(t) {
    if (this.mixer) {
      // drive the clip from the stepped clock so it animates at the same 12 fps as everything else
      this.mixer.setTime(this.clip ? t % this.clip.duration : t);
      return;
    }
    if (this.state !== 'working') return;
    // Typing: alternating forearm taps + small head bob, plus an occasional glance at the notebook
    this.arms.forEach(({ elbow, side }, i) => {
      elbow.rotation.z = -0.2 + Math.max(0, Math.sin(t * 9 + i * Math.PI)) * 0.08 * (side === 1 ? 1 : 0.8);
    });
    this.torso.rotation.z = -0.06 + Math.sin(t * 0.7) * 0.015;
    const glance = smoothPulse(t % 11, 7, 9);
    this.head.rotation.y = -0.05 + glance * 0.6;
    this.head.rotation.z = -0.1 + Math.sin(t * 4.5) * 0.02 - glance * 0.15;
  }
}

// 0 → 1 → 0 between a and b with eased edges
function smoothPulse(x, a, b) {
  const edge = 0.4;
  return THREE.MathUtils.smoothstep(x, a, a + edge) * (1 - THREE.MathUtils.smoothstep(x, b - edge, b));
}

export { SEAT };
