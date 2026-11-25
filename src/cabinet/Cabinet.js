import * as THREE from 'three';
import { board, createCabinetMaterials } from './materials.js';
import { Drawer } from './Drawer.js';

const DEFAULTS = {
  width: 0.9,
  depth: 0.5,
  bodyHeight: 0.54, // carcass, excluding stand and top
  plinthHeight: 0.07, // apron between the legs and the carcass
  footHeight: 0.42, // turned legs
  boardThickness: 0.02,
  drawerTravel: 0.38,
};

/**
 * A chest of drawers. Origin is on the floor at the centre of its footprint,
 * front facing +z, so it can be dropped into any environment anchor.
 *
 *   const cabinet = new Cabinet({ drawers: [{ label: 'Naturalia' }, ...] });
 *   scene.add(cabinet.group);
 *   cabinet.drawers[0].addItem(someObject3D);
 */
export class Cabinet {
  constructor({ drawers, ...options } = {}) {
    this.options = { ...DEFAULTS, ...options };
    this.materials = createCabinetMaterials();
    this.group = new THREE.Group();
    this.group.name = 'Cabinet';
    this.drawers = [];

    this.#buildBody(drawers.length);
    this.#buildDrawers(drawers);
  }

  /** Opens one drawer and closes the rest, so an open drawer is never hidden by the one above it. */
  toggleDrawer(drawer) {
    const opening = !drawer.isOpen;
    for (const d of this.drawers) d.close();
    if (opening) drawer.open();
  }

  closeAll() {
    for (const d of this.drawers) d.close();
  }

  update(dt) {
    for (const d of this.drawers) d.update(dt);
  }

  get bodyBottom() {
    return this.options.footHeight + this.options.plinthHeight;
  }

  #buildBody(rowCount) {
    const { width: W, depth: D, bodyHeight: H, boardThickness: t, plinthHeight, footHeight } = this.options;
    const m = this.materials;
    const y0 = this.bodyBottom;
    const y1 = y0 + H;

    // Carcass.
    this.group.add(board(t, H, D, m.wood, { x: -W / 2 + t / 2, y: y0 + H / 2 }));
    this.group.add(board(t, H, D, m.wood, { x: W / 2 - t / 2, y: y0 + H / 2 }));
    this.group.add(board(W, t, D, m.wood, { y: y0 + t / 2 }));
    this.group.add(board(W, t, D, m.wood, { y: y1 - t / 2 }));
    this.group.add(board(W - 2 * t, H - 2 * t, t, m.woodDark, { y: y0 + H / 2, z: -D / 2 + t / 2 }));

    // Rails between drawer openings.
    const openingH = this.#openingHeight(rowCount);
    for (let i = 1; i < rowCount; i++) {
      const y = y1 - t - i * openingH - (i - 0.5) * t;
      this.group.add(board(W - 2 * t, t, D - t, m.wood, { y, z: t / 2 }));
    }

    // Top with an overhang and a stepped crown.
    const topT = 0.03;
    this.group.add(board(W + 0.05, topT, D + 0.04, m.wood, { y: y1 + topT / 2, z: 0.01 }));
    this.group.add(board(W + 0.02, 0.014, D + 0.015, m.wood, { y: y1 + topT + 0.007, z: 0.005 }));

    // Apron with a moulding lip.
    this.group.add(board(W + 0.02, plinthHeight, D + 0.02, m.wood, { y: footHeight + plinthHeight / 2 }));
    this.group.add(board(W + 0.035, 0.016, D + 0.035, m.wood, { y: footHeight + plinthHeight - 0.008 }));

    // Turned legs joined by a low shelf.
    const legProfile = [
      [0, 0], [0.016, 0], [0.022, 0.015], [0.018, 0.04], [0.014, 0.1], [0.022, 0.17], [0.027, 0.21],
      [0.022, 0.25], [0.015, 0.31], [0.015, 0.36], [0.021, 0.385], [0.024, 0.4], [0.024, 1], [0, 1],
    ].map(([x, y]) => new THREE.Vector2(x, y < 1 ? y * (footHeight / 0.42) : footHeight));
    const legGeometry = new THREE.LatheGeometry(legProfile, 32);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const leg = new THREE.Mesh(legGeometry, m.wood);
        leg.position.set(sx * (W / 2 - 0.03), 0, sz * (D / 2 - 0.03));
        leg.castShadow = true;
        this.group.add(leg);
      }
    }
    this.group.add(board(W - 0.06, 0.018, D - 0.06, m.wood, { y: footHeight * 0.24 }));
  }

  #buildDrawers(drawerDefs) {
    const { width: W, depth: D, bodyHeight: H, boardThickness: t, drawerTravel } = this.options;
    const openingH = this.#openingHeight(drawerDefs.length);
    const top = this.bodyBottom + H - t;
    const gap = 0.003;

    drawerDefs.forEach((def, i) => {
      const drawer = new Drawer({
        width: W - 2 * t - gap * 2,
        height: openingH - gap * 2,
        depth: D - t - 0.04,
        travel: drawerTravel,
        label: def.label,
        materials: this.materials,
      });
      drawer.closedZ = D / 2;
      drawer.group.position.set(0, top - i * (openingH + t) - openingH / 2, D / 2);
      drawer.onSelect = (d) => this.toggleDrawer(d);
      this.group.add(drawer.group);
      this.drawers.push(drawer);
    });
  }

  #openingHeight(rowCount) {
    const { bodyHeight: H, boardThickness: t } = this.options;
    return (H - 2 * t - (rowCount - 1) * t) / rowCount;
  }
}
