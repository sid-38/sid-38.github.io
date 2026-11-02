import * as THREE from 'three';

// Extra things the avatar does between stretches of typing, layered on top of the "sit_typing"
// clip in code (no new Blender clips needed):
//
//   lean  – slouches back in the chair, hands behind his head, watching the screen
//   drink – picks up the water bottle, fiddles with the cap, takes a sip, puts it back
//
// Every frame the clip poses the skeleton first; these then bend bones from that pose. Each move
// has a weight that eases 0 → 1 → 0, so it always blends out of and back into typing.
//
// World axes: the avatar faces +X (toward the monitor), +Y is up and his left is -Z.
// The rig's bones keep the model's own axes. For the left hand that means the fingers run along
// local +X with the palm facing local -Y and the thumb along local +Z; the right hand is the
// mirror image (fingers along local -X).

const { smoothstep, clamp } = THREE.MathUtils;
const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);

// The bottle (see createWaterBottle in Desk.js)
const BOTTLE = { radius: 0.036, capTop: 0.228, cap: 0.214 };
// The chair's backrest: its front face is at about x = 0.13 at shoulder height and 0.11 behind
// the head, so the back of his head stays in front of HEAD_CLEAR and his hands just touch it.
const HEAD_CLEAR = 0.22;

// How long things take (seconds)
const LEAN_TIME = 2.6; // sitting back with hands behind the head, or coming back to the keys
export const DRINK_TIME = 12.6;
const LEAN_HANDOFF = 0.4; // a break from watching starts once he's this far from leaned back
const LEAN_HANDBACK = 1.8; // and he starts leaning back again this long before it ends
const TAP_BPM = 84; // his foot while watching with no music on (with music, he follows its beat)
const AUTO_DRINK = [150, 260]; // while typing he has a sip every couple of minutes or so

/**
 * What he's doing by the clock: in every hour he types for the first and third quarter and
 * watches something for the second and fourth.
 */
export function scheduledState(date = new Date()) {
  return Math.floor(date.getMinutes() / 15) % 2 === 0 ? 'typing' : 'watching';
}
const quarterIndex = (date = new Date()) => Math.floor(date.getTime() / 900000);

// ---- Small world-space helpers --------------------------------------------------------
const _q = new THREE.Quaternion();
const _pq = new THREE.Quaternion();
const _wq = new THREE.Quaternion();
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _m = new THREE.Matrix4();

const worldPos = (bone, out = new THREE.Vector3()) => bone.getWorldPosition(out);
const v = (x, y, z) => new THREE.Vector3(x, y, z);
const bezier = (a, c, b, k) => a.clone().multiplyScalar((1 - k) ** 2).addScaledVector(c, 2 * k * (1 - k)).addScaledVector(b, k * k);
/** A quadratic curve from a to b that passes through `via` halfway */
const through = (a, via, b, k) => bezier(a, via.clone().multiplyScalar(2).addScaledVector(a, -0.5).addScaledVector(b, -0.5), b, k);

/** Rotate a bone by a world-space rotation (keeps its children attached). */
function rotateWorld(bone, q) {
  bone.parent.getWorldQuaternion(_pq);
  bone.getWorldQuaternion(_wq);
  _wq.premultiply(q); // new world rotation
  bone.quaternion.copy(_pq.invert().multiply(_wq));
  bone.updateMatrixWorld(true);
}
function rotateWorldAxis(bone, axis, angle) {
  if (Math.abs(angle) < 1e-5) return;
  rotateWorld(bone, _q.setFromAxisAngle(axis, angle));
}
/** Turn a bone toward a world rotation, by w (0 = as it is, 1 = exactly q) */
function setWorldQuat(bone, q, w = 1) {
  if (w <= 0.001) return;
  bone.parent.getWorldQuaternion(_pq);
  const local = _pq.invert().multiply(q);
  bone.quaternion.slerp(local, Math.min(w, 1));
  bone.updateMatrixWorld(true);
}
/** Move a bone by a world-space offset */
function moveWorld(bone, delta) {
  const p = bone.parent.worldToLocal(worldPos(bone).add(delta));
  bone.position.copy(p);
  bone.updateMatrixWorld(true);
}
/** The rotation that turns direction a into direction b */
function between(a, b) {
  return new THREE.Quaternion().setFromUnitVectors(_v1.copy(a).normalize(), _v2.copy(b).normalize());
}
/** A rotation whose local X and Y axes point along these world directions (Y is squared up to X) */
function frame(xDir, yDir) {
  const x = xDir.clone().normalize();
  const z = new THREE.Vector3().crossVectors(x, yDir).normalize();
  const y = new THREE.Vector3().crossVectors(z, x);
  return new THREE.Quaternion().setFromRotationMatrix(_m.makeBasis(x, y, z));
}
/** The part of `d` at right angles to `axis`, normalised */
function across(d, axis) {
  return d.clone().addScaledVector(axis, -d.dot(axis)).normalize();
}

/**
 * Two-bone IK: bend shoulder→elbow→wrist so the wrist lands on `target`, with the elbow
 * pointing toward `pole`.
 */
function solveArm(arm, target, pole) {
  const { upper, lower, hand } = arm;
  const a = worldPos(upper);
  const b = worldPos(lower);
  const c = worldPos(hand);
  const lab = a.distanceTo(b);
  const lcb = b.distanceTo(c);
  const lat = clamp(a.distanceTo(target), 0.01, lab + lcb - 0.001);

  // 1. Elbow angle: bend so shoulder→wrist is exactly as long as shoulder→target
  const cur = c.clone().sub(b).angleTo(a.clone().sub(b));
  const want = Math.acos(clamp((lab * lab + lcb * lcb - lat * lat) / (2 * lab * lcb), -1, 1));
  const axis = new THREE.Vector3().crossVectors(c.clone().sub(b), a.clone().sub(b));
  if (axis.lengthSq() < 1e-8) axis.copy(Z);
  axis.normalize();
  rotateWorldAxis(lower, axis, cur - want);

  // 2. Swing the whole arm so the wrist points at the target
  const c2 = worldPos(hand);
  rotateWorld(upper, between(c2.sub(a), target.clone().sub(a)));

  // 3. Twist around the shoulder→target line so the elbow faces the pole
  if (pole) {
    const dir = target.clone().sub(a).normalize();
    const elbow = worldPos(lower).sub(a);
    const want2 = pole.clone().sub(a);
    elbow.addScaledVector(dir, -elbow.dot(dir));
    want2.addScaledVector(dir, -want2.dot(dir));
    if (elbow.lengthSq() > 1e-8 && want2.lengthSq() > 1e-8) {
      let ang = elbow.angleTo(want2);
      if (_v3.crossVectors(elbow, want2).dot(dir) < 0) ang = -ang;
      rotateWorldAxis(upper, dir, ang);
    }
  }
}

/** IK toward the target, mixed with the arm's current (typing) pose by w */
function reachArm(arm, target, pole, w) {
  if (w <= 0.001) return;
  const q0 = arm.upper.quaternion.clone();
  const q1 = arm.lower.quaternion.clone();
  solveArm(arm, target, pole);
  if (w < 0.999) {
    arm.upper.quaternion.copy(q0.slerp(arm.upper.quaternion, w));
    arm.lower.quaternion.copy(q1.slerp(arm.lower.quaternion, w));
    arm.upper.updateMatrixWorld(true);
  }
}

/**
 * Put a hand so the given point on its palm (in the hand's own space) sits at `at`, turned to
 * `q`. The arm is solved for the wrist position that gives, then the hand is turned.
 */
function placeHand(arm, at, q, palmPoint, pole, w) {
  const wrist = at.clone().sub(palmPoint.clone().applyQuaternion(q));
  reachArm(arm, wrist, pole, w);
  turnHand(arm, q, w);
}

/**
 * Turn the hand to world rotation q. The rig has no forearm twist bones, so a big turn of the
 * wrist would wring the skin there; instead most of the roll about the forearm is done by the
 * forearm itself, the way a real one turns (both bones of the forearm cross over).
 */
function turnHand(arm, q, w = 1) {
  setWorldQuat(arm.hand, q, w);
  const { lower, hand } = arm;
  const axis = hand.position.clone().normalize(); // the forearm, in its own space
  const hq = hand.quaternion;
  const d = hq.x * axis.x + hq.y * axis.y + hq.z * axis.z;
  const twist = new THREE.Quaternion(axis.x * d, axis.y * d, axis.z * d, hq.w);
  if (twist.lengthSq() < 1e-8) return;
  twist.normalize();
  const part = new THREE.Quaternion().slerp(twist, 0.65); // 65% of the roll goes to the forearm
  lower.quaternion.multiply(part);
  hand.quaternion.premultiply(part.invert());
  lower.updateMatrixWorld(true);
}

/** World rotation for a hand whose fingers point along F with the palm facing P */
function handFrame(side, F, P) {
  const back = P.clone().negate();
  return side === 'left' ? frame(F, back) : frame(F.clone().negate(), back);
}

/** Bend each finger joint toward the palm by `angle` (radians per joint) */
function curl(fingers, side, angle, thumbAngle = 0) {
  if (Math.abs(angle) < 1e-4 && Math.abs(thumbAngle) < 1e-4) return;
  // Left fingers point along local +X with the palm at -Y: a negative turn about Z curls them.
  // The right hand is mirrored.
  const q = new THREE.Quaternion().setFromAxisAngle(Z, -angle * (side === 'left' ? 1 : -1));
  for (const f of fingers.long) f.quaternion.multiply(q);
  const qt = new THREE.Quaternion().setFromAxisAngle(Y, thumbAngle * (side === 'left' ? 1 : -1));
  for (const f of fingers.thumb) f.quaternion.multiply(qt);
  fingers.long[0]?.parent.updateMatrixWorld(true);
}

// Eased 0..1 between two times
const span = (t, a, b) => smoothstep(t, a, b);
// Eased 0 → 1 → 0: rises over a..b, falls over c..d
const hump = (t, a, b, c, d) => span(t, a, b) * (1 - span(t, c, d));

/**
 * Drives the extra moves on the loaded VRoid skeleton.
 *
 * He's always in one of two states, which he holds for a long while:
 *   typing   – the "sit_typing" clip, with a sip from the bottle every few minutes
 *   watching – slouched back, hands behind his head, tapping a foot, a video on the monitor
 * The clock picks the state (scheduledState); clicking him flips it until the next quarter hour.
 */
export class AvatarMoves {
  constructor(root) {
    const bone = (n) => root.getObjectByName(`J_Bip_${n}`);
    this.b = {
      hips: bone('C_Hips'), spine: bone('C_Spine'), chest: bone('C_Chest'), upperChest: bone('C_UpperChest'),
      neck: bone('C_Neck'), head: bone('C_Head'),
      rightFoot: bone('R_Foot'), rightToes: bone('R_ToeBase'),
      rightThigh: bone('R_UpperLeg'), rightKnee: bone('R_LowerLeg'),
    };
    const fingers = (s) => ({
      long: ['Index', 'Middle', 'Ring', 'Little'].flatMap((f) => [1, 2, 3].map((i) => bone(`${s}_${f}${i}`))).filter(Boolean),
      thumb: [1, 2, 3].map((i) => bone(`${s}_Thumb${i}`)).filter(Boolean),
    });
    const arm = (s, side) => ({
      clavicle: bone(`${s}_Shoulder`), upper: bone(`${s}_UpperArm`), lower: bone(`${s}_LowerArm`), hand: bone(`${s}_Hand`),
      side, fingers: fingers(s),
    });
    this.arms = { left: arm('L', -1), right: arm('R', 1) };
    this.ok = Object.values(this.b).every(Boolean)
      && Object.values(this.arms).every((a) => a.clavicle && a.upper && a.lower && a.hand);

    // Every bone a move may bend. The mixer only writes a bone when the clip's value changes, and
    // at 12 fps it often doesn't, so these are put back to the clip pose before each frame.
    this.touched = this.ok ? [
      ...Object.values(this.b),
      ...Object.values(this.arms).flatMap((a) => [a.clavicle, a.upper, a.lower, a.hand, ...a.fingers.long, ...a.fingers.thumb]),
    ] : [];
    this.saved = this.touched.map((b) => b.quaternion.clone());
    this.savedHips = this.ok ? this.b.hips.position.clone() : null;

    this.bottle = null;
    this.capLoop = null;

    // State
    this.override = null; // { state, quarter }: a click wins until the quarter hour changes
    this.state = scheduledState();
    this.lean = this.state === 'watching' ? 1 : 0; // 0 typing … 1 leaned back
    this.drinkAt = null; // time the current sip started
    this.drinkIdle = false; // this sip is a break from watching (no typing in between)
    this.beat = null; // () => 0..1 through the music's current beat, or null when it's off
    this.drinkQueued = false;
    this.nextAutoDrink = null;
    this.last = null; // previous frame's time
    this.listeners = new Set();

    // Debug: ?move=lean / ?move=drink, and freezing a pose for screenshots
    this.forced = null;
    this.debugPose = null; // { lean: 0..1, drink: seconds, t: seconds }
  }

  /** Called with 'typing' | 'watching' when he switches (the monitor follows this) */
  onChange(cb) { this.listeners.add(cb); cb(this.state); return () => this.listeners.delete(cb); }

  /** The bottle he drinks from: it leaves the desk while he holds it and goes back to the same spot */
  setBottle(bottle) {
    this.bottle = bottle;
    this.capLoop = bottle.getObjectByName('water_bottle_loop');
    this.bottleHome = { position: bottle.position.clone(), quaternion: bottle.quaternion.clone() };
  }

  /** Clicked: switch between typing and watching (until the next quarter hour) */
  toggle() {
    const next = this.state === 'typing' ? 'watching' : 'typing';
    this.override = { state: next, quarter: quarterIndex() };
  }

  /** Clicked the bottle: have a sip (sitting up first if he's leaned back) */
  drink() {
    if (this.drinkAt == null) this.drinkQueued = true;
  }

  get drinking() { return this.drinkAt != null || this.drinkQueued; }

  /** Undo last frame's bending (call before the mixer poses the skeleton) */
  restore() {
    this.touched.forEach((b, i) => b.quaternion.copy(this.saved[i]));
    if (this.savedHips) this.b.hips.position.copy(this.savedHips);
  }

  /** Bend the skeleton for this frame (after the mixer has posed it). t: stepped seconds */
  apply(t) {
    if (!this.ok) return;
    this.touched.forEach((b, i) => this.saved[i].copy(b.quaternion));
    this.savedHips.copy(this.b.hips.position);
    const dt = this.last == null ? 0 : clamp(t - this.last, 0, 0.25);
    this.last = t;
    if (this.bottle) this._bottleHome();

    if (this.debugPose) {
      const { lean = 0, drink = null, t: dt2 = t, idle = 0 } = this.debugPose;
      this.drinkIdle = !!idle;
      if (lean > 0) this._lean(lean, dt2);
      if (drink != null) this._drink(drink);
      return;
    }

    this._think(t, dt);
    // Fingers: the typing clip keeps them tapping, which only makes sense on the keys. Leaned
    // back, and on a break from watching, they relax instead (straightened, then curled a bit).
    const relax = this.drinkAt != null && this.drinkIdle ? 1 : smoothstep(this.lean, 0, 0.4);
    this._relax(this.arms.left, relax);
    this._relax(this.arms.right, relax);
    // On a break from watching his arms never come all the way down to the keys: they're held
    // part-way up (where they were when the break started) and the drink takes them from there
    const k = smoothstep(this.lean, 0, 1);
    const armK = this.drinkAt != null && this.drinkIdle ? Math.max(k, smoothstep(LEAN_HANDOFF, 0, 1)) : k;
    if (armK > 0) this._lean(k, t, armK);
    if (this.drinkAt != null) this._drink(t - this.drinkAt);
    this._groove(t, dt);
  }

  /** Ease a hand's fingers from the clip's typing pose toward a loose, still, half-open hand */
  _relax(arm, w) {
    if (w <= 0.001) return;
    const still = new THREE.Quaternion();
    for (const f of [...arm.fingers.long, ...arm.fingers.thumb]) f.quaternion.slerp(still, w);
    curl(arm.fingers, arm === this.arms.left ? 'left' : 'right', 0.3 * w);
  }

  /**
   * Foot tap and head bob. With music playing on the speaker he follows its beat (`beat()` gives
   * where in the beat the track is, 0..1), whether typing or watching; with no music he only
   * taps along to himself while leaned back watching.
   */
  _groove(t, dt) {
    const music = this.beat?.() ?? null;
    const settled = smoothstep(this.lean, 0.9, 1);
    const phase = music ?? ((t * TAP_BPM) / 60) % 1;
    const target = music != null ? 1 : settled;
    this.grooveW = (this.grooveW ?? 0) + (target - (this.grooveW ?? 0)) * Math.min(1, dt * 3);
    const w = this.grooveW;
    if (w < 0.01) return;

    // Right foot: heel stays down, toes lift after the off-beat and slap down on the beat
    const up = smoothstep(phase, 0.5, 0.82) * (1 - smoothstep(phase, 0.9, 1));
    rotateWorldAxis(this.b.rightFoot, Z, 0.32 * up * w); // +Z lifts the toes (+X) toward +Y

    // Head: a small nod down on the beat that eases back up (not while drinking)
    const head = this.drinkAt != null ? 0 : 1;
    const bob = Math.exp(-phase * 5) * 0.06 * w * head;
    rotateWorldAxis(this.b.head, Z, -bob);
  }

  /** Decide what he's doing, and move the lean toward it */
  _think(t, dt) {
    // Which state: forced (debug), a recent click, or the clock
    if (this.override && this.override.quarter !== quarterIndex()) this.override = null;
    const want = this.forced === 'lean' ? 'watching'
      : this.forced === 'drink' ? 'typing'
        : this.override?.state ?? scheduledState();
    if (want !== this.state) {
      this.state = want;
      for (const cb of this.listeners) cb(want);
    }

    // A sip: now and then while typing, when the bottle is clicked, or on repeat (?move=drink)
    if (this.nextAutoDrink == null) this.nextAutoDrink = t + AUTO_DRINK[0] + Math.random() * (AUTO_DRINK[1] - AUTO_DRINK[0]);
    if (this.forced === 'drink' && this.drinkAt == null) this.drinkQueued = true;
    if (this.state === 'typing' && t > this.nextAutoDrink && this.drinkAt == null) this.drinkQueued = true;
    // From typing he starts straight away. From watching he starts while his arms are still
    // coming down, so they go straight from behind his head to the bottle and his lap without
    // touching the keys on the way.
    const ready = this.state === 'watching' ? this.lean < LEAN_HANDOFF : this.lean === 0;
    if (this.drinkQueued && ready) {
      this.drinkQueued = false;
      this.drinkAt = t;
      // A break from watching: his free hand rests in his lap instead of going back to the keys
      this.drinkIdle = this.state === 'watching';
    }
    if (this.drinkAt != null && t - this.drinkAt > DRINK_TIME) {
      this.drinkAt = null;
      this.nextAutoDrink = t + AUTO_DRINK[0] + Math.random() * (AUTO_DRINK[1] - AUTO_DRINK[0]);
    }

    // Lean back while watching, unless he's about to drink or drinking (he sits up for that).
    // At the end of a break he starts leaning back while still putting the bottle down.
    const finishing = this.drinkAt != null && this.drinkIdle && t - this.drinkAt > DRINK_TIME - LEAN_HANDBACK;
    const leanTarget = this.state === 'watching' && (!this.drinking || finishing) ? 1 : 0;
    const step = dt / LEAN_TIME;
    this.lean = leanTarget > this.lean ? Math.min(leanTarget, this.lean + step) : Math.max(leanTarget, this.lean - step);
  }

  _bottleHome() {
    this.bottle.position.copy(this.bottleHome.position);
    this.bottle.quaternion.copy(this.bottleHome.quaternion);
    if (this.capLoop) this.capLoop.visible = true;
  }

  // ---- Lean back, hands behind the head --------------------------------------------------
  /**
   * k: 0 typing … 1 fully leaned back (eased); t: seconds, for the idle motion once there;
   * armK: how far along their path the arms are, if not the same as the body
   */
  _lean(k, t, armK = k) {
    const { hips, spine, chest, upperChest, head } = this.b;
    const headQ = head.getWorldQuaternion(new THREE.Quaternion());

    // The arms lead and the body follows: he lifts his hands first, then sinks back
    const body = smoothstep(k, 0.2, 1);
    // Slouch: the hips slide forward on the seat so the back can recline without going into
    // the backrest, then the spine straightens out of the typing hunch and tips back
    // (+Z tips the top of the body toward -X, away from the desk)
    moveWorld(hips, v(0.09 * body, 0, 0));
    const settled = smoothstep(k, 0.9, 1); // fully back: the idle motion fades in
    const breathe = Math.sin(t * 1.3) * 0.012 * settled;
    rotateWorldAxis(spine, Z, 0.2 * body + breathe);
    rotateWorldAxis(chest, Z, 0.08 * body);
    rotateWorldAxis(upperChest, Z, 0.05 * body);
    // However far that went, never let the head sink into the headrest
    const hp = worldPos(head);
    if (hp.x < HEAD_CLEAR) moveWorld(hips, v(HEAD_CLEAR - hp.x, 0, 0));

    // Head keeps the same world rotation as when typing, so he stays looking at the screen
    // (the beat bob is added on top, in _groove)
    const nod = new THREE.Quaternion().setFromAxisAngle(Z, -0.06 * body);
    setWorldQuat(head, headQ.premultiply(nod));

    // Arms. How shoulders actually do this: raising the arm overhead isn't just the upper arm
    // swinging up; the collarbone lifts and pulls back with it (about a third of the elevation),
    // and the upper arm rolls outward so the elbows end up pointing out to the sides. The hands
    // travel up beside the head, past the ears, and only then slide round behind it.
    const h = worldPos(head);
    for (const [side, arm] of Object.entries(this.arms)) {
      const s = arm.side;
      // Collarbone: the outer end goes up (+Y) and back (-X). For the left side (-Z) that's a
      // positive turn about X and about Y; the right side is mirrored.
      const lift = smoothstep(armK, 0.1, 0.8);
      rotateWorldAxis(arm.clavicle, X, -s * 0.3 * lift);
      rotateWorldAxis(arm.clavicle, Y, -s * 0.12 * lift);

      const shoulder = worldPos(arm.upper);
      // Where the hand is, and how it's turned: typing → beside the ear → behind the head
      const fromWrist = worldPos(arm.hand);
      const fromElbow = worldPos(arm.lower);
      const fromQ = arm.hand.getWorldQuaternion(new THREE.Quaternion());

      const earQ = handFrame(side, v(-0.15, 1, 0.1 * s), v(0, 0, -s)); // fingers up, palm toward the head
      const earWrist = h.clone().add(v(0.03, -0.02, s * 0.19));

      const endQ = handFrame(side, v(0.15, 0.25, -s), X); // fingers across, palm forward on the head
      const palmPoint = v(side === 'left' ? 0.04 : -0.04, -0.012, 0);
      const endWrist = h.clone().add(v(-0.085, 0.075, s * 0.045)).sub(palmPoint.clone().applyQuaternion(endQ));

      // Elbows: from beside the body, out to the side at shoulder height, then wide and up
      const sideElbow = shoulder.clone().add(v(0.02, -0.02, s * 0.3));
      const endElbow = h.clone().add(v(0.15, 0.15, s * 0.5));

      const wrist = through(fromWrist, earWrist, endWrist, armK);
      const pole = through(fromElbow, sideElbow, endElbow, armK);
      solveArm(arm, wrist, pole);
      const q = armK < 0.5 ? fromQ.clone().slerp(earQ, smoothstep(armK, 0, 0.5)) : earQ.clone().slerp(endQ, smoothstep(armK, 0.5, 1));
      turnHand(arm, q);
      curl(arm.fingers, side, 0.25 * smoothstep(armK, 0.5, 1));
    }
  }

  // ---- Pick up the bottle, open it, drink, close it, put it back --------------------------
  _drink(t) {
    if (!this.bottle) return;
    const left = this.arms.left;
    const right = this.arms.right;
    const { spine, neck, head } = this.b;

    // Timeline (seconds)
    //   0.0–1.3   reach for it, close the hand on it
    //   1.5–2.5   lift it in front of his chest
    //   2.4–4.9   right hand on the cap, twisting it open (the loop on the cap disappears at 4.2)
    //   4.7–5.5   bring it to his lips, tip and sip, 7.1–7.9 back down in front of his chest
    //   7.7–10.2  right hand twists the cap closed (the loop is back at 9.2)
    //   9.9–10.8  set it on the desk, let go, 10.8–12.6 back to typing
    const reach = hump(t, 0, 1.3, 10.8, DRINK_TIME - 0.2);
    const holding = t > 1.3 && t < 10.8;
    const lift = hump(t, 1.5, 2.5, 9.9, 10.8); // off the desk
    const sip = hump(t, 4.7, 5.5, 7.1, 7.9); // at his lips
    const tip = hump(t, 5.4, 6.0, 6.7, 7.2); // the extra tip while drinking
    const opening = hump(t, 2.4, 3.0, 4.2, 4.9);
    const closing = hump(t, 7.7, 8.3, 9.5, 10.2);
    const cap = opening + closing; // right hand on the cap (never both at once)
    const twisting = (a, b) => span(t, a, a + 0.2) * (1 - span(t, b - 0.2, b));
    const twist = Math.sin(t * 7) * 0.45 * (twisting(3.0, 4.2) + twisting(8.3, 9.5));
    const grip = hump(t, 0.9, 1.3, 10.8, 11.2); // fingers closed round it
    const capOff = t > 4.2 && t < 9.2;

    // Lean toward the bottle while reaching for it and putting it down
    const turn = reach * (1 - lift);
    rotateWorldAxis(spine, Z, -0.16 * turn); // forward, over the desk
    rotateWorldAxis(spine, X, -0.1 * turn); // dip the left shoulder toward it
    rotateWorldAxis(spine, Y, 0.1 * turn); // and turn a little to face it

    // His mouth, as a point fixed to the head (so it follows when he tips his head back)
    const mouthLocal = head.worldToLocal(worldPos(head).add(_v3.set(0.1, -0.035, 0)));
    // Looks down at the cap while working it, tips his head back to drink
    rotateWorldAxis(neck, Z, 0.15 * sip - 0.1 * cap);
    rotateWorldAxis(head, Z, 0.3 * sip + 0.1 * tip - 0.12 * cap);
    const mouth = head.localToWorld(mouthLocal);

    // The bottle, placed by its middle: on the desk, held upright in front of his chest, then
    // with its cap at his lips, tipped toward him (+Z tips the top toward -X)
    this.bottle.parent.updateWorldMatrix(true, false);
    const tilt = sip * 1.2 + tip * 0.45;
    const bottleQ = new THREE.Quaternion().setFromAxisAngle(Z, tilt);
    const axis = Y.clone().applyQuaternion(bottleQ);
    const onDesk = this.bottle.getWorldPosition(new THREE.Vector3()).add(_v3.set(0, 0.1, 0));
    const inFront = mouth.clone().add(v(0.14, -0.24, -0.06));
    const atLips = mouth.clone().add(_v3.set(0.012, 0, 0)).sub(axis.clone().multiplyScalar(BOTTLE.capTop - 0.1));
    const mid = onDesk.lerp(inFront.lerp(atLips, sip), lift);
    const base = mid.clone().addScaledVector(axis, -0.1);
    if (holding) {
      const world = new THREE.Matrix4().compose(base, bottleQ, new THREE.Vector3(1, 1, 1));
      const local = this.bottle.parent.matrixWorld.clone().invert().multiply(world);
      local.decompose(this.bottle.position, this.bottle.quaternion, new THREE.Vector3());
      this.bottle.updateMatrixWorld(true);
    }
    if (this.capLoop) this.capLoop.visible = !capOff;

    // Left hand: palm against the side of the bottle that faces him, thumb up along it,
    // fingers wrapping round. On the desk he takes it from his side; once it's up, from the left.
    const shoulder = worldPos(left.upper);
    const fromHim = across(shoulder.clone().sub(mid), axis);
    const fromLeft = across(v(-0.4, -0.3, -1), axis);
    const side = fromHim.lerp(fromLeft, lift).normalize(); // where on the bottle his palm is
    const palmAt = base.clone().addScaledVector(axis, 0.085).addScaledVector(side, BOTTLE.radius + 0.008);
    // Fingers run round the bottle (across it), palm faces its middle
    const fingersDir = new THREE.Vector3().crossVectors(axis, side.clone().negate());
    const qLeft = frame(fingersDir, side); // local +Y is the back of the hand, away from the bottle
    const leftPole = shoulder.clone().add(v(-0.05, -0.35, -0.3));
    placeHand(left, palmAt, qLeft, v(0.045, -0.012, 0), leftPole, reach);
    // Wrap round the bottle (fingers sized to its radius), thumb hooked over the front
    curl(left.fingers, 'left', 0.55 * grip, 0.4 * grip);

    // Right hand, when he's on a break from watching: resting on his thigh whenever it isn't
    // working the cap (otherwise the typing clip has it on the keys, which is right while working)
    if (this.drinkIdle) {
      const rest = hump(t, 0, 0.9, DRINK_TIME - 1.4, DRINK_TIME);
      const hip = worldPos(this.b.rightThigh);
      const knee = worldPos(this.b.rightKnee);
      const onThigh = hip.lerp(knee, 0.62).add(v(0, 0.075, 0.01));
      const qRest = handFrame('right', v(1, -0.25, -0.15), v(0, -1, 0)); // fingers toward the knee, palm down
      const restPole = worldPos(right.upper).add(v(-0.1, -0.2, 0.3));
      placeHand(right, onThigh, qRest, v(-0.045, -0.015, 0), restPole, rest);
      curl(right.fingers, 'right', 0.2 * rest, 0);
    }

    // Right hand: palm on top of the cap, fingers over its rim, twisting back and forth
    if (cap > 0.001) {
      const capTop = base.clone().addScaledVector(axis, BOTTLE.capTop);
      // Fingers point across the cap toward his left, palm facing down onto it
      const fDir = across(v(0.3, 0, -1), axis).applyAxisAngle(axis, twist);
      const qRight = frame(fDir.clone().negate(), axis); // right fingers run along local -X
      const rightPole = worldPos(right.upper).add(v(0.1, -0.3, 0.35));
      placeHand(right, capTop.clone().addScaledVector(axis, 0.012), qRight, v(-0.05, -0.012, 0), rightPole, cap);
      curl(right.fingers, 'right', 0.5 * cap, 0.3 * cap);
    }
  }
}
