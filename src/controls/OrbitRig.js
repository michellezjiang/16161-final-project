import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/**
 * Camera rig for looking at one piece of furniture from the outside.
 *
 * A rig owns camera movement and exposes `enabled`, `setView(view)` and
 * `update(dt)`. A future walk-around rig (e.g. PointerLockControls + WASD)
 * should expose the same three members so main.js and Inspector don't change.
 */
export class OrbitRig {
  /**
   * fitRadius: radius (m) around the target that must stay in view horizontally,
   * so narrow portrait screens back the camera off instead of cropping.
   */
  constructor(camera, domElement, { view, minDistance = 1.0, maxDistance = 3.6, fitRadius = 0 } = {}) {
    this.camera = camera;
    this.fitRadius = fitRadius;
    this.baseMaxDistance = maxDistance;
    this.lastAspect = null;
    const controls = new OrbitControls(camera, domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.minDistance = minDistance;
    controls.maxDistance = maxDistance;
    controls.minPolarAngle = 0.25;
    controls.maxPolarAngle = Math.PI / 2 - 0.05;
    controls.minAzimuthAngle = -Math.PI / 2.5;
    controls.maxAzimuthAngle = Math.PI / 2.5;
    controls.rotateSpeed = 0.6;
    this.controls = controls;
    if (view) this.setView(view);
  }

  get enabled() {
    return this.controls.enabled;
  }

  set enabled(value) {
    this.controls.enabled = value;
  }

  /** view: { position: Vector3, target: Vector3 } in world space. */
  setView({ position, target }) {
    this.camera.position.copy(position);
    this.controls.target.copy(target);
    this.viewDistance = position.distanceTo(target);
    this.lastAspect = null;
    this.controls.update();
  }

  update() {
    if (this.camera.aspect !== this.lastAspect) this.#fitToAspect();
    this.controls.update();
  }

  #fitToAspect() {
    this.lastAspect = this.camera.aspect;
    if (!this.fitRadius || this.viewDistance === undefined) return;
    const halfHFov = Math.atan(Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * this.camera.aspect);
    const distance = Math.max(this.viewDistance, this.fitRadius / Math.tan(halfHFov));
    this.controls.maxDistance = Math.max(this.baseMaxDistance, distance * 1.2);
    const { target } = this.controls;
    this.camera.position.sub(target).setLength(distance).add(target);
  }
}
