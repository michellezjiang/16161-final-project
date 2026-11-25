import * as THREE from 'three';
import { LAYER_OVERLAY, LAYER_WORLD } from '../core/App.js';
import { damp, dampFactor } from '../core/damp.js';

const DISTANCE = 0.7; // metres in front of the camera
const FIT_RADIUS = 0.13; // world radius the object is scaled to while inspected
const ROTATE_SPEED = 0.008; // radians per pixel

/**
 * Lifts a Curiosity out of the world and holds it in front of the camera,
 * where it can be rotated and zoomed. It is drawn on the overlay layer with its
 * own lights (environment lights don't reach that layer), so it looks the same
 * whatever environment the cabinet is in.
 *
 * Works with any camera rig: it only needs `rig.enabled` to pause camera input.
 */
export class Inspector {
  constructor({ app, rig, interactor, infoPanel }) {
    this.app = app;
    this.rig = rig;
    this.interactor = interactor;
    this.infoPanel = infoPanel;
    this.current = null;
    this.returning = new Set();
    this.overlay = 0;

    this.anchor = new THREE.Group();
    this.anchor.position.z = -DISTANCE;
    app.camera.add(this.anchor);

    this.lights = [
      Object.assign(new THREE.DirectionalLight(0xfff1dc, 2.2), { userData: { base: 2.2 } }),
      Object.assign(new THREE.DirectionalLight(0xb8c8ff, 0.7), { userData: { base: 0.7 } }),
      Object.assign(new THREE.AmbientLight(0xffffff, 0.25), { userData: { base: 0.25 } }),
    ];
    this.lights[0].position.set(0.6, 0.8, 0.4);
    this.lights[1].position.set(-0.7, -0.2, 0.2);
    for (const light of this.lights) {
      light.layers.set(LAYER_OVERLAY);
      if (light.target) {
        light.target = this.anchor;
      }
      app.camera.add(light);
    }

    this.targetQuaternion = new THREE.Quaternion();
    this.zoom = 1;
    this.drag = null;
    this.#bindInput();
  }

  get isActive() {
    return this.current !== null;
  }

  inspect(curiosity) {
    if (this.current) return;
    this.current = curiosity;
    this.returning.delete(curiosity);
    curiosity.state = 'inspecting';
    curiosity.hovered = false;
    setLayer(curiosity.object, LAYER_OVERLAY);
    this.anchor.attach(curiosity.object);

    const [x, y, z] = curiosity.def.inspectRotation ?? [0, 0, 0];
    this.targetQuaternion.setFromEuler(new THREE.Euler(x, y, z));
    this.zoom = 1;

    this.rig.enabled = false;
    this.interactor.setEnabled(false);
    this.infoPanel.show(curiosity.def);
  }

  release() {
    const curiosity = this.current;
    if (!curiosity) return;
    this.current = null;
    curiosity.state = 'returning';
    curiosity.restParent.attach(curiosity.object);
    // Back in the world straight away, so the drawer front hides it as it drops in.
    setLayer(curiosity.object, LAYER_WORLD);
    this.returning.add(curiosity);

    this.rig.enabled = true;
    this.interactor.setEnabled(true);
    this.infoPanel.hide();
  }

  update(dt) {
    this.overlay = damp(this.overlay, this.current ? 1 : 0, 6, dt);
    this.app.setOverlayOpacity(this.overlay);
    for (const light of this.lights) light.intensity = light.userData.base * this.overlay;

    const k = dampFactor(8, dt);
    if (this.current) {
      const { object, radius } = this.current;
      object.position.lerp(this.#presentationOffset(), k);
      object.quaternion.slerp(this.targetQuaternion, k);
      const s = (FIT_RADIUS / radius) * this.zoom;
      object.scale.lerp(new THREE.Vector3(s, s, s), k);
    }

    for (const curiosity of this.returning) {
      const { object } = curiosity;
      object.position.lerp(curiosity.restPosition, k);
      object.quaternion.slerp(curiosity.restQuaternion, k);
      object.scale.lerp(curiosity.restScale, k);
      if (object.position.distanceTo(curiosity.restPosition) < 0.002 && object.quaternion.angleTo(curiosity.restQuaternion) < 0.01) {
        object.position.copy(curiosity.restPosition);
        object.quaternion.copy(curiosity.restQuaternion);
        object.scale.copy(curiosity.restScale);
        curiosity.state = 'rest';
        this.returning.delete(curiosity);
      }
    }
  }

  /** Shifts the object so it is centred in the part of the screen the info panel leaves free. */
  #presentationOffset() {
    const { camera, renderer } = this.app;
    const canvas = renderer.domElement.getBoundingClientRect();
    const halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * DISTANCE;
    const halfW = halfH * camera.aspect;
    const { right, bottom } = this.infoPanel.occlusion();
    return new THREE.Vector3((-right / canvas.width) * halfW, (bottom / canvas.height) * halfH, 0);
  }

  #bindInput() {
    const el = this.app.renderer.domElement;
    el.addEventListener('pointerdown', (e) => {
      if (!this.current) return;
      this.drag = { x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY };
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', (e) => {
      if (!this.current || !this.drag) return;
      const dx = e.clientX - this.drag.x;
      const dy = e.clientY - this.drag.y;
      this.drag.x = e.clientX;
      this.drag.y = e.clientY;
      // Rotate about the camera's axes so dragging always feels the same.
      const q = new THREE.Quaternion()
        .setFromAxisAngle(new THREE.Vector3(0, 1, 0), dx * ROTATE_SPEED)
        .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), dy * ROTATE_SPEED));
      this.targetQuaternion.premultiply(q);
    });
    el.addEventListener('pointerup', (e) => {
      if (!this.current || !this.drag) return;
      const moved = Math.hypot(e.clientX - this.drag.startX, e.clientY - this.drag.startY);
      this.drag = null;
      // A plain click on the backdrop (not on the object) puts it back.
      if (moved < 6 && !this.#hitsCurrent(e)) this.release();
    });
    el.addEventListener('wheel', (e) => {
      if (!this.current) return;
      e.preventDefault();
      this.zoom = THREE.MathUtils.clamp(this.zoom * Math.exp(-e.deltaY * 0.001), 0.6, 2.2);
    }, { passive: false });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.release();
    });
  }

  #hitsCurrent(e) {
    const rect = this.app.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    const raycaster = new THREE.Raycaster();
    raycaster.layers.set(LAYER_OVERLAY);
    raycaster.setFromCamera(ndc, this.app.camera);
    return raycaster.intersectObject(this.current.object, true).length > 0;
  }
}

function setLayer(root, layer) {
  root.traverse((o) => o.layers.set(layer));
}
