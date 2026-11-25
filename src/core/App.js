import * as THREE from 'three';

// Layer 0 is the normal world. Layer 1 is drawn on top of a dimming overlay,
// which is how an inspected object floats in front of everything else.
export const LAYER_WORLD = 0;
export const LAYER_OVERLAY = 1;

/**
 * Owns the renderer, scene, camera and frame loop. Knows nothing about
 * cabinets or rooms: anything with an `update(dt, elapsed)` method can be
 * registered with `addUpdatable`.
 */
export class App {
  constructor(container) {
    this.container = container;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // Shadows are refreshed once per frame in render(), not once per pass.
    renderer.shadowMap.autoUpdate = false;
    renderer.autoClear = false;
    container.appendChild(renderer.domElement);
    this.renderer = renderer;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.05, 2500);
    // The camera is in the scene so things can be parented to it (inspection anchor, lights).
    this.scene.add(this.camera);

    this.overlay = this.#createOverlay();
    this.updatables = new Set();
    this.clock = new THREE.Clock();

    this.#resize();
    new ResizeObserver(() => this.#resize()).observe(container);
  }

  addUpdatable(obj) {
    this.updatables.add(obj);
    return obj;
  }

  removeUpdatable(obj) {
    this.updatables.delete(obj);
  }

  start() {
    this.renderer.setAnimationLoop(() => this.#frame());
  }

  /** Strength of the dimming overlay, 0..1. Set by whoever is presenting something on LAYER_OVERLAY. */
  setOverlayOpacity(value) {
    this.overlay.strength = value;
  }

  #frame() {
    const dt = Math.min(this.clock.getDelta(), 1 / 20);
    const elapsed = this.clock.elapsedTime;
    for (const obj of this.updatables) obj.update(dt, elapsed);
    this.render();
  }

  render() {
    const { renderer, scene, camera, overlay } = this;

    renderer.shadowMap.needsUpdate = true;
    renderer.clear();
    camera.layers.set(LAYER_WORLD);
    renderer.render(scene, camera);

    // Pass 2: dim the world, then draw overlay-layer objects on top with fresh depth.
    overlay.material.opacity = overlay.maxOpacity * overlay.strength;
    if (overlay.strength > 0.001) renderer.render(overlay.scene, overlay.camera);
    renderer.clearDepth();
    const background = scene.background;
    scene.background = null;
    camera.layers.set(LAYER_OVERLAY);
    renderer.render(scene, camera);
    scene.background = background;
    camera.layers.set(LAYER_WORLD);
  }

  #createOverlay() {
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const material = new THREE.MeshBasicMaterial({
      color: 0x0a0806,
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false,
    });
    scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));
    return { scene, camera, material, strength: 0, maxOpacity: 0.72 };
  }

  #resize() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    this.renderer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }
}
