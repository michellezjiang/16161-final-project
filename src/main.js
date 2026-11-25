import { App } from './core/App.js';
import { StudioEnvironment } from './environments/StudioEnvironment.js';
import { Cabinet } from './cabinet/Cabinet.js';
import { Curiosity } from './curiosities/Curiosity.js';
import { catalog } from './curiosities/catalog.js';
import { OrbitRig } from './controls/OrbitRig.js';
import { Interactor } from './interaction/Interactor.js';
import { Inspector } from './interaction/Inspector.js';
import { InfoPanel } from './ui/InfoPanel.js';
import { Tooltip } from './ui/Tooltip.js';

const container = document.getElementById('app');

// Canvas textures (drawer labels, watch face) need the web font ready before drawing.
await Promise.race([
  document.fonts.load('italic 600 40px "Cormorant Garamond"'),
  new Promise((resolve) => setTimeout(resolve, 1500)),
]).catch(() => {});

const app = new App(container);

// --- Environment: swap this for a room later. Everything below only uses its anchors/viewpoints.
const environment = new StudioEnvironment().build(app);
app.addUpdatable(environment);

// --- Cabinet and its contents.
const cabinet = new Cabinet({ drawers: catalog.drawers });
const anchor = environment.anchors.cabinet;
cabinet.group.position.copy(anchor.position);
cabinet.group.rotation.y = anchor.rotationY;
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

// --- Camera, picking, inspection, UI.
const rig = app.addUpdatable(new OrbitRig(app.camera, app.renderer.domElement, {
  view: environment.viewpoints.cabinet,
  fitRadius: 0.6,
}));
const interactor = app.addUpdatable(new Interactor({ camera: app.camera, domElement: app.renderer.domElement, root: app.scene }));
const tooltip = new Tooltip(container, app.renderer.domElement);
interactor.onHoverChange = (hovered, pointer) => tooltip.update(hovered, pointer);

let inspector;
const infoPanel = new InfoPanel(container, { onClose: () => inspector.release() });
inspector = app.addUpdatable(new Inspector({ app, rig, interactor, infoPanel }));
for (const c of curiosities) c.onSelect = (curiosity) => inspector.inspect(curiosity);

app.start();
document.body.classList.add('is-ready');

// Handy for debugging and scripted screenshots.
window.cabinetApp = { app, environment, cabinet, curiosities, inspector, rig, interactor };
