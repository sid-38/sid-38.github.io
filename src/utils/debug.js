import GUI from 'lil-gui';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { CONFIG } from '../config.js';

/** Dev-only tweak panel (open the site with ?debug). Not included in the main bundle. */
export function createDebug({ scene, camera, pipeline, lighting, setMode, canvas }) {
  const gui = new GUI({ title: 'debug' });
  // Bottom-left, out of the way of the guide (top left) and day/night button (top right)
  Object.assign(gui.domElement.style, { left: '15px', right: 'auto', top: 'auto', bottom: '15px' });
  gui.close(); // collapsed until you need it
  const debug = { pixelSize: null, orbit: null };
  const u = pipeline.material.uniforms;

  const px = { override: false, size: CONFIG.pixel.startSize };
  const f2 = gui.addFolder('Pixel look');
  f2.add(px, 'override').name('override size').onChange((v) => { debug.pixelSize = v ? px.size : null; });
  f2.add(px, 'size', 1, 8, 1).onChange((v) => { if (px.override) debug.pixelSize = v; });
  f2.add(u.uOutline, 'value', 0, 1, 0.01).name('outline');
  f2.add(u.uThreshold, 'value', 0.005, 0.2, 0.001).name('outline threshold');
  f2.add(u.uPaletteMix, 'value', 0, 1, 1).name('palette snap');
  f2.add(CONFIG, 'animationFps', 0, 30, 1).name('anim fps (0 = smooth)');

  // Day/night: same as the button in the top right (this dropdown follows it)
  const modeProxy = { get mode() { return lighting.mode; }, set mode(v) { setMode(v); } };
  gui.add(modeProxy, 'mode', ['night', 'day']).name('lighting').listen();

  // Lamp: every change applies instantly. "copy lamp settings" puts them on the clipboard
  // (and in the console) ready to paste into CONFIG.lamp in src/config.js.
  const ls = lighting.lampSettings;
  const fl = gui.addFolder('Lamp');
  const refresh = () => lighting.updateLamp();
  fl.add(ls, 'on').name('on').listen().onChange(refresh);
  fl.add(ls, 'intensity', 0, 8, 0.05).onChange(refresh);
  fl.addColor(ls, 'color').onChange(refresh);
  fl.add(ls, 'angle', 0.15, 1.2, 0.01).name('cone width').onChange(refresh);
  fl.add(ls, 'penumbra', 0, 1, 0.01).name('edge softness').onChange(refresh);
  fl.add(ls, 'distance', 0.5, 6, 0.05).name('reach').onChange(refresh);
  fl.add(ls, 'decay', 0, 3, 0.05).name('falloff').onChange(refresh);
  fl.add(ls, 'glow', 0, 3, 0.05).name('bulb glow').onChange(refresh);
  fl.add(ls, 'glowDistance', 0.1, 2, 0.05).name('bulb glow reach').onChange(refresh);
  fl.add(ls, 'aimX', -0.6, 0.6, 0.01).name('aim ← →').onChange(refresh);
  fl.add(ls, 'aimZ', -0.8, 0.4, 0.01).name('aim near/far').onChange(refresh);
  fl.add(ls, 'shadows').onChange(refresh);
  fl.add({
    copy: () => {
      const { on, ...values } = ls;
      const text = `lamp: ${JSON.stringify({ ...values, color: `0x${values.color.toString(16).padStart(6, '0')}` }, null, 2)
        .replace(/"(\w+)":/g, '$1:').replace(/"(0x[0-9a-f]+)"/, '$1')},`;
      console.log(text);
      navigator.clipboard?.writeText(text).catch(() => {});
    },
  }, 'copy').name('copy lamp settings');

  const cam = { freeCamera: false };
  gui.add(cam, 'freeCamera').name('free camera (orbit)').onChange((v) => {
    if (v) {
      debug.orbit = new OrbitControls(camera, canvas);
      debug.orbit.target.set(0.6, 0.8, -0.3);
      debug.orbit.enableDamping = true;
    } else {
      debug.orbit?.dispose();
      debug.orbit = null;
    }
  });
  gui.add({ log: () => console.log('camera', camera.position.toArray().map((n) => +n.toFixed(2))) }, 'log')
    .name('log camera position');

  // Download the blockout as a .glb to import into Blender as a modelling reference.
  // Lights, rain and the sky are skipped; everything else keeps its name and position.
  gui.add({
    export: () => {
      const skip = new Set(['rain', 'outside']);
      const roots = scene.children.filter((o) => (o.isGroup || o.isMesh) && !skip.has(o.name));
      new GLTFExporter().parse(roots, (glb) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([glb], { type: 'model/gltf-binary' }));
        a.download = 'blockout.glb';
        a.click();
      }, (err) => console.error(err), { binary: true, onlyVisible: true });
    },
  }, 'export').name('export blockout .glb');

  return debug;
}
