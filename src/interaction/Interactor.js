import * as THREE from 'three';

const CLICK_MAX_MOVE = 6; // px; beyond this a press is treated as a camera drag

/**
 * Finds what the user is pointing at and forwards hover/select events.
 *
 * Any Object3D becomes clickable by setting `userData.interactable`:
 *   {
 *     label?:        string | () => string   tooltip text
 *     enabled?:      () => boolean           skipped (and the search continues upward) when false
 *     onHoverStart?, onHoverEnd?, onSelect?
 *   }
 * The nearest hit decides; we walk up from the hit mesh to the first enabled
 * interactable ancestor. Opaque scenery without one blocks the ray.
 *
 * mode 'pointer' aims with the mouse (orbit view). Mode 'center' aims from the
 * middle of the screen, for the first-person / pointer-lock walking view.
 *
 * root         Object3D or array of them to pick against (include walls so they block)
 * maxDistance  how far away things can be reached
 * isActive     extra gate, e.g. "the mouse is captured" in first-person mode
 */
export class Interactor {
  constructor({ camera, domElement, root, mode = 'pointer', maxDistance = Infinity, isActive = () => true }) {
    this.camera = camera;
    this.domElement = domElement;
    this.roots = [].concat(root);
    this.mode = mode;
    this.isActive = isActive;
    this.enabled = true;
    this.hovered = null;
    this.onHoverChange = null; // (interactable | null, event-ish {x, y}) => void

    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = maxDistance;
    this.pointer = new THREE.Vector2();
    this.pointerPx = { x: 0, y: 0 };
    this.pointerInside = false;
    this.downAt = null;

    domElement.addEventListener('pointermove', (e) => this.#onMove(e));
    domElement.addEventListener('pointerleave', () => (this.pointerInside = false));
    domElement.addEventListener('pointerdown', (e) => (this.downAt = { x: e.clientX, y: e.clientY }));
    domElement.addEventListener('pointerup', (e) => this.#onUp(e));
  }

  setEnabled(value) {
    this.enabled = value;
    if (!value) this.#setHovered(null);
  }

  /** Re-picks every frame, since drawers and objects move under a still pointer. */
  update() {
    if (!this.enabled) return;
    if (!this.isActive() || (this.mode === 'pointer' && !this.pointerInside)) {
      this.#setHovered(null);
      return;
    }
    if (this.mode === 'center') {
      const rect = this.domElement.getBoundingClientRect();
      this.pointerPx = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }
    this.#setHovered(this.#pick());
  }

  /** Selects whatever is under the reticle. Call from a key handler in 'center' mode. */
  selectHovered() {
    if (this.enabled) this.hovered?.onSelect?.();
  }

  #onMove(e) {
    const rect = this.domElement.getBoundingClientRect();
    this.pointerPx = { x: e.clientX, y: e.clientY };
    this.pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.pointerInside = true;
  }

  #onUp(e) {
    if (!this.downAt || !this.enabled || !this.isActive()) return;
    const moved = Math.hypot(e.clientX - this.downAt.x, e.clientY - this.downAt.y);
    this.downAt = null;
    if (moved > CLICK_MAX_MOVE) return;
    if (this.mode === 'pointer') this.#onMove(e);
    this.#setHovered(this.#pick());
    this.selectHovered();
  }

  #pick() {
    const ndc = this.mode === 'center' ? new THREE.Vector2(0, 0) : this.pointer;
    this.raycaster.setFromCamera(ndc, this.camera);
    const hits = this.raycaster.intersectObjects(this.roots, true);
    const hit = hits.find((h) => h.object.visible);
    if (!hit) return null;
    for (let o = hit.object; o; o = o.parent) {
      const interactable = o.userData.interactable;
      if (interactable && (interactable.enabled?.() ?? true)) return interactable;
    }
    return null;
  }

  #setHovered(interactable) {
    if (interactable !== this.hovered) {
      this.hovered?.onHoverEnd?.();
      this.hovered = interactable;
      interactable?.onHoverStart?.();
    }
    this.onHoverChange?.(this.hovered, this.pointerPx);
  }
}
