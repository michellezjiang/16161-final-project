import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { damp } from '../core/damp.js';

const HOVER_LIFT = 0.025;
const gltfLoader = new GLTFLoader();

/**
 * Wraps a catalog entry and its 3D model.
 *
 * `object` is a pivot whose origin is the model's bounding-box centre, so the
 * inspector can spin it in place. While at rest it sits in its drawer with the
 * model's base on the felt.
 *
 * state: 'rest' | 'inspecting' | 'returning' (the latter two are driven by Inspector)
 */
export class Curiosity {
  static async create(def) {
    const model = def.model ? (await gltfLoader.loadAsync(def.model)).scene : def.build();
    return new Curiosity(def, model);
  }

  constructor(def, model) {
    this.def = def;
    this.model = model;
    this.state = 'rest';
    this.hover = 0;
    this.hovered = false;
    this.isAvailable = () => true; // set by whoever places it (e.g. "drawer is open")

    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    this.radius = size.length() / 2;
    this.restHeight = center.y - box.min.y;

    model.position.sub(center);
    this.object = new THREE.Group();
    this.object.name = `Curiosity:${def.id}`;
    this.object.add(model);
    this.object.position.y = this.restHeight;
    if (def.restRotationY) this.object.rotation.y = def.restRotationY;

    this.object.userData.interactable = {
      label: () => def.name,
      enabled: () => this.state === 'rest' && this.isAvailable(),
      onHoverStart: () => (this.hovered = true),
      onHoverEnd: () => (this.hovered = false),
      onSelect: () => this.onSelect?.(this),
    };
  }

  /** Records the current local transform as "home"; the inspector returns the object here. */
  captureRestPose() {
    this.restParent = this.object.parent;
    this.restPosition = this.object.position.clone();
    this.restQuaternion = this.object.quaternion.clone();
    this.restScale = this.object.scale.clone();
  }

  update(dt) {
    this.model.userData.update?.(dt);
    if (this.state !== 'rest') return;
    this.hover = damp(this.hover, this.hovered ? 1 : 0, 10, dt);
    this.object.position.y = this.restPosition.y + this.hover * HOVER_LIFT;
  }
}
