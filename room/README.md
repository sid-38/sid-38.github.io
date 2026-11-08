# 3D Pixel-Art Desk Portfolio

A cozy night-time room rendered in 3D with a pixel-art look. Scrolling pushes the camera
into the notebook on the desk, the notebook opens, and the portfolio content (real HTML)
appears on its pages.

This is the **blockout** stage: every object is a gray-box stand-in built in code, so the
camera, composition and scroll timing can be tuned before any real assets are made.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build in dist/
```

URL flags:

- `?debug` shows a tweak panel with a scroll scrubber, pixel size, outline and palette
  toggles, day/night lighting, and a free orbit camera with "log camera position" for
  picking new shots.
- `?time=day` previews the day lighting preset.

## Project structure

```
index.html              Notebook page content (edit your About/Projects/etc. here)
src/
  config.js             All tunables: palette, pixel size, camera shots, scroll length
  main.js               Wires everything together + the scroll timeline
  scene/
    Room.js             Walls, window, city + rain, bed, cabinet, shelf
    Desk.js             Desk, monitor (animated code screen), PC, keyboard, lamp, props
    Notebook.js         Notebook with hinged cover; open(t), spread corners for the HTML
    Avatar.js           Chair, avatar and cat stand-ins with idle animation
    Lighting.js         Moon, lamp, monitor, RGB lights + night/day presets
  render/
    PixelPipeline.js    Low-res render, nearest upscale, depth outlines, palette snap
  camera/
    CameraRig.js        Spline camera path; final shot computed from the notebook
  ui/
    NotebookUI.js       Lays the HTML pages over the 3D notebook
  utils/
    materials.js        Toon/glow materials, blockout helpers, colours
    debug.js            lil-gui panel (only loaded with ?debug)
public/
  models/  textures/    Put exported .glb files and textures here
```

## How the scroll works

One GSAP timeline running from 0 to 1, scrubbed by scroll progress (smoothed with Lenis).
Each beat is one line in `main.js`:

| Timeline | Beat |
|---|---|
| 0.00 → 0.78 | Camera flies from the landing shot to above the notebook |
| 0.40 → 0.75 | Pixel size 4 → 2 (the scene "focuses" as you dive in) |
| 0.62 → 0.90 | Notebook cover opens |
| 0.86 → 0.93 | Pixel size 2 → 1 |
| 0.90 → 0.98 | HTML pages fade in over the 3D spread |

To retime the sequence, change the numbers in `main.js`. For a longer or shorter scroll,
change `scroll.pageHeightVh` in `config.js`.

## Replacing the blockout with real assets

1. Model in Blender at real-world scale (1 unit = 1 m, Y-up on export), using the blockout
   positions as a guide. Run `?debug` → free camera to see the scene from any angle.
2. Use the same object names as the blockout (`monitor_screen`, `notebook_cover`,
   `anchor_lamp_light`, `anchor_sleep`, …) so the code keeps finding them.
3. Keep textures small (16–64 px per object), painted in Aseprite with colours from the
   palette in `config.js`. Use nearest filtering and no mipmaps.
4. Export as `.glb` into `models-src/` (the uncompressed originals), then run `npm run models`.
   That writes the compressed copies the site loads to `public/models/` (meshopt geometry, WebP
   textures for the avatar; see `scripts/optimize-models.mjs`). Load it in place of the matching
   `create*()` function; the loading screen waits for every model, so nothing pops in.
5. Avatar: a Mixamo-compatible rig. Swap `Avatar.update()` for an `AnimationMixer`, and step
   it at `CONFIG.animationFps` for the hand-animated feel.

## Planned features

- Avatar behaviour state machine: working → stretching → walking → sleeping (the
  `anchor_sleep` on the bed is ready for this)
- Day/night from the visitor's local clock (tween between `LIGHT_PRESETS`)
- Notebook page flips between sections
- Loading screen, sound (rain, keyboard), reduced-motion polish
