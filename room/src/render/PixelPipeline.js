import * as THREE from 'three';
import { CONFIG } from '../config.js';

/**
 * Pixel-art pipeline:
 *  1. render the 3D scene into a small render target (1 texel = 1 "art pixel")
 *  2. composite to the screen with nearest-neighbour sampling, adding
 *     depth-based outlines and snapping colours to a fixed palette.
 *
 * `pixelSize` can be changed every frame (it's animated by the scroll timeline).
 */
export class PixelPipeline {
  constructor(renderer) {
    this.renderer = renderer;
    this.pixelSize = CONFIG.pixel.startSize;

    const depthTexture = new THREE.DepthTexture(1, 1);
    this.target = new THREE.WebGLRenderTarget(1, 1, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      generateMipmaps: false,
      depthTexture,
    });

    // Highlight mask: the clickable objects rendered flat in their guide colour (alpha = strength),
    // with their own depth so the composite can tell when something stands in front of them.
    this.maskTarget = new THREE.WebGLRenderTarget(1, 1, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      generateMipmaps: false,
      depthTexture: new THREE.DepthTexture(1, 1),
    });
    this.highlight = 0; // 0 = off; >0 the mask pass runs
    this.pulse = 1;
    this._clear = new THREE.Color();

    const palette = CONFIG.palette.map((hex) => new THREE.Color().setHex(hex, THREE.LinearSRGBColorSpace));

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tColor: { value: this.target.texture },
        tDepth: { value: depthTexture },
        uTexel: { value: new THREE.Vector2() },
        uNear: { value: 0.1 },
        uFar: { value: 50 },
        uOutline: { value: CONFIG.pixel.outline ? CONFIG.pixel.outlineStrength : 0 },
        uThreshold: { value: CONFIG.pixel.outlineThreshold },
        uPaletteMix: { value: CONFIG.pixel.palette ? 1 : 0 },
        uPalette: { value: palette.map((c) => new THREE.Vector3(c.r, c.g, c.b)) },
        tMask: { value: this.maskTarget.texture },
        tMaskDepth: { value: this.maskTarget.depthTexture },
        uHighlight: { value: 0 },
        uPulse: { value: 1 },
      },
      defines: { PALETTE_SIZE: palette.length },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        #include <packing>
        uniform sampler2D tColor;
        uniform sampler2D tDepth;
        uniform vec2 uTexel;
        uniform float uNear, uFar, uOutline, uThreshold, uPaletteMix;
        uniform vec3 uPalette[PALETTE_SIZE];
        uniform sampler2D tMask;
        uniform sampler2D tMaskDepth;
        uniform float uHighlight, uPulse;
        varying vec2 vUv;

        float depthAt(vec2 uv) {
          float d = texture2D(tDepth, uv).x;
          return -perspectiveDepthToViewZ(d, uNear, uFar);
        }

        // Palette entries are given in sRGB, we compare in sRGB space too, using the
        // cheap "redmean" approximation of perceived colour distance.
        vec3 snapToPalette(vec3 c) {
          vec3 best = uPalette[0];
          float bestD = 1e9;
          for (int i = 0; i < PALETTE_SIZE; i++) {
            vec3 p = uPalette[i];
            vec3 diff = c - p;
            float rmean = 0.5 * (c.r + p.r);
            float d = (2.0 + rmean) * diff.r * diff.r + 4.0 * diff.g * diff.g + (3.0 - rmean) * diff.b * diff.b;
            if (d < bestD) { bestD = d; best = p; }
          }
          return best;
        }

        // The clickable object covering this pixel, if it isn't hidden behind something else
        vec4 maskAt(vec2 uv) {
          vec4 m = texture2D(tMask, uv);
          if (m.a <= 0.0) return vec4(0.0);
          float md = -perspectiveDepthToViewZ(texture2D(tMaskDepth, uv).x, uNear, uFar);
          return md <= depthAt(uv) * 1.01 + 0.004 ? m : vec4(0.0);
        }

        void main() {
          vec4 col = texture2D(tColor, vUv);

          // Outline: darken a pixel when a neighbour is noticeably farther away,
          // so the line lands on the foreground object (1 art-pixel wide).
          float d = depthAt(vUv);
          float maxDiff = 0.0;
          maxDiff = max(maxDiff, depthAt(vUv + vec2(uTexel.x, 0.0)) - d);
          maxDiff = max(maxDiff, depthAt(vUv - vec2(uTexel.x, 0.0)) - d);
          maxDiff = max(maxDiff, depthAt(vUv + vec2(0.0, uTexel.y)) - d);
          maxDiff = max(maxDiff, depthAt(vUv - vec2(0.0, uTexel.y)) - d);
          float edge = step(uThreshold * d, maxDiff);
          col.rgb *= 1.0 - edge * uOutline;

          col = linearToOutputTexel(col);
          col.rgb = mix(col.rgb, snapToPalette(col.rgb), uPaletteMix);

          // Glow around clickable objects: a pulsing ring in the guide colour, 1 art-pixel wide
          // (2 when hovered), plus a faint tint over the object. Drawn after the palette snap
          // so the colours stay exact.
          if (uHighlight > 0.5) {
            vec4 m = maskAt(vUv);
            if (m.a > 0.0) {
              col.rgb = mix(col.rgb, linearToOutputTexel(vec4(m.rgb, 1.0)).rgb, 0.22 * m.a * uPulse);
            } else {
              vec4 ring = vec4(0.0);
              for (int dy = -2; dy <= 2; dy++) {
                for (int dx = -2; dx <= 2; dx++) {
                  vec4 n = maskAt(vUv + vec2(float(dx), float(dy)) * uTexel);
                  float reach = n.a > 0.8 ? 2.0 : 1.0;
                  if (n.a > 0.0 && max(abs(float(dx)), abs(float(dy))) <= reach && n.a > ring.a) ring = n;
                }
              }
              if (ring.a > 0.0) {
                vec3 rc = linearToOutputTexel(vec4(ring.rgb, 1.0)).rgb;
                float b = ring.a > 0.8 ? 1.0 : 0.45 + 0.55 * uPulse;
                col.rgb = mix(col.rgb, rc, b);
              }
            }
          }
          gl_FragColor = vec4(col.rgb, 1.0);
        }
      `,
      depthTest: false,
      depthWrite: false,
    });

    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.quad.frustumCulled = false;
    this.postScene = new THREE.Scene();
    this.postScene.add(this.quad);
    this.postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }

  setSize(width, height) {
    this.viewport = { width, height };
    this.updateTargetSize();
  }

  setPixelSize(size) {
    this.pixelSize = Math.max(1, size);
    this.updateTargetSize();
  }

  updateTargetSize() {
    if (!this.viewport) return;
    const dpr = this.renderer.getPixelRatio();
    // Round the pixel size to whole device pixels so every art pixel is the same width.
    const px = Math.max(1, Math.round(this.pixelSize * dpr));
    const w = Math.max(1, Math.floor((this.viewport.width * dpr) / px));
    const h = Math.max(1, Math.floor((this.viewport.height * dpr) / px));
    if (w !== this.target.width || h !== this.target.height) {
      this.target.setSize(w, h);
      this.maskTarget.setSize(w, h);
      this.material.uniforms.uTexel.value.set(1 / w, 1 / h);
    }
  }

  /**
   * @param maskScene optional scene of highlight shapes (MeshBasicMaterial, NoBlending,
   *   opacity = strength) drawn as glowing outlines while `this.highlight` > 0
   */
  render(scene, camera, maskScene = null) {
    const { renderer } = this;
    const u = this.material.uniforms;
    u.uNear.value = camera.near;
    u.uFar.value = camera.far;
    const highlight = maskScene && this.highlight > 0;
    u.uHighlight.value = highlight ? 1 : 0;
    u.uPulse.value = this.pulse;
    if (highlight) {
      renderer.getClearColor(this._clear);
      const alpha = renderer.getClearAlpha();
      renderer.setRenderTarget(this.maskTarget);
      renderer.setClearColor(0x000000, 0);
      renderer.clear();
      renderer.render(maskScene, camera);
      renderer.setClearColor(this._clear, alpha);
    }
    renderer.setRenderTarget(this.target);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.render(this.postScene, this.postCamera);
  }
}
