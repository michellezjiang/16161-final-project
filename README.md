# Cabinet of Curiosities

A WebGL (three.js) cabinet of curiosities from the near future. It stands in a
curator's study on the third floor of a city building. Out of the window is a
street much like today's, except that humanoid robots are an ordinary part of
the workforce.

Walk up to the cabinet, open a drawer, and pick up the object inside to turn it
over and read about it.

## Running

No build step. The files are ES modules and load three.js from a CDN, so they
need to be served over HTTP rather than opened directly:

```sh
python3 -m http.server 8000
# open http://localhost:8000              walk-in room
# open http://localhost:8000/?env=studio  the cabinet on its own
```

## Controls

| | |
|---|---|
| Click the view | capture the mouse and start walking |
| W A S D / arrows | walk (hold Shift to hurry) |
| Mouse | look around |
| Click (aiming with the centre dot) | open/close a drawer, pick up an object |
| Drag / scroll | turn / zoom an object you're holding |
| Esc or click the background | put the object back |
| Esc while walking | free the mouse |

On touch screens (no mouse to capture) the room falls back to an orbit view of
the cabinet: tap a drawer, tap an object.

## Layout

```
src/
  main.js                       picks the environment and camera rig, wires everything up
  core/App.js                   renderer, scene, camera, frame loop, overlay pass
  core/damp.js                  frame-rate independent smoothing for animations
  core/canvasTexture.js         helpers for drawn textures (signs, posters)
  environments/
    MuseumRoomEnvironment.js    the walk-in study: walls, window, lights, fixtures
    room/props.js               fittings (door, lamps, spotlight track)
    room/cityTextures.js        procedural facades, asphalt, paving and clouds
    room/CityView.js            the street outside: buildings, traffic, robots, drones, sky
    StudioEnvironment.js        a plain stage for the cabinet on its own
  characters/Humanoid.js        jointed robot/person figure with walk, carry, work, idle poses
  cabinet/
    Cabinet.js                  carcass, stand and drawer layout (dimensions are options)
    Drawer.js                   one sliding drawer; addItem() places objects on the felt
    materials.js                procedural wood, metal, felt, label textures
  curiosities/
    catalog.js                  drawer labels and objects: names, text, models
    models.js                   procedural models (ammonite, amethyst, pocket watch)
    Curiosity.js                wraps a model and makes it pick-up-able
  interaction/
    Interactor.js               hover/click picking via userData.interactable
    Inspector.js                holds an object in front of the camera
  controls/
    FirstPersonRig.js           pointer-lock walking with collision
    OrbitRig.js                 orbit camera around the cabinet
  ui/                           info panel, tooltip, walking HUD
```

## Changing the contents

Edit `src/curiosities/catalog.js`. Each object needs a `name`, `subtitle`,
`description` (an array of paragraphs) and either a `build()` function or a
`model: 'models/thing.glb'` path to a glTF file. A drawer can hold more than one
object; they are spaced out automatically.

## Environments

`main.js` only talks to an environment through this shape, so rooms are interchangeable:

- `build(app)`: adds everything to the scene
- `anchors.cabinet`: `{ position, rotationY, scale?, options? }`, where the cabinet stands, how big it
  is, and any `Cabinet` options (e.g. `footHeight`) to suit the space
- `viewpoints`: `start` (first-person) and `cabinet` (orbit), as `{ position, target }`
- `update(dt)` / `dispose()`
- for walkable spaces: `walkable: true`, `bounds`, `colliders` (floor-plan
  boxes) and `occluders` (objects that block the interaction ray)

Both camera rigs expose `enabled`, `setView()` and `update(dt)`. The Inspector
only toggles `rig.enabled`, which makes the first-person rig release the mouse
while you hold an object.

Other details:

- Anything can be made clickable by setting `object.userData.interactable`
  (see `Interactor.js`), e.g. the door.
- Inspected objects render on their own layer with their own lights, so they
  look the same in any room, however it is lit.
- `Humanoid` (used for the robots and people outside) takes `kind: 'robot' | 'person'`
  and a palette; set `pose` and call `update(dt)`. Set `lookTarget` to make its head
  follow something.
