// Central place for tunable values. Everything visual you'll want to tweak lives here.

export const CONFIG = {
  // ---- Pixel-art look -------------------------------------------------------
  pixel: {
    // Size of one "art pixel" in screen pixels on the landing shot.
    // The camera dive ramps this down to 1 so the notebook arrives crisp.
    startSize: 4,
    endSize: 1,
    outline: true,
    outlineStrength: 0.55, // how much edges get darkened (0..1)
    outlineThreshold: 0.035, // relative depth jump that counts as an edge
    palette: true,
  },

  // Limited palette (sRGB hex). Swap this for one from https://lospec.com/palette-list
  // Picked to match the reference: cool blue-grey room, warm window/lamp accents, RGB pops.
  palette: [
    0x0b0e1a, 0x141a2e, 0x1e2742, 0x2b3757, 0x3c4a6e, 0x52618a, 0x6e7fa8, 0x93a3c6,
    0xbcc8e0, 0xe6ecf5, // blues → near white
    0x2a1d1a, 0x4a3128, 0x6d4a35, 0x93674a, 0xb98c64, // woods / browns
    0xf2b880, 0xffd7a3, 0xffeccf, // warm light / skin
    0x8a2b3a, 0xc8424f, // chair red
    0x7a3fa8, 0xd05fd8, 0x3fb8d8, 0x7af0ff, // RGB accents
    0xc99a86, 0x5c4a6e, // cool-lit skin, purple shadow
    0x8a8796, 0x5f6070, 0xa8968e, // neutral greys (keep blue-lit skin/wood from snapping to green)
    0x3e5c4a, 0x7d9a6b, // greens (sage keycaps)
    0x3a2c33, 0x5e4342, 0x8a5e4c, // lamp-lit darks (warm pool on the black desk instead of purple)
    0x9cd2f2, 0xd4ecf8, // daytime sky
  ],

  // ---- Scroll choreography (0..1 of the timeline) ---------------------------
  scroll: {
    pageHeightVh: 500, // how much scrolling the whole dive takes
    smoothing: 0.08, // Lenis lerp (lower = floatier)
  },

  camera: {
    fov: 42,
    fovPortrait: 62,
    // Landing shot: inside the room, a bit above, looking down across the desk
    // at the avatar (matches the pixel-art reference).
    establishing: { pos: [0.95, 1.75, 2.2], target: [0.3, 0.95, -0.7] },
    // Mid-point of the dive so the move arcs over the desk instead of cutting through it.
    approach: { pos: [1.2, 1.45, 0.9], target: [0.85, 0.78, 0.02] },
    // Final framing is computed from the notebook so you can move the notebook freely.
    notebookTilt: 0.08, // radians away from straight-down (small: the 3D pages stay nearly rectangular, like the HTML)
    notebookFill: 0.93, // how much of the viewport the open pages fill (height on wide screens, width on tall ones)
    parallax: 0.08, // mouse parallax on the landing shot (metres)
  },

  // Desk lamp: on at night, off by day. Tune these live with ?debug → "Lamp",
  // then press "copy lamp settings" and paste the result here.
  lamp: {
    intensity: 5, // the spotlight's pool on the desk
    color: 0xffb060,
    angle: 0.5, // cone half-angle (radians): how wide the pool is
    penumbra: 0.2, // 0 = hard edge, 1 = very soft edge
    distance: 2.5, // reach in metres
    decay: 1, // falloff with distance
    glow: 0.8, // small point light at the bulb that lights the shade and the area around it
    glowDistance: 0.6,
    aimX: 0, // shift where the pool lands (metres, from the notebook)
    aimZ: 0,
    shadows: true,
  },

  // Fixed-step animation for characters/props, gives a hand-animated feel. 0 = smooth.
  animationFps: 12,
};
