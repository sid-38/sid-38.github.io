import * as THREE from 'three';
import { CONFIG } from '../config.js';

// Real-time lights are cheap here because the scene renders at a tiny resolution.
// Presets make the future day/night cycle a matter of tweening between them.
// The lamp's own look (brightness, cone, colour) lives in CONFIG.lamp; presets only switch it on/off.
export const LIGHT_PRESETS = {
  night: {
    hemiSky: 0x6e7fa8, hemiGround: 0x2b3757, hemi: 2.2,
    moon: 0x93a3c6, moonI: 2.2,
    lampOn: true,
    monitor: 0xbcc8e0, monitorI: 2.0,
    rgb: 0xd05fd8, rgbI: 0.6,
    fog: 0x0b0e1a,
  },
  day: {
    hemiSky: 0xd4ecf8, hemiGround: 0x6d4a35, hemi: 2.9,
    moon: 0xffeccf, moonI: 4.6,
    lampOn: false,
    monitor: 0x7af0ff, monitorI: 0.5,
    rgb: 0xd05fd8, rgbI: 0.2,
    fog: 0xd4ecf8, // daylight haze over the city
  },
};

const BULB_ON = 0xffeccf;
const BULB_OFF = 0x5f6070;

export function createLighting(scene) {
  const hemi = new THREE.HemisphereLight();
  scene.add(hemi);

  // Moon/sun through the window
  const moon = new THREE.DirectionalLight();
  moon.position.set(-1.5, 4, -6);
  moon.target.position.set(0.5, 0, 0.5);
  moon.castShadow = true;
  moon.shadow.mapSize.set(1024, 1024);
  Object.assign(moon.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3, near: 1, far: 15 });
  moon.shadow.bias = -0.002;
  scene.add(moon, moon.target);

  // Desk lamp: a spotlight pooling warm light on the notebook, plus a small glow at the bulb
  const lamp = new THREE.SpotLight();
  lamp.shadow.mapSize.set(512, 512);
  lamp.shadow.bias = -0.001;
  const lampGlow = new THREE.PointLight();
  const lampAnchor = scene.getObjectByName('anchor_lamp_light');
  const notebook = scene.getObjectByName('notebook');
  if (lampAnchor) {
    lampAnchor.updateWorldMatrix(true, false);
    lamp.position.setFromMatrixPosition(lampAnchor.matrixWorld);
    lampGlow.position.copy(lamp.position).add(new THREE.Vector3(0, 0.03, 0));
  }
  const aimBase = notebook ? notebook.position.clone() : new THREE.Vector3(1, 0.75, 0.1);
  scene.add(lamp, lamp.target, lampGlow);
  const bulb = scene.getObjectByName('lamp_bulb');

  // Monitor glow on the avatar's face
  const monitor = new THREE.PointLight(0xffffff, 1, 1.8, 1.5);
  const screen = scene.getObjectByName('monitor_screen');
  if (screen) {
    screen.updateWorldMatrix(true, false);
    monitor.position.setFromMatrixPosition(screen.matrixWorld).add(new THREE.Vector3(-0.15, 0, 0));
  }
  scene.add(monitor);

  // PC RGB spill
  const rgb = new THREE.PointLight(0xffffff, 1, 1.2, 2);
  const pc = scene.getObjectByName('pc_tower');
  if (pc) rgb.position.copy(pc.position).add(new THREE.Vector3(-0.3, 0.25, 0));
  scene.add(rgb);

  scene.fog = new THREE.Fog(0x000000, 8, 30);

  const lights = { hemi, moon, lamp, lampGlow, monitor, rgb };

  // Live lamp settings (the debug panel edits this object, then calls updateLamp)
  const lampSettings = { on: true, ...CONFIG.lamp };

  function updateLamp() {
    const s = lampSettings;
    lamp.visible = lampGlow.visible = s.on;
    lamp.color.set(s.color);
    lamp.intensity = s.intensity;
    lamp.angle = s.angle;
    lamp.penumbra = s.penumbra;
    lamp.distance = s.distance;
    lamp.decay = s.decay;
    lamp.castShadow = s.shadows;
    lamp.target.position.copy(aimBase).add(new THREE.Vector3(s.aimX, 0, s.aimZ));
    lampGlow.color.set(s.color);
    lampGlow.intensity = s.glow;
    lampGlow.distance = s.glowDistance;
    lampGlow.decay = 1.5;
    if (bulb) bulb.material.color.set(s.on ? BULB_ON : BULB_OFF);
  }

  let mode = 'night';
  function apply(name) {
    const p = LIGHT_PRESETS[name];
    if (!p) return;
    mode = name;
    hemi.color.set(p.hemiSky);
    hemi.groundColor.set(p.hemiGround);
    hemi.intensity = p.hemi;
    moon.color.set(p.moon);
    moon.intensity = p.moonI;
    monitor.color.set(p.monitor);
    monitor.intensity = p.monitorI;
    rgb.color.set(p.rgb);
    rgb.intensity = p.rgbI;
    scene.fog.color.set(p.fog);
    lampSettings.on = p.lampOn;
    updateLamp();
  }
  apply('night');

  return { lights, apply, lampSettings, updateLamp, get mode() { return mode; } };
}
