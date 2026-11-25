/** Small label that follows the pointer and names whatever is hovered. */
export class Tooltip {
  constructor(parent, canvas) {
    this.canvas = canvas;
    this.el = document.createElement('div');
    this.el.className = 'tooltip';
    parent.appendChild(this.el);
  }

  update(interactable, { x, y }) {
    const label = interactable && (typeof interactable.label === 'function' ? interactable.label() : interactable.label);
    this.canvas.style.cursor = interactable ? 'pointer' : '';
    if (!label) {
      this.el.classList.remove('is-visible');
      return;
    }
    this.el.textContent = label;
    this.el.style.transform = `translate(${x + 16}px, ${y + 16}px)`;
    this.el.classList.add('is-visible');
  }
}
