import { App } from './core/App.js';
import { StudioEnvironment } from './environments/StudioEnvironment.js';
import { MuseumRoomEnvironment } from './environments/MuseumRoomEnvironment.js';
import { Cabinet } from './cabinet/Cabinet.js';
import { Curiosity } from './curiosities/Curiosity.js';
import { catalog } from './curiosities/catalog.js';
import { OrbitRig } from './controls/OrbitRig.js';
import { FirstPersonRig } from './controls/FirstPersonRig.js';
import { Interactor } from './interaction/Interactor.js';
import { Inspector } from './interaction/Inspector.js';
import { InfoPanel } from './ui/InfoPanel.js';
import { Tooltip } from './ui/Tooltip.js';
import { WalkHud } from './ui/WalkHud.js';

const container = document.getElementById('app');
const params = new URLSearchParams(location.search);

// Canvas textures (drawer labels, watch face) need the web font ready before drawing.
await Promise.race([
  document.fonts.load('italic 600 40px "Cormorant Garamond"'),
  new Promise((resolve) => setTimeout(resolve, 1500)),
]).catch(() => {});

const app = new App(container);

// --- Environment. `?env=studio` shows the cabinet on its own; the default is the walk-in room.
const environment = (params.get('env') === 'studio' ? new StudioEnvironment() : new MuseumRoomEnvironment()).build(app);
app.addUpdatable(environment);

// --- Cabinet and its contents. The environment can tweak its size and proportions.
const anchor = environment.anchors.cabinet;
const cabinet = new Cabinet({ drawers: catalog.drawers, ...anchor.options });
cabinet.group.position.copy(anchor.position);
cabinet.group.rotation.y = anchor.rotationY;
cabinet.group.scale.setScalar(anchor.scale ?? 1);
app.scene.add(cabinet.group);
app.addUpdatable(cabinet);

const curiosities = [];
for (const [i, drawerDef] of catalog.drawers.entries()) {
  const drawer = cabinet.drawers[i];
  for (const itemDef of drawerDef.items) {
    const curiosity = await Curiosity.create({ ...itemDef, drawerLabel: drawerDef.label });
    curiosity.isAvailable = () => drawer.isAccessible;
    drawer.addItem(curiosity.object);
    curiosities.push(curiosity);
    app.addUpdatable(curiosity);
  }
}
// Positions are final only after every item in a drawer has been added.
cabinet.group.updateMatrixWorld(true);
for (const c of curiosities) c.captureRestPose();

// --- Camera rig: walk around where the environment allows it (and there's a mouse), else orbit.
const canWalk = environment.walkable && window.matchMedia('(pointer: fine)').matches;
let rig;
let hud;
if (canWalk) {
  rig = new FirstPersonRig(app.camera, app.renderer.domElement, {
    view: environment.viewpoints.start,
    bounds: environment.bounds,
    colliders: [...environment.colliders, cabinet.footprint()],
  });
  hud = new WalkHud(container);
  document.body.classList.add('is-walking');
} else {
  rig = new OrbitRig(app.camera, app.renderer.domElement, { view: environment.viewpoints.cabinet, fitRadius: 0.6 });
}
app.addUpdatable(rig);

// --- Picking, inspection, UI.
const interactor = app.addUpdatable(
  new Interactor({
    camera: app.camera,
    domElement: app.renderer.domElement,
    root: [cabinet.group, ...(environment.occluders ?? [])],
    ...(canWalk && { mode: 'center', maxDistance: 2.2, isActive: () => rig.isLocked }),
  })
);
const tooltip = new Tooltip(container, app.renderer.domElement);
interactor.onHoverChange = (hovered, pointer) => tooltip.update(hovered, pointer);

let inspector;
const infoPanel = new InfoPanel(container, { onClose: () => inspector.release() });
inspector = app.addUpdatable(new Inspector({ app, rig, interactor, infoPanel }));
for (const c of curiosities) c.onSelect = (curiosity) => inspector.inspect(curiosity);

if (hud) app.addUpdatable({ update: () => hud.update({ locked: rig.isLocked, inspecting: inspector.isActive }) });

app.start();
document.body.classList.add('is-ready');

// Handy for debugging and scripted screenshots.
window.cabinetApp = { app, environment, cabinet, curiosities, inspector, rig, interactor };
