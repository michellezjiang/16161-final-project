import * as THREE from 'three';
import { board, labelTexture } from './materials.js';
import { damp } from '../core/damp.js';

const PEEK = 0.04; // how far (fraction of travel) a drawer slides when hovered

/**
 * One drawer. `group` sits at the drawer opening and slides along +z.
 * Items are added to `contents`, whose origin is the centre of the felt floor.
 */
export class Drawer {
  constructor({ width, height, depth, travel, label, materials }) {
    this.width = width;
    this.height = height;
    this.depth = depth;
    this.travel = travel;
    this.label = label;

    this.amount = 0; // 0 closed .. 1 open
    this.target = 0;
    this.hovered = false;
    this.items = [];
    this.onSelect = null; // set by the cabinet
    this.closedZ = 0; // z of the front face when shut, in the parent's space

    this.group = new THREE.Group();
    this.group.name = `Drawer:${label}`;
    this.#build(materials);

    this.group.userData.interactable = {
      label: () => (this.isOpen ? `Close ${label}` : `Open ${label}`),
      onHoverStart: () => (this.hovered = true),
      onHoverEnd: () => (this.hovered = false),
      onSelect: () => this.onSelect?.(this),
    };
  }

  get isOpen() {
    return this.target === 1;
  }

  /** True once the drawer is far enough out for its contents to be picked up. */
  get isAccessible() {
    return this.amount > 0.85;
  }

  open() { this.target = 1; }
  close() { this.target = 0; }
  toggle() { this.target = this.isOpen ? 0 : 1; }

  /** Adds an object to the felt. Items are spread evenly across the drawer width. */
  addItem(object) {
    this.items.push(object);
    this.contents.add(object);
    const spacing = (this.width * 0.8) / this.items.length;
    this.items.forEach((item, i) => {
      item.position.x = -this.width * 0.4 + spacing * (i + 0.5);
      item.position.z = this.depth * 0.12; // a little toward the front, where it's easier to see
    });
  }

  update(dt) {
    const peek = this.hovered && !this.isOpen ? PEEK : 0;
    this.amount = damp(this.amount, Math.max(this.target, peek), 7, dt);
    this.group.position.z = this.closedZ + this.amount * this.travel;
  }

  #build(m) {
    const { width: w, height: h, depth: d } = this;
    const frontT = 0.022;
    const wallT = 0.012;
    const boxH = h - 0.035;
    const boxBottom = -h / 2 + 0.012;

    // Front panel; its outer face is at z = 0 so the drawer sits flush when closed.
    this.group.add(board(w, h, frontT, m.wood, { z: -frontT / 2 }));
    // Raised centre panel.
    this.group.add(board(w - 0.07, h - 0.07, 0.008, m.wood, { z: 0.004 }));

    // Box behind the front.
    const boxZ = -frontT - d / 2;
    const sideY = boxBottom + boxH / 2;
    this.group.add(board(wallT, boxH, d, m.interior, { x: -w / 2 + 0.01 + wallT / 2, y: sideY, z: boxZ }));
    this.group.add(board(wallT, boxH, d, m.interior, { x: w / 2 - 0.01 - wallT / 2, y: sideY, z: boxZ }));
    this.group.add(board(w - 0.02, boxH, wallT, m.interior, { y: sideY, z: -frontT - d + wallT / 2 }));
    this.group.add(board(w - 0.02, wallT, d, m.interior, { y: boxBottom + wallT / 2, z: boxZ }));

    const felt = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.02 - wallT * 2, d - wallT), m.felt);
    felt.rotation.x = -Math.PI / 2;
    felt.position.set(0, boxBottom + wallT + 0.001, boxZ + wallT / 2);
    felt.receiveShadow = true;
    this.group.add(felt);

    this.contents = new THREE.Group();
    this.contents.position.copy(felt.position);
    this.group.add(this.contents);

    // Brass knob.
    const knob = new THREE.Group();
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.008, 0.02, 16), m.brass);
    stem.rotation.x = Math.PI / 2;
    stem.position.z = 0.018;
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.016, 24, 16), m.brass);
    ball.scale.z = 0.8;
    ball.position.z = 0.034;
    const rose = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.004, 24), m.brass);
    rose.rotation.x = Math.PI / 2;
    rose.position.z = 0.009;
    knob.add(stem, ball, rose);
    knob.position.y = -h * 0.14;
    knob.traverse((o) => (o.castShadow = true));
    this.group.add(knob);

    // Brass label holder with a paper card.
    const holderW = Math.min(0.15, w * 0.4);
    const holderH = holderW * 0.33;
    const holder = new THREE.Mesh(new THREE.BoxGeometry(holderW, holderH, 0.004), m.brass);
    holder.position.set(0, h * 0.2, 0.01);
    const card = new THREE.Mesh(
      new THREE.PlaneGeometry(holderW - 0.012, holderH - 0.01),
      new THREE.MeshStandardMaterial({ map: labelTexture(this.label), roughness: 0.9 })
    );
    card.position.z = 0.0022;
    holder.add(card);
    this.group.add(holder);
  }
}
