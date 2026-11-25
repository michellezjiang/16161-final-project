# Cabinet of Curiosities

A WebGL (three.js) cabinet with three drawers. Click a drawer to open it, click the
object inside to lift it out, drag to turn it, scroll to zoom, and press Esc (or
click the background) to put it back. An info panel explains each object.

## Running

No build step. The files are ES modules and load three.js from a CDN, so they
need to be served over HTTP rather than opened directly:

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

## Layout

```
src/
  main.js                     wires everything together
  core/App.js                 renderer, scene, camera, frame loop, overlay pass
  core/damp.js                frame-rate independent smoothing for animations
  environments/
    StudioEnvironment.js      floor, lights, fog; exposes anchors + viewpoints
  cabinet/
    Cabinet.js                carcass, stand and drawer layout (dimensions are options)
    Drawer.js                 one sliding drawer; addItem() places objects on the felt
    materials.js              procedural wood, brass, felt, label textures
  curiosities/
    catalog.js                drawer labels and objects: names, text, models
    models.js                 procedural models (ammonite, amethyst, pocket watch)
    Curiosity.js              wraps a model and makes it pick-up-able
  interaction/
    Interactor.js             hover/click picking via userData.interactable
    Inspector.js              holds an object in front of the camera
  controls/OrbitRig.js        orbit camera around the cabinet
  ui/InfoPanel.js, Tooltip.js DOM overlays
```

## Changing the contents

Edit `src/curiosities/catalog.js`. Each object needs a `name`, `subtitle`,
`description` (an array of paragraphs) and either a `build()` function or a
`model: 'models/thing.glb'` path to a glTF file. A drawer can hold more than one
object; they are spaced out automatically.

## Moving the cabinet into a room

Nothing outside `main.js` knows about the environment, so a room comes down to two steps:

1. **Write `environments/RoomEnvironment.js`** with the same shape as
   `StudioEnvironment`: a `build(app)` that adds walls, floor and lights; an
   `anchors.cabinet` (`{ position, rotationY }`) for where the cabinet stands;
   and a starting viewpoint. Swap it in at the top of `main.js`.
2. **Write a walking camera rig** (e.g. `PointerLockControls` plus WASD) that
   exposes the same `enabled`, `setView()` and `update(dt)` as `OrbitRig`. The
   `Inspector` only toggles `rig.enabled`, so it keeps working. With pointer
   lock, create the `Interactor` with `mode: 'center'` so it aims from the
   centre of the screen, and call `interactor.selectHovered()` on click or key
   press.

Some other details that carry over:

- Anything can be made clickable by setting `object.userData.interactable`
  (see `Interactor.js`), e.g. a door or a second cabinet.
- Inspected objects render on their own layer with their own lights, so they
  look the same in any room, however it is lit.
- `Cabinet` takes `width`, `depth`, `bodyHeight`, etc. and any number of
  drawers, and its origin is on the floor at the centre of its footprint.
