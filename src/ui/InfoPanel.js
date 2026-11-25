/**
 * The text box that explains an inspected object. Plain DOM over the canvas.
 */
export class InfoPanel {
  constructor(parent, { onClose } = {}) {
    this.el = document.createElement('aside');
    this.el.className = 'info-panel';
    this.el.setAttribute('aria-live', 'polite');
    this.el.innerHTML = `
      <button class="info-panel__close" type="button" aria-label="Return object to drawer">×</button>
      <p class="info-panel__eyebrow"></p>
      <h2 class="info-panel__title"></h2>
      <p class="info-panel__subtitle"></p>
      <div class="info-panel__body"></div>
      <p class="info-panel__hint">Drag to turn · Scroll to zoom · Esc to put back</p>
    `;
    this.el.querySelector('.info-panel__close').addEventListener('click', () => onClose?.());
    parent.appendChild(this.el);
  }

  show(def) {
    this.el.querySelector('.info-panel__eyebrow').textContent = def.drawerLabel ?? '';
    this.el.querySelector('.info-panel__title').textContent = def.name;
    this.el.querySelector('.info-panel__subtitle').textContent = def.subtitle ?? '';
    const body = this.el.querySelector('.info-panel__body');
    body.replaceChildren(
      ...[].concat(def.description ?? []).map((text) => {
        const p = document.createElement('p');
        p.textContent = text;
        return p;
      })
    );
    this.el.classList.add('is-open');
    document.body.classList.add('is-inspecting');
  }

  hide() {
    this.el.classList.remove('is-open');
    document.body.classList.remove('is-inspecting');
  }

  /** Pixels of the canvas covered by the panel when open, so the 3D view can avoid it. */
  occlusion() {
    if (!this.el.classList.contains('is-open')) return { right: 0, bottom: 0 };
    const sideLayout = window.matchMedia('(min-width: 760px)').matches;
    const rect = this.el.getBoundingClientRect();
    return sideLayout
      ? { right: window.innerWidth - rect.left, bottom: 0 }
      : { right: 0, bottom: window.innerHeight - rect.top };
  }
}
