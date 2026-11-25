import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { damp } from '../core/damp.js';

// Gait: how far one step covers, and how much the head moves with each step.
const GAIT = {
  walk: { stepLength: 0.78, bob: 0.02, sway: 0.018, roll: 0.006 },
  run: { stepLength: 1.05, bob: 0.05, sway: 0.026, roll: 0.009 },
};

const KEYS = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  run: ['ShiftLeft', 'ShiftRight'],
};

/**
 * Walk-around camera: click to capture the mouse, move with WASD/arrows, look
 * with the mouse. Same `enabled` / `setView` / `update` interface as OrbitRig;
 * disabling it releases the mouse (e.g. while the Inspector shows an object).
 *
 * bounds     { minX, maxX, minZ, maxZ } the player can't leave
 * colliders  [{ minX, maxX, minZ, maxZ }] footprints the player can't enter
 */
export class FirstPersonRig {
  constructor(camera, domElement, { view, bounds, colliders = [], eyeHeight = 1.6, speed = 1.8, radius = 0.25 } = {}) {
    this.camera = camera;
    this.domElement = domElement;
    this.bounds = bounds;
    this.colliders = colliders;
    this.eyeHeight = eyeHeight;
    this.speed = speed;
    this.radius = radius;
    this.onLockChange = null;
    this._enabled = true;

    this.controls = new PointerLockControls(camera, domElement);
    this.controls.pointerSpeed = 0.8;
    this.controls.addEventListener('lock', () => this.onLockChange?.(true));
    this.controls.addEventListener('unlock', () => {
      this.pressed.clear();
      this.onLockChange?.(false);
    });

    this.pressed = new Set();
    this.velocity = new THREE.Vector2();
    // Head motion is layered on top of the "body" position, which is what collides.
    this.stepPhase = 0; // advances by PI per step
    this.gaitWeight = 0; // 0 standing .. 1 walking at full speed
    this.running = 0; // 0 walk .. 1 run, smoothed
    this.headOffset = new THREE.Vector3();
    this.euler = new THREE.Euler(0, 0, 0, 'YXZ');
    window.addEventListener('keydown', (e) => this.pressed.add(e.code));
    window.addEventListener('keyup', (e) => this.pressed.delete(e.code));
    domElement.addEventListener('click', () => {
      if (this._enabled && !this.isLocked) this.controls.lock();
    });

    if (view) this.setView(view);
  }

  get isLocked() {
    return this.controls.isLocked;
  }

  get enabled() {
    return this._enabled;
  }

  set enabled(value) {
    this._enabled = value;
    if (!value && this.isLocked) this.controls.unlock();
  }

  setView({ position, target }) {
    this.headOffset.set(0, 0, 0);
    this.gaitWeight = 0;
    this.camera.position.set(position.x, this.eyeHeight, position.z);
    this.camera.lookAt(target);
  }

  update(dt) {
    const input = new THREE.Vector2(
      this.#axis(KEYS.right) - this.#axis(KEYS.left),
      this.#axis(KEYS.forward) - this.#axis(KEYS.back)
    );
    if (!this.isLocked || !this._enabled) input.set(0, 0);
    if (input.lengthSq() > 1) input.normalize();
    const run = this.#axis(KEYS.run) && input.y > 0 ? 1 : 0;
    const speed = this.speed * (run ? 1.8 : 1);
    // Ease in and out so starting and stopping have some weight to them.
    this.velocity.x = damp(this.velocity.x, input.x * speed, 8, dt);
    this.velocity.y = damp(this.velocity.y, input.y * speed, 8, dt);

    // Move the body (camera minus head motion), then collide.
    const p = this.camera.position;
    p.sub(this.headOffset);
    const before = new THREE.Vector2(p.x, p.z);
    if (this.velocity.lengthSq() > 1e-6) {
      this.controls.moveRight(this.velocity.x * dt);
      this.controls.moveForward(this.velocity.y * dt);
      this.#collide();
    }
    p.y = this.eyeHeight;
    const travelled = before.distanceTo(new THREE.Vector2(p.x, p.z));

    this.#gait(travelled, dt, run);
    p.add(this.headOffset);
  }

  /**
   * Head bob from the distance actually covered (so walking into a wall doesn't bob):
   * the head dips as each foot lands, sways toward the supporting foot, and rolls slightly.
   */
  #gait(travelled, dt, run) {
    this.running = damp(this.running, run, 4, dt);
    const g = {};
    for (const key of Object.keys(GAIT.walk)) g[key] = THREE.MathUtils.lerp(GAIT.walk[key], GAIT.run[key], this.running);

    const actualSpeed = travelled / Math.max(dt, 1e-4);
    this.gaitWeight = damp(this.gaitWeight, Math.min(1, actualSpeed / this.speed), 6, dt);
    this.stepPhase += (travelled / g.stepLength) * Math.PI;
    // When stopping, let the head settle back to its resting height rather than freezing mid-step.
    if (this.gaitWeight < 0.02) this.stepPhase = Math.round(this.stepPhase / Math.PI) * Math.PI;

    const w = this.gaitWeight;
    // Footfalls are at multiples of PI: the head is lowest there, centred between the feet,
    // and highest mid-step, shifted over the supporting leg.
    const dip = -g.bob * (0.5 + 0.5 * Math.cos(2 * this.stepPhase)) * w;
    const sway = g.sway * Math.sin(this.stepPhase) * w;
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion).setY(0).normalize();
    this.headOffset.copy(right).multiplyScalar(sway);
    this.headOffset.y = dip;

    this.euler.setFromQuaternion(this.camera.quaternion);
    this.euler.z = -g.roll * Math.sin(this.stepPhase) * w;
    this.camera.quaternion.setFromEuler(this.euler);
  }

  #axis(codes) {
    return codes.some((c) => this.pressed.has(c)) ? 1 : 0;
  }

  /** Pushes the player's circle out of furniture and back inside the room. */
  #collide() {
    const p = this.camera.position;
    const r = this.radius;
    for (const c of this.colliders) {
      const nx = THREE.MathUtils.clamp(p.x, c.minX, c.maxX);
      const nz = THREE.MathUtils.clamp(p.z, c.minZ, c.maxZ);
      const dx = p.x - nx;
      const dz = p.z - nz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        p.x = nx + (dx / d) * r;
        p.z = nz + (dz / d) * r;
      } else {
        // Centre is inside the box: leave by the nearest side.
        const exits = [
          [c.minX - r - p.x, 'x'], [c.maxX + r - p.x, 'x'],
          [c.minZ - r - p.z, 'z'], [c.maxZ + r - p.z, 'z'],
        ].sort((a, b) => Math.abs(a[0]) - Math.abs(b[0]));
        p[exits[0][1]] += exits[0][0];
      }
    }
    if (this.bounds) {
      p.x = THREE.MathUtils.clamp(p.x, this.bounds.minX + r, this.bounds.maxX - r);
      p.z = THREE.MathUtils.clamp(p.z, this.bounds.minZ + r, this.bounds.maxZ - r);
    }
  }
}
