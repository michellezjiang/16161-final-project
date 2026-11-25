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

    // Slim bar pull on two posts.
    const pull = new THREE.Group();
    const bar = new THREE.Mesh(new THREE.CapsuleGeometry(0.0055, 0.075, 6, 16), m.metal);
    bar.rotation.z = Math.PI / 2;
    bar.position.z = 0.026;
    pull.add(bar);
    for (const x of [-0.032, 0.032]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0045, 0.022, 12), m.metal);
      post.rotation.x = Math.PI / 2;
      post.position.set(x, 0, 0.015);
      pull.add(post);
    }
    pull.position.y = -h * 0.16;
    pull.traverse((o) => (o.castShadow = true));
    this.group.add(pull);

    // Engraved metal label plate.
    const holderW = Math.min(0.15, w * 0.4);
    const holderH = holderW * 0.33;
    const holder = new THREE.Mesh(new THREE.BoxGeometry(holderW, holderH, 0.004), m.metal);
    holder.position.set(0, h * 0.2, 0.01);
    const label = labelTexture(this.label);
    const card = new THREE.Mesh(
      new THREE.PlaneGeometry(holderW - 0.008, holderH - 0.008),
      new THREE.MeshStandardMaterial({
        map: label,
        bumpMap: label, // dark lettering reads as cut into the metal
        bumpScale: 1.5,
        roughness: 0.35,
        metalness: 1,
      })
    );
    card.position.z = 0.0022;
    holder.add(card);
    this.group.add(holder);
  }
}
